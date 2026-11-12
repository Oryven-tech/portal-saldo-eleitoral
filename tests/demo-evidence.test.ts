import { expect, it } from 'vitest';
import { createDemoRepository } from '../src/demo';

it('cada envio fictício pendente possui PDF de três páginas com bytes íntegros', async () => {
  const repo = createDemoRepository('director');
  const data = await repo.load();
  for (const submission of data.submissions) {
    const docs = data.documents.filter((doc) => doc.submissionId === submission.id);
    expect(docs).toHaveLength(1);
    const doc = docs[0];
    const blob = await repo.download(doc);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(doc.size);
    const bytes = await blob.arrayBuffer();
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    expect(hash).toBe(doc.hash);
    const pdf = new TextDecoder().decode(bytes);
    expect(pdf).toMatch(/^%PDF-/);
    expect(pdf).toContain('/Count 3');
    expect(doc.name).toContain('EXEMPLO-FICTICIO');
  }
});

it('servidor de demonstração só lista e baixa os próprios comprovantes', async () => {
  const director = await createDemoRepository('director').load();
  const repo = createDemoRepository('staff');
  const staff = await repo.load();
  expect(staff.documents).toHaveLength(1);
  expect(staff.documents[0].staffId).toBe(staff.user.staffId);
  await expect(repo.download(staff.documents[0])).resolves.toBeInstanceOf(Blob);
  const other = director.documents.find((doc) => doc.staffId !== staff.user.staffId)!;
  await expect(repo.download(other)).rejects.toThrow('Documento não disponível');
});
