# Evidências do MVP — 16/10/2026

## Entrega local

Repositório Git inicializado nesta pasta original. React/TypeScript/Vite, versões fixadas e lockfile. Fontes Source Serif 4 e DM Sans servidas localmente com licenças. Interface responsiva em português, com demonstração fictícia separada do adaptador Supabase.

Fluxos preparados: direção e servidor, busca, documentos, revisão, agendamento, uso/cancelamento, edição de datas, ajuste de créditos, autorização de e-mails, CSV, backup protegido e verificação. Migração SQL com RLS/RPCs aplicada no projeto dedicado; função Edge de upload publicada. Login Google e jornadas autenticadas reais ainda pendentes.

## Verificações executadas

Ambiente: Windows, Node 24.15.0, npm 11.12.1, navegador Microsoft Edge/Chromium em desktop 1440×1000 e emulação Pixel 7.

| Verificação | Resultado | Limite |
| --- | --- | --- |
| `npm.cmd run build` | Passou | Compilação TypeScript e build do frontend; não executa a função Deno |
| `npx.cmd --yes deno check supabase/functions/submit-evidence/index.ts` | Passou | Checagem de tipos da função e SDK; não executa upload em Supabase real |
| `npm.cmd run test` | 19 testes passaram | Regras, CSV, chaves públicas, criptografia, estrutura de backup e PostgreSQL WASM |
| `npm.cmd run test:e2e -- --max-failures=2 --reporter=line` | 14 testes passaram (12 jornadas existentes + 2 testes da ficha simplificada) | Demonstração em memória; sem Auth/Storage hospedados |
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
- Gestão de e-mails e saída acessíveis também no celular. Após simplificação, o menu tem Servidores/Folgas/Backup; acessos abrem por botão na lista. Ajuda e textos promocionais removidos.
- Rótulo da data incluía texto do botão auxiliar; rótulos explícitos corrigidos.
- Validador de backup precisava aceitar offset de timestamps PostgreSQL; corrigido e coberto por teste.
- Conteúdo de backup passou a validar estrutura, vínculos, duplicados, paths e orçamento de extração antes de alocações indevidas.
- Cliente recusa chaves secretas e JWT service_role em configuração pública.

## Ainda não comprovado / bloqueios de uso oficial

1. Projeto Supabase Free dedicado criado pelo responsável em São Paulo: `axdooojqsfmjkwzugdxw`. Configuração pública do frontend salva em .env.local ignorado pelo Git.
2. Escola Estadual Edson Alves Pereira informada. Administrador inicial solicitado e confirmado pelo responsável, gravado na allowlist. E-mail da diretora definitiva ainda pendente; endereço pessoal de bootstrap não é versionado.
3. Login Google, hook, RLS, Storage e Edge Function hospedados precisam de validação real com duas contas e uma não autorizada.
4. Recuperação de desastre em outro projeto não implementada/homologada. Validar pacote não é restaurar.
5. Limpeza/reconciliação de uploads abandonados, correções de usos concluídos e troca de identidade precisam de procedimento/código antes da abertura oficial.
6. Formato/tamanho de PDFs reais e regras institucionais ainda não confirmados.
7. Ensaio com 50 usuários, Safari/iOS real, rotina de guarda, privacidade e responsáveis pendentes.
8. Prévia de homologação publicada no Pages, conforme atualização abaixo. Sites hospedado não foi utilizado por decisão explícita do responsável.

## Reversão e continuidade

O retorno do código local é controlado por Git. A migração foi aplicada no projeto dedicado; não reaplicar a migração inicial nem apagar o banco como reversão. Em infraestrutura real, reverter frontend não reverte banco: usar estratégia de compatibilidade e cópia validada antes de mudanças. Não apagar documentos/tabelas como rollback.

Próximo gate: configurar homologação Supabase/Google a partir do README, verificar fronteiras reais e só então encerrar as etapas correspondentes no PLANO-MVP.md.

Lockfile npm verificado: SHA-256 `69A4101EECA793A3A2DB5666F9DE78CA4473B1812366B9C583390C83AB36AF63`. O formatador posterior alterou apresentação dos fontes; não alterou lógica de execução.

## Simplificação e configuração real — continuação de 16/10/2026

