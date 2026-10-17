import { build } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Build separately and add only on explicit invocation, never via npm run build.
const output = resolve('.artifacts/isolation-site');
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: true,
    rolldownOptions: { input: resolve('scripts/isolation/index.html') },
  },
});
await mkdir('dist/assets', { recursive: true });
await cp(resolve(output, 'assets'), resolve('dist/assets'), { recursive: true });
await cp(resolve(output, 'scripts/isolation/index.html'), resolve('dist/verificacao-acesso.html'));
process.stdout.write(
  'Artefato temporário adicionado: dist/verificacao-acesso.html. Refaça o build normal após o ensaio.\n',
);
