import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// PostgreSQL WASM validates SQL, RLS and transactions. Auth/Storage schemas below
// are fixtures; this is NOT acceptance evidence of hosted Supabase or Google.
let db: PGlite;
const director = '20000000-0000-4000-8000-000000000001';
const staffUser = '20000000-0000-4000-8000-000000000002';
const staff = '30000000-0000-4000-8000-000000000001';
const other = '30000000-0000-4000-8000-000000000002';
const sql = readFileSync(
  new URL('../supabase/migrations/202610160001_portal.sql', import.meta.url),
  'utf8',
);
const act = async (id: string) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth; create table auth.users(id uuid primary key,email text not null,raw_app_meta_data jsonb not null default '{}',email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb); alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;`);
  await db.exec(sql);
  for (const file of [
    '202610180001_upload_reconciliation.sql',
    '202610180002_leave_access.sql',
    '202610180003_backup_audit.sql',
    '202610180004_audit_hardening.sql',
  ])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`reset role; truncate public.staff_members,public.access_allowlist,auth.users,private.backup_snapshots cascade;
    insert into public.staff_members(id,name,email) values('${staff}','Ana Teste','ana@example.com'),('${other}','Outro Servidor','outro@example.com');
    insert into public.access_allowlist(name,email,role,staff_id) values('Direção Teste','direcao@example.com','director',null),('Ana Teste','ana@example.com','staff','${staff}'),('Outro Servidor','outro@example.com','staff','${other}');
    insert into auth.users(id,email,raw_app_meta_data) values('${director}','direcao@example.com','{"provider":"google"}'),('${staffUser}','ana@example.com','{"provider":"google"}');
    insert into public.credit_entries(staff_id,days,reason,actor) values('${staff}',2,'Crédito testado','Direção');`);
});
afterAll(async () => {
  await db?.close();
});
describe('Postgres com fixtures de identidade', () => {
  it('isola os registros e nega mutação direta de saldo', async () => {
    await act(staffUser);
    const result = await db.query<{ id: string }>('select id from public.staff_members');
    expect(result.rows.map((r) => r.id)).toEqual([staff]);
    await expect(
      db.query('update public.credit_entries set days=100 where staff_id=$1', [staff]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query("select public.book_leave($1,$2,array['2026-11-03'::date],'Tentativa indevida')", [
        crypto.randomUUID(),
        staff,
      ]),
    ).rejects.toThrow('restrita');
  });
  it('bloqueia último dia em excesso e não duplica operação repetida', async () => {
    await act(director);
    const id = crypto.randomUUID();
    await db.query(
      "select public.book_leave($1,$2,array['2026-11-03'::date,'2026-11-04'::date],'Reserva de teste')",
      [id, staff],
    );
    await db.query(
      "select public.book_leave($1,$2,array['2026-11-03'::date,'2026-11-04'::date],'Reserva de teste')",
      [id, staff],
    );
    await expect(
      db.query("select public.book_leave($1,$2,array['2026-11-05'::date],'Outra reserva')", [
        crypto.randomUUID(),
        staff,
      ]),
    ).rejects.toThrow('insuficiente');
    const count = await db.query<{ count: number }>(
      'select count(*)::integer as count from public.leave_bookings',
    );
    expect(count.rows[0].count).toBe(1);
  });
  it('revogação bloqueia sessão existente e download', async () => {
    await db.exec(`insert into public.submissions(id,staff_id,activity,declared_days,upload_manifest,status) values('40000000-0000-4000-8000-000000000001','${staff}','Teste documental',2,'[]','pending');
      insert into public.documents(staff_id,submission_id,name,path,size,hash,status) values('${staff}','40000000-0000-4000-8000-000000000001','pdf.pdf','privado.pdf',12,repeat('a',64),'ready');
      insert into storage.objects(bucket_id,name,metadata) values('evidence','privado.pdf','{"size":12}');`);
    await act(staffUser);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
    await act(director);
    const access = await db.query<{ id: string }>(
      'select id from public.access_allowlist where email=$1',
      ['ana@example.com'],
    );
    await db.query('select public.toggle_access($1,false)', [access.rows[0].id]);
    await act(staffUser);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await expect(db.query('select public.portal_snapshot()')).rejects.toThrow('não autorizado');
  });
  it('nega upload direto e finalização privilegiada ao navegador', async () => {
    await act(staffUser);
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values('evidence','invasao.pdf')"),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query('select public.finalize_submission($1,$2)', [crypto.randomUUID(), staffUser]),
    ).rejects.toThrow('permission denied');
  });
  it('um ajuste não pode comprometer reservas existentes', async () => {
    await act(director);
    await db.query("select public.book_leave($1,$2,array['2026-11-03'::date],'Reserva válida')", [
      crypto.randomUUID(),
      staff,
    ]);
    await expect(
      db.query("select public.adjust_credit($1,$2,-2,'Correção de crédito')", [
        crypto.randomUUID(),
        staff,
      ]),
    ).rejects.toThrow('comprometeria');
  });
  it('nega bootstrap não autorizado ou por provedor incorreto', async () => {
    await expect(
      db.query(
        'insert into auth.users(id,email,raw_app_meta_data) values($1,\'estranho@example.com\',\'{"provider":"google"}\')',
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow('não autorizado');
    const hook = await db.query<{ result: { error: unknown } }>(
      `select public.before_user_created('{"user":{"email":"ana@example.com","app_metadata":{"provider":"email"}}}') as result`,
    );
    expect(hook.rows[0].result.error).toBeDefined();
  });
  it('edita datas sem debitar a mesma reserva duas vezes', async () => {
    await act(director);
    const id = crypto.randomUUID();
    await db.query("select public.book_leave($1,$2,array['2026-11-03'::date],'Reserva original')", [
      id,
      staff,
    ]);
    await db.query(
      "select public.reschedule_booking($1,array['2026-11-04'::date,'2026-11-05'::date],'Mudança combinada')",
      [id],
    );
    await expect(
      db.query(
        "select public.reschedule_booking($1,array['2026-11-04'::date,'2026-11-05'::date,'2026-11-06'::date],'Sem saldo para três')",
        [id],
      ),
    ).rejects.toThrow('insuficiente');
    const result = await db.query<{ count: number }>(
      'select cardinality(dates) as count from public.leave_bookings where id=$1',
      [id],
    );
    expect(result.rows[0].count).toBe(2);
  });
  it('reserva uploads com cota acumulada e devolve a mesma intenção no reenvio', async () => {
    await act(staffUser);
    const id = crypto.randomUUID();
    const meta = [{ name: 'arquivo.pdf', size: 6_000_000, hash: 'a'.repeat(64) }];
    const args = [id, 'Ana Teste', '', 'Treinamento', 2, JSON.stringify(meta)];
    const first = await db.query(
      'select public.reserve_submission($1,$2,$3,$4,$5,$6::jsonb)',
      args,
    );
    expect(
      await db.query('select public.reserve_submission($1,$2,$3,$4,$5,$6::jsonb)', args),
    ).toEqual(first);
    await expect(
      db.query('select public.reserve_submission($1,$2,$3,$4,$5,$6::jsonb)', [
        crypto.randomUUID(),
        'Ana Teste',
        '',
        'Primeiro turno',
        2,
        JSON.stringify([{ ...meta[0], hash: 'b'.repeat(64) }]),
      ]),
    ).rejects.toThrow('acumulado');
  });
  it('snapshot da direção contém dados completos e servidor não pode gerar backup da escola', async () => {
    await act(director);
    const result = await db.query<{ backup: { data: { staff: unknown[] }; createdAt: string } }>(
      'select public.create_backup_snapshot() as backup',
    );
    expect(result.rows[0].backup.data.staff).toHaveLength(2);
    expect(result.rows[0].backup.createdAt).toBeTruthy();
    await act(staffUser);
    await expect(db.query('select public.create_backup_snapshot()')).rejects.toThrow('restrita');
  });
});