- Entrada reduzida a escola, tipo de acesso e botão Google. Testes locais mantêm identificação factual; produção sem configuração oculta o modo de teste.
- Direção abre na lista de servidores. Comprovantes ficam na ficha; acessos autorizados em modal; menu reduzido a três seções. Título exato e logo/fav icon no mesmo SVG estático.
- Build passou; 19 testes locais passaram após ajustes SQL; 14 testes de navegador passaram no desktop/Pixel 7. Axe sem violações nas telas verificadas. Build sem configuração passou na checagem de CSP/login.
- Banco dedicado inspecionado vazio antes da migração: 0 tabelas públicas, 0 usuários Auth e 0 buckets. Nenhum projeto foi excluído.
- Migração aplicada pelo SQL Editor, incluindo defaults restritos, RLS também em snapshots privados e bootstrap separado não versionado. Resultado conferido: 9 tabelas públicas, RLS ativo em public/private, escola correta, 1 diretor ativo, bucket não público, anon sem SELECT de servidores, authenticated sem INSERT direto em créditos.
- Hook public.before_user_created ativado e exibido como ENABLED no painel; provedor de e-mail desativado. Google habilitado; nonce e exigência de e-mail preservados.
- Função submit-evidence publicada pelo editor. Projeto usa ECC (P-256). Filtro legado incompatível desativado após confirmação explícita do responsável; configuração versionada acompanha o painel. Função também valida usuário via Auth getUser antes de ler arquivos ou usar credencial de serviço.
- Origem preparada para homologação em http://127.0.0.1:5173. Atualizar origem e URLs exatas ao publicar no Pages.
- Evidências visuais locais em .artifacts/ (ignoradas no Git). SQL aplicado não substitui testes de RLS/Auth/Storage por API com sessões reais. Nenhum PDF pessoal ou cadastro de servidor foi inserido.

Próxima ação: concluir Google Cloud/OAuth, configurar chave pública e frontend de homologação, testar sessões e upload reais. Documentar compatibilidade da validação JWT, recuperação e procedimentos antes da abertura oficial.

- Verificação hospedada de autenticação: chamada sintética à função, origem local permitida e bearer inválido, retornou HTTP 401 com `{ "ok": false }`.
- Três testes Deno passaram sobre o handler real com Auth/REST simulados: bearer ausente/inválido antes da leitura do corpo, nenhuma chamada Storage quando reserva é recusada, origem/preflight sem bypass de autenticação. Não equivalem a upload completo hospedado.
- Google Cloud: projeto dedicado `sage-apogee-511902-a5` criado sem vincular faturamento. Identidade OAuth cadastrada após aceite explícito da política do Google; cliente web criado pelo responsável. Segredo não foi solicitado no chat nem salvo no repositório.

- Primeiro login Google real da direção concluído no navegador e painel carregado com escola correta e base vazia. Site URL de homologação salvo como http://127.0.0.1:5173, sem curingas. OAuth Google permanece em Testing, com administrador como usuário de teste; liberação aos 50 servidores exige concluir essa configuração para uso oficial.
- Build final configurado passou, com título/favicon corretos, login ativo, demonstração oculta e CSP sem erros: `node scripts/check-unconfigured-build.mjs --configured`. Os 14 testes de navegador passaram novamente após simplificação final.
- Bundle conectado: JavaScript aproximadamente 597 kB minificado / 174 kB gzip. Vite emitiu aviso de chunk acima de 500 kB, sem falha de build; não houve medição em rede/dispositivo físico.
- Fontes locais e favicon estático não consomem Storage do Supabase. Nenhum segredo Google ou chave administrativa foi inserido no frontend/arquivos versionados.
- Fonte da migração aplicada, SHA-256: 5EA48F217591173241D31F21C4F2353ED1FD02BA1E98D8D7AC2B1042E4214AB0. Fonte da função publicada, SHA-256: 0BC750C28A8EB65605B99ED96C4EF32AAE2ABBC5825E17341E4CD2344A18FA14. Hashes dos arquivos locais, não de pacote compilado do provedor.

## Continuidade da publicação

Pacote estático configurado para Direct Upload em `.artifacts/portal-saldo-eleitoral-pages.zip` (ignorado pelo Git), sem segredos administrativos. A primeira conta de recursos foi criada sob um login anterior; o responsável esclareceu que exige identidade independente. O destino correto está na seção seguinte. Nenhuma publicação foi feita nessa primeira conta.

