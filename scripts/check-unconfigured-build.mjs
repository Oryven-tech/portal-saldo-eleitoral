import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Default: deliberately unconfigured build. --configured checks a connected build.
const configured = process.argv.includes('--configured');
const root = resolve('dist');
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
  browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
  assert.equal(
    await page.getByRole('button', { name: 'Continuar com Google' }).isDisabled(),
    !configured,
  );
  assert.equal(await page.getByRole('button', { name: /Testar acesso de/ }).count(), 0);
  assert.deepEqual(errors, []);
  assert.equal(await page.title(), 'Portal Saldo Eleitoral');
  assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), '/favicon.svg');
  process.stdout.write(
    `PASS: build ${configured ? 'configurado habilita' : 'sem configuração bloqueia'} login, oculta demonstração e carrega com CSP sem erros.\n`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
