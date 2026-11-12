-- Upload lifecycle and technical reconciliation; no browser deletion privilege.
begin;
create table private.upload_cleanups (
 id uuid primary key references public.submissions(id),
 documents jsonb not null,
 reason text not null check(length(reason) between 3 and 500),
 requested_at timestamptz not null default now(),
 not_before timestamptz not null default now()+interval '24 hours',
 completed_at timestamptz
);
alter table private.upload_cleanups enable row level security;
revoke all on private.upload_cleanups from public,anon,authenticated;
create function private.canonical_upload_manifest(p_files jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(value order by value->>'name',value->>'hash',(value->>'size')::bigint),'[]'::jsonb)
 from jsonb_array_elements(p_files)
$$;
revoke all on function private.canonical_upload_manifest(jsonb) from public,anon,authenticated;
create or replace function public.reserve_submission(p_id uuid,p_name text,p_registration text,p_activity text,p_days integer,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist; s public.submissions; f jsonb; total bigint; used bigint; lim bigint; object_id uuid;
begin
 a:=private.current_access();
 if a.id is null or a.role<>'staff' or a.staff_id is null then raise exception 'Acesso de servidor necessário.'; end if;
 perform 1 from public.app_settings where singleton for update;
 select storage_limit into lim from public.staff_members where id=a.staff_id and active for no key update;
 if lim is null then raise exception 'Servidor desativado.'; end if;
 if p_id is null or p_name is null or p_registration is null or p_activity is null then raise exception 'Confira os dados do formulário.'; end if;
 if length(trim(p_name)) not between 3 and 120 or length(p_registration)>60 or length(trim(p_activity)) not between 3 and 120 or p_days is null or p_days not between 1 and 366 then raise exception 'Confira os dados do formulário.'; end if;
 if p_files is null or jsonb_typeof(p_files) is distinct from 'array' then raise exception 'Anexe de 1 a 3 PDFs.'; end if;
 if jsonb_array_length(p_files) not between 1 and 3 then raise exception 'Anexe de 1 a 3 PDFs.'; end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(f->'size') is distinct from 'number'
    or jsonb_typeof(f->'name') is distinct from 'string' or jsonb_typeof(f->'hash') is distinct from 'string'
    or (select count(*) from jsonb_object_keys(f))<>3 then raise exception 'Arquivo inválido.'; end if;
  if (f->>'size')::bigint not between 1 and 10000000 or (f->>'size')::numeric<>(f->>'size')::bigint
    or length(f->>'name') not between 1 and 255 or f->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'Arquivo inválido.'; end if;
 end loop;
 p_files:=private.canonical_upload_manifest(p_files);
 if exists(select 1 from private.upload_cleanups where id=p_id) then raise exception 'Envio descartado. Inicie um novo envio.'; end if;
 select * into s from public.submissions where id=p_id for update;
 if s.id is not null then
  if s.staff_id<>a.staff_id or s.activity<>trim(p_activity) or s.declared_days<>p_days or private.canonical_upload_manifest(s.upload_manifest)<>p_files then raise exception 'Reenvio incompatível com o original.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'path',path,'size',size,'hash',hash,'status',status,'submissionStatus',s.status)) from public.documents where submission_id=p_id),'[]'::jsonb);
 end if;
 total:=0;
 for f in select value from jsonb_array_elements(p_files) loop
  if (f->>'size')::bigint not between 1 and 10000000 or length(f->>'name') not between 1 and 255 or f->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'Arquivo inválido.'; end if;
  total:=total+(f->>'size')::bigint;
 end loop;
 if total>10000000 then raise exception 'Os PDFs excedem 10 MB.'; end if;
 select coalesce(sum(size),0) into used from public.documents where staff_id=a.staff_id;
 if used+total>lim then raise exception 'Limite acumulado de documentos atingido. Procure a direção.'; end if;
 select coalesce(sum(size),0) into used from public.documents;
 if used+total>(select storage_budget from public.app_settings where singleton) then raise exception 'Orçamento de armazenamento atingido. Procure a direção.'; end if;
 if (select count(*) from public.submissions where staff_id=a.staff_id and status='draft')>=3 then raise exception 'Retome os envios interrompidos antes de iniciar outro.'; end if;
 if (select count(*) from public.documents where staff_id=a.staff_id)+jsonb_array_length(p_files)>100
   or (select count(*) from public.documents)+jsonb_array_length(p_files)>3000
   or (select count(*) from public.submissions)>=3000 then raise exception 'Limite de registros atingido. Procure o responsável técnico.'; end if;
 update public.staff_members set name=trim(p_name),registration=trim(p_registration) where id=a.staff_id;
 insert into public.submissions(id,staff_id,activity,declared_days,upload_manifest) values(p_id,a.staff_id,trim(p_activity),p_days,p_files);
 for f in select value from jsonb_array_elements(p_files) loop
  object_id:=gen_random_uuid();
  insert into public.documents(id,staff_id,submission_id,name,path,size,hash) values(object_id,a.staff_id,p_id,f->>'name',a.staff_id||'/'||p_id||'/'||object_id||'.pdf',(f->>'size')::bigint,f->>'hash');
 end loop;
 return (select jsonb_agg(jsonb_build_object('id',id,'name',name,'path',path,'size',size,'hash',hash,'status',status,'submissionStatus','draft')) from public.documents where submission_id=p_id);
end $$;

create or replace function public.finalize_submission(p_id uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.submissions; d public.documents; actor text;
begin
 select * into s from public.submissions where id=p_id for update;
 if exists(select 1 from private.upload_cleanups where id=p_id) then raise exception 'Envio descartado.'; end if;
 if s.id is null or not exists(select 1 from public.user_memberships m join public.access_allowlist a on a.id=m.access_id join auth.users u on u.id=m.user_id join public.staff_members sm on sm.id=a.staff_id where m.user_id=p_actor and lower(u.email)=a.email and sm.active and a.active and a.role='staff' and a.staff_id=s.staff_id) then raise exception 'Envio não autorizado.'; end if;
 if s.status<>'draft' then return; end if;
 if (select count(*) from public.documents where submission_id=p_id) not between 1 and 3 then raise exception 'Documentos ausentes.'; end if;
 for d in select * from public.documents where submission_id=p_id loop
  if not exists(select 1 from storage.objects o where o.bucket_id='evidence' and o.name=d.path and (o.metadata->>'size')::bigint=d.size) then raise exception 'O upload não está completo.'; end if;
 end loop;
 update public.documents set status='ready' where submission_id=p_id;
 update public.submissions set status='pending' where id=p_id;
 select name into actor from public.staff_members where id=s.staff_id;
 insert into public.audit_events(action,actor_id,actor,staff_id,detail) values('Comprovantes recebidos',p_actor,actor,s.staff_id,s.activity);
end $$;


-- Serialize balance changes without blocking foreign-key identity references.
create or replace function public.book_leave(p_id uuid,p_staff_id uuid,p_dates date[],p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare existing public.leave_bookings; sid uuid;
begin
 perform private.require_director(); select id into sid from public.staff_members where id=p_staff_id and active for no key update;
 if sid is null then raise exception 'Servidor não encontrado ou desativado.'; end if;
 select * into existing from public.leave_bookings where id=p_id;
 if existing.id is not null then
  if existing.staff_id=p_staff_id and existing.dates=p_dates and existing.reason=trim(p_reason) then return; end if;
  raise exception 'Operação repetida com dados diferentes.';
 end if;
 if p_dates is null or cardinality(p_dates) not between 1 and 60 or exists(select 1 from unnest(p_dates) d where d is null) or cardinality(p_dates)<>(select count(distinct d) from unnest(p_dates) d) then raise exception 'Selecione datas válidas e distintas.'; end if;
 if length(trim(p_reason)) not between 3 and 500 then raise exception 'Informe a justificativa.'; end if;
 if private.available(p_staff_id)<cardinality(p_dates) then raise exception 'Saldo disponível insuficiente.'; end if;
 if exists(select 1 from public.leave_bookings where staff_id=p_staff_id and status<>'cancelled' and dates && p_dates) then raise exception 'Já existe folga em uma dessas datas.'; end if;
 insert into public.leave_bookings(id,staff_id,dates,reason,actor_id,actor) values(p_id,p_staff_id,p_dates,trim(p_reason),auth.uid(),private.actor_name());
 perform private.log('Folga agendada',p_staff_id,cardinality(p_dates)||' dia(s): '||array_to_string(p_dates,', '));
end $$;

-- Service-only inspection. It cannot create an identity or authorize a login.
create function public.inspect_upload(p_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'staffId',s.staff_id,'status',s.status,'createdAt',s.created_at,
  'actorId',(select m.user_id from public.user_memberships m
    join public.access_allowlist a on a.id=m.access_id join auth.users u on u.id=m.user_id
    join public.staff_members sm on sm.id=a.staff_id
    where a.staff_id=s.staff_id and a.active and a.role='staff' and sm.active and lower(u.email)=a.email limit 1),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'path',d.path,
    'size',d.size,'hash',d.hash,'status',d.status) order by d.id) from public.documents d where d.submission_id=s.id),'[]'::jsonb),
  'cleanup',case when c.id is null then null else jsonb_build_object('documents',c.documents,
    'requestedAt',c.requested_at,'notBefore',c.not_before,'completedAt',c.completed_at) end
 ) order by s.created_at),'[]'::jsonb)
 from public.submissions s left join private.upload_cleanups c on c.id=s.id
 where (p_id is not null and s.id=p_id) or (p_id is null and (s.status='draft' or (c.id is not null and c.completed_at is null)))