O segundo perfil foi posteriormente fornecido e autorizado expressamente. Os resultados atuais estão abaixo; não considerar isolamento completo, retomada ou restauração homologados apenas pelo login de duas contas.

## Identidade Cloudflare independente — correção de escopo

O responsável esclareceu que exige login independente para o PSE, além de uma conta de recursos separada. A sessão anterior foi encerrada. O responsável criou novo usuário Cloudflare exclusivo do portal e confirmou seu e-mail; identidade confirmada no painel e conta correta: `1e880ca98d3e03df5d0291a041cb18d0`. Não vincular pagamento nem conectar recursos de outro projeto.

A conta de recursos `5c2ed9db84e2c5460379d9b98122878f`, criada inicialmente dentro do login anterior, não é destino de publicação. Não recebeu site, arquivos, funções nem dados da aplicação. Permanece um recurso vazio criado nesta sessão; remoção exige confirmar o alvo e autorização de exclusão antes de executar. Não acessar ou modificar a conta/projetos CorrigePlus como parte do desenvolvimento do PSE.

Conta de teste do perfil servidor confirmada pelo responsável e autorizada pelo fluxo real do portal; Google OAuth Testing atualizado para duas contas. Login Google real do servidor concluído. Os endereços usados não são versionados no código. Fixtures em .artifacts/ incluem um PDF válido de três páginas e três PDFs de uma página, todos sintéticos.

## Ensaio hospedado e pacote revisado — 16/10/2026, horário de Brasília

- Dois envios reais pela conta de servidor: um PDF de três páginas (1.417 bytes) e três PDFs de uma página (686 bytes cada). Ambos ficaram pendentes, sem criar crédito. Invocações hospedadas confirmaram sucesso do upload.
- Download privado do primeiro PDF pelo portal concluído; bytes idênticos ao arquivo sintético original. Esse teste não substitui tentativa de acesso entre dois servidores diferentes.
- Direção aprovou o primeiro envio com justificativa explícita de teste: saldo de 0 para 2. Segundo envio recebeu solicitação de correção, sem crédito adicional.
- Direção reservou um dia sintético em 20/11/2026: 1 disponível e 1 reservado. Cancelamento preservou o histórico e devolveu o saldo a 2 disponíveis, sem reserva. Nenhum registro tem validade funcional.
- Novo login do próprio servidor confirmou 2 dias disponíveis, 0 usufruídos e 0 reservados, com crédito e justificativa de teste no histórico.
- Corrigida a apresentação de timestamps e o limite de dia para America/Sao_Paulo, preservando datas de calendário. Corrigida unidade de arquivos pequenos, que antes apareciam como 0 MB.
- Após esses ajustes: 21 testes locais passaram; build passou; 14 testes de navegador passaram em desktop e Pixel 7; checagem do build configurado passou com CSP, título/favicon, Google habilitado e modo de demonstração oculto.
- Pacote regenerado: 378.780 bytes compactados; SHA-256 `D4838D7CCDC15B0090BABD0675568F35CFF3EBC1FFB9E737A00FCEE6B40724C6`. Pages confirmou 17/17 arquivos carregados, incluindo index.html, favicon, headers, assets e licenças.
- Projeto Pages `portalsaldoeleitoral` publicado após autorização final expressa, na identidade independente correta. URL: https://portalsaldoeleitoral.pages.dev. Implantação `0ad2d16a-2a7c-40fa-b4eb-306797291224`, origem main por Direct Upload. Pacote estático acima; dados e PDFs permanecem no Supabase privado.
- Supabase Site URL e PORTAL_ORIGIN atualizados para https://portalsaldoeleitoral.pages.dev, sem curingas de redirecionamento. O retorno solicitado pelo frontend corresponde à Site URL. Segredos de autenticação não foram alterados. Origem local deixou de ser autorizada para upload.
- Login Google do servidor pela URL HTTPS concluído; novo envio sintético de um PDF recebido como pendente, sem crédito automático. Download privado em HTTPS conferido: 1.417 bytes, idêntico ao original. Console sem avisos/erros registrados nesse ensaio. Título e modo de produção conferidos visualmente; favicon e CSP já verificados no pacote idêntico antes da publicação.
- Login da direção também concluído em HTTPS, mostrando o mesmo saldo e o novo envio pendente. DOM confirmou título exato, favicon `/favicon.svg`, marca carregada e ausência do texto de demonstração. Evidência local: `.artifacts/portal-publicado-direcao.png`. Servidor local encerrado; prévia HTTPS permanece acessível.

