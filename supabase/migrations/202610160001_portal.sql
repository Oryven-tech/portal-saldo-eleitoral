-- Portal Saldo Eleitoral. Apply to a dedicated, empty Supabase project.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.app_settings (
  singleton boolean primary key default true check (singleton),
  school_name text not null default 'Unidade escolar · identificação pendente' check(length(school_name) between 3 and 200),
  storage_budget bigint not null default 700000000 check(storage_budget between 1 and 700000000)
);
insert into public.app_settings(singleton) values(true);
create table public.staff_members (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 3 and 120),
  email text not null unique check(email = lower(trim(email))), registration text not null default '' check(length(registration)<=60),
  active boolean not null default true, storage_limit bigint not null default 10000000 check(storage_limit between 1 and 30000000), created_at timestamptz not null default now()
);
create table public.access_allowlist (
  id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(trim(email)) and position('@' in email)>1),
  name text not null check(length(name) between 3 and 120), role text not null check(role in ('director','staff')),
  staff_id uuid references public.staff_members(id), active boolean not null default true, created_at timestamptz not null default now(),
  check((role='staff' and staff_id is not null) or role='director')
);
create table public.user_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade, access_id uuid not null unique references public.access_allowlist(id), created_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key, staff_id uuid not null references public.staff_members(id), activity text not null check(length(activity) between 3 and 120),
  declared_days integer not null check(declared_days between 1 and 366), status text not null default 'draft' check(status in ('draft','pending','approved','changes_requested')),
  note text not null default '' check(length(note)<=500), upload_manifest jsonb not null, created_at timestamptz not null default now()
);
create unique index one_open_activity on public.submissions(staff_id,activity) where status in ('draft','pending');
create table public.documents (
  id uuid primary key default gen_random_uuid(), staff_id uuid not null references public.staff_members(id), submission_id uuid not null references public.submissions(id),
  name text not null check(length(name) between 1 and 255), path text not null unique, size bigint not null check(size between 1 and 10000000),
  hash text not null check(hash ~ '^[a-f0-9]{64}$'), status text not null default 'pending' check(status in ('pending','ready','failed')),
  created_at timestamptz not null default now()
);
create table public.credit_entries (
  id uuid primary key default gen_random_uuid(), staff_id uuid not null references public.staff_members(id), days integer not null check(days<>0 and days between -366 and 366),
  reason text not null check(length(reason) between 3 and 500), source_id uuid unique references public.submissions(id), actor_id uuid references auth.users(id) on delete set null,
  actor text not null, created_at timestamptz not null default now()
);
create table public.leave_bookings (
  id uuid primary key, staff_id uuid not null references public.staff_members(id), dates date[] not null check(cardinality(dates) between 1 and 60),
  status text not null default 'reserved' check(status in ('reserved','used','cancelled')), reason text not null check(length(reason) between 3 and 500),
  actor_id uuid references auth.users(id) on delete set null, actor text not null, created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), action text not null, actor_id uuid references auth.users(id) on delete set null,
  actor text not null, staff_id uuid references public.staff_members(id), detail text not null, created_at timestamptz not null default now()
);
create table private.backup_snapshots(id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), actor_id uuid not null, payload jsonb not null);
create index submissions_staff on public.submissions(staff_id);
create index documents_staff on public.documents(staff_id);
create index credits_staff on public.credit_entries(staff_id);
create index bookings_staff on public.leave_bookings(staff_id);
create index audit_staff on public.audit_events(staff_id,created_at);

create function private.current_access() returns public.access_allowlist language sql stable security definer set search_path='' as $$
 select a from public.access_allowlist a join public.user_memberships m on m.access_id=a.id join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and a.active and lower(u.email)=a.email
$$;
create function private.is_director() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((private.current_access()).role='director',false)
$$;
create function private.can_read(p_staff uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.is_director() or ((private.current_access()).staff_id=p_staff and exists(select 1 from public.staff_members where id=p_staff and active)),false)
$$;
create function private.require_director() returns void language plpgsql stable security definer set search_path='' as $$
begin if not private.is_director() then raise exception 'Ação restrita à direção.' using errcode='42501'; end if; end $$;
create function private.actor_name() returns text language sql stable security definer set search_path='' as $$select coalesce((private.current_access()).name,'Responsável')$$;
create function private.log(p_action text,p_staff uuid,p_detail text) returns void language sql security definer set search_path='' as $$
 insert into public.audit_events(action,staff_id,detail,actor_id,actor) values(p_action,p_staff,p_detail,auth.uid(),private.actor_name())
