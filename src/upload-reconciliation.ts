import { z } from 'zod';
import { recordIdSchema } from './domain.ts';

const documentSchema = z.object({
  id: recordIdSchema,
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(300),
  size: z.number().int().min(1).max(10_000_000),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pending', 'ready', 'failed']),
});
export const uploadPlanSchema = z.object({
  id: recordIdSchema,
  staffId: recordIdSchema,
  status: z.enum(['draft', 'pending', 'approved', 'changes_requested']),
  createdAt: z.iso.datetime({ offset: true }),
  actorId: recordIdSchema.nullable(),
  documents: z.array(documentSchema).max(3),
  cleanup: z
    .object({
      documents: z.array(documentSchema).min(1).max(3),
      requestedAt: z.iso.datetime({ offset: true }),
      notBefore: z.iso.datetime({ offset: true }),
      completedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .nullable(),
});
export type UploadPlan = z.infer<typeof uploadPlanSchema>;
export interface UploadMaintenanceDestination {
  download(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  finalize(id: string, actorId: string): Promise<void>;
  authorizeCleanup(id: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  finishCleanup(id: string): Promise<void>;
}
async function verify(bytes: Uint8Array<ArrayBuffer>, doc: UploadPlan['documents'][number]) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (bytes.length !== doc.size || hash !== doc.hash)
    throw new Error('Arquivo diferente do manifesto. Operação interrompida.');
}
function checkPaths(plan: UploadPlan, documents: UploadPlan['documents']) {
  if (new Set(documents.map((doc) => doc.id)).size !== documents.length)
    throw new Error('Documento repetido. Operação interrompida.');
  for (const doc of documents) {
    if (doc.path !== `${plan.staffId}/${plan.id}/${doc.id}.pdf`)
      throw new Error('Caminho fora do envio original. Operação interrompida.');
  }
}
export async function reconcileUpload(input: unknown, destination: UploadMaintenanceDestination) {
  const plan = uploadPlanSchema.parse(input);
  if (plan.status !== 'draft' || plan.cleanup || !plan.actorId || !plan.documents.length)
    throw new Error('Finalização exige rascunho original e identidade ativa do servidor.');
  checkPaths(plan, plan.documents);
  for (const doc of plan.documents) {
    if (doc.status !== 'pending') throw new Error('Documento fora do estado de upload.');
    const bytes = await destination.download(doc.path);
    if (!bytes)
      throw new Error('Upload incompleto. Retome com os PDFs originais ou descarte o rascunho.');
    await verify(bytes, doc);
  }
  await destination.finalize(plan.id, plan.actorId);
  return { status: 'finalized', documents: plan.documents.length };
}
export async function purgeUpload(
  input: unknown,
  destination: UploadMaintenanceDestination,
  now: number = Date.now(),
) {
  const plan = uploadPlanSchema.parse(input);
  if (!plan.cleanup) throw new Error('Descarte não autorizado.');
  if (plan.cleanup.completedAt) return { status: 'already_cleaned', documents: 0 };
  if (plan.status !== 'changes_requested' || Date.parse(plan.cleanup.notBefore) > now)
    throw new Error('Limpeza exige descarte registrado e prazo de 24 horas encerrado.');
  checkPaths(plan, plan.cleanup.documents);
  if (
    plan.documents.length !== plan.cleanup.documents.length ||
    plan.documents.some((doc) => {
      const original = plan.cleanup!.documents.find((item) => item.id === doc.id);
      return (
        doc.status !== 'failed' ||
        !original ||
        original.path !== doc.path ||
        original.hash !== doc.hash ||
        original.size !== doc.size
      );
    })
  )
    throw new Error('Metadados mudaram após o descarte. Limpeza recusada.');
  // Server time is authoritative even if the operator's computer clock is wrong.
  await destination.authorizeCleanup(plan.id);
  // Verify the entire set before any irreversible removal. Missing objects are
  // accepted only for an interrupted prior cleanup of the same quarantine.
  for (const doc of plan.cleanup.documents) {
    const bytes = await destination.download(doc.path);
    if (bytes) await verify(bytes, doc);
  }
  await destination.remove(plan.cleanup.documents.map((doc) => doc.path));
  // The database checks that no objects remain before releasing reserved quota.
  await destination.finishCleanup(plan.id);
  return { status: 'cleaned', documents: plan.cleanup.documents.length };
}
