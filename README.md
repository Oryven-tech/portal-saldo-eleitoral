# Portal Saldo Eleitoral

MVP em desenvolvimento para uma escola, com Google Auth, Supabase Postgres/Storage privado e publicação prevista no Cloudflare Pages.

**Situação atual:** implementação local e demonstração funcional. Nenhum projeto Supabase ou Google foi conectado; nenhum dado real deve ser utilizado. As provas locais não substituem homologação dos serviços reais ou restauração de desastre.

## Executar

Requer Node 24 e npm. Instalações reproduzíveis usam o package-lock.json.

```powershell
npm.cmd ci
npm.cmd run dev
```

Abra o endereço local impresso pelo Vite. Em desenvolvimento, a entrada oferece demonstração de direção e servidor. Dados demonstrativos são fictícios, ficam em memória e desaparecem ao sair/recarregar. Não representam persistência do Supabase.

```powershell
npm.cmd run build
npm.cmd run test
npm.cmd run test:e2e
```

Testes E2E utilizam Microsoft Edge instalado e servidor local. PGlite exercita PostgreSQL/RLS com fixtures de Auth/Storage; **não** é validação do Supabase hospedado. O build de produção bloqueia acesso oficial sem configuração e não oferece demonstração por padrão.

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
6. Publicar a Edge Function `submit-evidence`, com validação JWT habilitada. Definir `PORTAL_ORIGIN` com a origem exata do frontend de homologação/produção. Variáveis administrativas do Supabase ficam apenas no ambiente da função. Validar a versão de SDK e a autenticação do projeto antes da primeira carga.
7. Copiar `.env.example` para `.env.local` e configurar **somente** URL e chave publicável do projeto. `sb_secret_*` e JWT `service_role` são recusados pelo cliente. Nunca usar credencial administrativa em `VITE_*`.

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=CHAVE_PUBLICAVEL_DO_PROJETO
VITE_ENABLE_DEMO=false
```

8. Testar direção, servidor A, servidor B e conta não autorizada contra o Supabase real; testar APIs diretas e Storage, sem depender da interface.
9. Medir PDFs representativos, ajustar orçamento/cotas com revisão e testar upload/retomada reais. Limite inicial: três PDFs somando 10 MB e cota acumulada padrão de 10 MB por servidor; complemento pode exigir exceção técnica. Orçamento global da aplicação: 700 MB, separado de quotas do provedor.
10. Publicar no Cloudflare Pages, build `npm run build`, saída `dist`, ou Direct Upload de build configurado. Criar ambiente de homologação primeiro. O nome `portalsaldoeleitoral.pages.dev` depende de disponibilidade.

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

**Restauração em outro projeto ainda não está implementada nem homologada.** O validador e o pacote são a base; a etapa de recuperação assistida precisa reconstruir esquema, objetos, relacionamentos e vínculos Google em homologação antes de uso real. Não tratar download/validação como prova de recuperação completa. Backups não contêm senhas, chaves ou sessões. No MVP, Drive recebe cópia manual; integração automática está fora desta etapa.

## Limitações que bloqueiam uso oficial

- Projeto, escola, administradores e política institucional ainda não configurados.
- Google Auth, hook, Edge Function, banco e bucket reais ainda não testados.
- Restauração assistida, reconciliação/limpeza de uploads e correções de usos já concluídos ainda pendentes.
- Calendário, fracionamento, campos obrigatórios, privacidade/base legal e temporalidade exigem validação institucional.
- Pausa por pouca atividade é aceita e precisa de responsável por reativação; não há SLA contratado.
- Testes em navegadores reais adicionais (Safari/iOS) e volume real de até 50 pessoas ainda pendentes.

## Reversão

Durante desenvolvimento, reverter código por Git sem apagar alterações não salvas. Em publicação, voltar deployment anterior somente se compatível com a migração vigente. A migração inicial não fornece `down` destrutivo: não apagar esquema/documentos como rollback. Em incidente, bloquear novas alterações, preservar banco e objetos e reconciliar por procedimento técnico. Exportar e verificar cópia antes de manutenção real.

O `PLANO-MVP.md` registra o andamento e os próximos gates. `EVIDENCIAS-MVP.md` reúne verificações e limites efetivamente observados.