$$;
create function private.available(p_staff uuid) returns integer language sql stable security definer set search_path='' as $$
 select (coalesce((select sum(days) from public.credit_entries where staff_id=p_staff),0)-coalesce((select sum(cardinality(dates)) from public.leave_bookings where staff_id=p_staff and status in ('reserved','used')),0))::integer
$$;

-- Admission is checked both before Auth creation and on every data operation.
create function public.before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if event->'user'->'app_metadata'->>'provider' is distinct from 'google' or not exists(select 1 from public.access_allowlist where email=lower(event->'user'->>'email') and active) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Acesso não autorizado. Procure a direção.'));
 end if;
 return '{}'::jsonb;
end $$;
create function private.attach_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist;
begin
 select * into a from public.access_allowlist where email=lower(new.email) and active for update;
 if a.id is null or new.raw_app_meta_data->>'provider' is distinct from 'google' then raise exception 'Acesso não autorizado.'; end if;
 insert into public.user_memberships(user_id,access_id) values(new.id,a.id);
 return new;
end $$;
create trigger on_portal_auth_user after insert on auth.users for each row execute function private.attach_auth_user();

alter table public.app_settings enable row level security;
alter table public.staff_members enable row level security;
alter table public.access_allowlist enable row level security;
alter table public.user_memberships enable row level security;
alter table public.submissions enable row level security;
alter table public.documents enable row level security;
alter table public.credit_entries enable row level security;
alter table public.leave_bookings enable row level security;
alter table public.audit_events enable row level security;
create policy settings_read on public.app_settings for select to authenticated using((private.current_access()).id is not null);
create policy staff_read on public.staff_members for select to authenticated using(private.can_read(id));
create policy access_read on public.access_allowlist for select to authenticated using(private.is_director());
create policy membership_read on public.user_memberships for select to authenticated using(user_id=auth.uid() and (private.current_access()).id is not null);
create policy submission_read on public.submissions for select to authenticated using(private.can_read(staff_id));
create policy document_read on public.documents for select to authenticated using(status='ready' and private.can_read(staff_id));
create policy credit_read on public.credit_entries for select to authenticated using(private.can_read(staff_id));
create policy booking_read on public.leave_bookings for select to authenticated using(private.can_read(staff_id));
create policy audit_read on public.audit_events for select to authenticated using(private.is_director());
revoke all on all tables in schema public from anon,authenticated;
grant select on public.app_settings,public.staff_members,public.access_allowlist,public.user_memberships,public.submissions,public.documents,public.credit_entries,public.leave_bookings,public.audit_events to authenticated;

create function public.add_access(p_name text,p_email text,p_role text default 'staff') returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 perform private.require_director();
 if p_role<>'staff' then raise exception 'Novos gestores exigem configuração técnica explícita.'; end if;
 if length(trim(p_name))<3 or length(p_name)>120 or length(p_email)>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Confira nome e e-mail.'; end if;
 insert into public.staff_members(name,email) values(trim(p_name),lower(trim(p_email))) returning id into sid;
 insert into public.access_allowlist(name,email,role,staff_id) values(trim(p_name),lower(trim(p_email)),'staff',sid);
 perform private.log('Acesso autorizado',sid,trim(p_name));
