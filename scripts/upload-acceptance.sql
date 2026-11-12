-- TEST ONLY. Apply through the isolated PSE Homologacao SQL Editor.
-- No passwords, tokens, real Google identities or persistent active accounts.
begin;
do $$ begin
 if (select school_name from public.app_settings where singleton)<>'Escola de Ensaio PSE'
   or to_regclass('private.upload_cleanups') is null
   or exists(select 1 from auth.users)
   or not exists(select 1 from private.recovery_runs where id='91000000-0000-4000-8000-000000000001') then
  raise exception 'Somente o ambiente isolado de ensaio pode receber este roteiro.';
 end if;
 if exists(select 1 from public.staff_members where id::text like '83000000-%') then
  raise exception 'Ensaio já existe. Preserve as evidências e investigue antes de repetir.';
 end if;
end $$;
create table private.upload_acceptance_context(singleton boolean primary key default true check(singleton),baseline_budget bigint not null);
alter table private.upload_acceptance_context enable row level security;
revoke all on private.upload_acceptance_context from public,anon,authenticated;
insert into private.upload_acceptance_context(baseline_budget) select storage_budget from public.app_settings where singleton;
insert into public.staff_members(id,name,email,registration) values
 ('83000000-0000-4000-8000-000000000001','Ensaio upload A','upload-a@example.invalid','UPLOAD-A'),
 ('83000000-0000-4000-8000-000000000002','Ensaio upload B','upload-b@example.invalid','UPLOAD-B');
insert into public.access_allowlist(name,email,role,staff_id,active) values
 ('Ensaio upload A','upload-a@example.invalid','staff','83000000-0000-4000-8000-000000000001',false),
 ('Ensaio upload B','upload-b@example.invalid','staff','83000000-0000-4000-8000-000000000002',false),
 ('Direção sintética upload','upload-director@example.invalid','director',null,false);
insert into public.credit_entries(staff_id,days,reason,actor) values('83000000-0000-4000-8000-000000000001',1,'Crédito fictício de concorrência','Ensaio técnico');

create function public.pse_upload_acceptance(p_action text,p_id uuid default null,p_actor integer default 1,
 p_files jsonb default null,p_limit bigint default null,p_dates date[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; actor uuid; test_email text; answer jsonb;
begin
 if p_actor not in (1,2) or (p_id is not null and p_id::text not like '83000000-%') then raise exception 'Referência fora dos dados fictícios.'; end if;
 if p_action='info' then
  return jsonb_build_object('environment','isolated-upload-acceptance-v1',
   'staff',(select count(*) from public.staff_members where id::text like '83000000-%'),
   'submissions',(select count(*) from public.submissions where staff_id::text like '83000000-%'),
   'documents',(select count(*) from public.documents where staff_id::text like '83000000-%'),
   'authUsers',(select count(*) from auth.users),'activeTestAccesses',(select count(*) from public.access_allowlist where email like 'upload-%@example.invalid' and active),
   'bookings',(select count(*) from public.leave_bookings where staff_id::text like '83000000-%'),
   'available',private.available('83000000-0000-4000-8000-000000000001'),
   'originalPdf',(select count(*) from public.documents where id='91000000-0000-4000-8000-000000000004' and size=686),
   'budgetRestored',(select storage_budget=(select baseline_budget from private.upload_acceptance_context) from public.app_settings where singleton));
 end if;
 if p_action='restore_limits' then
  update public.app_settings set storage_budget=(select baseline_budget from private.upload_acceptance_context) where singleton;
  update public.staff_members set storage_limit=10000000 where id::text like '83000000-%';
  return jsonb_build_object('ok',true);
 end if;
 if p_action in ('global_limit','staff_limit') then
  if p_limit not between 1 and 100000 then raise exception 'Margem de teste inválida.'; end if;
  if p_action='global_limit' then
   update public.app_settings set storage_budget=(select coalesce(sum(size),0) from public.documents)+p_limit where singleton;
  else
   update public.staff_members set storage_limit=(select coalesce(sum(size),0) from public.documents where staff_id=public.staff_members.id)+p_limit
    where id='83000000-0000-4000-8000-000000000001';
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='age' then
  update public.submissions set created_at=now()-interval '1 hour' where id=p_id and staff_id::text like '83000000-%' and status='draft';
  return jsonb_build_object('ok',found);
 end if;
 if p_action='advance_cleanup_clock' then
  update private.upload_cleanups set not_before=now()-interval '1 second' where id=p_id and completed_at is null;
  return jsonb_build_object('ok',found);
 end if;
 if p_action not in ('reserve','finalize','book') or p_id is null then raise exception 'Ação de teste inválida.'; end if;
 sid:=case when p_actor=1 then '83000000-0000-4000-8000-000000000001'::uuid else '83000000-0000-4000-8000-000000000002'::uuid end;
 actor:=gen_random_uuid();
 test_email:='upload-'||actor||'@example.invalid';
 -- These identities and active flags exist only within this RPC transaction.
 -- Success removes them before commit; any error rolls the entire RPC back.
 -- Separate identities avoid serializing the test on a shared Auth row before
 -- the application itself acquires its quota/balance locks.
 insert into public.access_allowlist(name,email,role,staff_id,active)
  values('Identidade sintética de ensaio',test_email,case when p_action='book' then 'director' else 'staff' end,
    case when p_action='book' then null else sid end,true);
 insert into auth.users(id,email,raw_app_meta_data) values(actor,test_email,'{"provider":"google"}');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if p_action='reserve' then
  answer:=public.reserve_submission(p_id,'Ensaio upload',case when p_actor=1 then 'UPLOAD-A' else 'UPLOAD-B' end,'Ensaio '||p_id,2,p_files);
 elsif p_action='finalize' then perform public.finalize_submission(p_id,actor); answer:=jsonb_build_object('ok',true);
 else perform public.book_leave(p_id,sid,p_dates,'Folga fictícia de concorrência'); answer:=jsonb_build_object('ok',true);
 end if;
 delete from auth.users where id=actor;
 delete from public.access_allowlist where email=test_email;
 return answer;
end $$;
revoke all on function public.pse_upload_acceptance(text,uuid,integer,jsonb,bigint,date[]) from public,anon,authenticated;
grant execute on function public.pse_upload_acceptance(text,uuid,integer,jsonb,bigint,date[]) to service_role;
commit;
