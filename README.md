# Portal Saldo Eleitoral

Portal para acompanhar créditos eleitorais, comprovantes e folgas de servidores. A direção analisa comprovantes e administra os registros; cada servidor consulta seus próprios dados. A aplicação usa React, TypeScript, Vite, Supabase e autenticação Google.

A demonstração funciona com dados fictícios, em memória, sem conexão com a escola. Não envie informações reais para a demonstração.

## Executar localmente

Requisitos: Node.js 24 e npm.

```sh
npm ci
npm run dev
```

Abra o endereço informado no terminal. Para criar uma demonstração isolada, execute `npm run build:demo`; os arquivos são gerados em `.artifacts/demo-dist`.

## Verificação

| Comando | Finalidade |
| --- | --- |
| `npm run build` | Verificar tipos e gerar a aplicação |
| `npm test` | Executar testes de regras, banco e segurança |
| `npm run test:e2e` | Testar os fluxos em computador e celular |
| `npm run test:edge` | Testar a função de upload com Deno |
| `npm run test:production` | Verificar o build sem configuração real |

Para os testes de navegador no Linux, instale o Chromium com `npx playwright install --with-deps chromium`. No Windows, o padrão é Microsoft Edge. Defina `PLAYWRIGHT_CHANNEL` para selecionar outro canal instalado.

## Estrutura e operação

- `src/`: interface e regras do portal.
- `supabase/`: migrações e função de upload.
- `scripts/`: ferramentas de verificação, upload e recuperação.
- `tests/`: testes automatizados.
- `.github/workflows/`: integração contínua.
- `docs/`: documentação da versão anterior, mantida como histórico; confira os caminhos no código atual antes de executar comandos descritos nela.

A configuração de um ambiente real exige projeto Supabase próprio, autenticação Google, permissões de acesso e revisão das políticas de banco e arquivos. Nunca inclua senhas, chaves administrativas, documentos pessoais ou backups no repositório. O acesso a arquivos e dados reais deve permanecer restrito às contas autorizadas.
