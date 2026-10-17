import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import type { Repository, Snapshot } from './repository';
import type { Document } from './domain';
import { backupDataSchema } from './domain';

const MAGIC = new TextEncoder().encode('PSEBKP01');
const ITERATIONS = 600_000;
const PART_BYTES = 20_000_000;
const MAX_PART_BYTES = 32_000_000;
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
const manifestSchema = z.object({
  format: z.literal('portal-saldo-eleitoral'),
  version: z.literal(1),
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  part: z.number().int().min(1).max(100),
  parts: z.number().int().min(1).max(100),
  schoolName: z.string().max(200),
  documents: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().max(255),
        size: z.number().int().min(1).max(10_000_000),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(3000),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
});
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (password.length < 16 || password.length > 256)
    throw new Error('Use uma frase de recuperação com 16 a 256 caracteres.');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptPart(bytes: Uint8Array<ArrayBuffer>, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(36);
  header.set(MAGIC);
  header.set(salt, 8);
  header.set(iv, 24);
  const key = await derive(password, salt);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, bytes),
  );
  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header);
  result.set(encrypted, 36);
  return result;
}
export async function decryptPart(bytes: Uint8Array<ArrayBuffer>, password: string) {
  if (bytes.length < 52 || bytes.length > MAX_PART_BYTES || !MAGIC.every((b, i) => bytes[i] === b))
    throw new Error('Arquivo de backup inválido ou acima do limite.');
  try {
    const key = await derive(password, bytes.slice(8, 24));
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(24, 36), additionalData: bytes.slice(0, 36) },
        key,
        bytes.slice(36),
      ),
    );
  } catch {
    throw new Error('Frase incorreta ou arquivo corrompido. Nenhum dado foi alterado.');
  }
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function groups(documents: Document[]) {
  const chunks: Document[][] = [[]];
  let size = 0;
  for (const doc of documents) {
    if (size + doc.size > PART_BYTES && chunks[chunks.length - 1].length) {
      chunks.push([]);
      size = 0;
    }
    chunks[chunks.length - 1].push(doc);
    size += doc.size;
  }
  return chunks;
}
export async function exportBackup(
  repo: Repository,
  password: string,
  progress: (message: string) => void,
  deliver = saveBlob,
) {
  if (password.length < 16)
    throw new Error('Use uma frase de recuperação com pelo menos 16 caracteres.');
  progress('Criando referência consistente dos dados…');
  const snapshot = await repo.snapshot();
  const chunks = groups(snapshot.data.documents);
  const data = new Uint8Array(strToU8(JSON.stringify(snapshot)));
  const dataHash = await digest(data);
  for (let i = 0; i < chunks.length; i++) {
    const entries: Record<string, Uint8Array<ArrayBuffer>> = {};
    if (i === 0) entries['dados.json'] = data;
    for (let j = 0; j < chunks[i].length; j++) {
      const doc = chunks[i][j];
      progress(`Parte ${i + 1}/${chunks.length} · documento ${j + 1}/${chunks[i].length}`);
      const bytes = new Uint8Array(await (await repo.download(doc)).arrayBuffer());
      if (bytes.length !== doc.size || (await digest(bytes)) !== doc.hash)
        throw new Error(
          `O documento ${doc.name} não passou na conferência. O backup está incompleto.`,
        );
      entries[`documentos/${doc.id}.pdf`] = bytes;
    }
    const manifest = {
      format: 'portal-saldo-eleitoral',
      version: 1,
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      part: i + 1,
      parts: chunks.length,
      schoolName: snapshot.data.schoolName,
      documents: chunks[i].map(({ id, name, size, hash }) => ({ id, name, size, hash })),
      dataHash,
    };
    entries['manifesto.json'] = new Uint8Array(strToU8(JSON.stringify(manifest)));
    const bytes = new Uint8Array(zipSync(entries, { level: 0 }));
    if (bytes.length > MAX_PART_BYTES - 52)
      throw new Error(
        'Esta parte excede o limite de memória suportado. Procure o responsável técnico.',
      );
    progress(`Protegendo parte ${i + 1}/${chunks.length}…`);
    const encrypted = await encryptPart(bytes, password);
    deliver(
      new Blob([encrypted], { type: 'application/octet-stream' }),
      `saldo-eleitoral-${snapshot.createdAt.slice(0, 10)}-${snapshot.id.slice(0, 8)}-parte-${i + 1}-de-${chunks.length}.psebackup`,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { parts: chunks.length, id: snapshot.id };
}
export interface BackupSummary {
  schoolName: string;
  createdAt: string;
  staff: number;
  documents: number;
  parts: number;
  snapshotId: string;
}
export async function verifyBackup(files: File[], password: string): Promise<BackupSummary> {
  if (!files.length || files.length > 100)
    throw new Error('Selecione todas as partes do mesmo backup, até 100 arquivos.');
  let expected: z.infer<typeof manifestSchema> | null = null;
  let snapshot: Snapshot | null = null;
  const parts = new Set<number>();
  const docs = new Map<string, { hash: string; size: number }>();
  let totalBytes = 0;
  for (const file of files) {
    if (file.size > MAX_PART_BYTES) throw new Error('Parte acima do limite de 32 MB.');
    const plain = await decryptPart(new Uint8Array(await file.arrayBuffer()), password);
    // The export uses STORE only. Reject compressed entries before allocation to avoid zip bombs.
    let extracted = 0;
    const seen = new Set<string>();
    const entries = unzipSync(plain, {
      filter: (entry) => {
        extracted += entry.originalSize;
        if (
          entry.compression !== 0 ||
          extracted > MAX_PART_BYTES ||
          seen.size > 3002 ||
          seen.has(entry.name) ||
          !/^(dados\.json|manifesto\.json|documentos\/[a-f0-9-]{36}\.pdf)$/.test(entry.name)
        )
          throw new Error('Conteúdo do pacote não permitido.');
        seen.add(entry.name);
        return true;
      },
    });
    if (!entries['manifesto.json']) throw new Error('Manifesto ausente.');
    const manifest = manifestSchema.parse(JSON.parse(strFromU8(entries['manifesto.json'])));
    if (parts.has(manifest.part)) throw new Error('Há uma parte repetida.');
    parts.add(manifest.part);
    if (
      expected &&
      (expected.id !== manifest.id ||
        expected.parts !== manifest.parts ||
        expected.dataHash !== manifest.dataHash ||
        expected.schoolName !== manifest.schoolName ||
        expected.createdAt !== manifest.createdAt)
    )
      throw new Error('Os arquivos pertencem a backups diferentes.');
    expected ??= manifest;
    const allowed = new Set([
      'manifesto.json',
      ...(manifest.part === 1 ? ['dados.json'] : []),
      ...manifest.documents.map((d) => `documentos/${d.id}.pdf`),
    ]);
    if (Object.keys(entries).some((name) => !allowed.has(name)))
      throw new Error('O pacote contém arquivos inesperados.');
    if (entries['dados.json']) {
      if ((await digest(new Uint8Array(entries['dados.json']))) !== manifest.dataHash)
        throw new Error('Dados com integridade inválida.');
      snapshot = JSON.parse(strFromU8(entries['dados.json'])) as Snapshot;
    }
    for (const doc of manifest.documents) {
      const bytes = entries[`documentos/${doc.id}.pdf`];
      if (
        !bytes ||
        docs.has(doc.id) ||
        bytes.length !== doc.size ||
        (await digest(new Uint8Array(bytes))) !== doc.hash
      )
        throw new Error('Documento ausente, duplicado ou corrompido.');
      totalBytes += bytes.length;
      if (totalBytes > 700_000_000) throw new Error('Backup excede o orçamento suportado.');
      docs.set(doc.id, { hash: doc.hash, size: doc.size });
    }
  }
  if (
    !expected ||
    parts.size !== expected.parts ||
    [...parts].some((n) => n > expected.parts) ||
    !snapshot ||
    snapshot.id !== expected.id
  )
    throw new Error('Backup incompleto: faltam partes ou dados.');
  const data = backupDataSchema.parse(snapshot.data);
  if (
    !Array.isArray(data?.staff) ||
    !Array.isArray(data?.documents) ||
    !Array.isArray(data?.credits) ||
    !Array.isArray(data?.bookings) ||
    data.schoolName !== expected.schoolName
  )
    throw new Error('Estrutura de dados incompatível.');
  if (
    data.documents.length !== docs.size ||
    data.documents.some((d) => docs.get(d.id)?.hash !== d.hash || docs.get(d.id)?.size !== d.size)
  )
    throw new Error('Associações de documentos inconsistentes.');
  return {
    schoolName: expected.schoolName,
    createdAt: expected.createdAt,
    staff: data.staff.length,
    documents: docs.size,
    parts: parts.size,
    snapshotId: expected.id,
  };
}
