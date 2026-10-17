import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

async function director(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Direção' }).click();
  await page.getByRole('button', { name: 'Testar acesso de direção' }).click();
  await expect(page.getByRole('heading', { name: 'Servidores' })).toBeVisible();
}
async function navigate(page: import('@playwright/test').Page, name: string) {
  const mobile = page.viewportSize()!.width < 601;
  const labels: Record<string, string> = {
    Documentos: 'Comprovantes',
  };
  await page
    .getByRole('navigation', { name: mobile ? 'Navegação no celular' : 'Navegação principal' })
    .getByRole('button', { name: labels[name] ?? name, exact: true })
    .click();
}
test('entrada responsiva, demonstração identificada e sem erro de acessibilidade', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Portal Saldo Eleitoral');
  await expect(
    page.getByText('Escola Estadual Edson Alves Pereira', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await mkdir('.artifacts', { recursive: true });
  await page.screenshot({ path: `.artifacts/entrada-${info.project.name}.png`, fullPage: true });
});
test('recusa OAuth aparece na entrada e não expõe texto externo', async ({ page }) => {
  await page.goto('/?error=access_denied&error_description=texto-externo#error=access_denied');
  await expect(page.getByRole('alert')).toHaveText('Acesso não autorizado. Procure a direção.');
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('error')).toBe(false);
  await expect(page.getByText('texto-externo', { exact: true })).toHaveCount(0);

  await page.goto('/#error=server_error&error_description=texto-externo');
  // An external OAuth callback loads a new document; hash navigation alone does not.
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    'Não foi possível concluir o acesso Google. Tente entrar novamente.',
  );
  expect(new URL(page.url()).hash).toBe('');
});

test('direção pesquisa, agenda e encontra a reserva', async ({ page }, info) => {
  await director(page);
  await page.screenshot({ path: `.artifacts/painel-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await navigate(page, 'Servidores');
  await page.getByRole('textbox', { name: 'Buscar servidor por nome ou matrícula' }).fill('Ana');
  await expect(
    page.getByRole('button', { name: 'Ver ficha de Ana Oliveira', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Registrar folga', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Servidor', { exact: true }).selectOption({ label: 'Ana Oliveira' });
  await dialog.getByLabel('Data da folga').fill('2026-11-12');
  await dialog.getByRole('button', { name: 'Adicionar' }).click();
  await dialog.getByRole('button', { name: 'Reservar 1 dia', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, 'Folgas');
  await expect(page.getByText('12 de nov. de 2026')).toBeVisible();
});
test('servidor envia PDF e não recebe crédito antes da análise', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Testar acesso de servidor' }).click();
  await expect(page.getByRole('heading', { name: 'Meu saldo' })).toBeVisible();
  const available = page
    .locator('.stat-card')
    .filter({ hasText: 'Disponíveis' })
    .locator('strong')
    .first();
  const before = await available.innerText();
  await page.getByRole('button', { name: 'Enviar comprovante' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Atividade comprovada').selectOption('Treinamento · 2026');
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'teste.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'),
  });
  await dialog.getByLabel('Conferi os dados e anexei os documentos correspondentes.').check();
  await dialog.getByRole('button', { name: 'Enviar para análise' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(available).toHaveText(before);
  await navigate(page, 'Documentos');
  await expect(page.getByText('teste.pdf')).toBeVisible();
});
test('backup protegido é gerado e validado sem alterar o portal', async ({ page }) => {
  test.setTimeout(60000);
  await director(page);
  await navigate(page, 'Backup');
  await page.getByRole('button', { name: 'Gerar backup protegido' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Frase de recuperação', { exact: true })
    .fill('Uma frase longa para este teste');
  await dialog.getByLabel('Repita a frase').fill('Uma frase longa para este teste');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Gerar e baixar' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Verificar backup', exact: true }).click();
  const verify = page.getByRole('dialog');
  await verify.getByLabel('Todas as partes do backup').setInputFiles(path!);
  await verify
    .getByLabel('Frase de recuperação', { exact: true })
    .fill('Uma frase longa para este teste');
  await verify.getByRole('button', { name: 'Verificar arquivos' }).click();
  await expect(verify.getByRole('heading', { name: 'Backup íntegro' })).toBeVisible();
});
test('direção corrige crédito preservando compromissos e edita uma data', async ({ page }) => {
  await director(page);
  await navigate(page, 'Servidores');
  await page.getByRole('button', { name: 'Ver ficha de Ana Oliveira', exact: true }).click();
  const profile = page.getByRole('dialog');
  await profile.getByRole('button', { name: 'Ajustar créditos' }).click();
  await profile.getByLabel('Ajuste de dias').fill('-6');
  await profile
    .getByLabel('Justificativa', { exact: true })
    .fill('Correção após conferência documental');
  await profile.getByRole('button', { name: 'Registrar ajuste' }).click();
  await expect(profile.getByRole('alert')).toContainText('comprometeria');
  await profile.getByLabel('Ajuste de dias').fill('-1');
  await profile.getByRole('button', { name: 'Registrar ajuste' }).click();
  await expect(profile.getByText('Correção após conferência documental')).toBeVisible();
  await profile.getByRole('button', { name: 'Fechar janela' }).click();
  await navigate(page, 'Folgas');
  const booking = page.locator('.booking-card').filter({ hasText: 'Ana Oliveira' });
  await booking.getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = page.getByRole('dialog');
  await edit.getByRole('button', { name: /Remover/ }).click();
  await edit.getByLabel('Data da folga', { exact: true }).fill('2026-11-18');
  await edit.getByRole('button', { name: 'Adicionar' }).click();
  await edit.getByRole('button', { name: 'Reservar 1 dia', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(booking.getByText('18 de nov. de 2026')).toBeVisible();
});
test('acessos autorizados funcionam no menu de celular e desktop', async ({ page }) => {
  await director(page);
  await page.getByRole('button', { name: 'Gerenciar acessos', exact: true }).click();
  await page.getByRole('button', { name: 'Autorizar servidor' }).click();
  const modal = page.getByRole('dialog', { name: 'Autorizar servidor', exact: true });
  await modal.getByLabel('Nome do servidor').fill('Servidor de teste');
  await modal.getByLabel('E-mail da conta Google').fill('teste@example.com');
  await modal.getByRole('button', { name: 'Autorizar acesso', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByText('teste@example.com')).toBeVisible();
});

test('direção usa três seções e analisa comprovante dentro da ficha', async ({ page }) => {
  await director(page);
  const mobile = page.viewportSize()!.width < 601;
  const nav = page.getByRole('navigation', {
    name: mobile ? 'Navegação no celular' : 'Navegação principal',
  });
  await expect(nav.getByRole('button')).toHaveText(['Servidores', 'Folgas', 'Backup']);
  await expect(
    page.getByText(
      /organizar hoje|clareza para todos|ajuda e orientações|cuidado em cada registro/i,
    ),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Comprovantes pendentes/ }).click();
  await page.getByRole('button', { name: 'Ver ficha de Ana Oliveira', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Analisar comprovantes' }).click();
  const review = page.getByRole('dialog', { name: 'Analisar comprovantes', exact: true });
  await review.getByLabel('Justificativa da decisão').fill('Conferência de dados fictícios');
  await review.getByLabel('Conferi os documentos e a quantidade de dias.').check();
  await review.getByRole('button', { name: 'Aprovar crédito' }).click();
  await expect(review).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Comprovantes pendentes/ })).toHaveText(
    'Comprovantes pendentes (2)',
  );
});
