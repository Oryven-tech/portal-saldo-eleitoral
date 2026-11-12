# Como contribuir

## Ambiente local

Use Node.js 24, indicado em [.nvmrc](../.nvmrc), e execute os comandos na raiz do repositório:

```sh
npm ci
npm run dev
```

A demonstração local usa dados fictícios em memória. A configuração de Supabase e Google está no [guia técnico](../docs/operations/technical-guide.md). `.env.local`, dependências, builds e relatórios são ignorados pelo Git.

## Organização

- `src/` contém a interface, as regras de saldo e os adaptadores de dados.
- Os arquivos em `tests/` cobrem regras, configuração, backup, SQL, RLS e recuperação com PGlite.
- `tests/e2e/` cobre os fluxos desktop e celular com Playwright.
- `supabase/functions/` contém a função de upload e seus testes Deno.
- `scripts/` agrupa ferramentas de recuperação, isolamento e verificação de build.
- `docs/` reúne operação, planejamento e evidências; comece pelo [índice](../docs/README.md).

Mantenha migrações SQL versionadas em `supabase/migrations/`. Arquivos de configuração de Vite, TypeScript, Vitest e Playwright permanecem na raiz para serem encontrados pelas ferramentas.

## Verificações

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Para usar um Microsoft Edge já instalado, defina `PLAYWRIGHT_CHANNEL=msedge`. No Linux, `npx playwright install --with-deps chromium` também instala as bibliotecas necessárias ao navegador.

Com Deno 2.9.7 disponível no `PATH`, execute `npm run test:edge` para verificar a fronteira de autenticação e autorização do upload.

`npm run test:production` verifica o build sem integração real. Execute com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` vazias e `VITE_ENABLE_DEMO=false`, para que essas variáveis tenham prioridade sobre um eventual `.env.local`.

Os testes de navegador iniciam o servidor local com Supabase desabilitado. PGlite e as respostas simuladas da função de upload não substituem a homologação do serviço hospedado.

## Scripts operacionais

Use `npm run recovery -- inspect <pasta>` para validar uma cópia protegida. A restauração segue o [procedimento de recuperação](../docs/operations/recovery.md).

O comando `npm run build:isolation-check` gera um artefato técnico para ensaios com contas sintéticas. Esse comando é uma operação separada do build normal. Os detalhes e os limites do ensaio estão nas [evidências](../docs/validation/evidence.md).

## Pull requests

Descreva o problema resolvido, o comportamento resultante e as verificações realizadas. Atualize os guias quando uma mudança alterar comandos, configuração ou procedimentos operacionais.

O [CI](workflows/ci.yml) executa três verificações em cada push e pull request. Confira os resultados e os artefatos Playwright antes da revisão.