end $$;
create function public.toggle_access(p_id uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist;
begin
 perform private.require_director(); select * into a from public.access_allowlist where id=p_id for update;
 if a.id is null or a.role='director' then raise exception 'Este acesso exige configuração técnica.'; end if;
 update public.access_allowlist set active=p_active where id=p_id; update public.staff_members set active=p_active where id=a.staff_id;
 perform private.log(case when p_active then 'Acesso reativado' else 'Acesso desativado' end,a.staff_id,a.name);
end $$;

create function public.book_leave(p_id uuid,p_staff_id uuid,p_dates date[],p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare existing public.leave_bookings; sid uuid;
begin
 perform private.require_director(); select id into sid from public.staff_members where id=p_staff_id and active for update;
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
create function public.change_booking(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare b public.leave_bookings;
begin
 perform private.require_director(); select * into b from public.leave_bookings where id=p_id;
 if b.id is null then raise exception 'Agendamento não encontrado.'; end if;
 perform 1 from public.staff_members where id=b.staff_id for update;
 select * into b from public.leave_bookings where id=p_id for update;
 if p_status not in ('used','cancelled') then raise exception 'Estado inválido.'; end if;
 if b.status=p_status then return; end if;
 if b.status<>'reserved' then raise exception 'Lançamento concluído. Correções exigem reconciliação técnica.'; end if;
 if p_status='used' and exists(select 1 from unnest(b.dates) d where d>(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Não confirme uso de uma folga futura.'; end if;
 update public.leave_bookings set status=p_status where id=p_id;
 perform private.log(case when p_status='used' then 'Folga usufruída' else 'Agendamento cancelado' end,b.staff_id,b.reason);
end $$;
create function public.reschedule_booking(p_id uuid,p_dates date[],p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare b public.leave_bookings;
begin
 perform private.require_director(); select * into b from public.leave_bookings where id=p_id;
 if b.id is null then raise exception 'Agendamento não encontrado.'; end if;
 perform 1 from public.staff_members where id=b.staff_id for update;
 select * into b from public.leave_bookings where id=p_id for update;
 if b.status<>'reserved' then raise exception 'Somente agendamentos podem ser alterados.'; end if;
 if p_dates is null or cardinality(p_dates) not between 1 and 60 or exists(select 1 from unnest(p_dates) d where d is null) or cardinality(p_dates)<>(select count(distinct d) from unnest(p_dates) d) or length(trim(p_reason)) not between 3 and 500 then raise exception 'Confira datas e justificativa.'; end if;
 if private.available(b.staff_id)+cardinality(b.dates)<cardinality(p_dates) then raise exception 'Saldo disponível insuficiente.'; end if;
 if exists(select 1 from public.leave_bookings where staff_id=b.staff_id and id<>p_id and status<>'cancelled' and dates && p_dates) then raise exception 'Já existe folga nessas datas.'; end if;
 perform private.log('Agendamento alterado',b.staff_id,array_to_string(b.dates,', ')||' → '||array_to_string(p_dates,', ')||': '||trim(p_reason));
 update public.leave_bookings set dates=p_dates,reason=trim(p_reason) where id=p_id;
end $$;
create function public.review_submission(p_id uuid,p_days integer,p_note text,p_approved boolean) returns void language plpgsql security definer set search_path='' as $$
declare s public.submissions;
begin
 perform private.require_director(); select * into s from public.submissions where id=p_id;
 if s.id is null then raise exception 'Envio não encontrado.'; end if;
 perform 1 from public.staff_members where id=s.staff_id for update;
 select * into s from public.submissions where id=p_id for update;
 if s.status<>'pending' then raise exception 'Este envio já foi analisado ou não está completo.'; end if;
 if length(trim(p_note)) not between 3 and 500 then raise exception 'Registre o motivo da decisão.'; end if;
 if not exists(select 1 from public.documents where submission_id=p_id and status='ready') then raise exception 'Documentos não disponíveis.'; end if;
 if p_approved then
  if p_days is null or p_days not between 1 and 366 then raise exception 'Quantidade de dias inválida.'; end if;
  insert into public.credit_entries(staff_id,days,reason,source_id,actor_id,actor) values(s.staff_id,p_days,trim(p_note),p_id,auth.uid(),private.actor_name());
 end if;
 update public.submissions set status=case when p_approved then 'approved' else 'changes_requested' end,note=trim(p_note) where id=p_id;
 perform private.log(case when p_approved then 'Crédito aprovado' else 'Correção solicitada' end,s.staff_id,trim(p_note));
end $$;
create function public.adjust_credit(p_id uuid,p_staff_id uuid,p_days integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.credit_entries;
begin
 perform private.require_director(); perform 1 from public.staff_members where id=p_staff_id for update;
 if not found then raise exception 'Servidor não encontrado.'; end if;
 select * into c from public.credit_entries where id=p_id;
 if c.id is not null then
  if c.staff_id=p_staff_id and c.days=p_days and c.reason=trim(p_reason) and c.source_id is null then return; end if;
  raise exception 'Operação repetida com conteúdo diferente.';
 end if;
 if p_days is null or p_days=0 or p_days not between -366 and 366 or length(trim(p_reason)) not between 3 and 500 then raise exception 'Informe dias e justificativa válidos.'; end if;
 if private.available(p_staff_id)+p_days<0 then raise exception 'O ajuste comprometeria dias já usados ou reservados.'; end if;
 insert into public.credit_entries(id,staff_id,days,reason,actor_id,actor) values(p_id,p_staff_id,p_days,trim(p_reason),auth.uid(),private.actor_name());
 perform private.log('Ajuste de crédito',p_staff_id,p_days||' dia(s): '||trim(p_reason));
end $$;

-- All object creation is through the authenticated Edge Function. Browser clients have no INSERT policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidence','evidence',false,10000000,array['application/pdf']);
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and exists(select 1 from public.documents d where d.path=storage.objects.name and d.status='ready' and private.can_read(d.staff_id)));

create function public.reserve_submission(p_id uuid,p_name text,p_registration text,p_activity text,p_days integer,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist; s public.submissions; f jsonb; total bigint; used bigint; lim bigint; object_id uuid;
begin
 a:=private.current_access();
 if a.id is null or a.role<>'staff' or a.staff_id is null then raise exception 'Acesso de servidor necessário.'; end if;
 perform 1 from public.app_settings where singleton for update;
 select storage_limit into lim from public.staff_members where id=a.staff_id and active for update;
 if lim is null then raise exception 'Servidor desativado.'; end if;
 if length(trim(p_name)) not between 3 and 120 or length(p_registration)>60 or length(trim(p_activity)) not between 3 and 120 or p_days is null or p_days not between 1 and 366 then raise exception 'Confira os dados do formulário.'; end if;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 3 then raise exception 'Anexe de 1 a 3 PDFs.'; end if;
 select * into s from public.submissions where id=p_id for update;
 if s.id is not null then
  if s.staff_id<>a.staff_id or s.activity<>trim(p_activity) or s.declared_days<>p_days or s.upload_manifest<>p_files then raise exception 'Reenvio incompatível com o original.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'path',path,'size',size,'hash',hash)) from public.documents where submission_id=p_id),'[]'::jsonb);
 end if;
 total:=0;
 for f in select value from jsonb_array_elements(p_files) loop
  if (f->>'size')::bigint not between 1 and 10000000 or length(f->>'name') not between 1 and 255 or f->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'Arquivo inválido.'; end if;
  total:=total+(f->>'size')::bigint;
 end loop;
 if total>10000000 then raise exception 'Os PDFs excedem 10 MB.'; end if;
 select coalesce(sum(size),0) into used from public.documents where staff_id=a.staff_id and status<>'failed';
 if used+total>lim then raise exception 'Limite acumulado de documentos atingido. Procure a direção.'; end if;
 select coalesce(sum(size),0) into used from public.documents where status<>'failed';
 if used+total>(select storage_budget from public.app_settings where singleton) then raise exception 'Orçamento de armazenamento atingido. Procure a direção.'; end if;
 update public.staff_members set name=trim(p_name),registration=trim(p_registration) where id=a.staff_id;
 insert into public.submissions(id,staff_id,activity,declared_days,upload_manifest) values(p_id,a.staff_id,trim(p_activity),p_days,p_files);
 for f in select value from jsonb_array_elements(p_files) loop
  object_id:=gen_random_uuid();
  insert into public.documents(id,staff_id,submission_id,name,path,size,hash) values(object_id,a.staff_id,p_id,f->>'name',a.staff_id||'/'||p_id||'/'||object_id||'.pdf',(f->>'size')::bigint,f->>'hash');
 end loop;
 return (select jsonb_agg(jsonb_build_object('id',id,'name',name,'path',path,'size',size,'hash',hash)) from public.documents where submission_id=p_id);
end $$;
create function public.finalize_submission(p_id uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.submissions; d public.documents; actor text;
begin
 select * into s from public.submissions where id=p_id for update;
 if s.id is null or not exists(select 1 from public.user_memberships m join public.access_allowlist a on a.id=m.access_id where m.user_id=p_actor and a.active and a.role='staff' and a.staff_id=s.staff_id) then raise exception 'Envio não autorizado.'; end if;
 if s.status<>'draft' then return; end if;
 for d in select * from public.documents where submission_id=p_id loop
  if not exists(select 1 from storage.objects o where o.bucket_id='evidence' and o.name=d.path and (o.metadata->>'size')::bigint=d.size) then raise exception 'O upload não está completo.'; end if;
 end loop;
 update public.documents set status='ready' where submission_id=p_id;
 update public.submissions set status='pending' where id=p_id;
 select name into actor from public.staff_members where id=s.staff_id;
 insert into public.audit_events(action,actor_id,actor,staff_id,detail) values('Comprovantes recebidos',p_actor,actor,s.staff_id,s.activity);
end $$;

create function private.snapshot_payload(p_full boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'schoolName',(select school_name from public.app_settings where singleton),
  'user',jsonb_build_object('name',(private.current_access()).name,'email',(private.current_access()).email,'role',(private.current_access()).role,'staffId',(private.current_access()).staff_id),
  'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'registration',registration,'active',active) order by name) from public.staff_members where private.can_read(id)),'[]'::jsonb),
  'credits',coalesce((select jsonb_agg(jsonb_build_object('id',id,'staffId',staff_id,'days',days,'reason',reason,'createdAt',created_at,'actor',actor,'sourceId',source_id) order by created_at desc) from public.credit_entries where private.can_read(staff_id)),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'staffId',staff_id,'dates',dates,'status',status,'reason',reason,'createdAt',created_at,'actor',actor) order by created_at desc) from public.leave_bookings where private.can_read(staff_id)),'[]'::jsonb),
  'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'staffId',staff_id,'activity',activity,'declaredDays',declared_days,'status',status,'note',note,'createdAt',created_at) order by created_at desc) from public.submissions where private.can_read(staff_id)),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'staffId',staff_id,'submissionId',submission_id,'name',name,'path',path,'size',size,'hash',hash,'createdAt',created_at) order by created_at) from public.documents where status='ready' and private.can_read(staff_id)),'[]'::jsonb),
  'access',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'role',role,'active',active) order by name) from public.access_allowlist where private.is_director()),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'actor',actor,'createdAt',created_at,'detail',detail) order by created_at desc) from (select * from public.audit_events where private.is_director() order by created_at desc limit case when p_full then null else 50 end) a),'[]'::jsonb)
 )
