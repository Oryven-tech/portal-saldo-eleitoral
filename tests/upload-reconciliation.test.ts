import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { reconcileUpload, purgeUpload } from '../src/upload-reconciliation';
import type { UploadPlan, UploadMaintenanceDestination } from '../src/upload-reconciliation';

const uid = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const staff = uid(1),
  other = uid(2),
  user = uid(3),
  otherUser = uid(4),
  director = uid(5);
let db: PGlite;
async function act(id: string, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
const manifest = (size = 686) => [{ name: 'original.pdf', size, hash: 'a'.repeat(64) }];
const reserve = (id: string, files: unknown = manifest(), activity = 'Teste de upload') =>
  db.query<{ docs: UploadPlan['documents'] }>(
    'select public.reserve_submission($1,$2,$3,$4,2,$5::jsonb) as docs',
    [id, 'Servidor de teste', 'TESTE', activity, JSON.stringify(files)],
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth; create table auth.users(id uuid primary key,email text not null,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;`);
  for (const file of [
    '202610160001_portal.sql',
    '202610170001_recovery.sql',
    '202610180001_upload_reconciliation.sql',
  ])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`reset role; drop function if exists public.pse_upload_acceptance(text,uuid,integer,jsonb,bigint,date[]); drop table if exists private.upload_acceptance_context;
    truncate public.staff_members,public.access_allowlist,auth.users,private.backup_snapshots,private.recovery_runs,storage.objects cascade;
    update public.app_settings set storage_budget=700000000;
    insert into public.staff_members(id,name,email) values('${staff}','Servidor de teste','a@example.invalid'),('${other}','Outro teste','b@example.invalid');
    insert into public.access_allowlist(name,email,role,staff_id) values('Direção','d@example.invalid','director',null),('Servidor de teste','a@example.invalid','staff','${staff}'),('Outro teste','b@example.invalid','staff','${other}');
    insert into auth.users(id,email,raw_app_meta_data) values('${user}','a@example.invalid','{"provider":"google"}'),('${otherUser}','b@example.invalid','{"provider":"google"}'),('${director}','d@example.invalid','{"provider":"google"}');`);
});
afterAll(async () => {
  await db?.close();
});

it('roteiro nativo restringe o alvo, mantém identidades apenas dentro da transação e restaura limites', async () => {
  const fixture = readFileSync(
    new URL('../scripts/upload-acceptance.sql', import.meta.url),
    'utf8',
  );
  await expect(db.exec(fixture)).rejects.toThrow('isolado');
  await db.exec(`rollback; reset role; delete from auth.users; update public.app_settings set school_name='Escola de Ensaio PSE';
    insert into private.recovery_runs(id,payload) values('91000000-0000-4000-8000-000000000001','{"data":{"documents":[]}}');`);
  await db.exec(fixture);
  await act(user);
  await expect(db.query("select public.pse_upload_acceptance('info')")).rejects.toThrow(
    'permission denied',
  );
  await act(user, 'service_role');
  await db.query("select public.pse_upload_acceptance('reserve',$1,1,$2::jsonb)", [
    '83000000-0000-4000-8000-000000000020',
    JSON.stringify(manifest()),
  ]);
  const info = await db.query<{
    info: {
      authUsers: number;
      activeTestAccesses: number;
      documents: number;
      budgetRestored: boolean;
    };
  }>("select public.pse_upload_acceptance('info') as info");
  expect(info.rows[0].info).toMatchObject({
    authUsers: 0,
    activeTestAccesses: 0,
    documents: 1,
    budgetRestored: true,
  });
  await db.query("select public.pse_upload_acceptance('book',$1,1,null,null,array['2026-11-20'::date])",['83000000-0000-4000-8000-000000000030']);
  await expect(db.query("select public.pse_upload_acceptance('book',$1,1,null,null,array['2026-11-21'::date])",['83000000-0000-4000-8000-000000000031'])).rejects.toThrow('insuficiente');
  await db.query("select public.pse_upload_acceptance('global_limit',null,1,null,1000)");
  await db.query("select public.pse_upload_acceptance('restore_limits')");
  expect(
    (
      await db.query<{ info: { budgetRestored: boolean } }>(
        "select public.pse_upload_acceptance('info') as info",
      )
    ).rows[0].info.budgetRestored,
  ).toBe(true);
});

it('retoma os mesmos três PDFs em outra ordem, inclusive manifesto legado, sem duplicar intenção', async () => {
  await act(user);
  const files = [
    manifest()[0],
    { ...manifest()[0], name: 'b.pdf' },
    { ...manifest()[0], name: 'c.pdf' },
  ];
  const first = await reserve(uid(10), files);
  await db.exec('reset role');
  await db.query('update public.submissions set upload_manifest=$1::jsonb where id=$2', [
    JSON.stringify([...files].reverse()),
    uid(10),
  ]);
  await act(user);
  const again = await reserve(uid(10), [...files].reverse());
  expect(again.rows[0].docs.map((doc) => doc.id).sort()).toEqual(
    first.rows[0].docs.map((doc) => doc.id).sort(),
  );
  await expect(
    reserve(uid(10), [{ ...files[0], hash: 'b'.repeat(64) }, ...files.slice(1)]),
  ).rejects.toThrow('incompatível');
  expect((await db.query('select id from public.submissions')).rows).toHaveLength(1);
});

it('recusa metadados ausentes, campos extras e tamanho fracionário sem reservar cota', async () => {
  await act(user);
  for (const files of [
    null,
    {},
    [{ name: 'x.pdf', size: 1 }],
    [{ ...manifest()[0], extra: true }],
    [{ ...manifest()[0], size: 1.5 }],
  ])
    await expect(reserve(uid(10), files)).rejects.toThrow();
  expect((await db.query('select * from public.documents')).rows).toHaveLength(0);
});

it('restringe reconciliação e descarte ao operador; outro servidor não retoma uma intenção alheia', async () => {
  await act(user);
  await reserve(uid(10));
  await act(otherUser);
  await expect(reserve(uid(10))).rejects.toThrow('incompatível');
  for (const actor of [user, director]) {
    await act(actor);
    await expect(db.query('select public.inspect_upload($1)', [uid(10)])).rejects.toThrow(
      'permission denied',
    );
    await expect(
      db.query("select public.retire_upload($1,'Motivo sintético')", [uid(10)]),
    ).rejects.toThrow('permission denied');
    await expect(db.query('select public.finish_upload_cleanup($1)', [uid(10)])).rejects.toThrow(
      'permission denied',
    );
  }
});

it('descarte não devolve cota; limpeza exige prazo, ausência física e mantém bloqueio de reenvio antigo', async () => {
  await act(user);
  await reserve(uid(10), manifest(6_000_000));
  await db.exec('reset role');
  await db.exec(`update public.submissions set created_at=now()-interval '1 hour';
    insert into storage.objects(bucket_id,name,metadata) select 'evidence',path,jsonb_build_object('size',size) from public.documents;`);
  await act(user, 'service_role');
  await db.query("select public.retire_upload($1,'Arquivo original indisponível')", [uid(10)]);
  await db.query("select public.retire_upload($1,'Repetição sem novo efeito')", [uid(10)]);
  await expect(db.query('select public.finish_upload_cleanup($1)', [uid(10)])).rejects.toThrow(
    '24 horas',
  );
  await expect(
    db.query('select public.finalize_submission($1,$2)', [uid(10), user]),
  ).rejects.toThrow('descartado');
  await act(user);
  await expect(reserve(uid(10), manifest(6_000_000))).rejects.toThrow('descartado');
  await expect(reserve(uid(11), manifest(5_000_000), 'Outro turno')).rejects.toThrow('acumulado');
  await db.exec(
    "reset role; update private.upload_cleanups set not_before=now()-interval '1 second'",
  );
  await act(user, 'service_role');
  await expect(db.query('select public.finish_upload_cleanup($1)', [uid(10)])).rejects.toThrow(
    'ainda existem',
  );
  // Only the mock Storage fixture is manipulated with SQL. Real deletion uses Storage API.
  await db.exec('reset role; delete from storage.objects');
  await act(user, 'service_role');
  await db.query('select public.finish_upload_cleanup($1)', [uid(10)]);
  await db.query('select public.finish_upload_cleanup($1)', [uid(10)]);
  const report = await db.query<{ plan: UploadPlan[] }>(
    'select public.inspect_upload($1) as plan',
    [uid(10)],
  );
  expect(report.rows[0].plan[0].documents).toHaveLength(0);
  expect(report.rows[0].plan[0].cleanup?.documents).toHaveLength(1);
  await act(user);
  await reserve(uid(11), manifest(6_000_000), 'Outro turno');
  await expect(reserve(uid(10), manifest(6_000_000))).rejects.toThrow('descartado');
});

it('protege rascunhos recentes e referências de backup/recuperação', async () => {
  await act(user);
  await reserve(uid(10));
  await act(user, 'service_role');
  await expect(
    db.query("select public.retire_upload($1,'Descarte de teste')", [uid(10)]),
  ).rejects.toThrow('15 minutos');
  await db.exec("reset role; update public.submissions set created_at=now()-interval '1 hour'");
  await db.query('insert into private.backup_snapshots(actor_id,payload) values($1,$2::jsonb)', [
    director,
    JSON.stringify({ documents: [{ submissionId: uid(10) }] }),
  ]);
  await act(user, 'service_role');
  await expect(
    db.query("select public.retire_upload($1,'Descarte de teste')", [uid(10)]),
  ).rejects.toThrow('backup');
  await db.exec('reset role; delete from private.backup_snapshots');
  await db.query('insert into private.recovery_runs(id,payload) values($1,$2::jsonb)', [
    uid(20),
    JSON.stringify({ data: { documents: [{ submissionId: uid(10) }] } }),
  ]);
  await act(user, 'service_role');
  await expect(
    db.query("select public.retire_upload($1,'Descarte de teste')", [uid(10)]),
  ).rejects.toThrow('recuperação');
});

it('finalização é idempotente e recusa identidade que mudou de e-mail', async () => {
  await act(user);
  await reserve(uid(10));
  await db.exec(
    `reset role; insert into storage.objects(bucket_id,name,metadata) select 'evidence',path,jsonb_build_object('size',size) from public.documents;`,
  );
  await db.query('update auth.users set email=$1 where id=$2', ['mudou@example.invalid', user]);
  await act(user, 'service_role');
  await expect(
    db.query('select public.finalize_submission($1,$2)', [uid(10), user]),
  ).rejects.toThrow('não autorizado');
  await db.exec('reset role');
  await db.query('update auth.users set email=$1 where id=$2', ['a@example.invalid', user]);
  await act(user, 'service_role');
  await db.query('select public.finalize_submission($1,$2)', [uid(10), user]);
  await db.query('select public.finalize_submission($1,$2)', [uid(10), user]);
  const plan = await db.query<{ plan: UploadPlan[] }>('select public.inspect_upload($1) as plan', [
    uid(10),
  ]);
  expect(plan.rows[0].plan[0].status).toBe('pending');
  expect(plan.rows[0].plan[0].documents[0].status).toBe('ready');
  await expect(
    db.query("select public.retire_upload($1,'Não pode apagar')", [uid(10)]),
  ).rejects.toThrow('rascunho');
  await db.exec('reset role');
  expect(
    (await db.query("select * from public.audit_events where action='Comprovantes recebidos'"))
      .rows,
  ).toHaveLength(1);
  expect((await db.query('select * from public.credit_entries')).rows).toHaveLength(0);
});

it('cota global inclui quarentena e limita rascunhos abertos', async () => {
  await act(user);
  await reserve(uid(10), manifest(6_000_000));
  await db.exec(
    "reset role; update public.submissions set created_at=now()-interval '1 hour'; update public.app_settings set storage_budget=8000000",
  );
  await act(user, 'service_role');
  await db.query("select public.retire_upload($1,'Descarte de teste')", [uid(10)]);
  await act(otherUser);
  await expect(reserve(uid(11), manifest(3_000_000))).rejects.toThrow('Orçamento');
  for (let i = 12; i < 15; i++) await reserve(uid(i), manifest(1), `Atividade ${i}`);
  await expect(reserve(uid(15), manifest(1), 'Quarta atividade')).rejects.toThrow('Retome');
});

async function localPlan(): Promise<UploadPlan> {
  const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  return {
    id: uid(10),
    staffId: staff,
    status: 'draft',
    createdAt: '2026-10-18T00:00:00Z',
    actorId: user,
    cleanup: null,
    documents: [
      {
        id: uid(11),
        name: 'teste.pdf',
        path: `${staff}/${uid(10)}/${uid(11)}.pdf`,
        size: bytes.length,
        hash,
        status: 'pending',
      },
    ],
  };
}
it('operador só finaliza após conferir bytes; arquivo ausente ou corrompido não finaliza', async () => {
  const plan = await localPlan();
  const calls: string[] = [];
  const destination: UploadMaintenanceDestination = {
    download: async () => new TextEncoder().encode('%PDF-1.7\n%%EOF'),
    finalize: async () => {
      calls.push('finalize');
    },
    authorizeCleanup: async () => {},
    remove: async () => {
      calls.push('remove');
    },
    finishCleanup: async () => {
      calls.push('finish');
    },
  };
  await reconcileUpload(plan, destination);
  expect(calls).toEqual(['finalize']);
  calls.length = 0;
  await expect(
    reconcileUpload(plan, { ...destination, download: async () => null }),
  ).rejects.toThrow('incompleto');
  await expect(
    reconcileUpload(plan, { ...destination, download: async () => new Uint8Array(1) }),
  ).rejects.toThrow('diferente');
  expect(calls).toEqual([]);
});
it('limpeza verifica todo conjunto, prazo, caminhos e suporta repetição após remoção parcial', async () => {
  const plan = await localPlan();
  plan.status = 'changes_requested';
  plan.cleanup = {
    documents: structuredClone(plan.documents),
    requestedAt: '2026-10-17T00:00:00Z',
    notBefore: '2026-10-18T00:00:00Z',
    completedAt: null,
  };
  plan.documents[0].status = 'failed';
  const calls: string[] = [];
  const destination: UploadMaintenanceDestination = {
    download: async () => null,
    finalize: async () => {
      calls.push('finalize');
    },
    authorizeCleanup: async () => {},
    remove: async () => {
      calls.push('remove');
    },
    finishCleanup: async () => {
      calls.push('finish');
    },
  };
  await expect(purgeUpload(plan, destination, 0)).rejects.toThrow('24 horas');
  const unsafe = structuredClone(plan);
  unsafe.cleanup!.documents[0].path = 'outro/arquivo.pdf';
  await expect(purgeUpload(unsafe, destination)).rejects.toThrow('Caminho');
  await expect(
    purgeUpload(plan, { ...destination, download: async () => new Uint8Array(1) }),
  ).rejects.toThrow('diferente');
  await expect(
    purgeUpload(
      plan,
      {
        ...destination,
        authorizeCleanup: async () => {
          throw new Error('Prazo no servidor ainda não encerrou');
        },
      },
      Date.now() + 1e12,
    ),
  ).rejects.toThrow('servidor');
  expect(calls).toEqual([]);
  await purgeUpload(plan, destination);
  expect(calls).toEqual(['remove', 'finish']);
  calls.length = 0;
  plan.cleanup.completedAt = '2026-10-18T01:00:00Z';
  plan.documents = [];
  expect((await purgeUpload(plan, destination)).status).toBe('already_cleaned');
  expect(calls).toEqual([]);
});