$$;

-- Quarantine preserves every byte of quota until API deletion is confirmed.
create function public.retire_upload(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.submissions; protected boolean; manifest jsonb;
begin
 if p_id is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Informe envio e justificativa.'; end if;
 perform 1 from public.app_settings where singleton for update;
 select * into s from public.submissions where id=p_id;
 if s.id is null then raise exception 'Envio não encontrado.'; end if;
 perform 1 from public.staff_members where id=s.staff_id for no key update;
 select * into s from public.submissions where id=p_id for update;
 if exists(select 1 from private.upload_cleanups where id=p_id) then return; end if;
 if s.status<>'draft' or s.created_at>now()-interval '15 minutes' then raise exception 'Somente rascunho interrompido há pelo menos 15 minutos pode ser descartado.'; end if;
 if exists(select 1 from public.credit_entries where source_id=p_id)
   or exists(select 1 from public.documents where submission_id=p_id and status<>'pending') then
   raise exception 'Envio contém crédito ou documento concluído. Descarte recusado.';
 end if;
 if exists(select 1 from private.backup_snapshots b cross join lateral jsonb_array_elements(b.payload->'documents') d
   where d->>'submissionId'=p_id::text) then raise exception 'Documento referenciado em backup. Descarte recusado.'; end if;
 if to_regclass('private.recovery_runs') is not null then
  execute 'select exists(select 1 from private.recovery_runs b cross join lateral jsonb_array_elements(b.payload->''data''->''documents'') d where d->>''submissionId''=$1::text)' into protected using p_id;
  if protected then raise exception 'Documento referenciado em recuperação. Descarte recusado.'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'path',path,'size',size,'hash',hash,'status',status) order by id),'[]'::jsonb)
   into manifest from public.documents where submission_id=p_id;
 if jsonb_array_length(manifest) not between 1 and 3 then raise exception 'Metadados incompletos. Investigue antes de descartar.'; end if;
 insert into private.upload_cleanups(id,documents,reason) values(p_id,manifest,trim(p_reason));
 update public.documents set status='failed' where submission_id=p_id;
 update public.submissions set status='changes_requested',note=left('Envio interrompido descartado: '||trim(p_reason)||'. Faça um novo envio.',500) where id=p_id;
 insert into public.audit_events(action,actor,staff_id,detail) values('Envio interrompido descartado','Reconciliação assistida',s.staff_id,
   'Referência '||p_id||'. '||trim(p_reason)||'. Cota preservada até remoção conferida após 24 horas.');
