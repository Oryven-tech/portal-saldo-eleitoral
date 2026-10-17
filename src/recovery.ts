import { z } from 'zod';
import { backupDataSchema, balance } from './domain.ts';
import type { Snapshot } from './repository.ts';

const envelope = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  data: backupDataSchema,
});

export function recoveryPath(snapshotId: string, documentId: string) {
  z.uuid().parse(snapshotId);
  z.uuid().parse(documentId);
  // Never use file names or paths supplied by the archive as destination paths.
  return `_recovery/${snapshotId.toLowerCase()}/${documentId.toLowerCase()}.pdf`;
}

export function planRecovery(input: unknown) {
  const snapshot: Snapshot = envelope.parse(input);
  const { data } = snapshot;
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (data.user.role !== 'director') fail('A recuperação exige uma cópia completa da direção.');
  const emails = data.staff.map((s) => s.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) fail('Há e-mails de servidores repetidos.');
  const sources = data.credits.filter((c) => c.sourceId).map((c) => c.sourceId);
  if (new Set(sources).size !== sources.length)
    fail('Há crédito repetido para o mesmo comprovante.');
  let totalBytes = 0;
  const drafts: string[] = [];
  const open = new Set<string>();
  for (const s of data.submissions) {
    const docs = data.documents.filter((d) => d.submissionId === s.id);
    if (s.status === 'draft') {
      if (docs.length) fail('Rascunho com documentos concluídos exige reconciliação.');
      drafts.push(s.id);
    } else if (docs.length < 1 || docs.length > 3) {
      fail('Envio concluído sem o conjunto de documentos esperado.');
    }
    if (docs.reduce((n, d) => n + d.size, 0) > 10_000_000) fail('Envio acima de 10 MB.');
    const credits = data.credits.filter((c) => c.sourceId === s.id);
    if (
      (s.status === 'approved' && (credits.length !== 1 || credits[0].days < 1)) ||
      (s.status !== 'approved' && credits.length)
    )
      fail('Crédito incompatível com a análise do envio.');
    if (s.status === 'pending') {
      const key = `${s.staffId}:${s.activity}`;
      if (open.has(key)) fail('Há envios pendentes repetidos para a mesma atividade.');
      open.add(key);
    }
  }
  for (const staff of data.staff) {
    if (balance(data, staff.id).available < 0)
      fail('Saldo comprometido acima dos créditos disponíveis.');
    const dates = data.bookings
      .filter((b) => b.staffId === staff.id && b.status !== 'cancelled')
      .flatMap((b) => b.dates);
    if (new Set(dates).size !== dates.length) fail('Há folgas sobrepostas para o mesmo servidor.');
    const bytes = data.documents
      .filter((d) => d.staffId === staff.id)
      .reduce((n, d) => n + d.size, 0);
    if (bytes > 30_000_000) fail('Documentos do servidor excedem o limite máximo suportado.');
    totalBytes += bytes;
  }
  if (totalBytes > 700_000_000) fail('Documentos excedem o orçamento de 700 MB.');
  return {
    snapshot,
    totalBytes,
    interruptedSubmissions: drafts,
    // These are historical entries for manual review, never permission grants.
    accessForReview: data.access,
    counts: {
      staff: data.staff.length,
      documents: data.documents.length,
      credits: data.credits.length,
      bookings: data.bookings.length,
      submissions: data.submissions.length,
    },
  };
}

export interface RecoveryDestination {
  restore(snapshot: Snapshot, checkOnly: boolean): Promise<{ status: string }>;
  upload(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  download(path: string): Promise<Uint8Array<ArrayBuffer>>;
}
const hash = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export async function performRecovery(
  input: unknown,
  destination: RecoveryDestination,
  readDocument: (id: string) => Promise<Uint8Array<ArrayBuffer>>,
  progress: (message: string) => void = () => {},
) {
  const plan = planRecovery(input);
  const preflight = await destination.restore(plan.snapshot, true);
  if (preflight.status === 'already_restored')
    return { ...plan.counts, status: 'already_restored' };
  if (preflight.status !== 'empty') throw new Error('O destino não confirmou que está vazio.');
  let index = 0;
  for (const doc of plan.snapshot.data.documents) {
    progress(`Conferindo documento ${++index}/${plan.counts.documents}…`);
    const bytes = await readDocument(doc.id);
    if (bytes.length !== doc.size || (await hash(bytes)) !== doc.hash)
      throw new Error('O documento local mudou após a validação. A restauração não foi concluída.');
    const path = recoveryPath(plan.snapshot.id, doc.id);
    try {
      await destination.upload(path, bytes);
    } catch {
      // A prior attempt may have uploaded this immutable object. Reading and
      // hashing it is mandatory, including after a successful fresh upload.
    }
    const remote = await destination.download(path);
    if (remote.length !== doc.size || (await hash(remote)) !== doc.hash)
      throw new Error('Documento diferente no destino. Nenhum arquivo foi sobrescrito.');
  }
  progress('Concluindo registros em uma única transação…');
  const result = await destination.restore(plan.snapshot, false);
  if (!['restored', 'already_restored'].includes(result.status))
    throw new Error('O destino não confirmou a recuperação.');
  return { ...plan.counts, status: result.status };
}
