import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { planRecovery, performRecovery, recoveryPath } from '../../src/recovery';
import { exportBackup, readBackup } from '../../src/backup';
import type { Snapshot } from '../../src/repository';

const uid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pdf = new TextEncoder().encode('%PDF-1.7\nDocumento sintético\n%%EOF');
const stamp = '2026-10-17T12:00:00Z';
let source: Snapshot;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth; create table auth.users(id uuid primary key,email text not null,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;`);
  for (const file of ['202610160001_portal.sql', '202610170001_recovery.sql'])
    await db.exec(
      readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'),
    );
}, 30000);
beforeEach(async () => {
  source = {
    id: uid(1),
    createdAt: stamp,
    data: {
      schoolName: 'Escola de teste',
      user: {
        name: 'Direção anterior',
        email: 'anterior@example.com',
        role: 'director',
        staffId: null,
      },
      staff: [
        {
          id: uid(2),
          name: 'Servidor Teste',
          email: 'teste@example.com',
          registration: 'T-1',
          active: true,
        },
        {
          id: uid(9),
          name: 'Outro Servidor',
          email: 'outro@example.com',
          registration: 'T-2',
          active: false,
        },
      ],
      submissions: [
        {
          id: uid(3),
          staffId: uid(2),
          activity: 'Serviço eleitoral',
          declaredDays: 3,
          status: 'approved',
          note: 'Conferido',
          createdAt: stamp,
        },
      ],
      documents: [
        {
          id: uid(4),
          staffId: uid(2),
          submissionId: uid(3),
          name: '../arquivo.pdf',
          path: '../../caminho-nao-confiavel',
          size: pdf.length,
          hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', pdf))]
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
          createdAt: stamp,
        },
      ],
      credits: [
        {
          id: uid(5),
          staffId: uid(2),
          days: 3,
          reason: 'Conferido',
          sourceId: uid(3),
          actor: 'Direção anterior',
          createdAt: stamp,
        },
      ],
      bookings: [
        {
          id: uid(6),
          staffId: uid(2),
          dates: ['2026-10-01'],
          status: 'used',
          reason: 'Uso confirmado',
          actor: 'Direção anterior',
          createdAt: stamp,
        },
        {
          id: uid(7),
          staffId: uid(2),
          dates: ['2026-11-03'],
          status: 'reserved',
          reason: 'Reserva confirmada',
          actor: 'Direção anterior',
          createdAt: stamp,
        },
      ],
      access: [
        {
          id: uid(8),
          name: 'Não conferir administração',
          email: 'teste@example.com',
          role: 'director',
          active: true,
        },
      ],
      audit: [],
    },
  };
  await db.exec(`reset role; truncate public.staff_members,public.access_allowlist,auth.users,private.backup_snapshots,private.recovery_runs,storage.objects cascade;
    insert into public.access_allowlist(name,email,role) values('Direção nova','nova@example.com','director');
    insert into auth.users(id,email,raw_app_meta_data) values('${uid(20)}','nova@example.com','{"provider":"google"}');`);
});
afterAll(async () => {
  await db?.close();
});
async function object() {
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('evidence',$1,$2::jsonb)",
    [recoveryPath(source.id, uid(4)), JSON.stringify({ size: pdf.length })],
  );
}
const restore = async (checkOnly = false) =>
  (
    await db.query<{ result: { status: string } }>(
      'select public.restore_backup($1::jsonb,$2) as result',
      [JSON.stringify(source), checkOnly],
    )
  ).rows[0].result;

it('lê cópia criptografada por partes e recupera PDFs sem usar caminhos do arquivo', async () => {
  const files: File[] = [];
  await exportBackup(
    { snapshot: async () => source, download: async () => new Blob([pdf]) } as never,
    'frase sintética de recuperação',
    () => {},
    (blob, name) => files.push(new File([blob], name)),
  );
  const staged = new Map<string, Uint8Array<ArrayBuffer>>();
  const read = await readBackup(files, 'frase sintética de recuperação', async (id, bytes) => {
    staged.set(id, bytes);
  });
  expect(read.summary.documents).toBe(1);
  expect(staged.get(uid(4))).toEqual(pdf);
  expect(planRecovery(read.snapshot).counts.staff).toBe(2);
  expect(recoveryPath(source.id, uid(4))).not.toContain('..');
  expect(() => recoveryPath('../invasao', uid(4))).toThrow();
});
it('recusa créditos/folgas incoerentes e cópia parcial de servidor antes de transmitir', () => {
  source.data.credits[0].days = 1;
  expect(() => planRecovery(source)).toThrow('Saldo comprometido');
  source.data.credits[0].days = 3;
  source.data.bookings[1].dates = source.data.bookings[0].dates;
  expect(() => planRecovery(source)).toThrow('sobrepostas');
  source.data.user.role = 'staff';
  expect(() => planRecovery(source)).toThrow('cópia completa');
});
it('retoma objeto existente idêntico e só conclui metadados após conferir o destino', async () => {
  const calls: boolean[] = [];
  const result = await performRecovery(
    source,
    {
      restore: async (_, check) => {
        calls.push(check);
        return { status: check ? 'empty' : 'restored' };
      },
      upload: async () => {
        throw new Error('Objeto já existe');
      },
      download: async () => pdf,
    },
    async () => pdf,
  );
  expect(result.status).toBe('restored');
  expect(calls).toEqual([true, false]);
  calls.length = 0;
  await expect(
    performRecovery(
      source,
      {
        restore: async (_, check) => {
          calls.push(check);
          return { status: 'empty' };
        },
        upload: async () => {},
        download: async () => new Uint8Array([1, 2, 3]),
      },
      async () => pdf,
    ),
  ).rejects.toThrow('Documento diferente');
  expect(calls).toEqual([true]);
});
it('bloqueia restauração por sessão comum e exige arquivos completos', async () => {
  await db.exec('set role authenticated');
  await expect(restore()).rejects.toThrow('permission denied');
  await db.exec('reset role; set role anon');
  await expect(restore()).rejects.toThrow('permission denied');
  await db.exec('reset role; set role service_role');
  expect((await restore(true)).status).toBe('empty');
  await expect(restore()).rejects.toThrow('Faltam documentos');
});
it('restaura saldos e vínculos atomicamente, não concede acesso histórico e não duplica', async () => {
  await object();
  await db.exec('set role service_role');
  expect((await restore()).status).toBe('restored');
  expect((await restore()).status).toBe('already_restored');
  await db.exec('reset role');
  expect((await db.query('select private.available($1) as days', [uid(2)])).rows[0]).toEqual({
    days: 1,
  });
  expect((await db.query('select * from public.credit_entries')).rows).toHaveLength(1);
  expect((await db.query('select * from public.access_allowlist where active')).rows).toHaveLength(
    1,
  );
  expect(
    (await db.query("select * from public.access_allowlist where role='director'")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select * from public.access_allowlist where role='staff' and not active"))
      .rows,
  ).toHaveLength(2);
  expect((await db.query('select * from public.user_memberships')).rows).toHaveLength(1);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(20)]);
  await db.exec('set role authenticated');
  await db.query(
    "select public.toggle_access(id,true) from public.access_allowlist where email='teste@example.com'",
  );
  await db.exec('reset role');
  expect((await db.query('select * from public.staff_members')).rows).toHaveLength(2);
  expect(
    (await db.query("select staff_id from public.access_allowlist where email='teste@example.com'"))
      .rows[0],
  ).toEqual({ staff_id: uid(2) });
  await db.query(
    'insert into auth.users(id,email,raw_app_meta_data) values($1,\'teste@example.com\',\'{"provider":"google"}\')',
    [uid(21)],
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(21)]);
  await db.exec('set role authenticated');
  expect((await db.query('select id from public.staff_members')).rows).toEqual([{ id: uid(2) }]);
  expect((await db.query('select name from storage.objects')).rows).toEqual([
    { name: recoveryPath(source.id, uid(4)) },
  ]);
  await expect(restore()).rejects.toThrow('permission denied');
});
it('desfaz toda a transação se saldo for inválido; não substitui base existente', async () => {
  await object();
  source.data.credits[0].days = 1;
  await expect(restore()).rejects.toThrow('Saldo comprometido');
  expect((await db.query('select * from public.staff_members')).rows).toHaveLength(0);
  expect((await db.query('select * from private.recovery_runs')).rows).toHaveLength(0);
  source.data.credits[0].days = 3;
  await restore();
  source.id = uid(30);
  await expect(restore(true)).rejects.toThrow('destino vazio');
});
it('converte rascunho incompleto em correção sem criar crédito ou travar reenvio', async () => {
  source.data.submissions.push({
    id: uid(25),
    staffId: uid(2),
    activity: 'Interrompida',
    declaredDays: 2,
    status: 'draft',
    note: '',
    createdAt: stamp,
  });
  await object();
  await restore();
  expect(
    (await db.query('select status,note from public.submissions where id=$1', [uid(25)])).rows[0],
  ).toEqual({
    status: 'changes_requested',
    note: expect.stringContaining('envio interrompido'),
  });
  expect((await db.query('select * from public.credit_entries')).rows).toHaveLength(1);
});
