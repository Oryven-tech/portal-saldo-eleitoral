import { expect, it } from 'vitest';
import { createDemoRepository } from '../src/demo';
import { decryptPart, encryptPart, exportBackup, verifyBackup } from '../src/backup';

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
  expect(result.documents).toBe(1);
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
  await exportBackup(
    fixture,
    password,
    () => {},
    (blob, name) => corrupted.push(new File([blob], name)),
  );
  await expect(verifyBackup(corrupted, password)).rejects.toThrow('Vínculo de servidor ausente');
});
