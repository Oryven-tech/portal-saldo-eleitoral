// Manual, local-only acceptance. No credentials, network or hosted writes.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { exportBackup, readBackup } from '../src/backup.ts';
import { performRecovery, recoveryPath } from '../src/recovery.ts';
import type { Snapshot, Repository } from '../src/repository.ts';

const uid = (n: number) => `86000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = '2026-10-19T00:00:00Z';
const password = 'Somente ensaio sintetico local; nao usar em dados reais.';
const root = await mkdtemp(join(tmpdir(), 'pse-recovery-volume-'));
const db = new PGlite();
const parts: string[] = [];
const proof = {
  startedAt: new Date().toISOString(),
  staff: 50,
  documents: 150,
  bytes: 450_000_000,
  parts: 0,
  uploads: 0,
  restored: false,
  inactiveAccesses: 0,
  peakRssBytes: 0,
  completedAt: '',
  error: '',
};
const observe = () => {
  proof.peakRssBytes = Math.max(proof.peakRssBytes, process.memoryUsage().rss);
};
const memory = setInterval(observe, 100);
function pdf() {
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < bodies.length; i++) {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${bodies[i]}\nendobj\n`;
  }
  const trailer = (xref: number) =>
    `xref\n0 5\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
      .join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // A long PDF comment supplies real bytes without an image or external asset.
  const pad = 3_000_000 - text.length - trailer(3_000_000).length - 2;
  text += '%' + 'x'.repeat(pad) + '\n';
  const bytes = new TextEncoder().encode(text + trailer(text.length));
  assert.equal(bytes.length, 3_000_000);
  return bytes;
}
try {
  const bytes = pdf();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  const data: Snapshot['data'] = {
    schoolName: 'Escola de Ensaio Local',
    user: {
      name: 'Direção sintética',
      email: 'origem@example.invalid',
      role: 'director',
      staffId: null,
    },
    staff: [],
    submissions: [],
    documents: [],
    credits: [],
    bookings: [],
    access: [],
    audit: [],
  };
  for (let n = 1; n <= 50; n++) {
    const id = uid(n),
      submission = uid(100 + n),
      email = `professor${n}@educacao.mg.gov.br`;
    data.staff.push({
      id,
      name: `Professor sintético ${n}`,
      email,
      registration: `S-${n}`,
      active: true,
    });
    data.submissions.push({
      id: submission,
      staffId: id,
      activity: 'Serviço eleitoral sintético',
      declaredDays: 6,
      status: 'approved',
      note: 'Conferido no ensaio',
      createdAt: stamp,
    });
    data.credits.push({
      id: uid(200 + n),
      staffId: id,
      days: 6,
      reason: 'Conferido no ensaio',
      sourceId: submission,
      actor: 'Direção sintética',
      createdAt: stamp,
    });
    for (let d = 0; d < 3; d++)
      data.documents.push({
        id: uid(1000 + n * 3 + d),
        staffId: id,
        submissionId: submission,
        name: `comprovante-${d + 1}.pdf`,
        path: `synthetic/${n}/${d}.pdf`,
        size: bytes.length,
        hash,
        createdAt: stamp,
      });
    data.bookings.push(
      {
        id: uid(300 + n),
        staffId: id,
        dates: ['2026-10-01'],
        status: 'used',
        reason: 'Uso sintético',
        actor: 'Direção sintética',
        createdAt: stamp,
      },
      {
        id: uid(400 + n),
        staffId: id,
        dates: ['2026-11-03'],
        status: 'reserved',
        reason: 'Reserva sintética',
        actor: 'Direção sintética',
        createdAt: stamp,
      },
    );
    data.access.push({
      id: uid(500 + n),
      name: `Professor sintético ${n}`,
      email,
      role: 'staff',
      active: true,
    });
    data.audit.push({
      id: uid(600 + n),
      staffId: id,
      action: 'Crédito aprovado',
      actor: 'Direção sintética',
      detail: 'Ensaio local sem dados reais',
      createdAt: stamp,
    });
  }
  const snapshot: Snapshot = { id: uid(9000), createdAt: stamp, data };
  const pending: Promise<void>[] = [];
  await exportBackup(
    {
      snapshot: async () => snapshot,
      download: async () => new Blob([bytes]),
    } as unknown as Repository,
    password,
    () => {},
    (blob) => {
      const path = join(root, `part-${parts.length + 1}.psebackup`);
      parts.push(path);
      pending.push(blob.arrayBuffer().then((buffer) => writeFile(path, new Uint8Array(buffer))));
    },
  );
  await Promise.all(pending);
  proof.parts = parts.length;
  assert(parts.length > 1);
  const staged = new Map<string, string>();
  const archiveFiles = await Promise.all(
    parts
      .reverse()
      .map(async (path) => ({
        size: (await stat(path)).size,
        arrayBuffer: async () => Uint8Array.from(await readFile(path)).buffer,
      })),
  );
  const copy = await readBackup(archiveFiles, password, async (id, value) => {
    const path = join(root, `${id}.pdf`);
    await writeFile(path, value);
    staged.set(id, path);
  });
  assert.equal(copy.summary.staff, 50);
  assert.equal(copy.summary.documents, 150);
  console.log(
    `PASSOU: backup de 450 MB, ${parts.length} partes, ordem invertida, 50 servidores/150 PDFs íntegros.`,
  );
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key,email text not null,raw_app_meta_data jsonb not null default '{}',email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`,
  );
  for (const file of [
    '202610160001_portal.sql',
    '202610170001_recovery.sql',
    '202610180001_upload_reconciliation.sql',
    '202610180002_leave_access.sql',
    '202610180003_backup_audit.sql',
    '202610180004_audit_hardening.sql',
  ])
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'),
    );
  await db.exec(
    "insert into public.access_allowlist(name,email,role) values('Direção nova','destino@example.invalid','director')",
  );
  const destination = {
    async restore(input: Snapshot, checkOnly: boolean) {
      return (
        await db.query<{ result: { status: string } }>(
          'select public.restore_backup($1::jsonb,$2) result',
          [JSON.stringify(input), checkOnly],
        )
      ).rows[0].result;
    },
    async upload(path: string, value: Uint8Array<ArrayBuffer>) {
      const safe = join(root, 'destination', path);
      assert(safe.startsWith(join(root, 'destination') + sep));
      await mkdir(dirname(safe), { recursive: true });
      await writeFile(safe, value, { flag: 'wx' });
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('evidence',$1,$2::jsonb)",
        [path, JSON.stringify({ size: value.length })],
      );
      proof.uploads++;
    },
    async download(path: string) {
      return Uint8Array.from(await readFile(join(root, 'destination', path)));
    },
  };
  const result = await performRecovery(copy.snapshot, destination, async (id) =>
    Uint8Array.from(await readFile(staged.get(id)!)),
  );
  assert.equal(result.status, 'restored');
  assert.equal(proof.uploads, 150);
  const counts = (
    await db.query<{
      staff: number;
      documents: number;
      available: number;
      inactive: number;
      linked: number;
    }>(
      "select (select count(*)::int from public.staff_members) staff,(select count(*)::int from public.documents) documents,(select sum(private.available(id))::int from public.staff_members) available,(select count(*)::int from public.access_allowlist where role='staff' and not active) inactive,(select count(*)::int from public.audit_events where staff_id is not null) linked",
    )
  ).rows[0];
  assert.deepEqual(counts, { staff: 50, documents: 150, available: 200, inactive: 50, linked: 50 });
  assert.equal(
    (
      await performRecovery(copy.snapshot, destination, async () => {
        throw new Error('Não deve repetir PDFs');
      })
    ).status,
    'already_restored',
  );
  assert.equal(proof.uploads, 150);
  assert.equal(recoveryPath(snapshot.id, data.documents[0].id).includes('..'), false);
  proof.restored = true;
  proof.inactiveAccesses = counts.inactive;
  console.log(
    'PASSOU: migrações reais no PostgreSQL local, saldos/histórico preservados, acessos inativos e repetição sem duplicação.',
  );
  proof.completedAt = new Date().toISOString();
} catch (error) {
  proof.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  clearInterval(memory);
  observe();
  await db.close();
  // Remove only this script's freshly-created directory inside the OS temp root.
  const target = resolve(root);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert(basename(target).startsWith('pse-recovery-volume-'));
  await rm(target, { recursive: true, force: true });
  await mkdir('.artifacts', { recursive: true });
  await writeFile('.artifacts/recovery-volume-report.json', JSON.stringify(proof, null, 2));
}
