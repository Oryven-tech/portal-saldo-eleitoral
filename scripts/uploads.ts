// Technical operator only; no privileged key is accepted through CLI arguments.
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { hidden } from './hidden-input.ts';
import { uploadPlanSchema, reconcileUpload, purgeUpload } from '../src/upload-reconciliation.ts';

async function main() {
  const [mode, target, id] = process.argv.slice(2);
  if (
    !['inspect', 'finalize', 'discard', 'purge'].includes(mode) ||
    !/^[a-z0-9]{20}$/.test(target ?? '') ||
    (id && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) ||
    (mode !== 'inspect' && !id)
  )
    throw new Error(
      'Uso: npm run uploads -- inspect <projeto> [id] | finalize/discard/purge <projeto> <id>',
    );
  process.stdout.write(`Destino: https://${target}.supabase.co. Chave somente deste projeto.\n`);
  let key = await hidden('Chave secreta/service_role (entrada mascarada): ');
  if (!key.startsWith('sb_secret_')) {
    let role = '';
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {
      /* reject below */
    }
    if (role !== 'service_role')
      throw new Error('Chave administrativa necessária; chave publicável não serve.');
  }
  const client = createClient(`https://${target}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  key = '';
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`Operação recusada: ${error.message}`);
    return data;
  };
  const plans = uploadPlanSchema.array().parse(await rpc('inspect_upload', { p_id: id ?? null }));
  process.stdout.write(
    JSON.stringify(
      plans.map((plan) => ({
        id: plan.id,
      staffId: plan.staffId,
        status: plan.status,
        createdAt: plan.createdAt,
        documents: plan.documents.length,
        bytes: plan.documents.reduce((sum, doc) => sum + doc.size, 0),
        activeIdentity: !!plan.actorId,
        cleanupAfter: plan.cleanup?.notBefore ?? null,
        cleanedAt: plan.cleanup?.completedAt ?? null,
      })),
      null,
      2,
    ) + '\n',
  );
  if (mode === 'inspect') return;
  if (plans.length !== 1) throw new Error('Envio não encontrado.');
  const verb = { finalize: 'FINALIZAR', discard: 'DESCARTAR', purge: 'EXCLUIR' }[mode]!;
  const confirmation = `${verb} ${target} ${id}`;
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let reason = '';
  try {
    if (mode === 'discard') reason = await terminal.question('Justificativa do descarte: ');
    if (mode === 'purge')
      process.stdout.write('Exclusão definitiva somente dos PDFs deste rascunho descartado.\n');
    const answer = await terminal.question(`Digite ${confirmation}: `);
    if (answer !== confirmation) throw new Error('Operação não confirmada.');
  } finally {
    terminal.close();
  }
  const destination = {
    async download(path: string) {
      const { data, error } = await client.storage.from('evidence').download(path);
      if (error) {
        if ([400, 404].includes(Number(error.status)) && /not found/i.test(error.message))
          return null;
        throw new Error('Não foi possível conferir o arquivo no Storage.');
      }
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
    async finalize(submissionId: string, actorId: string) {
      await rpc('finalize_submission', { p_id: submissionId, p_actor: actorId });
    },
    async authorizeCleanup(submissionId: string) {
      await rpc('authorize_upload_cleanup', { p_id: submissionId });
    },
    async remove(paths: string[]) {
      const { error } = await client.storage.from('evidence').remove(paths);
      if (error)
        throw new Error(
          'Remoção não confirmada. A cota continua reservada; retome a mesma operação.',
        );
    },
    async finishCleanup(submissionId: string) {
      await rpc('finish_upload_cleanup', { p_id: submissionId });
    },
  };
  const fresh = uploadPlanSchema.array().parse(await rpc('inspect_upload', { p_id: id }))[0];
  if (!fresh) throw new Error('Envio não encontrado.');
  if (mode === 'discard') {
    await rpc('retire_upload', { p_id: id, p_reason: reason });
    process.stdout.write(
      'Rascunho descartado. A cota só será liberada após limpeza conferida, no mínimo 24 horas depois.\n',
    );
  } else {
    const result =
      mode === 'finalize'
        ? await reconcileUpload(fresh, destination)
        : await purgeUpload(fresh, destination);
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}
main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : 'Operação interrompida.') + '\n');
  process.exitCode = 1;
});