Pendências para uso oficial: restauração de desastre implementada e ensaiada, testes negativos reais de isolamento entre servidores, bloqueio de conta não autorizada, concorrência e retomada de upload, limpeza/reconciliação de arquivos, configuração Google para produção, diretora definitiva e regras institucionais. A prévia é para homologação com dados sintéticos.

## Ajuste visual do login — 17/10/2026

- Marca da entrada centralizada em uma linha, com tamanho responsivo; apresentação da marca no painel preservada.
- Botão alterado para “Entrar com Google”. Removida margem automática do SVG que deslocava ícone e texto para a direita.
- Opção Servidor/Direção selecionada recebe borda verde de 1 px.
- Build passou; os dois testes existentes da entrada passaram em desktop/Pixel 7, incluindo responsividade e acessibilidade. Capturas locais inspecionadas. Checagem do build configurado com CSP passou.
- Pacote Pages atualizado, SHA-256 `C83B201C1852D0074E57B301B43D12DA62624D1C5FDA2FF1686098ECE49CC776`. Atualização apenas do frontend; nenhuma alteração de banco, permissões ou credenciais.
- Publicação concluída na conta independente e conferida em https://portalsaldoeleitoral.pages.dev. Marca centralizada, título em uma linha e sem overflow; margem do ícone Google igual a 0 px; opção selecionada com borda de 1 px rgb(36, 77, 64). Alternância Servidor/Direção conferida no site. Captura: `.artifacts/login-atualizado-publicado.png`.

## Continuidade: marca à esquerda e recuperação — 17/10/2026

A pedido posterior, a marca da entrada voltou ao alinhamento à esquerda, mantendo o título em uma linha. Esse ajuste foi publicado; referência local `2bbd1fd`. Os resultados da seção anterior sobre centralização da marca descrevem a versão intermediária.

### Recuperação em ambiente isolado

- Implementados leitor de backup por partes, comando assistido `scripts/recover.ts`, validações em `src/recovery.ts` e migração `202610170001_recovery.sql`. Procedimento em RECUPERACAO.md. O leitor atualizado integra o frontend da prévia; comando e migração são ferramentas técnicas. A migração de recuperação foi aplicada somente no Supabase isolado.
- O responsável criou `PSE Homologacao` (`fjhvkxxvkarilenfjzsy`), Free, São Paulo. Antes das migrações, foram conferidos 0 tabelas públicas, 0 usuários Auth e 0 buckets. A base da prévia `axdooojqsfmjkwzugdxw` não foi restaurada ou sobrescrita.
- As duas migrações foram aplicadas pelo SQL Editor no ambiente isolado. Hash SHA-256 da migração de recuperação aplicada: `8D424D878774CD88E5E7D61C294C29F2ED06B9868113AE8C35D323E5BB9BD51B`.
- Ensaio exclusivamente sintético: dois servidores com e-mails `.invalid`, um envio aprovado, um PDF privado de 686 bytes, crédito de três dias, uma folga usada e uma reservada. Resultado: um dia disponível. Repetição do mesmo conteúdo manteve um único crédito e um único documento.
- A cópia continha propositalmente um papel administrativo histórico. A recuperação não o concedeu: os dois acessos de servidor foram recriados inativos; somente o administrador de bootstrap permaneceu ativo. Nenhuma identidade Auth foi importada.
- Asserções no PostgreSQL hospedado, com identidade e claims sintéticos dentro de transação descartada por rollback, confirmaram leitura apenas do próprio registro/documento, ausência de permissão de restauração e edição direta de crédito para usuário comum e bloqueio de leitura após revogação. Não equivalem a tentativas HTTP entre dois logins Google reais.
- Download pelo painel Storage conferido contra o PDF original: 686 bytes idênticos, SHA-256 `379a9fa54b0271aa046f73ea782c19c1857ce9558eeb92e56232bfd9f031277a`.
- Verificações locais: 28 testes passaram; após o ajuste final de acessos inativos, os sete testes de recuperação afetados passaram novamente. Build passou. Os dois testes existentes de backup protegido passaram em desktop e Pixel 7. O comando `npm.cmd run recovery -- inspect .artifacts/recovery-fixture` leu e validou o pacote criptografado sintético em Node 24.
- Limites: envio hospedado e transação foram conduzidos pelo painel. O transporte completo de `recovery apply` com chave administrativa não foi executado; volume representativo, operação assistida e configuração Auth do destino continuam pendentes. O ambiente isolado não atende ao site publicado. Nenhuma chave administrativa foi lida pelo agente ou incluída no frontend.

