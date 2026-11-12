import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

// This deployment is deliberately independent from every Supabase project.
// Ignore .env.local too: public keys must not accidentally reconnect the demo.
await build({
  mode: 'demo',
  envDir: false,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
    'import.meta.env.VITE_ENABLE_DEMO': JSON.stringify('true'),
    'import.meta.env.VITE_DEMO_ONLY': JSON.stringify('true'),
  },
  build: { outDir: '.artifacts/demo-dist', emptyOutDir: true },
});
const path = '.artifacts/demo-dist/_headers';
const headers = await readFile(path, 'utf8');
await writeFile(path, headers.replace(/connect-src[^;]+;/, "connect-src 'self';"));
const html = await readFile('.artifacts/demo-dist/index.html', 'utf8');
const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
const bundle = await readFile('.artifacts/demo-dist' + asset, 'utf8');
if (/axdooojqsfmjkwzugdxw|fjhvkxxvkarilenfjzsy|sb_publishable_[A-Za-z0-9_-]+/.test(bundle))
  throw new Error('Build de demonstração contém referência de projeto real. Não publicar.');
process.stdout.write('Demonstração isolada criada: sem Supabase, sem chave e CSP somente self.\n');
