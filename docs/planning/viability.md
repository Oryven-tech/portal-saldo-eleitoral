# Portal Saldo Eleitoral — análise de viabilidade e preparação do MVP

Data de referência: 16/10/2026. Horizonte solicitado: até 16/10/2028.
Estado: análise documental e técnica; nenhum ambiente, conta, bucket ou aplicação foi provisionado.

Decisão posterior do responsável: adotar Cloudflare Pages + Supabase completo e aceitar a possibilidade de pausa por pouca atividade, com procedimento de reativação. O [docs/planning/roadmap.md](roadmap.md) passa a ser a referência de execução; as alternativas abaixo permanecem como análise histórica e contingência.

## 1. Veredicto

É viável desenvolver um portal funcional para aproximadamente 50 servidores usando serviços gratuitos. Cadastro, autenticação, formulários, conferência de comprovantes, extrato de créditos e registro de folgas representam uma carga pequena.

Isso não permite garantir dois anos de disponibilidade ininterrupta, permanência das condições comerciais ou recuperação automática de qualquer incidente. O maior risco não é a quantidade de usuários: são inatividade, permissões incorretas, exclusão de documentos, ausência de backup, perda de acesso às contas e erro na movimentação de saldo.

A escolha do armazenamento depende do tamanho real dos PDFs. Três páginas não determinam quantos MB um arquivo ocupa. Faltam amostras para encerrar essa decisão.

Restrições confirmadas pelo responsável neste chat:

- Não vincular forma de pagamento.
- Todos os servidores e a diretora conseguem utilizar conta Google.
- Aproximadamente 50 servidores, mais poucas contas administrativas.
- Um PDF com três páginas ou até três PDFs separados por servidor, com margem para correções e complementação.
- Consulta individual e gestão administrativa com histórico.
- Disponibilidade pretendida por dois anos; dados reais exigem governança e manutenção.

## 2. Arquiteturas avaliadas

### A. Cloudflare Pages + Supabase Auth, Postgres e Storage privado

É a primeira opção para o MVP se os documentos reais couberem com margem. Usa autenticação e controle de acesso integrados; reduz o número de integrações e de segredos operacionais.

O frontend pode usar React, TypeScript e Vite. Regras de saldo ficam em operações transacionais no banco, com permissões restritas. O navegador nunca é a autoridade do saldo. PDFs ficam em bucket privado, separados dos registros relacionais.

Condições: medir PDFs, validar o orçamento de armazenamento, manter backup externo e reconhecer a política de pausa por pouca atividade. Não considerar essa arquitetura como compromisso de acesso contínuo sem intervenção.

Limites publicados relevantes do Supabase Free: 500 MB de banco por projeto, 1 GB de arquivos, 50 mil usuários ativos mensais, 5 GB de saída e uma franquia separada de 5 GB de saída em cache. Upload máximo publicado de 50 MB por arquivo não equivale à capacidade total disponível. Há limite de dois projetos Free ativos; verificar a disponibilidade na organização antes de separar homologação e produção.

