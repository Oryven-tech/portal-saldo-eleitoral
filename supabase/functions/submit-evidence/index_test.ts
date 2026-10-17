// These boundary tests run the actual handler with Auth/REST responses stubbed.
// Hosted Google sessions, RLS and Storage still require separate acceptance tests.
type Handler = (request: Request) => Response | Promise<Response>;
let handler: Handler;
const originalServe = Deno.serve;
const originalFetch = globalThis.fetch;
Deno.env.set('PORTAL_ORIGIN', 'http://127.0.0.1:5173');
Deno.env.set('SUPABASE_URL', 'https://portal-test.invalid');
Deno.env.set('SUPABASE_ANON_KEY', 'synthetic-public-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-server-key');
// Capture the production entry point without opening a socket.
Deno.serve = ((callback: Handler) => {
  handler = callback;
  return {};
}) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = originalServe;

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
const origin = 'http://127.0.0.1:5173';

Deno.test('unauthenticated requests cannot read the body or reach privileged APIs', async () => {
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    calls.push(String(input));
    return Promise.resolve(Response.json({ message: 'invalid token' }, { status: 401 }));
  }) as typeof fetch;
  try {
    const missing = new Request('https://portal-test.invalid/upload', {
      method: 'POST',
      headers: { origin },
      body: 'synthetic payload',
    });
    equal((await handler(missing)).status, 401);
    equal(missing.bodyUsed, false);
    equal(calls, []);
    const invalid = new Request('https://portal-test.invalid/upload', {
      method: 'POST',
      headers: { origin, authorization: 'Bearer invalid-token' },
      body: 'synthetic payload',
    });
    equal((await handler(invalid)).status, 401);
    equal(invalid.bodyUsed, false);
    equal(calls.length, 1);
    equal(calls[0], 'https://portal-test.invalid/auth/v1/user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('a valid identity without a staff reservation cannot use Storage', async () => {
  const paths: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path === '/auth/v1/user')
      return Promise.resolve(
        Response.json({
          id: '10000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'google' },
          user_metadata: {},
          created_at: '2026-10-16T00:00:00Z',
        }),
      );
    if (path === '/rest/v1/rpc/reserve_submission')
      return Promise.resolve(
        Response.json(
          {
            message: 'Acesso de servidor necessário.',
            code: '42501',
          },
          { status: 403 },
        ),
      );
    throw new Error(`Unexpected privileged call: ${path}`);
  }) as typeof fetch;
  try {
    const form = new FormData();
    form.append('id', '10000000-0000-4000-8000-000000000002');
    form.append('name', 'Synthetic Test');
    form.append('activity', 'Synthetic activity');
    form.append('days', '2');
    form.append(
      'files',
      new File(['%PDF-1.7\n%%EOF'], 'synthetic.pdf', { type: 'application/pdf' }),
    );
    const request = new Request('https://portal-test.invalid/upload', {
      method: 'POST',
      headers: { origin, authorization: 'Bearer synthetic-user-token' },
      body: form,
    });
    equal((await handler(request)).status, 400);
    equal(paths, ['/auth/v1/user', '/rest/v1/rpc/reserve_submission']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test(
  'cross-origin requests are rejected and preflight does not bypass POST authentication',
  async () => {
    equal(
      (
        await handler(
          new Request('https://portal-test.invalid/upload', {
            method: 'POST',
            headers: { origin: 'https://other.invalid' },
          }),
        )
      ).status,
      403,
    );
    equal(
      (
        await handler(
          new Request('https://portal-test.invalid/upload', {
            method: 'OPTIONS',
            headers: { origin },
          }),
        )
      ).status,
      204,
    );
    equal(
      (
        await handler(
          new Request('https://portal-test.invalid/upload', {
            method: 'POST',
            headers: { origin },
          }),
        )
      ).status,
      401,
    );
  },
);
