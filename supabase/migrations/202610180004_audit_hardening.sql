-- Audit fixes: closed defaults, finite calendar arrays and explicit decisions.
begin;
-- A schema-level REVOKE cannot remove the global PUBLIC execute default.
-- Existing RPC permissions are unchanged; future RPCs require explicit grants.
alter default privileges for role postgres revoke execute on functions from public,anon,authenticated;

create function private.valid_leave_dates(p_dates date[]) returns boolean
language sql immutable strict set search_path='' as $$
 select coalesce(array_ndims(p_dates)=1 and array_lower(p_dates,1)=1
  and cardinality(p_dates) between 1 and 60
  and not exists(select 1 from unnest(p_dates) d where d is null or d<'0001-01-01'::date or d>'9999-12-31'::date)
  and cardinality(p_dates)=(select count(distinct d) from unnest(p_dates) d),false)
$$;
revoke all on function private.valid_leave_dates(date[]) from public,anon,authenticated;
alter table public.leave_bookings add constraint leave_dates_exportable check(private.valid_leave_dates(dates)) not valid;
alter table public.leave_bookings validate constraint leave_dates_exportable;

-- Match the application's practical email syntax, including legacy test domains.
-- New staff admission still requires the exact institutional domain in its RPC.
create function private.valid_portal_email(p_email text) returns boolean
language sql immutable strict set search_path='' as $$
 select p_email=lower(trim(p_email)) and length(p_email) between 3 and 254
  and p_email ~ '^(?:[A-Za-z0-9_''+-]+[.])*[A-Za-z0-9_''+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*[.])+[A-Za-z]{2,}$'
$$;
revoke all on function private.valid_portal_email(text) from public,anon,authenticated;
alter table public.staff_members add constraint staff_email_exportable check(private.valid_portal_email(email)) not valid;
alter table public.access_allowlist add constraint access_email_exportable check(private.valid_portal_email(email)) not valid;
alter table public.staff_members validate constraint staff_email_exportable;
alter table public.access_allowlist validate constraint access_email_exportable;

create or replace function public.review_submission(p_id uuid,p_days integer,p_note text,p_approved boolean) returns void
language plpgsql security definer set search_path='' as $$
declare s public.submissions;
begin
 perform private.require_director();
 if p_approved is null or p_note is null or length(trim(p_note)) not between 3 and 500 then
  raise exception 'Informe a decisão e o motivo da análise.';
 end if;
 select * into s from public.submissions where id=p_id;
 if s.id is null then raise exception 'Envio não encontrado.'; end if;
 -- Keep the same lock order as quota, identity and correction operations.
 perform 1 from public.staff_members where id=s.staff_id for no key update;
 select * into s from public.submissions where id=p_id for update;
 if s.status<>'pending' then raise exception 'Este envio já foi analisado ou não está completo.'; end if;
 if not exists(select 1 from public.documents where submission_id=p_id and status='ready') then raise exception 'Documentos não disponíveis.'; end if;
 if p_approved then
  if p_days is null or p_days not between 1 and 366 then raise exception 'Quantidade de dias inválida.'; end if;
  insert into public.credit_entries(staff_id,days,reason,source_id,actor_id,actor)
   values(s.staff_id,p_days,trim(p_note),p_id,auth.uid(),private.actor_name());
 end if;
 update public.submissions set status=case when p_approved then 'approved' else 'changes_requested' end,note=trim(p_note) where id=p_id;
 perform private.log(case when p_approved then 'Crédito aprovado' else 'Correção solicitada' end,s.staff_id,trim(p_note));
end $$;

-- Optional platform event trigger: it never needs direct browser execution.
-- Preserve the trigger itself and its automatic RLS protection.
do $migration$
declare owner_id oid;
begin
 select proowner into owner_id from pg_proc where oid=to_regprocedure('public.rls_auto_enable()')
  and prorettype='event_trigger'::regtype;
 if owner_id is not null and pg_has_role(current_user,owner_id,'USAGE') then
  revoke all on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $migration$;
commit;
