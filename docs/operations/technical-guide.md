# Guia técnico e operacional

[Documentação](../README.md) · [Início do projeto](../../README.md)

MVP em desenvolvimento para uma escola, com Google Auth, Supabase Postgres/Storage privado e prévia no Cloudflare Pages: https://portalsaldoeleitoral.pages.dev.

**Situação atual:** prévia conectada ao Supabase e Google, publicada em conta Cloudflare com login independente do PSE. Login dos dois perfis, upload e download privados, aprovação e reserva/cancelamento passaram com dados sintéticos. Leitura e download cruzados entre dois servidores com Google real foram recusados pela API; conta não autorizada também foi bloqueada. Recuperação pelo comando completo ensaiada em segundo Supabase, com registros, saldo e bytes do PDF conferidos. Uso oficial ainda não liberado: faltam volume representativo, liberação de identidades no destino recuperado, concorrência/reconciliação e aceite institucional. Não inserir dados pessoais reais nesta homologação.

## Executar

Requer Node 24 e npm. Instalações reproduzíveis usam o package-lock.json.

```sh
npm ci
npm run dev
```

Abra o endereço local impresso pelo Vite. Em desenvolvimento, a entrada oferece demonstração de direção e servidor. Dados demonstrativos são fictícios, ficam em memória e desaparecem ao sair/recarregar. Não representam persistência do Supabase.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Testes E2E utilizam o Chromium instalado pelo Playwright e iniciam o servidor local automaticamente. Para usar Microsoft Edge instalado, defina `PLAYWRIGHT_CHANNEL=msedge`. No Windows, `npm.cmd` também pode ser usado. PGlite exercita PostgreSQL/RLS com fixtures de Auth/Storage; **não** é validação do Supabase hospedado. O build de produção bloqueia acesso oficial sem configuração e não oferece demonstração por padrão.

## Integração contínua

O workflow [CI](../../.github/workflows/ci.yml) roda em cada push, pull request e execução manual pelo GitHub Actions. Usa Node 24 e três verificações independentes:

- Compilação TypeScript/Vite e testes Vitest de regras, backup, recuperação e PostgreSQL/RLS com PGlite.
- Testes Playwright em desktop e celular, acessibilidade e verificação do build sem configuração de produção. Relatórios, capturas e rastros ficam disponíveis nos artefatos por sete dias.
- Testes Deno da autenticação e autorização da função de upload, com respostas externas simuladas.

O CI usa dados sintéticos e não precisa de segredos do Supabase ou de login Google. Não executa migrações nem publica o site. Os testes de navegador também desabilitam a conexão ao Supabase no servidor local. Falhas aparecem nos checks do commit e da pull request.

Com Deno 2.9.7 e Chromium instalados, as verificações adicionais podem ser executadas localmente:

```sh
npm run test:edge
# Use um ambiente sem VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY e sem demo habilitada.
npm run test:production
```

## Arquitetura

- `src/domain.ts`: tipos, regras locais de saldo, datas, validação e CSV seguro.
- `src/App.tsx`: fluxos de entrada, direção, servidor, agenda e documentos.
- `src/repository.ts`: adaptador Supabase e contrato de dados; nenhuma chave administrativa.
- `src/demo.ts`: ambiente fictício isolado.
- `src/backup.ts`: exportação em partes, proteção e verificação; nunca aplica restauração automaticamente.
- `supabase/migrations/`: esquema, RLS, admissão, RPCs transacionais e política do bucket privado.
- `supabase/functions/submit-evidence/`: upload autenticado, orçamento, conferência e finalização.
- `public/_headers`: políticas de segurança para Pages.

Fontes: Source Serif 4 e DM Sans, servidas localmente via Fontsource. A serifada segue a direção visual da referência; não utiliza arquivo proprietário da Anthropic. Licenças em `public/licenses/`.

## Configuração real — somente em projeto dedicado

1. Criar projeto Supabase **Free**, sem cartão, dedicado à escola. Guardar senha do banco em local seguro; não enviar pelo chat nem versionar. Conferir cotas, região e responsáveis.
2. Aplicar `supabase/migrations/202610160001_portal.sql` em projeto vazio, pelo SQL Editor ou fluxo de migrações revisado. Não aplicar cegamente em banco de outro sistema: a migração define privilégios do esquema público para este produto.
3. Configurar escola e a primeira diretora antes do primeiro login, com SQL revisado pelo responsável. Substituir os exemplos abaixo pelos dados confirmados; não guardar e-mails reais no repositório:

