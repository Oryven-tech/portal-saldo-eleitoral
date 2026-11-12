import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const allowedOrigin = Deno.env.get('PORTAL_ORIGIN');
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': allowedOrigin ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
  if (!allowedOrigin || request.headers.get('origin') !== allowedOrigin)
    return reply(403, { ok: false, message: 'Origem não autorizada.' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { ok: false });
  const deadline = Date.now() + 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  const checkDeadline = () => {
    if (Date.now() >= deadline) throw new Error('Prazo do envio esgotado');
    controller.signal.throwIfAborted();
  };
  const boundedFetch: typeof fetch = (input, init = {}) => {
    checkDeadline();
    return fetch(input, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
    });
  };
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return reply(401, { ok: false });
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth }, fetch: boundedFetch },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return reply(401, { ok: false });
    if (!request.body) return reply(400, { ok: false });
    // Enforce the real body size; Content-Length alone is not trusted.
    const reader = request.body.getReader();
    controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}), {
      once: true,
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      checkDeadline();
      if (done) break;
      size += value.length;
      if (size > 10_100_000) {
        await reader.cancel();
        return reply(413, { ok: false });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Response(body, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
    const files = form.getAll('files');
    if (files.length < 1 || files.length > 3 || files.some((f) => !(f instanceof File)))
      return reply(400, { ok: false });
    const actualFiles = files as File[];
    if (actualFiles.reduce((n, f) => n + f.size, 0) > 10_000_000) return reply(413, { ok: false });
    const metadata = [];
    const buffers: Uint8Array[] = [];
    for (const file of actualFiles) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (
        !file.name.toLowerCase().endsWith('.pdf') ||
        file.name.length > 255 ||
        new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' ||
        !new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF')
      )
        return reply(400, { ok: false });
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      metadata.push({ name: file.name, size: file.size, hash });
      buffers.push(bytes);
    }
    const id = String(form.get('id'));
    if (!/^[a-f0-9-]{36}$/i.test(id)) return reply(400, { ok: false });
    const { data: reserved, error } = await userClient.rpc('reserve_submission', {
      p_id: id,
      p_name: String(form.get('name') ?? ''),
      p_registration: String(form.get('registration') ?? ''),
      p_activity: String(form.get('activity') ?? ''),
      p_days: Number(form.get('days')),
      p_files: metadata,
    });
    if (error || !Array.isArray(reserved) || reserved.length !== metadata.length)
      return reply(400, {
        ok: false,
        message: 'Não foi possível reservar o envio. Confira os dados ou procure a direção.',
      });
    if (
      reserved.every(
        (doc) =>
          doc.status === 'ready' &&
          ['pending', 'approved', 'changes_requested'].includes(doc.submissionStatus),
      )
    )
      return reply(200, { ok: true });
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      global: { fetch: boundedFetch },
      auth: { persistSession: false },
    });
    for (const doc of reserved) {
      checkDeadline();
      const index = metadata.findIndex(
        (f) => f.hash === doc.hash && f.name === doc.name && f.size === doc.size,
      );
      if (index < 0) return reply(409, { ok: false });
      const upload = await service.storage.from('evidence').upload(doc.path, buffers[index], {
        contentType: 'application/pdf',
        upsert: false,
        cacheControl: '0',
      });
      if (upload.error) {
        checkDeadline();
        // A retry may encounter an already uploaded object: verify it instead of overwriting.
        const existing = await service.storage.from('evidence').download(doc.path);
        if (existing.error || !existing.data || existing.data.size !== doc.size)
          throw new Error('Upload incompleto');
        const actualHash = [
          ...new Uint8Array(
            await crypto.subtle.digest('SHA-256', await existing.data.arrayBuffer()),
          ),
        ]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (actualHash !== doc.hash) throw new Error('Documento incompatível');
      }
    }
    checkDeadline();
    const finalized = await service.rpc('finalize_submission', { p_id: id, p_actor: user.id });
    if (finalized.error) throw new Error('Finalização indisponível');
    return reply(200, { ok: true });
  } catch {
    return reply(400, {
      ok: false,
      message:
        'O envio não foi confirmado. Tente novamente com os mesmos documentos ou procure a direção.',
    });
  } finally {
    clearTimeout(timer);
  }
});