$$;
create function public.portal_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if (private.current_access()).id is null then raise exception 'Acesso não autorizado.' using errcode='42501'; end if; return private.snapshot_payload(false); end $$;
create function public.create_backup_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.backup_snapshots;
begin
 perform private.require_director();
 insert into private.backup_snapshots(actor_id,payload) values(auth.uid(),private.snapshot_payload(true)) returning * into b;
 delete from private.backup_snapshots where id in(select id from private.backup_snapshots order by created_at desc offset 20);
 perform private.log('Referência de backup criada',null,'A criação do snapshot não confirma a guarda dos arquivos.');
 return jsonb_build_object('id',b.id,'createdAt',b.created_at,'data',b.payload);
end $$;

-- Explicit grants: no mutable table grants and no anonymous RPC access.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.current_access(),private.is_director(),private.can_read(uuid) to authenticated;
revoke all on function public.before_user_created(jsonb),public.add_access(text,text,text),public.toggle_access(uuid,boolean),public.book_leave(uuid,uuid,date[],text),public.change_booking(uuid,text),public.review_submission(uuid,integer,text,boolean),public.adjust_credit(uuid,uuid,integer,text),public.reserve_submission(uuid,text,text,text,integer,jsonb),public.finalize_submission(uuid,uuid),public.portal_snapshot(),public.create_backup_snapshot() from public,anon,authenticated;
revoke all on function public.reschedule_booking(uuid,date[],text) from public,anon,authenticated;
grant execute on function public.reschedule_booking(uuid,date[],text),public.add_access(text,text,text),public.toggle_access(uuid,boolean),public.book_leave(uuid,uuid,date[],text),public.change_booking(uuid,text),public.review_submission(uuid,integer,text,boolean),public.adjust_credit(uuid,uuid,integer,text),public.reserve_submission(uuid,text,text,text,integer,jsonb),public.portal_snapshot(),public.create_backup_snapshot() to authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.finalize_submission(uuid,uuid) to service_role;
commit;