end $$;

create function private.check_upload_cleanup(p_id uuid) returns private.upload_cleanups
language plpgsql security definer set search_path='' as $$
declare c private.upload_cleanups; s public.submissions;
begin
 select * into s from public.submissions where id=p_id;
 if s.id is null then raise exception 'Envio não encontrado.'; end if;
 select * into c from private.upload_cleanups where id=p_id;
 if c.id is null then raise exception 'Descarte não autorizado.'; end if;
 if c.completed_at is not null then return c; end if;
 if c.not_before>now() then raise exception 'Aguarde 24 horas antes da limpeza física.'; end if;
 if s.status<>'changes_requested' or exists(select 1 from public.credit_entries where source_id=p_id)
   or (select count(*) from public.documents where submission_id=p_id)<>jsonb_array_length(c.documents)
   or exists(select 1 from public.documents d where d.submission_id=p_id and
    (d.status<>'failed' or not exists(select 1 from jsonb_array_elements(c.documents) x where
      (x->>'id')::uuid=d.id and x->>'path'=d.path and x->>'hash'=d.hash and (x->>'size')::bigint=d.size))) then
   raise exception 'Estado do envio mudou. Limpeza recusada.';
 end if;
 return c;
end $$;
revoke all on function private.check_upload_cleanup(uuid) from public,anon,authenticated;

create function public.authorize_upload_cleanup(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin perform private.check_upload_cleanup(p_id); end $$;

create function public.finish_upload_cleanup(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c private.upload_cleanups; s public.submissions;
begin
 perform 1 from public.app_settings where singleton for update;
 select * into s from public.submissions where id=p_id;
 if s.id is null then raise exception 'Envio não encontrado.'; end if;
 perform 1 from public.staff_members where id=s.staff_id for no key update;
 perform 1 from public.submissions where id=p_id for update;
 perform 1 from private.upload_cleanups where id=p_id for update;
 c:=private.check_upload_cleanup(p_id);
 if c.completed_at is not null then return; end if;
 if exists(select 1 from storage.objects o join jsonb_array_elements(c.documents) d on d->>'path'=o.name where o.bucket_id='evidence') then
   raise exception 'Arquivos ainda existem no Storage. Use a API antes de liberar cota.';
 end if;
 delete from public.documents where submission_id=p_id;
 update private.upload_cleanups set completed_at=now() where id=p_id;
 insert into public.audit_events(action,actor,staff_id,detail) values('Limpeza de envio interrompido concluída','Reconciliação assistida',s.staff_id,
   'Referência '||p_id||'. Arquivos ausentes no Storage; cota liberada. Manifesto técnico preservado.');
end $$;

revoke all on function public.inspect_upload(uuid),public.retire_upload(uuid,text),public.authorize_upload_cleanup(uuid),public.finish_upload_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.inspect_upload(uuid),public.retire_upload(uuid,text),public.authorize_upload_cleanup(uuid),public.finish_upload_cleanup(uuid) to service_role;
commit;
