# Evidências do MVP — 16/10/2026

## Entrega local

Repositório Git inicializado nesta pasta original. React/TypeScript/Vite, versões fixadas e lockfile. Fontes Source Serif 4 e DM Sans servidas localmente com licenças. Interface responsiva em português, com demonstração fictícia separada do adaptador Supabase.

Fluxos preparados: direção e servidor, busca, documentos, revisão, agendamento, uso/cancelamento, edição de datas, ajuste de créditos, autorização de e-mails, CSV, backup protegido e verificação. Migração SQL com RLS/RPCs e função Edge de upload escrita; ainda não aplicada em Supabase real.

## Verificações executadas

Ambiente: Windows, Node 24.15.0, npm 11.12.1, navegador Microsoft Edge/Chromium em desktop 1440×1000 e emulação Pixel 7.

| Verificação | Resultado | Limite |
| --- | --- | --- |
| `npm.cmd run build` | Passou | Compilação TypeScript e build do frontend; não executa a função Deno |
| `npx.cmd --yes deno check supabase/functions/submit-evidence/index.ts` | Passou | Checagem de tipos da função e SDK; não executa upload em Supabase real |
| `npm.cmd run test` | 19 testes passaram | Regras, CSV, chaves públicas, criptografia, estrutura de backup e PostgreSQL WASM |
| `npm.cmd run test:e2e -- --max-failures=2 --reporter=line` | 12 testes passaram | Demonstração em memória; sem Auth/Storage hospedados |
| axe WCAG A/AA nas telas de entrada e visão geral | Sem violações detectadas nos testes | Não é certificação de acessibilidade de todo o produto |
| Largura da página em desktop/celular | Sem overflow horizontal nas jornadas iniciais testadas | Outras telas e Safari/iOS precisam de homologação adicional |
| Servidor local | HTTP 200 | Prévia de desenvolvimento, sem publicação |
| `node scripts/check-unconfigured-build.mjs` | Passou | Build sem configuração recusa login, oculta demonstração e carrega com CSP sem erros no Edge |
| Auditoria npm na instalação | Nenhuma vulnerabilidade reportada | Fotografia das dependências naquele momento; não é auditoria integral de segurança |

Os testes PostgreSQL usam PGlite com schemas artificiais de auth/storage. Exercitam restrição de tabelas/RPCs, isolamento, revogação, orçamento acumulado, idempotência, edição de datas, ajustes e snapshot. Não provam Google Auth, serviço Storage, Edge runtime ou concorrência de sessões nativas do Supabase.

Nos testes de navegador: direção busca servidor, agenda folga, corrige crédito com bloqueio de saldo comprometido e edita data; servidor envia PDF sintético sem crédito automático; direção autoriza novo e-mail; pacote protegido é gerado e validado. Todos os testes foram repetidos em desktop e celular emulado.

## Problemas encontrados e corrigidos

- Qualificação ambígua de coluna na política de leitura de objetos; agora usa `storage.objects.name` explicitamente.
- Contraste insuficiente de textos e avatar; cores ajustadas e fonte mínima ampliada.
- Menu completo ausente no celular; adicionado acesso a gestão de e-mails, ajuda e saída.
- Rótulo da data incluía texto do botão auxiliar; rótulos explícitos corrigidos.
- Validador de backup precisava aceitar offset de timestamps PostgreSQL; corrigido e coberto por teste.
- Conteúdo de backup passou a validar estrutura, vínculos, duplicados, paths e orçamento de extração antes de alocações indevidas.
- Cliente recusa chaves secretas e JWT service_role em configuração pública.

## Ainda não comprovado / bloqueios de uso oficial

1. Projeto Supabase ainda não criado pelo responsável. Não há URL/chave publicável configurada.
2. Nome da escola e primeiro e-mail administrativo ainda não informados.
3. Login Google, hook, RLS, Storage e Edge Function hospedados precisam de validação real com duas contas e uma não autorizada.
4. Recuperação de desastre em outro projeto não implementada/homologada. Validar pacote não é restaurar.
5. Limpeza/reconciliação de uploads abandonados, correções de usos concluídos e troca de identidade precisam de procedimento/código antes da abertura oficial.
6. Formato/tamanho de PDFs reais e regras institucionais ainda não confirmados.
7. Ensaio com 50 usuários, Safari/iOS real, rotina de guarda, privacidade e responsáveis pendentes.
8. Não há hospedagem publicada. Pages é o destino escolhido; Sites hospedado não foi utilizado por essa decisão explícita.

## Reversão e continuidade

Sem dados reais nem migração aplicada, o retorno local é controlado por Git. Em infraestrutura real, reverter frontend não reverte banco: usar estratégia de compatibilidade e cópia validada antes de mudanças. Não apagar documentos/tabelas como rollback.

Próximo gate: configurar homologação Supabase/Google a partir do README, verificar fronteiras reais e só então encerrar as etapas correspondentes no PLANO-MVP.md.

Lockfile npm verificado: SHA-256 `69A4101EECA793A3A2DB5666F9DE78CA4473B1812366B9C583390C83AB36AF63`. O formatador posterior alterou apresentação dos fontes; não alterou lógica de execução.