### Admissão e isolamento com Google real

- O responsável confirmou a terceira conta no Google OAuth Testing e sua autorização posterior como segundo servidor. Após o login concluído diretamente pelo responsável, o retorno trouxe `access_denied` e “Acesso não autorizado. Procure a direção.”. A conta ainda não estava na allowlist: bloqueio inicial confirmado. Endereços pessoais não são versionados nesta evidência.
- A direção autorizou o perfil “Servidor de teste 2” pelo fluxo do portal, conforme confirmação recebida. Novo login abriu saldo zero, sem histórico da primeira conta. Foi enviado um PDF sintético de 686 bytes, matrícula TESTE-002; ficou pendente e não gerou crédito. A direção passou a ver os dois cadastros, com saldos de 2 e 0 dias.
- A recusa inicial não aparecia visualmente, embora presente no retorno OAuth. Corrigido em `src/auth-return.ts` e App: mensagens locais fixas, sem reproduzir conteúdo externo, com remoção dos parâmetros de erro da URL. Os testes de callback passaram em desktop e Pixel 7. Na prévia, o mesmo formato de URL recusada foi reproduzido e a mensagem apareceu. Essa conferência visual posterior é uma reprodução do retorno; o bloqueio real foi observado antes da correção.
- Verificador técnico temporário compilado separadamente (`node scripts/build-isolation-check.mjs`), sem chave administrativa ou acesso ampliado. A direção preparou apenas IDs e metadados dos PDFs sintéticos; as chamadas seguintes usaram a sessão comum de cada servidor. Tokens/sessões não foram extraídos, exibidos ou enviados ao agente.
- Em **cada uma das duas contas Google reais**, chamadas HTTPS ao Supabase confirmaram: snapshot apenas próprio; SELECT direto com filtro pelo ID conhecido do outro servidor retornou zero linhas em `staff_members`, `documents`, `credit_entries`, `submissions` e `leave_bookings`; download do PDF próprio funcionou com tamanho/SHA-256 corretos; download do PDF conhecido da outra conta foi recusado pelo Storage. Isso verifica os dois sentidos da fronteira de leitura/download, não somente a ausência de botões na interface.
- Nas duas sessões, chamada de `adjust_credit` com zero dias foi recusada com código `42501` e mensagem “Ação restrita à direção.”, antes da validação funcional. Não foi lançado crédito. Cliente separado sem sessão também recebeu `42501` no snapshot/SELECT e recusa do download de caminho conhecido. Os downloads próprios bem-sucedidos serviram de controle positivo contra falso resultado por indisponibilidade geral.
- Relatórios e capturas locais ignorados pelo Git: `.artifacts/api-isolamento-servidor-1.txt`, `.artifacts/api-isolamento-servidor-2.txt` e respectivos PNGs. Os testes concluíram às 12:02:16 e 12:02:40 de 17/10/2026, horário de Brasília.
- Referências locais do verificador foram limpas. Novo build normal excluiu página/assets técnicos da versão corrente; URL antiga voltou ao fallback normal do portal. Deployments históricos do provedor não foram excluídos. O verificador não concedia permissões nem continha segredos.

### Verificação e publicação final da etapa

