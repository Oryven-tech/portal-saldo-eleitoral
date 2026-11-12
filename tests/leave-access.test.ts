import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { backupDataSchema, staffEmailSchema, balance, type PortalData } from '../src/domain';
import { planRecovery } from '../src/recovery';

// PostgreSQL engine with synthetic Auth/Storage tables, not hosted Google acceptance.
const id = (n: number) => `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
const act = async (n: number, role = 'authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  await db.exec(`set role ${role}`);
};
const correct = (
  n: number,
  dates: string[],
  reason = 'Correção conferida pela direção',
  booking = id(10),
) =>
  db.query('select public.correct_used_leave($1,$2,$3::date[],$4)', [
    id(n),
    booking,
    dates,
    reason,
  ]);
const change = (
  n: number,
  email = 'nova.conta@educacao.mg.gov.br',
  expected = 'ana@educacao.mg.gov.br',
  access = id(4),
) =>
  db.query('select public.change_staff_email($1,$2,$3,$4,$5)', [
    id(n),
    access,
    expected,
    email,
    'Troca de conta conferida pessoalmente',
  ]);
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
  ])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`reset role;truncate public.staff_members,public.access_allowlist,auth.users,private.backup_snapshots cascade;
   insert into public.staff_members(id,name,email) values('${id(1)}','Ana Teste','ana@educacao.mg.gov.br'),('${id(2)}','Outro Teste','outro@educacao.mg.gov.br');
   insert into public.access_allowlist(id,name,email,role,staff_id) values('${id(3)}','Direção Teste','direcao@example.invalid','director',null),('${id(4)}','Ana Teste','ana@educacao.mg.gov.br','staff','${id(1)}'),('${id(5)}','Outro Teste','outro@educacao.mg.gov.br','staff','${id(2)}');
   insert into auth.users(id,email,raw_app_meta_data) values('${id(6)}','direcao@example.invalid','{"provider":"google"}'),('${id(7)}','ana@educacao.mg.gov.br','{"provider":"google"}'),('${id(8)}','outro@educacao.mg.gov.br','{"provider":"google"}');
   insert into public.credit_entries(staff_id,days,reason,actor) values('${id(1)}',3,'Crédito fictício','Ensaio');
   insert into public.leave_bookings(id,staff_id,dates,status,reason,actor,created_at) values('${id(10)}','${id(1)}',array['2026-10-01','2026-10-02']::date[],'used','Uso original preservado','Autor original','2026-09-01'),('${id(11)}','${id(1)}',array['2026-10-03']::date[],'reserved','Reserva fictícia','Ensaio','2026-09-01');
   insert into public.submissions(id,staff_id,activity,declared_days,status,upload_manifest) values('${id(12)}','${id(1)}','Comprovante fictício',3,'approved','[]');
   insert into public.documents(id,staff_id,submission_id,name,path,size,hash,status) values('${id(13)}','${id(1)}','${id(12)}','teste.pdf','${id(1)}/${id(12)}/${id(13)}.pdf',686,repeat('a',64),'ready');
   update public.credit_entries set source_id='${id(12)}' where staff_id='${id(1)}';`);
  await act(6);
});
afterAll(async () => {
  await db?.close();
});
it('vincula Google verificado preexistente sem roubar vínculo de outro cadastro', async () => {
  await db.exec(`reset role;insert into public.access_allowlist(id,name,email,role,staff_id) values('${id(41)}','Conta anterior de ensaio','nova.conta@educacao.mg.gov.br','staff','${id(1)}');
   insert into auth.users(id,email,raw_app_meta_data) values('${id(9)}','nova.conta@educacao.mg.gov.br','{"provider":"google"}');
   delete from public.user_memberships where user_id='${id(9)}';delete from public.access_allowlist where id='${id(41)}';`);
  await act(6);
  await change(20);
  await act(9);
  expect(
    (await db.query<{ data: PortalData }>('select public.portal_snapshot() data')).rows[0].data.user
      .staffId,
  ).toBe(id(1));
  await act(6);
  await expect(
    change(21, 'outro@educacao.mg.gov.br', 'nova.conta@educacao.mg.gov.br'),
  ).rejects.toThrow('fusão');
});
it('falha na identidade de destino reverte também a revogação do vínculo anterior', async () => {
  await db.exec(`reset role;insert into public.access_allowlist(id,name,email,role,staff_id) values('${id(41)}','Conta sintética','nova.conta@educacao.mg.gov.br','staff','${id(1)}');
 insert into auth.users(id,email,raw_app_meta_data) values('${id(9)}','nova.conta@educacao.mg.gov.br','{"provider":"google"}');
 delete from public.user_memberships where user_id='${id(9)}';delete from public.access_allowlist where id='${id(41)}';update auth.users set email_confirmed_at=null where id='${id(9)}';`);
  await act(6);
  await expect(change(20)).rejects.toThrow('revisão técnica');
  await act(7);
  expect(
    (await db.query<{ data: PortalData }>('select public.portal_snapshot() data')).rows[0].data.user
      .email,
  ).toBe('ana@educacao.mg.gov.br');
});
it('estorna sem apagar original, corrige consumo uma vez e permite estorno completo da substituição', async () => {
  await correct(20, ['2026-10-04']);
  await correct(20, ['2026-10-04']);
  const old = (
    await db.query<{ dates: string[]; status: string; reason: string; actor: string }>(
      'select to_jsonb(dates) as dates,status,reason,actor from public.leave_bookings where id=$1',
      [id(10)],
    )
  ).rows[0];
  expect(old).toEqual({
    dates: ['2026-10-01', '2026-10-02'],
    status: 'cancelled',
    reason: 'Uso original preservado',
    actor: 'Autor original',
  });
  const data = (await db.query<{ data: PortalData }>('select public.portal_snapshot() data'))
    .rows[0].data;
  expect(data.bookings.filter((b) => b.status === 'used')).toHaveLength(1);
  expect(data.audit.filter((a) => a.action === 'Uso de folga corrigido')).toHaveLength(1);
  await expect(correct(21, [])).rejects.toThrow('Somente folga usufruída');
  await expect(correct(20, [])).rejects.toThrow('dados diferentes');
  await correct(
    22,
    [],
    'Estorno integral após conferência',
    data.bookings.find((b) => b.status === 'used')!.id,
  );
  const final = (await db.query<{ data: PortalData }>('select public.portal_snapshot() data'))
    .rows[0].data;
  expect(balance(final, id(1)).available).toBe(2);
});
it('recusa excesso, sobreposição, data futura e justificativa vazia sem alterar o original', async () => {
  await expect(correct(20, ['2026-10-04', '2026-10-05', '2026-10-06'])).rejects.toThrow(
    'insuficiente',
  );
  await expect(correct(20, ['2026-10-03'])).rejects.toThrow('Já existe');
  await expect(correct(20, ['9999-01-01'])).rejects.toThrow('datas já usufruídas');
  await expect(correct(20, [], ' ')).rejects.toThrow('motivo');
  await expect(
    db.query('select public.correct_used_leave($1,$2,null,null)', [id(20), id(10)]),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ status: string }>('select status from public.leave_bookings where id=$1', [
        id(10),
      ])
    ).rows[0].status,
  ).toBe('used');
});
it('nega correção/troca a servidor, anônimo e mutação direta de registro técnico', async () => {
  await act(7);
  await expect(correct(20, [])).rejects.toThrow('restrita');
  await expect(change(20)).rejects.toThrow('restrita');
  await expect(db.query('select * from private.used_leave_corrections')).rejects.toThrow(
    'permission denied',
  );
  await act(7, 'anon');
  await expect(correct(20, [])).rejects.toThrow('permission denied');
  await expect(change(20)).rejects.toThrow('permission denied');
});
it('troca e-mail preserva cadastro, saldo/PDFs, bloqueia sessão antiga e permite novo Google', async () => {
  await change(20);
  await change(20);
  await act(7);
  await expect(db.query('select public.portal_snapshot()')).rejects.toThrow('não autorizado');
  await db.exec('reset role');
  await db.exec(
    `insert into auth.users(id,email,raw_app_meta_data) values('${id(9)}','nova.conta@educacao.mg.gov.br','{"provider":"google"}');`,
  );
  await act(9);
  const data = (await db.query<{ data: PortalData }>('select public.portal_snapshot() data'))
    .rows[0].data;
  expect(data.user.staffId).toBe(id(1));
  expect(data.documents).toHaveLength(1);
  expect(data.bookings).toHaveLength(2);
  expect(data.credits[0].days).toBe(3);
  expect(data.staff[0].email).toBe('nova.conta@educacao.mg.gov.br');
  await act(6);
  await expect(change(21, 'nova2@educacao.mg.gov.br')).rejects.toThrow('mudou');
  await expect(
    change(21, 'outro@educacao.mg.gov.br', 'nova.conta@educacao.mg.gov.br'),
  ).rejects.toThrow('fusão');
  await expect(
    change(21, 'nova2@educacao.mg.gov.br', 'direcao@example.invalid', id(3)),
  ).rejects.toThrow('direção');
});
it('desativação bloqueia token atual e troca de e-mail não reativa servidor', async () => {
  await db.query('select public.toggle_access($1,false)', [id(4)]);
  await change(20);
  await act(7);
  await expect(db.query('select public.portal_snapshot()')).rejects.toThrow('não autorizado');
  await act(6);
  expect(
    (
      await db.query<{ active: boolean }>('select active from public.staff_members where id=$1', [
        id(1),
      ])
    ).rows[0].active,
  ).toBe(false);
  await db.query('select public.toggle_access($1,true)', [id(4)]);
  await db.query('select public.toggle_access($1,true)', [id(4)]);
  const data = (await db.query<{ data: PortalData }>('select public.portal_snapshot() data'))
    .rows[0].data;
  expect(data.audit.filter((a) => a.action === 'Acesso reativado')).toHaveLength(1);
});
it('admissão institucional exige autorização individual e rejeita endereços semelhantes/pessoais', async () => {
  for (const email of ['pessoa@gmail.com', 'pessoa@educacao.mg.gov.br.evil.invalid', null])
    await expect(
      db.query('select public.add_access($1,$2,$3)', ['Nova Pessoa', email, 'staff']),
    ).rejects.toThrow('educacao');
  await expect(
    db.query("select public.add_access('Nova Pessoa','pessoa@educacao.mg.gov.br','director')"),
  ).rejects.toThrow('gestores');
  await db.query(
    "select public.add_access('Nova Pessoa','  Nova.Pessoa@educacao.mg.gov.br  ','staff')",
  );
  await expect(
    db.query("select public.add_access('Duplicada','nova.pessoa@educacao.mg.gov.br','staff')"),
  ).rejects.toThrow();
  await act(8);
  expect((await db.query('select id from public.staff_members')).rows).toHaveLength(1);
  expect(staffEmailSchema.parse('  Nova.Pessoa@educacao.mg.gov.br ')).toBe(
    'nova.pessoa@educacao.mg.gov.br',
  );
});
it('histórico corrigido e troca de e-mail permanecem compatíveis com backup/recuperação', async () => {
  await correct(20, ['2026-10-04']);
  await change(21);
  const data = (
    await db.query<{ data: PortalData }>("select public.create_backup_snapshot()->'data' as data")
  ).rows[0].data;
  expect(backupDataSchema.safeParse(data).success).toBe(true);
  expect(() =>
    planRecovery({ id: id(40), createdAt: new Date().toISOString(), data }),
  ).not.toThrow();
  expect(
    data.audit.some(
      (a) => a.detail.includes('ana@educacao.mg.gov.br') && a.detail.includes('nova.conta'),
    ),
  ).toBe(true);
  expect(data.bookings.some((b) => b.id === id(10) && b.status === 'cancelled')).toBe(true);
  expect(data.audit.find((a) => a.action === 'Uso de folga corrigido')?.staffId).toBe(id(1));
  expect(
    (await db.query("select to_regprocedure('public.restore_backup(jsonb,boolean)') as rpc"))
      .rows[0].rpc,
  ).toBeNull();
  await act(8);
  expect(
    (await db.query<{ data: PortalData }>('select public.portal_snapshot() data')).rows[0].data
      .audit,
  ).toEqual([]);
  await expect(db.query('select private.snapshot_payload(true)')).rejects.toThrow(
    'permission denied',
  );
});
it('motivo máximo e dois conjuntos de 60 datas cabem no histórico exportável', async () => {
  await db.exec(`reset role;update public.credit_entries set days=120 where staff_id='${id(1)}';
    update public.leave_bookings set dates=array(select d::date from generate_series('2025-01-01'::date,'2025-03-01'::date,'1 day') d) where id='${id(10)}';`);
  await act(6);
  await db.query(
    `select public.correct_used_leave($1,$2,array(select d::date from generate_series('2024-01-01'::date,'2024-02-29'::date,'1 day') d),$3)`,
    [id(20), id(10), 'x'.repeat(500)],
  );
  const data = (
    await db.query<{ data: PortalData }>("select public.create_backup_snapshot()->'data' as data")
  ).rows[0].data;
  expect(
    data.audit.find((a) => a.action === 'Uso de folga corrigido')!.detail.length,
  ).toBeLessThanOrEqual(2000);
  expect(backupDataSchema.safeParse(data).success).toBe(true);
});
