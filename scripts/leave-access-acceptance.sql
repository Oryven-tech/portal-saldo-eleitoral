-- Only isolated PSE Homologacao. Every fixture and identity is rolled back.
begin;
do $$ begin
 if (select school_name from public.app_settings where singleton)<>'Escola de Ensaio PSE'
  or exists(select 1 from auth.users) or to_regclass('private.used_leave_corrections') is null
  or exists(select 1 from public.staff_members where id::text like '85000000-%') then
  raise exception 'Ambiente incompatível com o ensaio isolado.';
 end if;
end $$;
insert into public.staff_members(id,name,email) values('85000000-0000-4000-8000-000000000001','Ensaio isolado de acesso','pse-ensaio-85001@educacao.mg.gov.br');
insert into public.access_allowlist(id,name,email,role,staff_id) values
 ('85000000-0000-4000-8000-000000000002','Direção sintética isolada','direcao-850@example.invalid','director',null),
 ('85000000-0000-4000-8000-000000000003','Ensaio isolado de acesso','pse-ensaio-85001@educacao.mg.gov.br','staff','85000000-0000-4000-8000-000000000001');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('85000000-0000-4000-8000-000000000004','direcao-850@example.invalid',now(),'{"provider":"google"}'),
 ('85000000-0000-4000-8000-000000000005','pse-ensaio-85001@educacao.mg.gov.br',now(),'{"provider":"google"}');
insert into public.credit_entries(staff_id,days,reason,actor) values('85000000-0000-4000-8000-000000000001',3,'Crédito sintético isolado','Ensaio');
insert into public.leave_bookings(id,staff_id,dates,status,reason,actor) values
 ('85000000-0000-4000-8000-000000000006','85000000-0000-4000-8000-000000000001',array[current_date-10,current_date-9],'used','Uso sintético original','Autor original'),
 ('85000000-0000-4000-8000-000000000007','85000000-0000-4000-8000-000000000001',array[current_date-8],'reserved','Reserva sintética','Ensaio');
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin
 begin perform public.correct_used_leave('85000000-0000-4000-8000-000000000008','85000000-0000-4000-8000-000000000006',array[current_date-7,current_date-6,current_date-5],'Excesso deve ser recusado');
  raise exception using errcode='XX000',message='Excesso não foi recusado';
 exception when raise_exception then if sqlerrm not like '%insuficiente%' then raise; end if; end;
 begin perform public.correct_used_leave('85000000-0000-4000-8000-000000000008','85000000-0000-4000-8000-000000000006',array[current_date-8],'Sobreposição deve ser recusada');
  raise exception using errcode='XX000',message='Sobreposição não foi recusada';
 exception when raise_exception then if sqlerrm not like '%Já existe%' then raise; end if; end;
end $$;
select public.correct_used_leave('85000000-0000-4000-8000-000000000008','85000000-0000-4000-8000-000000000006',array[current_date-7],'Um dia não foi utilizado no ensaio');
select public.correct_used_leave('85000000-0000-4000-8000-000000000008','85000000-0000-4000-8000-000000000006',array[current_date-7],'Um dia não foi utilizado no ensaio');
select public.change_staff_email('85000000-0000-4000-8000-000000000009','85000000-0000-4000-8000-000000000003','pse-ensaio-85001@educacao.mg.gov.br','pse-ensaio-85002@educacao.mg.gov.br','Conta sintética corrigida no ensaio isolado');
select public.change_staff_email('85000000-0000-4000-8000-000000000009','85000000-0000-4000-8000-000000000003','pse-ensaio-85001@educacao.mg.gov.br','pse-ensaio-85002@educacao.mg.gov.br','Conta sintética corrigida no ensaio isolado');
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000005',true);
do $$ begin
 if (select count(*) from public.staff_members)<>0 then raise exception 'Sessão anterior ainda lê dados'; end if;
 begin perform public.portal_snapshot();raise exception using errcode='XX000',message='Sessão anterior não foi recusada';exception when insufficient_privilege then null;end;
 begin perform public.correct_used_leave('85000000-0000-4000-8000-000000000010','85000000-0000-4000-8000-000000000006','{}','Servidor não deve corrigir');raise exception using errcode='XX000',message='Servidor corrigiu uso';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('85000000-0000-4000-8000-000000000011','pse-ensaio-85002@educacao.mg.gov.br',now(),'{"provider":"google"}');
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000011',true);
set local role authenticated;
do $$ declare p jsonb;begin p:=public.portal_snapshot();
 if p->'user'->>'staffId'<>'85000000-0000-4000-8000-000000000001' or jsonb_array_length(p->'bookings')<>3 then raise exception 'Vínculo/histórico do novo e-mail divergente';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select public.toggle_access('85000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000011',true);
do $$ begin begin perform public.portal_snapshot();raise exception using errcode='XX000',message='Desativação não bloqueou';exception when insufficient_privilege then null;end;end $$;
reset role;
do $$ begin
 if private.available('85000000-0000-4000-8000-000000000001')<>1
  or (select count(*) from private.used_leave_corrections where id='85000000-0000-4000-8000-000000000008')<>1
  or (select count(*) from private.staff_email_changes where id='85000000-0000-4000-8000-000000000009')<>1
  or (select count(*) from public.leave_bookings where id='85000000-0000-4000-8000-000000000006' and status='cancelled' and reason='Uso sintético original' and actor='Autor original')<>1
  or has_function_privilege('anon','public.correct_used_leave(uuid,uuid,date[],text)','execute')
  or has_function_privilege('authenticated','private.bind_verified_access(uuid)','execute') then raise exception 'Conferência final divergente';end if;
end $$;
rollback;
do $$ begin if exists(select 1 from auth.users) or exists(select 1 from public.staff_members where id::text like '85000000-%') then raise exception 'Ensaio não foi revertido';end if;end $$;
select 'APROVADO: correção, repetição, saldo, troca de conta, RLS e revogação. Fixtures revertidas; nenhum login Google foi simulado como prova real.' as resultado;
