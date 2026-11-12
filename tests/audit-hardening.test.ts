import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { backupDataSchema, dateSchema } from '../src/domain';
import { exportBackup, readBackup } from '../src/backup';
import { planRecovery } from '../src/recovery';
import type { Snapshot } from '../src/repository';

const id = (n: number) => `86000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
async function act(n: number) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  await db.exec('set role authenticated');
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
    create schema auth;create table auth.users(id uuid primary key,email text not null,raw_app_meta_data jsonb not null default '{}',email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);
  for (const file of [
    '202610160001_portal.sql',
    '202610180001_upload_reconciliation.sql',
    '202610180002_leave_access.sql',
    '202610180003_backup_audit.sql',
    '202610180004_audit_hardening.sql',
  ]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 30000);
beforeEach(async () => {
  await db.exec(`reset role;truncate public.staff_members,public.access_allowlist,auth.users,private.backup_snapshots cascade;
    insert into public.staff_members(id,name,email) values('${id(1)}','Servidor sintético','sintetico@educacao.mg.gov.br');
    insert into public.access_allowlist(name,email,role,staff_id) values('Direção sintética','direcao@example.invalid','director',null),('Servidor sintético','sintetico@educacao.mg.gov.br','staff','${id(1)}');
    insert into auth.users(id,email,raw_app_meta_data) values('${id(2)}','direcao@example.invalid','{"provider":"google"}'),('${id(3)}','sintetico@educacao.mg.gov.br','{"provider":"google"}');
    insert into public.credit_entries(staff_id,days,reason,actor) values('${id(1)}',2,'Crédito sintético','Ensaio');`);
  await act(2);
});
afterAll(async () => {
  await db?.close();
});

it('função nova nasce sem execução pública, mesmo sem revoke por objeto', async () => {
  await db.exec(
    'reset role;create function public.pse_future_function_probe() returns boolean language sql as $$select false$$',
  );
  try {
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','public.pse_future_function_probe()','execute') a,has_function_privilege('authenticated','public.pse_future_function_probe()','execute') u",
        )
      ).rows[0],
    ).toEqual({ a: false, u: false });
  } finally {
    await db.exec('drop function public.pse_future_function_probe()');
  }
});
it('API de agendamento recusa datas infinitas, fora de quatro dígitos e arrays multidimensionais', async () => {
  for (const dates of [
    "array['-infinity'::date]",
    "array['infinity'::date]",
    "array['10000-01-01'::date]",
    "array['0001-01-01 BC'::date]",
    "array[array['2026-01-10'::date]]",
  ])
    await expect(
      db.query(`select public.book_leave($1,$2,${dates},'Reserva sintética')`, [
        crypto.randomUUID(),
        id(1),
      ]),
    ).rejects.toThrow();
  expect((await db.query('select id from public.leave_bookings')).rows).toHaveLength(0);
  expect(dateSchema.safeParse('0000-01-01').success).toBe(false);
});
it('backup aceita IDs PostgreSQL e caracteres Unicode válidos recebidos pela API direta', async () => {
  const opaqueId = '11111111-1111-0111-0111-111111111111';
  await act(3);
  await db.query('select public.reserve_submission($1,$2,$3,$4,1,$5::jsonb)', [
    opaqueId,
    '𐐀'.repeat(120),
    '𐐀'.repeat(60),
    '𐐀'.repeat(120),
    JSON.stringify([{ name: 'exemplo.pdf', size: 20, hash: 'a'.repeat(64) }]),
  ]);
  await act(2);
  const snapshot = (await db.query<{ s: Snapshot }>('select public.create_backup_snapshot() s'))
    .rows[0].s;
  expect(backupDataSchema.safeParse(snapshot.data).success).toBe(true);
  const files: File[] = [];
  await exportBackup(
    {
      snapshot: async () => snapshot,
      download: async () => {
        throw new Error('Rascunho não deve baixar PDF');
      },
    } as never,
    'frase sintética longa de recuperação',
    () => {},
    (blob, name) => files.push(new File([blob], name)),
  );
  const copy = await readBackup(files, 'frase sintética longa de recuperação');
  expect(planRecovery(copy.snapshot).interruptedSubmissions).toEqual([opaqueId]);
  expect(copy.snapshot.data.staff[0].name).toBe('𐐀'.repeat(120));
});
it('análise exige decisão booleana explícita e não transforma null em pedido de correção', async () => {
  await db.exec(`reset role;insert into public.submissions(id,staff_id,activity,declared_days,status,upload_manifest) values('${id(10)}','${id(1)}','Ensaio',1,'pending','[]');
    insert into public.documents(staff_id,submission_id,name,path,size,hash,status) values('${id(1)}','${id(10)}','exemplo.pdf','exemplo.pdf',20,repeat('a',64),'ready');`);
  await act(2);
  await expect(
    db.query('select public.review_submission($1,1,$2,null)', [id(10), 'Conferência sintética']),
  ).rejects.toThrow();
  expect(
    (await db.query('select status from public.submissions where id=$1', [id(10)])).rows[0].status,
  ).toBe('pending');
});
it('API de autorização recusa endereço malformado sem criar cadastro que inviabilize backup', async () => {
  for (const email of [
    '.inicio@educacao.mg.gov.br',
    'dois..pontos@educacao.mg.gov.br',
    'fim.@educacao.mg.gov.br',
  ])
    await expect(
      db.query("select public.add_access('Pessoa sintética',$1,'staff')", [email]),
    ).rejects.toThrow();
  expect((await db.query('select id from public.staff_members')).rows).toHaveLength(1);
});