- `npm.cmd test`: **28 testes passaram**. `npm.cmd run build`: passou; aviso conhecido de bundle JavaScript de aproximadamente 598 kB minificado / 174 kB gzip.
- `npm.cmd run test:e2e -- --max-failures=1 --reporter=line`: **16 testes passaram** em desktop e Pixel 7, incluindo entrada, acessibilidade verificada, gestão de saldo, autorização, envio e backup protegido. Jornadas locais usam demonstração; as provas hospedadas acima são registradas separadamente.
- `node scripts/check-unconfigured-build.mjs --configured`: passou com CSP, título/favicon, login habilitado e demonstração oculta. Typecheck separado do verificador técnico passou. O sandbox impediu iniciar o Edge de teste; verificações de navegador foram executadas fora dele após aprovação. Uma primeira versão do teste de callback fazia apenas navegação de fragmento e preservava o estado React anterior; corrigida para recarregar como no retorno OAuth externo, depois passou.
- Atualização temporária do ensaio: deployment `f4aed9c1-e7a2-4c77-bf0e-466dfc9115ad`. Publicação final sem o verificador: `b360a4da-14cf-46de-a597-48cf360344ed`, conta independente PSE `1e880ca98d3e03df5d0291a041cb18d0`. Pacote `.artifacts/portal-saldo-eleitoral-pages.zip`: **379.107 bytes**, SHA-256 `96EC58D2700DEB488C64EC556DF1405C584C6BBCDB201BD2B41854F75DC59E74`; Pages confirmou 17/17 arquivos e sucesso.
- Conferido em https://portalsaldoeleitoral.pages.dev: marca à esquerda em uma linha, botão Google centralizado, borda da opção selecionada e mensagem de recusa visível. Captura `.artifacts/login-recusa-corrigida-publicado.png`. Não houve migração de recuperação, restauração ou troca de credenciais na base da prévia nesta etapa.

Próximas verificações: transporte completo da recuperação com credencial fornecida diretamente pelo responsável no terminal, concorrência/retomada/reconciliação de uploads, correção de folgas usufruídas e troca de identidade. Dados institucionais, diretora definitiva, guarda/reativação e aceite de uso oficial continuam pendentes. O ensaio de isolamento não encerra toda a matriz de segurança do PLANO-MVP.md.

### Preparação do ensaio completo pelo comando

Após confirmação explícita do responsável, foram removidos somente o PDF e os registros sintéticos do projeto `PSE Homologacao` (`fjhvkxxvkarilenfjzsy`). Bootstrap administrativo, esquema, políticas, bucket e backup local preservados. Não houve limpeza no projeto da prévia.

A primeira tentativa de limpeza SQL foi recusada pelas guardas: o painel Storage havia deixado um objeto `.emptyFolderPlaceholder` de zero bytes. Os registros permaneceram intactos nessa tentativa. O marcador foi identificado por consulta e a pasta vazia removida pelo Storage; nenhum `DELETE` direto foi executado em `storage.objects`. A transação guardada foi então concluída, conferindo payload exato do ensaio e IDs previstos. Resultado: 0 servidores, 0 documentos, 1 administrador ativo, 0 usuários Auth; bucket vazio. Captura `.artifacts/recuperacao-destino-vazio-confirmado.png`.

Terminal do Codex aberto no repositório original e painel de chaves do projeto isolado preparado com segredo mascarado. O responsável recebeu o comando `npm.cmd run recovery -- apply .artifacts/recovery-fixture fjhvkxxvkarilenfjzsy` e instrução de informar a chave somente no terminal oculto. A execução completa ainda aguarda esse handoff; destino vazio não equivale a recuperação concluída.

### Entrada da frase no terminal — ajuste de operação

O responsável executou o comando e recebeu “Frase incorreta ou arquivo corrompido” antes de informar credencial administrativa. Leitura direta do pacote local com a frase sintética confirmada passou; inspeção pelo comando em PTY também passou. Portanto o pacote local está íntegro. O conteúdo efetivamente digitado/colado pelo responsável não foi capturado; a causa exata da tentativa não foi comprovada.

Extraída a entrada oculta para `scripts/hidden-input.ts`: exibe apenas asteriscos, recusa submissão vazia sem encerrar o programa, preserva espaços/Unicode, aceita Backspace e restaura o modo anterior do terminal ao concluir ou cancelar. Cinco testes exercitam fluxo UTF-8, Ctrl+V sem texto seguido de nova entrada, correção, cancelamento e recusa de terminal não interativo. Typecheck dos scripts passou; suíte completa: **33 testes passaram**. Inspeção em PTY, incluindo tentativa vazia e entrada posterior correta: passou. Nenhuma alteração de frontend, migração ou chamada ao Supabase nesta correção. Resta repetir a execução assistida do responsável e conferir a restauração completa.