```sql
update public.app_settings set school_name = 'NOME CONFIRMADO DA ESCOLA' where singleton;
insert into public.access_allowlist(name,email,role)
values ('NOME DA DIRETORA','email-confirmado@example.com','director');
```

4. Configurar Google OAuth no Google Cloud e Supabase. Escopos somente de identidade básica. Callback Google: `https://PROJECT_REF.supabase.co/auth/v1/callback`. Definir URLs de origem e retorno exatas para homologação/produção; não usar curingas amplos.
5. Habilitar o hook de banco `public.before_user_created` em **Authentication / Hooks / Before User Created**. Desabilitar provedores não usados, incluindo email/senha. Manter criação de contas Google permitida, pois o hook e a lista controlam a admissão. O trigger adicional também rejeita criação fora da lista.
6. Publicar a Edge Function `submit-evidence` com `verify_jwt=false` para o projeto ECC atual. O handler exige bearer e valida a sessão com `auth.getUser()` antes de ler arquivos, reservar quota ou usar credencial de serviço. Não remover essa validação. Definir `PORTAL_ORIGIN` com a origem exata do frontend de homologação/produção. Variáveis administrativas do Supabase ficam apenas no ambiente da função. Validar a versão de SDK e a autenticação do projeto antes da primeira carga.
7. Copiar `.env.example` para `.env.local` e configurar **somente** URL e chave publicável do projeto. `sb_secret_*` e JWT `service_role` são recusados pelo cliente. Nunca usar credencial administrativa em `VITE_*`.

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=CHAVE_PUBLICAVEL_DO_PROJETO
VITE_ENABLE_DEMO=false
```

8. Testar direção, servidor A, servidor B e conta não autorizada contra o Supabase real; testar APIs diretas e Storage, sem depender da interface.
9. Medir PDFs representativos, ajustar orçamento/cotas com revisão e testar upload/retomada reais. Limite inicial: três PDFs somando 10 MB e cota acumulada padrão de 10 MB por servidor; complemento pode exigir exceção técnica. Orçamento global da aplicação: 700 MB, separado de quotas do provedor.
10. Publicar no Cloudflare Pages, build `npm run build`, saída `dist`, ou Direct Upload de build configurado. Usar o projeto de homologação existente `portalsaldoeleitoral`, na conta independente correta; não criar substituto em outra identidade.

Sem essas configurações, o botão oficial permanece indisponível. Não habilitar demonstração no portal oficial. Não misturar preview com escrita na base de produção.

## Regras implementadas

- Crédito apenas após decisão administrativa; autorizações e poderes são conferidos no servidor/banco.
- Reserva reduz disponibilidade; conversão para uso não debita novamente.
- Datas explícitas inteiras; sem inferir calendário escolar ou expiração legal.
- Ajuste com justificativa não pode comprometer dias já utilizados/reservados.
- Alteração de agendamento preserva evento no histórico.
- Operações de crédito/reserva serializam pelo registro do servidor; IDs de operação previnem duplicação.
- Download privado verifica vínculo ativo; clientes não têm política de escrita direta no Storage.
- Upload real passa pela função autenticada; limita corpo real e arquivos, calcula hash e reserva quota no banco. Um reenvio idêntico reutiliza intenção; não sobrescreve arquivo pronto.
- Envio interrompido é retomado com os mesmos PDFs. Cancelar/reconciliar uma intenção incompatível ainda exige procedimento técnico antes da liberação oficial.

## Backup e recuperação

O painel da direção exporta CSV de consulta e backup funcional protegido em arquivos `.psebackup` por lotes de aproximadamente 20 MB de documentos. O pacote utiliza ZIP STORE, PBKDF2-SHA256 (600.000 iterações), salt aleatório, AES-256-GCM, nonce aleatório por parte e cabeçalho autenticado. A frase tem de 16 a 256 caracteres; não é enviada ao Supabase. O formato é versionado e usa algoritmos padronizados do Web Crypto.

O manifesto inclui hashes SHA-256, contagens e associações. A verificação rejeita partes ausentes/repetidas, chave incorreta, adulteração, compactação inesperada, caminhos não permitidos e vínculos incoerentes. **Verificar integridade não autentica a origem administrativa nem aplica restauração.**

Manter duas cópias protegidas, com recuperação separada. Backup de banco não contém PDFs. Exportar tudo a cada alteração pode esgotar egress; planejar frequência conforme o tamanho observado.

**Recuperação assistida implementada para um projeto vazio.** Consulte [docs/operations/recovery.md](recovery.md): `npm.cmd run recovery -- inspect <pasta>` valida localmente; `apply <pasta> <referencia>` exige confirmação do destino e chave administrativa informada sem exibição no terminal. PDFs são conferidos no destino e os registros são aplicados em uma transação. Servidores ficam com acessos inativos para revisão; papéis, identidades Auth e sessões antigas não são reaplicados. O comando completo foi executado pelo responsável no ensaio sintético, seguido de conferência independente do banco e download com bytes idênticos. Volume e liberação dos logins no destino ainda precisam de homologação. No MVP, Drive recebe cópia manual; integração automática está fora desta etapa.

## Limitações que bloqueiam uso oficial

- Escola e administrador inicial configurados em projeto Free dedicado; política institucional e diretora definitiva ainda pendentes.
- Google Auth permanece em Testing com três contas. Recusa de conta não autorizada, leitura/download cruzados entre os dois servidores, RPC administrativa por servidor e acesso anônimo foram conferidos na API hospedada. Concorrência, retomada e demais testes adversariais de upload continuam pendentes; estes resultados não encerram toda a matriz de segurança.
- Recuperação pelo comando completo ensaiada em banco hospedado com PDF idêntico ao original; faltam volume representativo e conferência dos logins após revisão dos acessos no destino. Reconciliação/limpeza de uploads e correções de usos já concluídos ainda pendentes.
- Calendário, fracionamento, campos obrigatórios, privacidade/base legal e temporalidade exigem validação institucional.
- Pausa por pouca atividade é aceita e precisa de responsável por reativação; não há SLA contratado.
- Testes em navegadores reais adicionais (Safari/iOS) e volume real de até 50 pessoas ainda pendentes.

## Reversão

Durante desenvolvimento, reverter código por Git sem apagar alterações não salvas. Em publicação, voltar deployment anterior somente se compatível com a migração vigente. A migração inicial não fornece `down` destrutivo: não apagar esquema/documentos como rollback. Em incidente, bloquear novas alterações, preservar banco e objetos e reconciliar por procedimento técnico. Exportar e verificar cópia antes de manutenção real.

O `docs/planning/roadmap.md` registra o andamento e os próximos gates. `docs/validation/evidence.md` reúne verificações e limites efetivamente observados.

## Estado da integração em 17/10/2026

Projeto dedicado Free em São Paulo (`axdooojqsfmjkwzugdxw`), migração aplicada, bucket privado, bootstrap administrativo confirmado e hook de admissão ativo. E-mail/senha desativado. URL/chave publicável configuradas em .env.local ignorado pelo Git. Google OAuth ativo para direção e dois servidores de teste, com isolamento de leitura/download conferido. Aceite de uso oficial ainda pendente. Não reaplicar a migração inicial nesse banco. Permissões padrão de novos objetos foram restringidas mesmo tendo sido criado com exposição automática marcada.

Prévia Pages publicada após autorização em https://portalsaldoeleitoral.pages.dev, implantação `0ad2d16a-2a7c-40fa-b4eb-306797291224`. Site URL e PORTAL_ORIGIN apontam para essa origem exata. Login da direção e do servidor, envio e download privado conferidos em HTTPS. Ao desenvolver localmente, não presumir que o upload local está autorizado: alterar a origem hospedada exige planejamento para não interromper a prévia. A lista de retornos não usa curingas.

Interface da direção: Servidores, Folgas e Backup. Gerenciamento de acessos abre na lista; análise documental abre na ficha individual. O favicon e a marca usam `/favicon.svg`, hospedado como arquivo estático no Pages, sem uso do Storage do Supabase.

Teste da fronteira de upload: `npx.cmd --yes deno test --allow-env supabase/functions/submit-evidence/index_test.ts`. Captura o handler real e simula Auth/REST; verifica bloqueio antes da leitura do corpo e impede Storage sem reserva autorizada. Não substitui upload completo com sessão real.