Fonte: [preços Supabase](https://supabase.com/pricing).

O Free pode pausar por pouca atividade em uma janela de sete dias. A documentação consultada informa restauração pelo painel por até um ano após a pausa. Não depender desse prazo para preservar registros. Requisições artificiais não constituem garantia de disponibilidade; backup e acompanhamento continuam necessários.

Fonte: [pausa de projetos](https://supabase.com/docs/guides/platform/free-project-pausing).

### B. Pages + Supabase Auth/Postgres + Backblaze B2 privado

Alternativa se os PDFs ultrapassarem o orçamento seguro do Storage. O B2 anuncia os primeiros 10 GB gratuitos e cadastro sem cartão. Isso melhora a margem, mas não resolve a pausa do Supabase.

Exige uma camada de servidor para autorizar uploads e downloads, conferir vínculo com o usuário, finalizar envios e gerenciar inconsistências entre banco e armazenamento. Chaves do B2 nunca vão ao frontend. O bucket permanece privado.

A página atual de preços anuncia saída gratuita até três vezes a média mensal armazenada. Documentação de contas sem pagamento também menciona cotas diárias de operações; materiais oficiais de buckets mantêm referências a limites de download diferentes. Portanto, testar especificamente as cotas aplicadas à conta sem cartão antes de selecionar B2 para produção. Não transpor automaticamente condições de contas pagas para essa conta.

Fontes: [preços B2](https://www.backblaze.com/cloud-storage/pricing), [cadastro sem cartão](https://www.backblaze.com/sign-up/s3), [cotas de operações em contas sem pagamento](https://www.backblaze.com/apidocs/b2-create-bucket), [limites e alertas](https://www.backblaze.com/docs/en/cloud-storage-data-caps-and-alerts).

### C. Cloudflare Pages/Workers + D1 + Google OAuth + B2 privado

Candidata quando a política de pausa do Supabase for incompatível com o uso esporádico da escola. Retira a dependência do Supabase, inclusive no login. A política de pausa do Supabase deixa de ser um risco específico dessa arquitetura; isso não significa SLA ou garantia de disponibilidade da Cloudflare.

D1 Free publica 500 MB por banco, 5 GB totais por conta, 5 milhões de linhas lidas/dia e 100 mil linhas escritas/dia. Workers Free publica 100 mil requisições/dia e 10 ms de CPU por invocação. A carga prevista é pequena, mas exige consultas indexadas e evitar processamento pesado de PDFs no Worker. D1 disponibiliza recuperação Time Travel por sete dias no Free; isso não substitui backup externo de dois anos.

Fontes: [preços D1](https://developers.cloudflare.com/d1/platform/pricing/), [limites D1](https://developers.cloudflare.com/d1/platform/limits/), [limites Workers](https://developers.cloudflare.com/workers/platform/limits/).

O custo de engenharia é maior: sessões, proteção contra CSRF, autorização por registro e integração OAuth precisam de biblioteca mantida e testes. Não implementar criptografia ou senhas próprias. Essa alternativa merece uma prova técnica antes de substituir a solução mais integrada.

### Opções que não escolheria agora

- Cloudflare R2: 10 GB-mês de armazenamento Standard e franquias de operações são interessantes, mas há assinatura com faturamento e possibilidade de excedentes. Incompatível com a preferência de não vincular pagamento. Não tratar aviso de consumo como bloqueio financeiro garantido.
- Firebase Storage: a exigência de Blaze/faturamento em 2026 não combina com a restrição atual.
- Appwrite Free: não resolve a preocupação de continuidade; publica pausa por inatividade e exclusão após 90 dias de pausa.
- Vercel Hobby: sua documentação restringe o plano a uso pessoal e não comercial. Não presumir enquadramento de uma ferramenta institucional; Pages evita depender dessa interpretação nesta escolha.
- Google Drive como banco e armazenamento principal: economiza serviços, mas adiciona permissões, associação de documentos, dependência de conta e integração OAuth. É mais apropriado como destino de uma cópia de segurança gerenciada pela escola, com espaço confirmado, do que como banco de saldo.

Fontes: [R2](https://developers.cloudflare.com/r2/pricing/), [ativação R2](https://developers.cloudflare.com/r2/get-started/), [faturamento Cloudflare](https://developers.cloudflare.com/billing/understand/billing-policy/), [Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Appwrite: pausa](https://appwrite.io/changelog/entry/2026-02-20-1), [Appwrite: exclusão](https://appwrite.io/changelog/entry/2026-06-29), [Vercel](https://vercel.com/docs/plans/hobby).

## 3. Dimensionamento com margem

Valores decimais aproximados; cálculos de produto, não medição de arquivos fornecidos.

| Total de PDFs por servidor | Total para 50 servidores | Consequência |
| --- | --- | --- |
| 3 MB | 150 MB | Boa margem no Supabase Storage |
| 6 MB | 300 MB | Margem para versões e correções |
| 10 MB | 500 MB | Viável com orçamento e controle de versões |
| 15 MB | 750 MB | Margem pequena para correções |
| 20 MB | 1 GB | Ocupa praticamente toda a franquia; inadequado |
| 60 MB | 3 GB | Exige outro armazenamento |

Exemplo importante: três arquivos de 5 MB representam 15 MB por pessoa e 750 MB para o grupo. Uma substituição completa preservando os originais dobraria para 1,5 GB. Três arquivos de 20 MB por pessoa resultam em 3 GB para o grupo, antes das versões.

Recomendação provisória para a opção A: orçamento de até 500 MB para o conjunto inicial e até 200 MB para complementações/versões, deixando aproximadamente 300 MB livres. São limites internos de projeto, não franquias adicionais do provedor. O teto precisa considerar outros objetos na organização e o consumo real observado.

Uma regra inicial de 10 MB somados por servidor pode atender, mas só será adotada se amostras reais confirmarem isso. Arquivos legítimos maiores exigem exceção administrada dentro do orçamento ou adoção da opção B/C. Não comprimir comprovantes assinados ou descartar originais silenciosamente. Unir três PDFs não garante reduzir tamanho.

Na opção B/C, uma proposta inicial é aceitar até três arquivos de 20 MB, total de 60 MB por servidor: até 3 GB iniciais e aproximadamente 6 GB com uma revisão completa preservada. Ainda é necessário orçamento global, controle de versões, franquia de downloads e backup fora da mesma cota. Essa proposta só vira requisito após a prova técnica sem cartão.

Guardar 500 MB por 24 meses não transforma o conjunto em 12 GB armazenados. O que cresce é a quantidade de novos arquivos e versões. Downloads consomem outra franquia: baixar um acervo de 500 MB dez vezes no mês representa aproximadamente 5 GB de saída, antes de outros acessos.

Textos, datas, contas e movimentações são pequenos em comparação aos PDFs. Uma simulação de 50 perfis e alguns milhares de movimentações deve ocupar uma fração dos 500 MB, mas o tamanho final precisa ser medido com índices, autenticação e logs. Não armazenar PDFs como base64 no banco.

## 4. Login e autorização

Dois botões na entrada: “Sou servidor” e “Sou diretora/secretaria”. Podem usar o mesmo provedor Google. Escolher um botão não concede permissão administrativa: o servidor consulta um papel previamente autorizado.

Fluxo recomendado:

1. Diretora cadastra lista de e-mails autorizados, vinculada a registros dos servidores.
2. Servidor entra com Google; o sistema aceita somente identidade verificada e autorizada.
3. Primeiro acesso conclui dados e inicia o envio; os demais acessam o painel pessoal.
4. Diretora e auxiliares têm contas individuais, sem senha compartilhada.
5. Remoção da lista ou desativação bloqueia novas operações mesmo se houver sessão ainda válida.
6. Troca de e-mail exige conferência administrativa e vinculação ao mesmo cadastro; não duplica o saldo.

No Supabase, o hook “Before User Created” está disponível no Free e permite impedir criação de usuários fora da lista. A autorização também deve ser conferida nas políticas e operações depois do cadastro. Papel administrativo não pode vir de campo editável pelo próprio usuário.

Fontes: [hooks](https://supabase.com/docs/guides/auth/auth-hooks), [bloqueio antes do cadastro](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook).

Google reduz dependência de e-mails de confirmação, convites e recuperação de senha enviados pelo portal. O SMTP padrão do Supabase é de teste, restrito a endereços da equipe do projeto e atualmente a duas mensagens por hora. Isso não atende cadastro aberto de 50 professores por e-mail/senha. Não adicionar professores à equipe técnica para contornar a restrição.

Fonte: [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Pedir apenas identidade básica — nome, e-mail e perfil — sem acesso ao Gmail ou Drive. Configurar projeto Google, consentimento, URLs de retorno exatas, endereço de suporte e política de privacidade. Contas escolares podem precisar de liberação do administrador Workspace. Publicação e eventual verificação de marca devem ser testadas no subdomínio gratuito; domínio próprio não está automaticamente incluído. Não presumir que as regras genéricas de tokens de teste de sete dias se aplicam ao login básico: há exceção oficial para escopos de identidade.

Fontes: [Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [regras de audiência Google](https://support.google.com/cloud/answer/15549945).

Capacidade mensal de usuários não é limite de tentativas instantâneas. Testar primeira entrada de vários servidores no mesmo Wi-Fi, tratamento de HTTP 429 e repetição com espera; há limites de autenticação por IP/operação.

Fonte: [rate limits Supabase](https://supabase.com/docs/guides/auth/rate-limits).

## 5. Jornada do servidor e da direção

Servidor: abrir QR Code/link, entrar com Google, preencher nome, matrícula/identificador funcional se necessário, vínculo e dados do comprovante, informar dias declarados, anexar PDFs e enviar. Nome e data de nascimento não são identificadores seguros; não coletar nascimento ou CPF sem necessidade administrativa demonstrada.

O envio produz protocolo e estado “aguardando análise”, nunca crédito automático. O professor vê situação da análise, pendências, créditos aprovados, dias reservados, dias usufruídos, saldo disponível e histórico de alterações relevantes.

Se o envio exigir correção, a direção devolve com motivo e permite complementação. Créditos anteriores válidos permanecem preservados; complementação não reaplica o total já aprovado. Deve ser possível enviar documentação adicional do segundo turno depois do cadastro inicial.

Direção: visualizar pendências e lista de todos os servidores; buscar por nome/identificador; abrir cada cadastro e documento; aprovar ou devolver comprovantes; lançar crédito com justificativa; registrar folgas; cancelar ou corrigir lançamentos; exportar dados e acervo.

Auxiliares precisam de permissões explícitas: leitura, conferência ou lançamento, conforme atribuição. Evitar conceder administração total por conveniência.

Interface responsiva para celular, textos legíveis, navegação por teclado, rótulos claros e mensagens de erro acessíveis. Mostrar progresso de upload e distinguir rascunho, upload concluído e envio efetivado. Não depender de confirmação por e-mail ou WhatsApp na primeira versão.

## 6. Saldo e datas: regras centrais

Não usar um único campo de saldo livremente sobrescrito. Registrar eventos de crédito aprovado, reserva de folga, consumo, liberação de reserva e ajuste/estorno. O saldo é derivado desses eventos ou de projeção reconciliável.

Proposta de estados:

- Crédito: declarado, pendente, aprovado ou devolvido; somente aprovado entra no saldo.
- Folga: agendada/reservada, usufruída ou cancelada.
- Ajuste: identifica lançamento corrigido, responsável e justificativa.

Definições propostas:

`saldo do direito = créditos aprovados + ajustes líquidos - dias usufruídos`

`disponível para novos agendamentos = saldo do direito - dias reservados`

Exemplo: dez créditos, dois dias agendados e um usufruído resultam em nove de saldo, dois reservados e sete disponíveis. Quando um agendamento vira uso, o sistema libera a reserva e lança o consumo na mesma operação; não desconta duas vezes. Cancelamento libera reserva. Estorno de consumo devolve crédito mediante justificativa.

Alterações em datas e quantidades preservam o histórico. Reduzir crédito abaixo de dias já usados/reservados deve bloquear a mudança comum e abrir reconciliação explícita, sem produzir saldo negativo silencioso.

Aplicar autorização, validação e consistência transacional no servidor/banco. Duplo clique ou repetição após falha de rede usa chave de idempotência. Dois administradores tentando reservar o último dia não podem ambos concluir. Impedir sobreposição de afastamentos do mesmo vínculo.

Guardar datas de folga como datas de calendário, sem conversão acidental de fuso. Guardar instantes de auditoria em UTC e exibir no fuso apropriado. Não usar diferença entre datas como regra universal de dias debitados: calendário escolar, fins de semana, feriados, turnos e eventual meio período precisam de decisão administrativa. A proposta inicial é registrar datas e unidades de dias explicitamente, sem fracionamento até confirmação.

Não programar perda automática de saldo em 16/10/2028 nem limite universal de 30 dias. Dois anos de acesso ao portal, prazo de guarda de documentos e prazo de exercício do direito são assuntos diferentes.

O TSE informa compensação em dobro mediante comprovação e vincula o direito à duração do vínculo de trabalho; isso não confirma vencimento geral em dois anos. A rede de ensino/RH deve confirmar o procedimento aplicável antes de automatizar regras de concessão, utilização ou expiração.

Fonte: [orientação TSE](https://www.tse.jus.br/comunicacao/noticias/2023/Agosto/tem-direito-a-folga-por-servicos-prestados-nas-eleicoes-esclareca-suas-duvidas).

Em 16/10/2026, o segundo turno previsto para 25/10 ainda é futuro. Portanto, não exigir comprovante dele na abertura nem antecipar crédito por serviço futuro. Primeiro turno, treinamento e segundo turno não são um conjunto obrigatório e idêntico para todas as pessoas.

Fonte: [calendário e informações TSE 2026](https://www.tse.jus.br/eleicoes/cde-2026).

## 7. PDFs e segurança de dados

- Bucket privado; servidor só acessa documentos próprios, direção acessa conforme papel.
- Políticas de banco e armazenamento precisam negar acesso direto indevido, além de ocultar botões na tela.
- Caminhos aleatórios sem CPF/nome; metadados guardam nome original, tamanho, hash, proprietário, versão e estado.
- Aplicar limites de quantidade e tamanho fora do navegador; reservar orçamento para concorrência e conferir tamanho real ao finalizar. A implementação deve demonstrar que não é possível contornar cotas chamando APIs diretamente.
- Não tratar extensão/MIME como prova de segurança: conferir estrutura básica e integridade, lidar com PDFs corrompidos ou protegidos e não executar conteúdo incorporado.
- Não presumir antivírus gratuito ou enviar comprovantes a verificadores públicos externos. Validação de formato não certifica ausência de malware.
- Preservar originais, especialmente os assinados digitalmente; conferência humana é responsável pela validade administrativa do comprovante.
- Upload e gravação relacional não são uma transação única. Usar estados, finalização idempotente e limpeza de objetos abandonados. Um envio só aparece concluído depois de arquivos e registro consistentes.
- Links temporários de leitura são credenciais até expirar. Preferir acesso autenticado quando possível, expiração curta e ausência desses links nos logs.
- Chaves administrativas ficam em segredo do servidor, nunca em código público, frontend, mensagens ou exportações.
- Sessões administrativas com proteção reforçada, reautenticação em ações sensíveis e MFA na conta Google e contas de infraestrutura.
- Política de conteúdo, controle de dependências, consultas parametrizadas e proteção contra XSS/CSRF conforme a arquitetura. Não armazenar comprovantes em cache persistente ou service worker de computador compartilhado.
- Logs funcionais devem indicar autor, ação e momento sem copiar documentos, tokens ou informações pessoais desnecessárias. Administradores comuns não podem editar o histórico pela aplicação; operadores com acesso ao banco continuam sendo uma fronteira de confiança.

Referência: [acesso a arquivos privados Supabase](https://supabase.com/docs/guides/storage/serving/downloads).

## 8. LGPD e responsabilidade institucional

Dados de adultos continuam protegidos. Identificar a entidade responsável pelo tratamento, a finalidade, a base legal aplicável e quem opera o portal; não supor que um checkbox de consentimento resolve todo tratamento funcional de uma escola.

Coletar o mínimo necessário, informar acessos e finalidade, estabelecer contato para correções e incidentes, definir guarda conforme orientação administrativa e avaliar contratos/localização/transferência internacional dos provedores. Selecionar região de banco no Brasil, se disponível, não garante que todos os tratamentos e subprocessadores fiquem no Brasil.

Não apagar registros ao fim de dois anos sem definição institucional. Antes de eventual encerramento, exportar, conferir e transferir a guarda; documentos oficiais podem exigir política de temporalidade própria.

Fontes: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [guia ANPD para o poder público](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_tratamento_de_dados_pessoais_pelo_poder_publico).

## 9. Dois anos exigem operação e recuperação

Ter arquivos no serviço principal não é ter backup. Exportar banco não copia PDFs. Uma planilha de saldos também não permite restaurar contas, permissões, comprovantes e todo o histórico.

O Supabase recomenda exportações regulares e cópias fora do serviço para projetos Free. Sua documentação esclarece que backup do banco não inclui os objetos do Storage.

Fonte: [backups Supabase](https://supabase.com/docs/guides/platform/backups).

Plano proposto:

- Responsável técnico e substituto definidos; responsáveis institucionais com contas individuais e recuperação documentada.
- Contas de infraestrutura sob titularidade aprovada pela escola; não depender exclusivamente de uma conta pessoal sem sucessão.
- Exportação diária do banco quando houver movimentação e cópia incremental dos PDFs novos/alterados; execução automática só após configurar destino, segredos e alertas.
- Segunda cópia criptografada fora do provedor principal, em equipamento/pasta institucional com espaço e acesso confirmados. Chave de recuperação guardada separadamente por responsável autorizado.
- Versões do backup com retenção compatível com espaço e política institucional; não copiar o acervo inteiro diariamente indefinidamente.
- Manifesto com arquivos, hashes e associação aos registros; migrações e instruções de restauração junto do backup.
- Recuperação de usuários/sessões merece procedimento próprio; não presumir que uma exportação CSV restaure autenticação.
- Conferir execução de backup; teste de restauração antes da estreia e periodicamente, por exemplo a cada trimestre.
- Verificar saúde do portal, alertas do provedor, espaço, saída e contas. Monitoramento não transforma serviço Free em garantia contratual.
- Proposta inicial a acordar: perda máxima de até um dia de alterações e restauração em até um dia útil. São metas operacionais dependentes de responsável e backup, não SLA adquirido.
- Procedimento temporário para registrar solicitações durante indisponibilidade e reconciliar depois, sem lançamentos duplicados.

Manter acesso por dois anos demanda trabalho mesmo se as faturas forem zero. Alterações de planos, bloqueios, falhas de conta e vulnerabilidades devem ser acompanhadas. O projeto precisa conseguir exportar e migrar antes de atingir um limite ou encerrar o serviço.

## 10. Hospedagem e atualização

Cloudflare Pages é adequada para o frontend estático. Publica requisições estáticas gratuitas sem limite e 500 builds/mês no Free. Funções têm cotas diferentes, compartilhadas com Workers. PDFs privados não pertencem ao diretório público do site.

Fontes: [Pages: preços](https://developers.cloudflare.com/pages/functions/pricing/), [Pages: limites](https://developers.cloudflare.com/pages/platform/limits/).

O endereço pretendido é algo como `https://portalsaldoeleitoral.pages.dev`, sujeito à disponibilidade do nome. Ainda não foi registrado ou publicado. Não é necessário comprar domínio para o frontend; a configuração OAuth no subdomínio gratuito precisa ser validada.

Repositório privado, dependências fixadas, configuração reproduzível e homologação separada dos dados reais. Preview não deve escrever em produção por padrão. Releases devem ter migrações revisadas e procedimento de reversão; mudanças destrutivas exigem backup e estratégia compatível com versões anteriores.

Não há necessidade de IA, OCR, pagamentos, notificações WhatsApp, aplicativo nativo ou um backend separado por usuário. Realtime também não é requisito inicial: atualizar após ações e oferecer atualização da lista pode bastar. Se adotado, restringir assinaturas ao escopo autorizado e testar reconexão.

## 11. Modelo de dados inicial

Entidades lógicas; nomes finais e esquema serão definidos na implementação:

- Usuários e vínculo com identidade de autenticação.
- Servidores/vínculos funcionais, independentes da conta de login.
- Permissões administrativas e lista de acesso autorizado.
- Comprovantes/submissões, eleição/atividade e estado da análise.
- Documentos com chave de armazenamento e versões.
- Movimentações de crédito/débito/ajuste, com origem verificável.
- Agendamentos e dias específicos, com estado e unidades debitadas.
- Auditoria funcional.
- Controle de operações idempotentes e uploads pendentes.

Um usuário pode ser servidor e administrador sem perder a separação de permissões. Nome repetido não deve unir registros. Uma matrícula pode exigir combinação com vínculo/unidade; confirmar com a escola. Exclusão de conta não deve apagar automaticamente registros funcionais sem observar a política de guarda.

## 12. Critérios de aceite do MVP

1. Login Google real no endereço de teste; usuários fora da lista não obtêm acesso.
2. Servidor A não lê, altera ou baixa nada do servidor B, inclusive pela API direta.
3. Servidor não consegue alterar crédito, papel ou estado de aprovação.
4. Direção aprova comprovante e registra movimentação auditável, sem duplicar crédito em reenvio.
5. Upload de um PDF e de três separados; interrupção, repetição, arquivo inválido e tamanho excedido tratados corretamente.
6. Substituição/complementação preserva associações e documentos necessários; objetos abandonados não ocupam espaço indefinidamente.
7. Agendamento, consumo, cancelamento, estorno e correção mantêm as fórmulas de saldo.
8. Duplo clique, duas abas e dois gestores concorrentes não produzem saldo indevido.
9. Cadastro admite documentação posterior do segundo turno sem presumir serviço ainda não prestado.
10. Datas não mudam por fuso; regras de calendário e fracionamento refletem decisão da escola.
11. Desativação e troca de e-mail preservam histórico e bloqueiam operações indevidas.
12. Exportação completa inclui dados, documentos e manifesto; restauração em ambiente limpo é demonstrada.
13. Limites são testados com dados sintéticos equivalentes aos 50 usuários, incluindo acesso pelo mesmo IP, sem gerar carga abusiva nos serviços.
14. Uso no celular e por teclado validado; falhas de rede não exibem confirmação falsa de envio.
15. Segredos ausentes do frontend/repositório; implantação e rollback documentados.

Passar build ou mostrar telas não comprova esses critérios. Demonstração local com dados fictícios deve ser identificada como demonstração. Integrações reais, permissões e restauração precisam de evidência própria antes do uso oficial.

## 13. Sequência de desenvolvimento

1. **Fechar regras e medir documentos.** Confirmar campos, identificador, gestores, calendário, crédito, datas e política de guarda; medir amostras representativas sem expor dados pessoais.
2. **Prova de infraestrutura gratuita.** Validar conta sem cartão, login Google no domínio gratuito, upload/download privado e limites. Comparar A com B/C se volume ou pausa inviabilizar A. Não habilitar faturamento.
3. **Modelo e segurança.** Criar migrações, papéis, políticas de acesso e regras transacionais; verificar isolamento com usuários distintos.
4. **Fluxo completo.** Formulário, anexos, análise, crédito, agenda e extrato; tratamento de erro e idempotência.
5. **Recuperação e operação.** Exportação, backup, restauração, alertas e documentação para a escola.
6. **Piloto com dados controlados.** Dois ou três servidores e direção; corrigir problemas encontrados.
7. **Entrada dos 50.** Somente após aceite funcional, de segurança, recuperação e regras administrativas.

Não há estimativa séria de prazo fechado antes da prova de infraestrutura e do aceite das regras. Telas podem ficar prontas rapidamente; isso não mede prontidão para dois anos de uso.

## 14. Decisões ainda pendentes

- Tamanhos reais, quantidade de complementações e necessidade de preservar versões dos PDFs.
- Aceitabilidade operacional da pausa do Supabase; a preferência por acesso eventual a qualquer momento pesa contra esse comportamento.
- Se necessário, validação do B2 sem cartão: conta, uploads privados, saída, cotas e recuperação.
- Campos obrigatórios, matrícula/vínculo, lista dos e-mails e papéis da secretaria.
- Procedimento de crédito, reserva, consumo, cancelamento, correção e calendário escolar.
- Autoridade institucional sobre guarda, LGPD, prazo de uso e eventual encerramento.
- Destino, responsável e frequência dos backups; recuperação de contas e troca de gestão.

Decisão vigente: executar a opção A conforme o docs/planning/roadmap.md. A pausa foi aceita pelo responsável; tamanho real dos PDFs, segurança, restauração e condições da infraestrutura continuam sujeitos a aceite antes dos dados reais. As opções B/C ficam como contingência se surgir incompatibilidade comprovada, sem provisionamento antecipado.
