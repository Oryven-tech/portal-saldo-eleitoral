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
