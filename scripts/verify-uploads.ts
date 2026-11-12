// Native acceptance with synthetic identity claims. Never run against the school project.
// Real Auth/RLS isolation has separate Google-session evidence; this script does not replace it.
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { hidden } from './hidden-input.ts';
import { purgeUpload, uploadPlanSchema } from '../src/upload-reconciliation.ts';

const project = 'fjhvkxxvkarilenfjzsy';
const target = `https://${project}.supabase.co`;
const fixtureOrigin = 'https://upload-acceptance.invalid';
const originalFetch = globalThis.fetch;
const uid = (n: number) => `83000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const resumeCleanup = Deno.args.length === 1 && Deno.args[0] === '--cleanup-only';
const proof: {
  passed: string[];
  limitation: string;
  completedAt?: string;
  error?: string;
  resumedAt?: string;
} = {
  passed: [],
  limitation:
    'RPC concorrente e Storage nativos; identidade/claims sintéticos. Handler real executado localmente, sem novo login Google.',
};
function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(`FALHOU: ${label}`);
  if (!proof.passed.includes(label)) proof.passed.push(label);
  console.log(`PASSOU: ${label}`);
}
async function main() {
  if (Deno.args.length && !resumeCleanup) throw new Error('Opção de ensaio desconhecida.');
  if (resumeCleanup) {
    const previous = JSON.parse(
      await Deno.readTextFile('.artifacts/upload-acceptance-report.json'),
    );
    if (
      previous.error !== 'FALHOU: PDF fictício de descarte enviado pelo Storage nativo' ||
      !Array.isArray(previous.passed) ||
      previous.passed.length !== 11 ||
      previous.passed.some((value: unknown) => typeof value !== 'string')
    )
      throw new Error(
        'Retomada exige o relatório da primeira execução interrompida no upload de descarte.',
      );
    proof.passed = previous.passed;
    proof.resumedAt = new Date().toISOString();
    await Deno.writeTextFile(
      '.artifacts/upload-acceptance-initial-report.json',
      JSON.stringify(previous, null, 2),
    );
    console.log(
      'Retomando somente o descarte; os 11 resultados anteriores serão preservados e o estado será conferido.',
    );
  }
  console.log(`Ensaio somente em PSE Homologacao: ${target}`);
  console.log(
    'Cria dados fictícios, simula falhas e exclui apenas um PDF fictício descartado. Não apaga a cópia recuperada anteriormente.',
  );
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const confirmed = await terminal.question(`Digite TESTAR ${project}: `);
  terminal.close();
  if (confirmed !== `TESTAR ${project}`) throw new Error('Ensaio não confirmado.');
  let key = await hidden(
    'Chave secreta/service_role SOMENTE do projeto isolado: ',
    process.stdin,
    process.stdout,
  );
  if (!key.startsWith('sb_secret_')) {
    let role = '';
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {
      /* reject below */
    }
    if (role !== 'service_role')
      throw new Error('Chave administrativa do ambiente isolado necessária.');
  }
  const client = createClient(target, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init = {}) =>
        originalFetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  };
  const exercise = (action: string, args: Record<string, unknown> = {}) =>
    rpc('pse_upload_acceptance', { p_action: action, ...args });
  const inspect = async (id: string) =>
    uploadPlanSchema.array().parse(await rpc('inspect_upload', { p_id: id }))[0];
  let captured: ((request: Request) => Response | Promise<Response>) | undefined;
  const serve = Deno.serve;
  let partial = false,
    uploadCount = 0,
    privilegedCalls = 0;
  try {
    const info = await exercise('info');
    assert(
      info.environment === 'isolated-upload-acceptance-v1' &&
        info.originalPdf === 1 &&
        info.authUsers === 0 &&
        info.activeTestAccesses === 0,
      'destino isolado, PDF original preservado e nenhuma identidade ativa',
    );
    Deno.env.set('PORTAL_ORIGIN', 'http://127.0.0.1:5173');
    Deno.env.set('SUPABASE_URL', fixtureOrigin);
    Deno.env.set('SUPABASE_ANON_KEY', 'synthetic-public-key');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-server-key');
    Deno.serve = ((handler: typeof captured) => {
      captured = handler;
      return {};
    }) as typeof Deno.serve;
    await import('../supabase/functions/submit-evidence/index.ts');
    Deno.serve = serve;
    globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== fixtureOrigin)
        throw new Error('Destino não permitido no transporte de ensaio.');
      const headers = new Headers(init.headers);
      const actor = headers.get('authorization') === 'Bearer synthetic-b' ? 2 : 1;
      if (url.pathname === '/auth/v1/user')
        return Response.json({
          id: uid(actor === 1 ? 3 : 4),
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'google' },
          user_metadata: {},
          created_at: '2026-10-18T00:00:00Z',
        });
      if (url.pathname === '/rest/v1/rpc/reserve_submission') {
        const args = JSON.parse(String(init.body));
        try {
          return Response.json(
            await exercise('reserve', { p_id: args.p_id, p_actor: actor, p_files: args.p_files }),
          );
        } catch {
          return Response.json({ message: 'Reservation refused' }, { status: 400 });
        }
      }
      if (url.pathname === '/rest/v1/rpc/finalize_submission') {
        const args = JSON.parse(String(init.body));
        try {
          return Response.json(
            await exercise('finalize', {
              p_id: args.p_id,
              p_actor: args.p_actor === uid(4) ? 2 : 1,
            }),
          );
        } catch {
          return Response.json({ message: 'Finalization refused' }, { status: 400 });
        }
      }
      if (!url.pathname.startsWith('/storage/v1/object/evidence/'))
        throw new Error('Chamada fora do protocolo de ensaio.');
      privilegedCalls++;
      if ((init.method ?? 'GET') === 'POST' && partial && ++uploadCount === 2)
        return Response.json({ message: 'Synthetic interrupted transport' }, { status: 400 });
      // Forward the SDK's real Storage request, body and deadline to the isolated
      // project. The administrative credential never appears in URLs or output.
      headers.set('apikey', key);
      headers.set('authorization', `Bearer ${key}`);
      return originalFetch(target + url.pathname + url.search, { ...init, headers });
    }) as typeof fetch;
    const files = [
      new File(['%PDF-1.7\nA\n%%EOF'], 'a.pdf', { type: 'application/pdf' }),
      new File(['%PDF-1.7\nB\n%%EOF'], 'b.pdf', { type: 'application/pdf' }),
      new File(['%PDF-1.7\nC\n%%EOF'], 'c.pdf', { type: 'application/pdf' }),
    ];
    const metadata = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        size: file.size,
        hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join(''),
      })),
    );
    if (!resumeCleanup) {
      const concurrent = await Promise.all(
        Array.from({ length: 50 }, () => exercise('reserve', { p_id: uid(20), p_files: metadata })),
      );
      const paths = concurrent.map((items) =>
        items
          .map((doc: { id: string }) => doc.id)
          .sort()
          .join(','),
      );
      assert(
        new Set(paths).size === 1 && (await inspect(uid(20))).documents.length === 3,
        '50 reservas simultâneas da mesma intenção mantêm somente três documentos',
      );
      const request = (reverse = false) => {
        const form = new FormData();
        form.set('id', uid(20));
        form.set('name', 'Ensaio upload');
        form.set('registration', 'UPLOAD-A');
        form.set('activity', `Ensaio ${uid(20)}`);
        form.set('days', '2');
        for (const file of reverse ? [...files].reverse() : files) form.append('files', file);
        return new Request(`${fixtureOrigin}/upload`, {
          method: 'POST',
          headers: { origin: 'http://127.0.0.1:5173', authorization: 'Bearer synthetic-a' },
          body: form,
        });
      };
      partial = true;
      assert(
        (await captured!(request())).status === 400,
        'handler não confirma envio interrompido após o primeiro objeto',
      );
      assert(
        (await inspect(uid(20))).status === 'draft',
        'falha parcial permanece rascunho sem crédito',
      );
      const partialPlan = await inspect(uid(20));
      const available = await Promise.all(
        partialPlan.documents.map((doc) => client.storage.from('evidence').download(doc.path)),
      );
      assert(
        available.filter((item) => !item.error && item.data).length === 1,
        'Storage nativo contém somente o primeiro PDF após interrupção',
      );
      partial = false;
      assert(
        (await captured!(request(true))).status === 200,
        'handler retoma em outra ordem e finaliza os PDFs no serviço real',
      );
      const complete = await inspect(uid(20));
      assert(
        complete.status === 'pending' &&
          complete.documents.length === 3 &&
          complete.documents.every((doc) => doc.status === 'ready'),
        'banco finaliza um único envio com três documentos prontos',
      );
      const before = privilegedCalls;
      assert(
        (await captured!(request())).status === 200 && privilegedCalls === before,
        'resposta perdida pode ser repetida sem novo upload/download',
      );
      await exercise('global_limit', { p_limit: 1000 });
      const quotaFiles = [{ name: 'quota.pdf', size: 600, hash: 'a'.repeat(64) }];
      const globalRace = await Promise.allSettled([
        exercise('reserve', { p_id: uid(21), p_actor: 1, p_files: quotaFiles }),
        exercise('reserve', { p_id: uid(22), p_actor: 2, p_files: quotaFiles }),
      ]);
      assert(
        globalRace.filter((item) => item.status === 'fulfilled').length === 1,
        'duas reservas simultâneas não ultrapassam a cota global restante',
      );
      await exercise('restore_limits');
      await exercise('staff_limit', { p_limit: 1000 });
      const staffRace = await Promise.allSettled([
        exercise('reserve', { p_id: uid(23), p_files: quotaFiles }),
        exercise('reserve', { p_id: uid(24), p_files: quotaFiles }),
      ]);
      assert(
        staffRace.filter((item) => item.status === 'fulfilled').length === 1,
        'duas reservas simultâneas não ultrapassam a cota individual',
      );
      await exercise('restore_limits');
      const bookRace = await Promise.allSettled([
        exercise('book', { p_id: uid(30), p_dates: ['2026-11-20'] }),
        exercise('book', { p_id: uid(31), p_dates: ['2026-11-21'] }),
      ]);
      assert(
        bookRace.filter((item) => item.status === 'fulfilled').length === 1,
        'duas reservas de folga concorrentes não usam o mesmo último dia',
      );
    } else {
      const complete = await inspect(uid(20));
      const interrupted = await inspect(uid(25));
      assert(
        info.submissions === 4 &&
          info.documents === 6 &&
          info.bookings === 1 &&
          info.available === 0 &&
          info.budgetRestored &&
          complete.status === 'pending' &&
          complete.documents.length === 3 &&
          complete.documents.every((doc) => doc.status === 'ready') &&
          interrupted.status === 'draft' &&
          interrupted.documents.length === 1 &&
          !interrupted.cleanup,
        'retomada confere envio pronto, disputa do último dia, limites restaurados e descarte ainda pendente',
      );
    }
    const cleanupDocs = await exercise('reserve', { p_id: uid(25), p_files: [metadata[0]] });
    const upload = await client.storage
      .from('evidence')
      .upload(cleanupDocs[0].path, await files[0].arrayBuffer(), {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (upload.error)
      console.error(
        `Storage recusou o PDF fictício: ${upload.error.message.replaceAll(key, '[redigido]').slice(0, 300)}`,
      );
    assert(!upload.error, 'PDF fictício de descarte enviado pelo Storage nativo');
    await exercise('age', { p_id: uid(25) });
    await rpc('retire_upload', {
      p_id: uid(25),
      p_reason: 'Ensaio sintético de quarentena e liberação de cota',
    });
    const quarantined = await inspect(uid(25));
    assert(
      quarantined.status === 'changes_requested' && quarantined.documents[0].status === 'failed',
      'descarte bloqueia retomada e mantém os metadados reservados',
    );
    const early = await client.rpc('authorize_upload_cleanup', { p_id: uid(25) });
    assert(
      !!early.error && early.error.message.includes('24 horas'),
      'servidor recusa exclusão antes de 24 horas',
    );
    assert(
      !(await client.storage.from('evidence').download(cleanupDocs[0].path)).error,
      'recusa antecipada preserva o PDF no Storage',
    );
    // Clock advance exists only in this service-only fixture helper, restricted
    // to synthetic IDs; production reconciliation has no deadline override.
    await exercise('advance_cleanup_clock', { p_id: uid(25) });
    const eligible = await inspect(uid(25));
    await purgeUpload(
      eligible,
      {
        async download(path) {
          const { data, error } = await client.storage.from('evidence').download(path);
          if (error) throw new Error('Download do ensaio não confirmado');
          return data ? new Uint8Array(await data.arrayBuffer()) : null;
        },
        async finalize() {
          throw new Error('Limpeza não pode finalizar envio');
        },
        async authorizeCleanup(id) {
          await rpc('authorize_upload_cleanup', { p_id: id });
        },
        async remove(paths) {
          const { error } = await client.storage.from('evidence').remove(paths);
          if (error) throw new Error('Exclusão fictícia não confirmada');
        },
        async finishCleanup(id) {
          await rpc('finish_upload_cleanup', { p_id: id });
        },
      },
      Date.parse(eligible.cleanup!.notBefore) + 1,
    );
    const cleaned = await inspect(uid(25));
    assert(
      cleaned.documents.length === 0 && !!cleaned.cleanup?.completedAt,
      'remoção pelo Storage libera cota e preserva o manifesto de auditoria',
    );
    await exercise('restore_limits');
    const final = await exercise('info');
    assert(
      final.authUsers === 0 &&
        final.activeTestAccesses === 0 &&
        final.originalPdf === 1 &&
        final.budgetRestored &&
        final.bookings === 1 &&
        final.available === 0,
      'limites restaurados, cópia original preservada, saldo consistente e nenhuma identidade ativa',
    );
    proof.completedAt = new Date().toISOString();
    console.log(
      'ENSAIO DE UPLOADS CONCLUÍDO. Dados fictícios preservados no projeto isolado para conferência.',
    );
  } finally {
    Deno.serve = serve;
    globalThis.fetch = originalFetch;
    try {
      await exercise('restore_limits');
    } catch {
      console.error('Confira a restauração dos limites do projeto isolado antes de novos ensaios.');
    }
    key = '';
  }
}
try {
  await main();
} catch (error) {
  proof.error = error instanceof Error ? error.message : 'Ensaio interrompido';
  console.error(proof.error);
  Deno.exitCode = 1;
}
await Deno.mkdir('.artifacts', { recursive: true });
await Deno.writeTextFile(
  '.artifacts/upload-acceptance-report.json',
  JSON.stringify(proof, null, 2),
);
