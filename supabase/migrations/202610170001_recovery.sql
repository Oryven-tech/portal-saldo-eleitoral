-- Assisted recovery only. No browser or authenticated-user restore permission.
begin;
create table private.recovery_runs (
  id uuid primary key,
  payload jsonb not null,
  completed_at timestamptz not null default now()
);
alter table private.recovery_runs enable row level security;
revoke all on private.recovery_runs from public,anon,authenticated;

create function public.restore_backup(p_snapshot jsonb,p_check_only boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  rid uuid; source jsonb; item text; previous jsonb; total bigint; result jsonb;
begin
  rid:=(p_snapshot->>'id')::uuid;
  source:=p_snapshot->'data';
  if rid is null or p_snapshot->>'createdAt' is null or source->'user'->>'role' is distinct from 'director' then
    raise exception 'Cópia completa da direção necessária.';
  end if;
  perform (p_snapshot->>'createdAt')::timestamptz;
  foreach item in array array['staff','submissions','documents','credits','bookings','access','audit'] loop
    if jsonb_typeof(source->item) is distinct from 'array' then raise exception 'Estrutura incompatível: %.',item; end if;
    if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(source->item)) then
      raise exception 'Identificadores repetidos ou ausentes: %.',item;
    end if;
  end loop;
  if jsonb_array_length(source->'staff')>200 or jsonb_array_length(source->'documents')>3000
    or jsonb_array_length(source->'submissions')>3000 or jsonb_array_length(source->'credits')>20000
    or jsonb_array_length(source->'bookings')>20000 or jsonb_array_length(source->'audit')>30000 then
    raise exception 'Cópia acima dos limites suportados.';
  end if;
  perform 1 from public.app_settings where singleton for update;
  lock table public.staff_members,public.submissions,public.documents,public.credit_entries,
    public.leave_bookings,public.access_allowlist,public.user_memberships in share row exclusive mode;
  select payload into previous from private.recovery_runs where id=rid;
  if previous is not null then
    if previous<>p_snapshot then raise exception 'Identificador de recuperação repetido com outros dados.'; end if;
    return jsonb_build_object('status','already_restored','snapshotId',rid);
  end if;
  if exists(select 1 from private.recovery_runs) or exists(select 1 from public.staff_members)
    or exists(select 1 from public.submissions) or exists(select 1 from public.documents)
    or exists(select 1 from public.credit_entries) or exists(select 1 from public.leave_bookings)
    or exists(select 1 from public.access_allowlist where role<>'director') then
    raise exception 'A recuperação exige destino vazio. Nenhum registro existente será substituído.';
  end if;
  if not exists(select 1 from public.access_allowlist where role='director' and active) then
    raise exception 'Configure primeiro o administrador do novo projeto.';
  end if;
  if exists(select 1 from jsonb_array_elements(source->'staff') s join public.access_allowlist a
    on a.email=lower(trim(s->>'email'))) then
    raise exception 'O administrador do destino deve ter e-mail diferente dos servidores restaurados.';
  end if;
  if exists(select 1 from storage.objects where bucket_id='evidence' and left(name,length('_recovery/'||rid||'/'))<>'_recovery/'||rid||'/') then
    raise exception 'O destino contém arquivos de outra operação.';
  end if;
  select coalesce(sum((d->>'size')::bigint),0) into total from jsonb_array_elements(source->'documents') d;
  if total>(select storage_budget from public.app_settings where singleton) then
    raise exception 'Orçamento de armazenamento insuficiente.';
  end if;
  result:=jsonb_build_object('snapshotId',rid,'staff',jsonb_array_length(source->'staff'),
    'documents',jsonb_array_length(source->'documents'),'bytes',total);
  if p_check_only then return result||jsonb_build_object('status','empty'); end if;

  -- Objects are uploaded with overwrite disabled and verified byte-for-byte by
  -- the local operator before metadata can become visible to portal users.
  if exists(select 1 from jsonb_array_elements(source->'documents') d where not exists(
    select 1 from storage.objects o where o.bucket_id='evidence'
      and o.name='_recovery/'||rid||'/'||(d->>'id')::uuid||'.pdf'
      and (o.metadata->>'size')::bigint=(d->>'size')::bigint)) then
    raise exception 'Faltam documentos completos no destino.';
  end if;
  if exists(select 1 from storage.objects o where o.bucket_id='evidence' and not exists(
    select 1 from jsonb_array_elements(source->'documents') d
    where o.name='_recovery/'||rid||'/'||(d->>'id')::uuid||'.pdf')) then
    raise exception 'Há arquivos fora do conjunto validado.';
  end if;

  insert into public.staff_members(id,name,email,registration,active,storage_limit)
    select (s->>'id')::uuid,s->>'name',lower(trim(s->>'email')),s->>'registration',(s->>'active')::boolean,
      greatest(10000000,coalesce((select sum((d->>'size')::bigint)
        from jsonb_array_elements(source->'documents') d where d->>'staffId'=s->>'id'),0))
    from jsonb_array_elements(source->'staff') s;
  -- Historical roles are untrusted. Recreate staff entries disabled, with new
  -- identities; only a director's later explicit activation can admit a login.
  insert into public.access_allowlist(name,email,role,staff_id,active)
    select name,email,'staff',id,false from public.staff_members;
  insert into public.submissions(id,staff_id,activity,declared_days,status,note,upload_manifest,created_at)
    select (s->>'id')::uuid,(s->>'staffId')::uuid,s->>'activity',(s->>'declaredDays')::integer,
      case when s->>'status'='draft' then 'changes_requested' else s->>'status' end,
      case when s->>'status'='draft' then left('Recuperação: envio interrompido. Reenvie os PDFs para nova análise. '||coalesce(s->>'note',''),500)
        else s->>'note' end,
      coalesce((select jsonb_agg(jsonb_build_object('name',d->>'name','size',(d->>'size')::bigint,'hash',d->>'hash') order by d->>'id')
        from jsonb_array_elements(source->'documents') d where d->>'submissionId'=s->>'id'),'[]'::jsonb),
      (s->>'createdAt')::timestamptz
    from jsonb_array_elements(source->'submissions') s;
  insert into public.documents(id,staff_id,submission_id,name,path,size,hash,status,created_at)
    select (d->>'id')::uuid,(d->>'staffId')::uuid,(d->>'submissionId')::uuid,d->>'name',
      '_recovery/'||rid||'/'||(d->>'id')::uuid||'.pdf',(d->>'size')::bigint,d->>'hash','ready',(d->>'createdAt')::timestamptz
    from jsonb_array_elements(source->'documents') d;
  insert into public.credit_entries(id,staff_id,days,reason,source_id,actor,created_at)
    select (c->>'id')::uuid,(c->>'staffId')::uuid,(c->>'days')::integer,c->>'reason',
      (c->>'sourceId')::uuid,c->>'actor',(c->>'createdAt')::timestamptz
    from jsonb_array_elements(source->'credits') c;
  insert into public.leave_bookings(id,staff_id,dates,status,reason,actor,created_at)
    select (b->>'id')::uuid,(b->>'staffId')::uuid,
      array(select value::date from jsonb_array_elements_text(b->'dates')),
      b->>'status',b->>'reason',b->>'actor',(b->>'createdAt')::timestamptz
    from jsonb_array_elements(source->'bookings') b;

  if exists(select 1 from public.documents d join public.submissions s on s.id=d.submission_id where d.staff_id<>s.staff_id)
    or exists(select 1 from public.credit_entries c join public.submissions s on s.id=c.source_id where c.staff_id<>s.staff_id or s.status<>'approved' or c.days<1)
    or exists(select 1 from public.submissions s where
      (s.status='approved' and not exists(select 1 from public.credit_entries c where c.source_id=s.id))
      or (s.status in ('pending','approved') and not exists(select 1 from public.documents d where d.submission_id=s.id))) then
    raise exception 'Vínculos ou créditos inconsistentes.';
  end if;
  if exists(select 1 from public.staff_members where private.available(id)<0) then
    raise exception 'Saldo comprometido acima dos créditos.';
  end if;
  if exists(select 1 from public.leave_bookings where cardinality(dates)<>(select count(distinct d) from unnest(dates) d))
    or exists(select 1 from public.leave_bookings a join public.leave_bookings b on a.staff_id=b.staff_id and a.id<b.id
      where a.status<>'cancelled' and b.status<>'cancelled' and a.dates && b.dates) then
    raise exception 'Datas repetidas ou folgas sobrepostas.';
  end if;
  if exists(select 1 from public.submissions s where (select count(*)>3 or sum(size)>10000000 from public.documents where submission_id=s.id)) then
    raise exception 'Envio acima dos limites suportados.';
  end if;
  insert into public.audit_events(id,action,actor,detail,created_at)
    select (a->>'id')::uuid,a->>'action',a->>'actor',a->>'detail',(a->>'createdAt')::timestamptz
    from jsonb_array_elements(source->'audit') a;
  update public.app_settings set school_name=source->>'schoolName' where singleton;
  insert into private.recovery_runs(id,payload) values(rid,p_snapshot);
  insert into public.audit_events(action,actor,detail) values('Backup restaurado','Recuperação assistida',
    'Referência '||rid||'. Acessos históricos não foram autorizados. Rascunhos incompletos exigem reenvio.');
  return result||jsonb_build_object('status','restored');
end $$;
revoke all on function public.restore_backup(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.restore_backup(jsonb,boolean) to service_role;

commit;
