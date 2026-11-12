import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Default: deliberately unconfigured build. --configured checks a connected build.
const configured = process.argv.includes('--configured');
const demo = process.argv.includes('--demo');
const root = resolve(demo ? '.artifacts/demo-dist' : 'dist');
const headerText = await readFile(resolve(root, '_headers'), 'utf8');
const headers = Object.fromEntries(
  headerText
    .split('/assets/*')[0]
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const index = line.indexOf(':');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(target);
    response.writeHead(200, {
      ...headers,
      'Content-Type': types[extname(target)] ?? 'application/octet-stream',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  });
  const page = await browser.newPage();
  const errors = [];
  const external = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
  if (demo) assert.equal(await page.getByRole('button', { name: 'Entrar com Google' }).count(), 0);
  else
    assert.equal(
      await page.getByRole('button', { name: 'Entrar com Google' }).isDisabled(),
      !configured,
    );
  assert.equal(await page.getByRole('button', { name: /Testar acesso de/ }).count(), 0);
  assert.deepEqual(errors, []);
  assert.equal(await page.title(), 'Portal Saldo Eleitoral');
  assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), '/favicon.svg');
  if (demo) {
    await page.getByRole('button', { name: 'Direção', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir demonstração', exact: true }).click();
    await page.getByRole('heading', { name: 'Servidores', exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('heading', { name: 'Demonstração', exact: true }).count(), 1);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    process.stdout.write(
      'PASS: demonstração opera com dados locais, reinicia ao recarregar e não acessa serviços externos.\n',
    );
  }
  process.stdout.write(
    `PASS: build ${demo ? 'de demonstração isolada' : configured ? 'configurado sem demonstração' : 'sem configuração'} carrega com login e CSP conforme o destino.\n`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
