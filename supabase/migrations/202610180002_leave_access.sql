-- Audited corrections and individual institutional Google accounts.
begin;
create table private.used_leave_corrections (
 id uuid primary key, booking_id uuid not null unique references public.leave_bookings(id),
 replacement_id uuid unique references public.leave_bookings(id), dates date[] not null,
 reason text not null, actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table private.staff_email_changes (
 id uuid primary key, access_id uuid not null references public.access_allowlist(id),
 old_email text not null, new_email text not null, reason text not null,
 actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table private.used_leave_corrections enable row level security;
alter table private.staff_email_changes enable row level security;
revoke all on private.used_leave_corrections,private.staff_email_changes from public,anon,authenticated;

create function public.correct_used_leave(p_id uuid,p_booking_id uuid,p_dates date[],p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.leave_bookings; c private.used_leave_corrections; replacement uuid;
begin
 perform private.require_director();
 if p_id is null or p_booking_id is null or p_dates is null or cardinality(p_dates)>60
  or exists(select 1 from unnest(p_dates) d where d is null or d>(now() at time zone 'America/Sao_Paulo')::date)
  or cardinality(p_dates)<>(select count(distinct d) from unnest(p_dates) d)
  or p_reason is null or length(trim(p_reason)) not between 10 and 500 then
  raise exception 'Confira as datas já usufruídas e informe o motivo da correção (10 a 500 caracteres).';
 end if;
 select coalesce(array_agg(d order by d),'{}'::date[]) into p_dates from unnest(p_dates) d;
 select * into b from public.leave_bookings where id=p_booking_id;
 if b.id is null then raise exception 'Folga não encontrada.'; end if;
 perform 1 from public.staff_members where id=b.staff_id for no key update;
 select * into b from public.leave_bookings where id=p_booking_id for update;
 select * into c from private.used_leave_corrections where id=p_id;
 if c.id is not null then
  if c.booking_id=p_booking_id and c.dates=p_dates and c.reason=trim(p_reason) then return; end if;
  raise exception 'Operação repetida com dados diferentes.';
 end if;
 if b.status<>'used' then raise exception 'Somente folga usufruída pode receber esta correção. Atualize a lista.'; end if;
 if private.available(b.staff_id)+cardinality(b.dates)<cardinality(p_dates) then raise exception 'Saldo disponível insuficiente.'; end if;
 if exists(select 1 from public.leave_bookings where staff_id=b.staff_id and id<>b.id and status<>'cancelled' and dates && p_dates) then
  raise exception 'Já existe folga em uma dessas datas.';
 end if;
 -- Preserve the original dates, reason, author and timestamp; reverse only its effect.
 update public.leave_bookings set status='cancelled' where id=b.id;
 if cardinality(p_dates)>0 then
  replacement:=gen_random_uuid();
  insert into public.leave_bookings(id,staff_id,dates,status,reason,actor_id,actor)
   values(replacement,b.staff_id,p_dates,'used',trim(p_reason),auth.uid(),private.actor_name());
 end if;
 insert into private.used_leave_corrections(id,booking_id,replacement_id,dates,reason,actor_id)
  values(p_id,b.id,replacement,p_dates,trim(p_reason),auth.uid());
 perform private.log('Uso de folga corrigido',b.staff_id,
  'Original '||b.id||' ['||array_to_string(b.dates,',')||'] estornado. '||
  case when replacement is null then 'Sem novo consumo.' else 'Novo '||replacement||' ['||array_to_string(p_dates,',')||'].' end||
  ' Motivo: '||trim(p_reason));
end $$;

-- Bind an already existing, verified Google identity only to its exact authorized
-- email. Never merge two staff records or take a membership from another access.
create function private.bind_verified_access(p_access_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist; target uuid;
begin
 select * into a from public.access_allowlist where id=p_access_id;
 if a.id is null or not a.active or a.role<>'staff' or not exists(select 1 from public.staff_members where id=a.staff_id and active) then return; end if;
 select id into target from auth.users where lower(email)=a.email
  and email_confirmed_at is not null and raw_app_meta_data->>'provider'='google';
 if target is null then
  if exists(select 1 from auth.users where lower(email)=a.email) then raise exception 'Identidade existente exige revisão técnica antes da autorização.'; end if;
  return;
 end if;
 if exists(select 1 from public.user_memberships where (user_id=target and access_id<>a.id) or (access_id=a.id and user_id<>target)) then
  raise exception 'A conta já está vinculada a outro acesso. Não é permitida fusão automática.';
 end if;
 insert into public.user_memberships(user_id,access_id) values(target,a.id) on conflict(user_id) do nothing;
end $$;
revoke all on function private.bind_verified_access(uuid) from public,anon,authenticated;

create or replace function public.add_access(p_name text,p_email text,p_role text default 'staff') returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid; aid uuid;
begin
 perform private.require_director();
 if p_role is distinct from 'staff' then raise exception 'Novos gestores exigem configuração técnica explícita.'; end if;
 if p_name is null or p_email is null or length(trim(p_name)) not between 3 and 120 or length(trim(p_email))>254
  or lower(trim(p_email)) !~ '^[^[:space:]@]+@educacao[.]mg[.]gov[.]br$' then
  raise exception 'Informe nome e e-mail individual @educacao.mg.gov.br.';
 end if;
 -- Serialize admission caps and concurrent authorizations, without exposing settings.
 perform 1 from public.app_settings where singleton for update;
 if (select count(*) from public.staff_members)>=200 or (select count(*) from public.access_allowlist)>=200 then raise exception 'Limite de cadastros atingido. Procure o responsável técnico.'; end if;
 insert into public.staff_members(name,email) values(trim(p_name),lower(trim(p_email))) returning id into sid;
 insert into public.access_allowlist(name,email,role,staff_id) values(trim(p_name),lower(trim(p_email)),'staff',sid) returning id into aid;
 perform private.bind_verified_access(aid);
 perform private.log('Acesso autorizado',sid,trim(p_name)||' · '||lower(trim(p_email)));
end $$;

create or replace function public.toggle_access(p_id uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist;
begin
 perform private.require_director();
 if p_active is null then raise exception 'Informe a autorização desejada.'; end if;
 select * into a from public.access_allowlist where id=p_id;
 if a.id is null or a.role<>'staff' then raise exception 'Este acesso exige configuração técnica.'; end if;
 perform 1 from public.staff_members where id=a.staff_id for no key update;
 select * into a from public.access_allowlist where id=p_id for update;
 if a.active=p_active and (select active from public.staff_members where id=a.staff_id)=p_active then return; end if;
 update public.access_allowlist set active=p_active where id=p_id;
 update public.staff_members set active=p_active where id=a.staff_id;
 if p_active then perform private.bind_verified_access(a.id); end if;
 perform private.log(case when p_active then 'Acesso reativado' else 'Acesso desativado' end,a.staff_id,a.name||' · '||a.email);
end $$;

create function public.change_staff_email(p_id uuid,p_access_id uuid,p_expected_email text,p_email text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist; c private.staff_email_changes;
begin
 perform private.require_director();
 if p_id is null or p_access_id is null or p_email is null or p_expected_email is null
  or length(trim(p_email))>254 or lower(trim(p_email)) !~ '^[^[:space:]@]+@educacao[.]mg[.]gov[.]br$'
  or p_reason is null or length(trim(p_reason)) not between 10 and 500 then
  raise exception 'Confira o e-mail individual @educacao.mg.gov.br e o motivo da troca (10 a 500 caracteres).';
 end if;
 p_email:=lower(trim(p_email)); p_expected_email:=lower(trim(p_expected_email));
 select * into a from public.access_allowlist where id=p_access_id;
 if a.id is null or a.role<>'staff' then raise exception 'Troca de conta da direção exige configuração técnica.'; end if;
 perform 1 from public.staff_members where id=a.staff_id for no key update;
 select * into a from public.access_allowlist where id=p_access_id for update;
 select * into c from private.staff_email_changes where id=p_id;
 if c.id is not null then
  if c.access_id=p_access_id and c.old_email=p_expected_email and c.new_email=p_email and c.reason=trim(p_reason) and a.email=p_email then return; end if;
  raise exception 'Operação repetida ou substituída por outra troca. Atualize a lista.';
 end if;
 if a.email<>p_expected_email then raise exception 'O acesso mudou desde a consulta. Atualize a lista.'; end if;
 if a.email=p_email then raise exception 'Informe um e-mail diferente.'; end if;
 if exists(select 1 from public.access_allowlist where email=p_email and id<>a.id)
  or exists(select 1 from public.staff_members where email=p_email and id<>a.staff_id) then
  raise exception 'O e-mail já possui cadastro. Não é permitida fusão automática.';
 end if;
 -- The previous Google account remains in Auth, but loses its data membership.
 -- No passwords, OAuth identities or personal Google settings are changed.
 delete from public.user_memberships where access_id=a.id;
 update public.access_allowlist set email=p_email where id=a.id;
 update public.staff_members set email=p_email where id=a.staff_id;
 perform private.bind_verified_access(a.id);
 insert into private.staff_email_changes(id,access_id,old_email,new_email,reason,actor_id)
  values(p_id,a.id,a.email,p_email,trim(p_reason),auth.uid());
 perform private.log('E-mail do servidor alterado',a.staff_id,a.email||' → '||p_email||'. Motivo: '||trim(p_reason)||'. Saldo e documentos preservados; vínculo anterior revogado.');
end $$;
revoke all on function public.correct_used_leave(uuid,uuid,date[],text),public.change_staff_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.correct_used_leave(uuid,uuid,date[],text),public.change_staff_email(uuid,uuid,text,text,text) to authenticated;
commit;
