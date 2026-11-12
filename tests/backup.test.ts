import { expect, it } from 'vitest';
import { createDemoRepository } from '../src/demo';
import { backupGroups, decryptPart, encryptPart, exportBackup, verifyBackup } from '../src/backup';
import type { Document } from '../src/domain';

const password = 'minha frase longa para recuperação';
it('protege o conteúdo e detecta senha errada e adulteração', async () => {
  const bytes = new TextEncoder().encode('dados confidenciais');
  const encrypted = await encryptPart(bytes, password);
  expect(new TextDecoder().decode(encrypted)).not.toContain('dados confidenciais');
  expect(await decryptPart(encrypted, password)).toEqual(bytes);
  await expect(decryptPart(encrypted, 'outra frase de recuperação')).rejects.toThrow(
    'Frase incorreta',
  );
  encrypted[encrypted.length - 1] ^= 1;
  await expect(decryptPart(encrypted, password)).rejects.toThrow('corrompido');
});
it('exporta e valida dados e um PDF, sem aplicar nada ao repositório', async () => {
  const repo = createDemoRepository('staff');
  const id = crypto.randomUUID();
  await repo.submit({
    id,
    name: 'Ana Oliveira',
    registration: '2026-101',
    activity: 'Treinamento adicional',
    days: 2,
    files: [new File(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'], 'comprovante.pdf')],
  });
  // A director repository is separate in demo: use the staff snapshot as a fixture only.
  const data = await repo.load();
  const snapshotId = crypto.randomUUID();
  const fixture = {
    ...repo,
    snapshot: async () => ({ id: snapshotId, createdAt: new Date().toISOString(), data }),
  };
  const files: File[] = [];
  await exportBackup(
    fixture,
    password,
    () => {},
    (blob, name) => files.push(new File([blob], name)),
  );
  const result = await verifyBackup(files, password);
  expect(result.documents).toBe(2);
  expect(result.staff).toBe(1);
  expect(result.snapshotId).toBe(snapshotId);
  expect((await repo.load()).documents).toEqual(data.documents);
  await expect(verifyBackup([files[0], files[0]], password)).rejects.toThrow('parte repetida');
});
it('aceita timestamps PostgreSQL com offset e recusa vínculos incoerentes', async () => {
  const repo = createDemoRepository('director');
  const data = await repo.load();
  const fixture = {
    ...repo,
    snapshot: async () => ({
      id: crypto.randomUUID(),
      createdAt: '2026-10-16T12:00:00+00:00',
      data,
    }),
  };
  const files: File[] = [];
  await exportBackup(
    fixture,
    password,
    () => {},
    (blob, name) => files.push(new File([blob], name)),
  );
  expect((await verifyBackup(files, password)).staff).toBe(8);
  data.credits[0].staffId = crypto.randomUUID();
  const corrupted: File[] = [];
  await expect(exportBackup(fixture,password,()=>{},(blob,name)=>corrupted.push(new File([blob],name)))).rejects.toThrow('Vínculo de servidor ausente');
  expect(corrupted).toHaveLength(0);
});
it('histórico grande ganha parte própria antes de dois PDFs de 10 MB, sem carregar os bytes', () => {
  const a = { size: 10_000_000 } as Document;
  const b = { size: 10_000_000 } as Document;
  expect(backupGroups([a,b],13_000_000)).toEqual([[],[a,b]]);
  expect(backupGroups([a,b],1000)).toEqual([[a],[b]]);
  expect(backupGroups([],1000)).toEqual([[]]);
});
it('frase acima do limite é recusada antes de consultar o banco', async () => {
  await expect(exportBackup({snapshot:async()=>{throw new Error('Não deve consultar');}} as never,'x'.repeat(257),()=>{})).rejects.toThrow('16 a 256');
});
