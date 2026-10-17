# Portal Saldo Eleitoral

Portal para acompanhar créditos eleitorais, comprovantes e agendamentos de folga de uma escola. A direção analisa documentos e administra os registros; cada servidor consulta seus próprios dados.

Desenvolvido com **React, TypeScript, Vite e Supabase**, com autenticação Google e armazenamento privado de PDFs.

**Status:** MVP em homologação. O uso oficial depende das validações registradas no [guia técnico](docs/operations/technical-guide.md#limitações-que-bloqueiam-uso-oficial). Os testes automáticos usam dados sintéticos.

## Começar

Requisitos: Node.js 24 e npm. A versão do Node está indicada em [.nvmrc](.nvmrc).

```sh
npm ci
npm run dev
```

Abra o endereço local informado pelo Vite. O ambiente de desenvolvimento oferece acessos de demonstração com dados fictícios em memória. Para configurar Supabase e Google, siga o [guia técnico e operacional](docs/operations/technical-guide.md#configuração-real--somente-em-projeto-dedicado) e use [.env.example](.env.example) como referência.

## Comandos

Execute os comandos na raiz do repositório.

| Comando                               | Finalidade                                                 |
| ------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                         | Iniciar o servidor de desenvolvimento                      |
| `npm run build`                       | Verificar TypeScript e gerar o site em `dist/`             |
| `npm run preview`                     | Visualizar o build local                                   |
| `npm run typecheck`                   | Verificar tipos                                            |
| `npm test`                            | Executar testes unitários e de integração                  |
| `npm run test:e2e`                    | Testar desktop e celular com Playwright                    |
| `npm run test:edge`                   | Testar a função de upload com Deno 2.9.7                   |
| `npm run test:production`             | Compilar e verificar um build sem configuração de produção |
| `npm run recovery -- inspect <pasta>` | Inspecionar um backup protegido                            |

Para testes de navegador, instale o Chromium uma vez com `npx playwright install chromium`. Os pré-requisitos e os limites das verificações estão no [guia de contribuição](.github/CONTRIBUTING.md).

## Estrutura

```text
.github/                  CI e orientações de contribuição
docs/
  operations/             Configuração, operação e recuperação
  planning/               Planejamento e análise de viabilidade
  validation/             Evidências de homologação
public/                   Arquivos estáticos, cabeçalhos e licenças
scripts/
  isolation/              Ensaio técnico de isolamento de acessos
  recovery/               Comando de recuperação e entrada protegida
  verification/           Verificação do build de produção
src/                      Aplicação React e regras do portal
supabase/
  functions/              Função de upload e testes de autorização
  migrations/             Migrações SQL versionadas
tests/
  e2e/                    Fluxos de navegador desktop e celular
  integration/            Banco, RLS e recuperação com PGlite
  unit/                   Regras, configuração e backup
```

## Documentação e CI

- [Índice da documentação](docs/README.md)
- [Guia técnico e operacional](docs/operations/technical-guide.md)
- [Recuperação de backup](docs/operations/recovery.md)
- [Planejamento do MVP](docs/planning/roadmap.md)
- [Evidências e limites da homologação](docs/validation/evidence.md)
- [Como contribuir](.github/CONTRIBUTING.md)
- [Execuções do CI](https://github.com/williandevbr/portal-saldo-eleitoral/actions)

O [workflow CI](.github/workflows/ci.yml) verifica build, testes de regras e banco, fluxos de navegador, acessibilidade e autenticação do upload a cada push e pull request. Relatórios de navegador ficam disponíveis como artefatos por sete dias.
