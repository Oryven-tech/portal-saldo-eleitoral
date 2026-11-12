-- Read-only inventory for the dedicated PSE projects. No keys, tokens, emails,
-- file names, document bytes or business records are returned.
select jsonb_build_object(
 'database',jsonb_build_object('version',current_setting('server_version'),'bytes',pg_database_size(current_database())),
 'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,
   'anonSelect',has_table_privilege('anon',c.oid,'select'),'anonWrite',has_table_privilege('anon',c.oid,'insert,update,delete,truncate'),
   'userSelect',has_table_privilege('authenticated',c.oid,'select'),'userWrite',has_table_privilege('authenticated',c.oid,'insert,update,delete,truncate')) order by n.nspname,c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p')),
 'views',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'options',c.reloptions,
   'anonSelect',has_table_privilege('anon',c.oid,'select'),'userSelect',has_table_privilege('authenticated',c.oid,'select'))),'[]'::jsonb)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('v','m')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
   'definer',p.prosecdef,'volatility',p.provolatile,'settings',p.proconfig,'sourceHash',md5(replace(p.prosrc,chr(13),'')),
   'anon',has_function_privilege('anon',p.oid,'execute'),'user',has_function_privilege('authenticated',p.oid,'execute'),
   'service',has_function_privilege('service_role',p.oid,'execute'),'authHook',has_function_privilege('supabase_auth_admin',p.oid,'execute')) order by n.nspname,p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','private','storage')),
 'defaults',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'*'),'kind',d.defaclobjtype,'acl',d.defaclacl))
   from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','private') or d.defaclnamespace=0),
 'clientRoles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls)) from pg_roles where rolname in ('anon','authenticated','service_role')),
 'schemaCreate',jsonb_build_object('anonPublic',has_schema_privilege('anon','public','create'),'userPublic',has_schema_privilege('authenticated','public','create'),
   'anonPrivate',has_schema_privilege('anon','private','create'),'userPrivate',has_schema_privilege('authenticated','private','create')),
 'dataApiRoleSettings',(select jsonb_agg(setting) from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) setting
   where r.rolname='authenticator' and split_part(setting,'=',1) in ('pgrst.db_schemas','pgrst.db_extra_search_path','pgrst.db_pre_request','pgrst.db_max_rows')),
 'bucket',(select jsonb_build_object('private',not public,'limit',file_size_limit,'types',allowed_mime_types) from storage.buckets where id='evidence'),
 'counts',jsonb_build_object('staff',(select count(*) from public.staff_members),'documents',(select count(*) from public.documents),
   'objects',(select count(*) from storage.objects where bucket_id='evidence'),'audit',(select count(*) from public.audit_events),'backups',(select count(*) from private.backup_snapshots)),
 'integrity',jsonb_build_object(
   'objectsWithoutMetadata',(select count(*) from storage.objects o where bucket_id='evidence' and not exists(select 1 from public.documents d where d.path=o.name)),
   'readyWithoutObject',(select count(*) from public.documents d where status='ready' and not exists(select 1 from storage.objects o where o.bucket_id='evidence' and o.name=d.path and (o.metadata->>'size')::bigint=d.size)),
   'negativeBalances',(select count(*) from public.staff_members where private.available(id)<0),
   'identityMismatches',(select count(*) from public.user_memberships m join public.access_allowlist a on a.id=m.access_id join auth.users u on u.id=m.user_id where lower(u.email)<>a.email or u.email_confirmed_at is null or u.raw_app_meta_data->>'provider' is distinct from 'google'),
   'invalidDates',(select count(*) from public.leave_bookings b where exists(select 1 from unnest(b.dates) d where d is null or d<'0001-01-01'::date or d>'9999-12-31'::date) or cardinality(b.dates)<>(select count(distinct d) from unnest(b.dates) d))),
 'capacity',jsonb_build_object('reservedBytes',(select coalesce(sum(size),0) from public.documents),'budget',(select storage_budget from public.app_settings where singleton)),
 'authSummary',jsonb_build_object('users',(select count(*) from auth.users),'unverified',(select count(*) from auth.users where email_confirmed_at is null)),
 'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion,'schema',n.nspname)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'realtime',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename)),'[]'::jsonb) from pg_publication_tables where pubname='supabase_realtime')
) as audit;
