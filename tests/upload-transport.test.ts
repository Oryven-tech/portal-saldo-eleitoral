import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';

it('uses explicit PDF MIME with the Storage SDK byte transport used by the handler', async () => {
  const requests: { mime: string; bytes: string }[] = [];
  const client = createClient('https://fixture.invalid', 'synthetic', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
          const form = await request.formData();
          const file = [...form.values()].find((value) => value instanceof Blob) as File;
          requests.push({ mime: file.type, bytes: await file.text() });
        } else
          requests.push({
            mime: request.headers.get('content-type')!,
            bytes: await request.text(),
          });
        return Response.json({ Key: 'evidence/fixture.pdf' });
      },
    },
  });
  const untyped = new File(['%PDF-1.7\nA\n%%EOF'], 'a.pdf');
  await client.storage
    .from('evidence')
    .upload('untyped.pdf', untyped, { contentType: 'application/pdf' });
  await client.storage
    .from('evidence')
    .upload('bytes.pdf', await untyped.arrayBuffer(), { contentType: 'application/pdf' });
  expect(requests[0].mime).toBe('application/octet-stream');
  expect(requests[1]).toEqual({ mime: 'application/pdf', bytes: '%PDF-1.7\nA\n%%EOF' });
});
