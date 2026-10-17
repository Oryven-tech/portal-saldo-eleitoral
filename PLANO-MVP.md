# Portal Saldo Eleitoral — plano de execução do MVP

Atualizado em 16/10/2026. Referência de continuidade: este plano e a análise de viabilidade no mesmo diretório.

Estado: desenvolvimento iniciado em 16/10/2026. Base React/TypeScript, demonstração isolada, adaptador Supabase, migração SQL/RLS e função de upload implementados localmente. Nenhuma conta Supabase/Google foi conectada e nenhuma publicação ou restauração real foi executada. Evidências e limitações em EVIDENCIAS-MVP.md.

## 1. Decisões vigentes

| Assunto | Decisão |
| --- | --- |
| Produto | Portal Saldo Eleitoral, para uma escola e aproximadamente 50 servidores |
| Frontend | React + TypeScript + Vite, hospedado no Cloudflare Pages |
| Backend | Supabase Auth, Postgres, Storage privado e Edge Functions onde necessárias |
| Login | Google para direção, secretaria e servidores |
| Admissão | Lista de e-mails previamente autorizados; sem cadastro público aberto |
| Infraestrutura | Planos gratuitos, sem vincular pagamento ou habilitar recursos pagos |
| Continuidade | Possível pausa do Supabase aceita; responsáveis e procedimento de reativação obrigatórios |
| Documentos | Um a três PDFs por conjunto inicial, com complementações controladas |
| Saldo | Crédito após análise, reservas, consumo e ajustes com histórico |
| Backup do MVP | Exportação completa para download, protegida, com validação e restauração controlada |
| Drive no MVP | Cópia manual do backup pela diretora, sem integração com a API |
| Uso oficial | Somente depois dos testes de acesso, saldo, upload e restauração |

O horizonte solicitado de acesso é até aproximadamente 16/10/2028. Não é regra automática de expiração do direito ou de eliminação dos documentos.

## 2. Objetivo e limites do MVP

Entregar um fluxo completo: servidor autorizado entra, preenche dados, anexa comprovantes; direção analisa, aprova créditos, registra folgas; servidor consulta somente seus próprios registros; direção gera cópia completa e consegue recuperar o conjunto por procedimento validado.

Inclui gestão de e-mails autorizados, estados de análise, complementação, busca, agenda por servidor, extrato, cancelamentos/ajustes, auditoria, relatório CSV, backup, verificação do pacote, restauração assistida, informação de indisponibilidade e guia de operação.

Ficam para depois: integração automática com Drive, notificações por e-mail/WhatsApp, OCR/IA, aplicativo nativo, funcionamento de escrita offline, várias escolas, regras legais automáticas, leitura automática de assinatura digital, processamento/compressão de originais e infraestrutura alternativa. O aplicativo não depende desses itens para completar o fluxo central.

Perfeição absoluta não é uma condição demonstrável. Os critérios abaixo convertem o objetivo em comportamento verificável e deixam riscos residuais explícitos.

## 3. Pausa e titularidade da infraestrutura

A documentação atual descreve pausa por pouca atividade de banco em uma janela de sete dias. Reativação: entrar no Supabase Dashboard, selecionar organização e projeto, clicar em “Resume project” e confirmar. Não é preciso recriar as tabelas ou reimportar dados quando a retomada normal funciona.

Não foi encontrada nessa documentação uma cota publicada de reativações. Isso não é confirmação contratual de reativações ilimitadas. O tempo de retomada também não deve ser prometido como instantâneo.

A janela atual de restauração pelo Studio é de até um ano após a pausa. Depois disso, a retomada padrão deixa de ser assegurada; não interpretar “um ano” como política de guarda ou prazo para agir.

Fonte: [Supabase — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

Operação proposta:

1. Organização dedicada à escola, sem expor projetos pessoais ou de terceiros.
2. Diretora/responsável institucional e responsável técnico com contas individuais autorizadas; não compartilhar senha da conta Supabase.
3. Conferir no painel quais papéis disponíveis no Free permitem reativar e que outros poderes concedem. Não presumir existência de um papel limitado a “reativar”.
4. MFA e recuperação de contas de infraestrutura configurados com responsáveis identificados.
5. Diretora recebe guia com link do projeto, passos e contatos; pessoa substituta definida.
6. Após reativar, conferir login, leitura de um cadastro e abertura de um PDF; se falhar, registrar incidente e acionar o técnico.
7. Alertas de pausa devem chegar a responsáveis que efetivamente os acompanhem.

O frontend no Pages pode continuar acessível durante uma pausa, mas o login, os dados e os anexos dependentes do Supabase podem ficar indisponíveis. A página pública terá orientação genérica e contato institucional aprovado, sem expor dados de servidores. Não diagnosticar toda falha de rede como pausa.

Não colocar token da Management API nem senha de infraestrutura no frontend para criar botão público de reativação. O acesso “Direção” do portal não equivale ao acesso administrativo ao Supabase.

Referência: [controle de acesso do Supabase](https://supabase.com/docs/guides/platform/access-control).

## 4. Admissão e primeiro acesso

### Inicialização da diretora

O responsável técnico registra o e-mail Google da primeira diretora por procedimento administrativo de configuração, fora de formulário público. A permissão inicial é concedida explicitamente; nunca atribuir administração ao primeiro visitante que conseguir entrar.

A diretora não precisa já existir em Auth para que seu e-mail conste na lista autorizada. Sua conta de autenticação será criada no primeiro login Google permitido.

### Entrada dos servidores

1. Diretora pede o endereço da conta Google que cada pessoa usará.
2. Em “Acessos autorizados”, registra nome de referência, e-mail e identificador funcional quando necessário. Pode importar uma lista CSV validada, com prévia e detecção de duplicados.
3. O servidor abre o link/QR Code e escolhe “Continuar com Google”.
4. Google comprova o controle da conta. O backend verifica que aquele endereço está autorizado.
5. A criação é permitida; o servidor confirma os campos do cadastro e preenche o formulário.
6. Nos próximos acessos, o sistema abre seu painel e preserva o vínculo com o mesmo registro funcional.

E-mail digitado pela diretora é autorização administrativa; login Google comprova controle da conta. Nenhum deles, isoladamente, comprova vínculo funcional: a conferência da lista é responsabilidade da escola.

Normalizar espaços e comparação de e-mail de forma consistente, sem remover pontos ou aliases para fundir contas automaticamente. Google Workspace pode usar endereço que não termina em gmail.com. Nome, CPF, data de nascimento e trecho de URL não substituem autenticação.

Usar “Before User Created” para impedir criação fora da lista, com concessões mínimas à função. A criação deve falhar de forma segura se a lista não puder ser consultada. RLS e operações de servidor verificam autorização ativa mesmo para usuários já cadastrados; revogação não depende apenas de sair do navegador.

Fontes: [hook de criação](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook), [disponibilidade dos hooks](https://supabase.com/docs/guides/auth/auth-hooks).

Não expor a lista de autorizados por endpoint anônimo. Não exibir publicamente se determinada pessoa pertence à escola. Retorno de acesso negado será genérico com instrução para procurar a direção.

Troca de e-mail exige conferência, transferência explícita do vínculo e bloqueio da identidade anterior quando aplicável. O registro do servidor terá ID próprio, independente do auth.users.id, para que troca de conta não crie ou perca saldo.

Não haverá código compartilhado para consulta dos saldos. Não pedir senha Google no portal; o login redireciona ao provedor oficial.

## 5. Papéis e permissões

| Papel | Consulta | Alteração |
| --- | --- | --- |
| Servidor | Seu cadastro, documentos, análise, agenda e extrato | Rascunho e complementação autorizada; nunca saldo ou papel |
| Secretaria de consulta | Registros autorizados da escola | Sem movimentação financeira de dias |
| Secretaria gestora, se aprovada | Registros autorizados da escola | Análise/lançamentos conforme concessão explícita |
| Diretora | Todos os registros funcionais da escola | Acessos, análise, crédito, folgas, ajustes e exportação completa |
| Responsável técnico | Infraestrutura conforme função | Migrações, recuperação técnica e configuração; acesso administrativo auditável |

O MVP pode começar apenas com servidor e diretora. Secretaria só entra quando os poderes forem definidos; não ampliar o papel por conveniência.

Restauração é uma capacidade separada de gestão cotidiana. No MVP, diretora pode selecionar e validar pacote, examinar a prévia e solicitar recuperação; a aplicação em produção é assistida pelo responsável técnico após ensaio em homologação. Não oferecer substituição irrestrita de toda a base a qualquer auxiliar.

Papéis ficam em estrutura protegida e não em user_metadata editável. Impedir autoelevação, alteração da própria lista de autorização e remoção acidental do último administrador operacional. Chaves service_role/secret são exclusivas de ambiente de servidor.

## 6. Telas e estados

1. **Entrada:** marca, explicação breve, “Servidor”, “Direção”, login Google, privacidade e suporte.
2. **Primeiro acesso:** cadastro mínimo, confirmação de vínculo, orientação de documentos.
3. **Formulário:** campos, arquivos, progresso, rascunho e revisão antes de enviar.
4. **Meu saldo:** aprovados, usados, reservados e disponíveis; próxima folga e situação da análise.
5. **Meu histórico:** documentos, observações destinadas ao servidor, datas e movimentações.
6. **Painel da direção:** pendências, busca, lista e filtros; números com significado explícito.
7. **Ficha do servidor:** dados, documentos, decisões, crédito e agenda.
8. **Registrar folga/ajuste:** datas, quantidade, justificativa, resumo do efeito e confirmação.
9. **Acessos:** inclusão, importação, desativação e troca de e-mail.
10. **Relatórios e backup:** CSV de consulta, pacote completo, validação de pacote e orientação de restauração.
11. **Ajuda operacional:** pausa, contato, exportação e recuperação.

Carregamento, vazio, sem autorização, arquivo indisponível, rede interrompida, limite atingido e sessão expirada têm estados próprios. Nunca mostrar “enviado” antes da finalização no servidor. Layout para celular, teclado e leitores de tela; datas no padrão brasileiro e mensagens claras.

Notas internas da direção não aparecem automaticamente ao servidor. Decisões, justificativas administrativas comunicáveis e observações internas precisam de campos e permissões distintos.

## 7. Dados mínimos e esquema lógico

Campos candidatos: nome completo, identificador funcional/vínculo se exigido, e-mail de acesso, atividade eleitoral, datas da atividade quando relevantes, dias declarados e documentos. Data de nascimento, telefone, CPF e endereço não entram por padrão; escola deve justificar eventual necessidade.

Entidades propostas:

| Entidade | Responsabilidade |
| --- | --- |
| app_settings | Identificação da escola e regras aprovadas |
| staff_members | Registro funcional estável, independente do login |
| access_allowlist | E-mails, papel autorizado e estado de admissão |
| user_memberships | Identidade autenticada e vínculo com servidor/papel |
| submissions | Declaração do servidor, estado e decisões de análise |
| documents | Objeto privado, proprietário, origem, tamanho, hash, versão e estado |
| credit_entries | Créditos e ajustes com origem e unidades |
| leave_bookings / leave_days | Datas agendadas, reservadas, usufruídas e canceladas |
| audit_events | Autor, ação, momento, motivo e referência aos registros |
| operation_keys | Idempotência de ações que não podem duplicar |
| upload_jobs | Reserva de espaço e estado de finalização de uploads |
| backup_jobs / restore_jobs | Estado e metadados das operações de recuperação |

Nomes são proposta; a migração decidirá a separação final. Evitar redundância de saldo sem reconciliação. Usar IDs gerados com mecanismo apropriado e integridade referencial. Nome homônimo não une cadastros.

Manter código, migrações, funções, políticas RLS e configuração sem segredos versionados no repositório. Não usar localStorage como fonte oficial de cadastro, anexos ou saldo. Para computador compartilhado, não manter rascunho sensível persistente no navegador por padrão.

## 8. Crédito, agendamento e consumo

Estados da submissão: rascunho, enviada, em análise, correção solicitada e aprovada. A revisão do comprovante controla a concessão; receber PDF não cria crédito.

Estados de folga: agendada/reservada, usufruída e cancelada. No MVP, direção registra e confirma; servidor consulta. Pedido de folga pelo servidor pode ser adicionado depois se a escola solicitar.

Fórmulas:

`saldo do direito = créditos aprovados + ajustes líquidos - dias usufruídos`

`disponível = saldo do direito - dias reservados`

Cada reserva/uso está associado ao servidor e, quando necessário, à origem do crédito. Aprovação repetida da mesma origem não concede crédito novamente. Complementação de um segundo turno adiciona apenas o crédito novo aprovado.

Operações transacionais no Postgres, com bloqueio apropriado por servidor, permissões explícitas e chave de idempotência. Validar autorização na operação, inclusive em RPCs e funções SECURITY DEFINER; limitar privilégios, fixar search_path e evitar RLS recursiva ou contornável.

Casos obrigatórios:

- Reserva reduz o disponível, sem antecipar consumo.
- Confirmar uso retira a reserva e registra consumo atomicamente.
- Cancelar reserva libera disponibilidade.
- Estornar uso exige motivo e referência ao registro original.
- Alterar data/quantidade registra revisão e recalcula sem duplicar débito.
- Crédito não pode ser reduzido abaixo dos compromissos existentes por edição comum; abrir reconciliação explícita.
- Impedir sobreposição indevida e consumo além do disponível, inclusive com duas abas/duas pessoas.
- Um lançamento retroativo terá política aprovada e ficará identificado; não permitir para contornar saldo.

Proposta inicial: dias inteiros e datas explícitas selecionadas, com uma unidade por data, sujeitos à confirmação da escola. Não presumir que um intervalo corrido debita todos os dias, nem que feriados nacionais representam o calendário escolar completo. Fracionamento, turnos, limite de afastamentos simultâneos e regras de vínculo precisam de definição antes de automatização.

Datas funcionais são date; auditoria usa instante em UTC e apresentação no fuso apropriado. Não expirar crédito automaticamente em dois anos ou limitar universalmente a 30 dias. Conferir procedimento com RH. Documentação complementar após 25/10/2026 deve ser possível; não exigir comprovante de atividade futura.

Referências já analisadas: [TSE — folgas](https://www.tse.jus.br/comunicacao/noticias/2023/Agosto/tem-direito-a-folga-por-servicos-prestados-nas-eleicoes-esclareca-suas-duvidas), [TSE — calendário 2026](https://www.tse.jus.br/eleicoes/cde-2026).

## 9. Upload e orçamento do Storage

O plano Free publica 1 GB de armazenamento; é necessário conferir uso agregado da organização, objetos existentes e franquias efetivas do projeto. Não confundir com os 500 MB do banco ou com o limite por arquivo.

Orçamento inicial de produto:

- Até aproximadamente 500 MB para o conjunto inicial dos 50 servidores.
- Até aproximadamente 200 MB para complementações, substituições e objetos em trânsito.
- Aproximadamente 300 MB de margem operacional; não prometer esse espaço a novos envios.
- Limite individual provisório: até três PDFs somando 10 MB no envio inicial. Exceções só com análise do orçamento global. A medição de amostras decide se essa proposta é aceitável.

No complemento, o histórico retido também ocupa espaço. Não adotar “10 MB por envio” sem limite acumulado. Dimensionar cota por servidor, por conjunto documental e globalmente. Se documentos reais exigirem mais, registrar incompatibilidade e revisar a decisão antes do lançamento, sem apagar originais para disfarçar falta de espaço.

Fluxo: criar intenção autorizada, reservar espaço, transmitir por mecanismo com limites efetivos, conferir objeto real, finalizar documento/submissão e liberar a reserva. Inserções diretas e URLs de upload não podem contornar quantidade, proprietário ou cota. O mecanismo exato precisa de prova com o Supabase; nunca confiar apenas em Content-Length ou tamanho declarado pelo cliente.

Objetos finalizados são imutáveis; substituição cria versão e vínculo. Isso favorece auditoria e snapshots. Limpeza automática somente de uploads temporários comprovadamente abandonados, com política e margem para retomada; documentos aprovados não entram nessa limpeza.

Validar PDF, tamanho real e integridade; extensão não é prova. Decidir tratamento de arquivos protegidos/corrompidos. Nenhuma validação básica certifica ausência de malware. Sem envio de documentos a scanners públicos externos. Preservar PDF original, especialmente se assinado. Caminhos de armazenamento não expõem nomes/CPF e nunca são usados como autorização.

Download autenticado ou URL curta temporária após verificação de acesso; credenciais temporárias não entram em logs. Conferir CORS sem tratá-lo como barreira de autorização. Não colocar PDFs no diretório público do Pages.

Fonte: [limites e preços Supabase](https://supabase.com/pricing).

## 10. Backup escolhido para o MVP

### 10.1 Três produtos diferentes

**Relatório de consulta:** CSV e extrato imprimível para a direção consultar fora do portal. Proteger CSV contra fórmulas executáveis e deixar data da geração visível. Esse relatório não restaura o sistema.

**Backup funcional completo:** dados estruturados, documentos originais e associações necessários para reconstruir a aplicação. Será gerado pelo acesso da direção, com proteção e verificação. Este é o recurso de produto do MVP.

**Recuperação técnica:** migrações, políticas, configuração, procedimento de autenticação e exportação técnica do banco quando pertinente, sob responsabilidade técnica. Complementa o backup funcional; não é um arquivo SQL para a diretora executar.

O Supabase recomenda backup externo para o Free e esclarece que o backup de banco não contém os objetos do Storage.

Fonte: [Supabase — backups](https://supabase.com/docs/guides/platform/backups).

### 10.2 Conteúdo e proteção

Pacote versionado contendo:

- Identificador do backup, escola, instante de referência, versão do formato e esquema.
- Dados funcionais, vínculos lógicos, autorizações exportadas para referência, análises e histórico.
- Créditos, reservas, usos, cancelamentos e ajustes.
- PDFs originais de todas as versões necessárias à política de guarda.
- Manifesto com arquivos, hashes, tamanhos, contagens e associações.
- Relatório de pendências, caso existam; backup incompleto nunca será rotulado como completo.
- Instrução de recuperação e indicação das configurações externas que precisam ser refeitas.

Excluir senhas, access/refresh tokens, chaves service_role, credenciais Google, segredos MFA, cookies e SQL executável. Não restaurar permissões administrativas automaticamente por confiar no conteúdo do pacote.

Usar formato criptografado com biblioteca mantida/algoritmos padronizados, senha/frase de recuperação forte e teste de compatibilidade. Chave/senha não fica junto do arquivo; responsáveis autorizados guardam recuperação separadamente. Não criar algoritmo de criptografia próprio. Perda da chave pode inviabilizar recuperação; um hash sozinho detecta divergência, mas não comprova autenticidade do remetente.

MVP deve permitir leitura dos relatórios de consulta sem depender da disponibilidade do Supabase, mantendo o backup completo protegido. Não apresentar backup criptografado como arquivo legível sem aplicativo/ferramenta compatível: entregar ferramenta ou procedimento de recuperação testado e versionado.

### 10.3 Geração consistente e sem duplicar o acervo no Storage

Não criar um segundo ZIP permanente dentro do mesmo bucket de 1 GB. Gerar snapshot lógico consistente do banco e manifesto; baixar originais imutáveis por lotes, com controle de acesso, repetição e conferência de hashes. Impedir que limpeza/removal remova arquivos referenciados por um backup em geração.

Uma captura não pode misturar saldo de um momento com documentos e decisões de outro. Usar snapshot transacional dos dados e referências versionadas; se for necessário breve modo de manutenção, aplicá-lo no servidor, com prazo, retomada e indicação clara. Não bloquear toda a escola durante um download demorado sem necessidade.

Validar geração em computador e celular. PDF já costuma ser comprimido; evitar trabalho de compressão pesada no Edge. Se um pacote único exceder memória/limites do navegador, usar partes de tamanho controlado com índice, contagem total e identificação comum. “Completo” exige todas as partes válidas. O tamanho de lote será determinado por medição, sem prometer antecipadamente 500 MB de ZIP em qualquer celular.

Transferência iniciada no navegador não prova arquivo salvo. Distinguir estados: snapshot criado, partes geradas/transferidas, confirmação de guarda e pacote validado. A verificação por reabertura do arquivo/pacote é evidência mais forte que iniciar download.

### 10.4 Frequência, cópias e franquia de saída

No MVP, exportação será manual: após carga inicial, antes de manutenção relevante, depois de grandes lotes de alterações e pelo menos semanalmente em uso ativo, respeitando orçamento de saída. Interface informa backup desatualizado, alterações desde o último snapshot e resultado da última validação.

A geração manual não oferece recuperação garantida das alterações posteriores ao último arquivo guardado. Sem rotina diária confirmada, não prometer perda máxima de 24 horas. Meta provisória semanal implica potencial de até sete dias ou mais se a rotina for descumprida; o risco deve ser aceito ou a rotina deve ser melhorada antes do uso oficial.

Separar alterações pequenas do banco e novos PDFs de documentos já copiados. Se o acervo crescer, implementar cadeia incremental com backup-base, deltas e teste de montagem, ou revisar frequência dentro da franquia. Não introduzir incrementais sem reconstrução testada.

Conta conservadora: acervo de 500 MB baixado integralmente quatro vezes no mês consome aproximadamente 2 GB de saída, além das consultas e aberturas normais. Dez cópias completas consomem aproximadamente 5 GB. Fazer backups grandes repetidos no mesmo dia pode comprometer disponibilidade por franquia. Não depender da franquia de cache para prometer capacidade de documentos privados.

Guardar uma cópia local protegida e outra fora do equipamento, por exemplo pasta privada no Drive institucional com espaço disponível. Política inicial: manter duas cópias completas válidas recentes e versões adicionais conforme espaço/temporalidade aprovada, sem excluir a única cópia utilizável. A política externa de retenção é distinta de apagar dados oficiais do portal.

### 10.5 Google Drive

Entrar com Google não concede acesso ao Drive. Uma integração precisaria de permissão adicional, habilitação da API e tratamento de quota, revogação, erros e eventual recuperação de token para operação sem usuário presente.

Decisão do MVP: diretora baixa o pacote e pode colocá-lo manualmente numa pasta privada. Isso entrega cópia externa sem acrescentar acesso ao Drive no login de professores ou custódia de refresh token do Drive no backend.

Evolução possível: botão exclusivo da direção “Conectar Drive para backups”, consentimento separado, escopo mínimo drive.file para arquivos criados/selecionados com o app e confirmação de upload real. Não pedir acesso ao Drive inteiro. Isso será nova etapa com critérios próprios; não é requisito da primeira entrega.

Fonte: [Google — escopos do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

### 10.6 Importação e restauração

Importar backup antigo pode apagar mudanças posteriores se houver substituição. Por isso não implementar botão de sobrescrever tudo sem diagnóstico e confirmação.

Fluxo do MVP:

1. Diretora autorizada seleciona as partes e informa a frase de recuperação localmente conforme o formato escolhido.
2. Validador confere formato suportado, integridade, origem esperada, contagens, referências, limites e presença de todos os PDFs.
3. Exibir prévia: data do backup, servidores, lançamentos, arquivos, tamanho e diferenças esperadas. Não alterar dados nessa fase.
4. Rejeitar conteúdo incompatível, duplicados contraditórios, arquivos gigantes/compactação abusiva, caminhos externos e esquema inesperado. Não executar SQL, HTML, scripts ou instruções trazidas pelo pacote.
5. Técnico ensaia restauração em ambiente separado; autenticação administrativa desse ambiente já deve estar configurada de forma independente.
6. Garantir espaço temporário e backup atual antes de eventual alteração de produção. Se duplicar PDFs exceder 1 GB, usar projeto de recuperação vazio/fluxo técnico planejado, nunca apagar primeiro para abrir espaço.
7. Aplicar por operação retomável, idempotente e auditável; só publicar conjunto validado. Falha parcial não apresenta sucesso nem libera acervo inconsistente.
8. Reconstruir vínculos de login com identidades verificadas. auth.users.id de um projeto não é assumido como portátil para outro. Usuários fazem login novamente; sessões não são restauradas.
9. Conferir saldos e contagens, abrir documentos, comparar hashes e testar login de servidor/direção.
10. Registrar resultado e revisão técnica; liberar operação após aceite.

A prévia/validação pode existir no painel da diretora. Aplicação em produção será assistida no MVP; autoatendimento destrutivo fica fora. Uma recuperação de desastre ainda depende de infraestrutura funcionando ou de novo projeto configurado. Se o projeto inteiro morrer, o botão do portal antigo não recria Auth, chaves, OAuth e políticas sozinho.

Restauração não será fusão livre entre bases. O MVP restaura um snapshot coerente; reconciliar alterações posteriores ou dados externos exige procedimento separado. Ensaiar atualização de formato e preservar ferramenta compatível com os backups guardados.

## 11. Segurança e governança

- RLS em todas as tabelas acessíveis e políticas específicas no Storage; teste de API direta, inclusive tentativas de listar arquivos.
- Papéis e autorização ativa conferidos por operação; reautenticação/proteção adicional em exportação completa e recuperação.
- MFA em contas Google administrativas e de infraestrutura; avaliar TOTP adicional do Supabase para operações privilegiadas se necessário, com recuperação testada.
- Sem conta de infraestrutura compartilhada; acesso técnico separado do acesso funcional do portal.
- Lista de e-mails, comprovantes e backups tratados como dados privados.
- Sem segredos em VITE_*, repositório, logs, exportações ou mensagens. Configurar URLs OAuth exatas e ambiente de preview separado.
- Entrada validada, saída escapada, consultas parametrizadas e políticas de conteúdo adequadas; retorno OAuth e mudanças de sessão testados.
- Logs de auditoria funcionais preservados e inacessíveis para edição comum. Acesso direto de operador ao banco continua fronteira de confiança; não prometer inviolabilidade absoluta.
- Originais não enviados a modelos de IA, analytics ou serviços públicos de inspeção.
- Coleta mínima, aviso de privacidade compreensível e contato institucional para correção/incidentes.
- Base legal, responsável pelo tratamento, contratação/termos dos provedores e eventual transferência internacional avaliados pela instituição.
- Dois anos de uso não autorizam exclusão automática. Temporalidade e encerramento serão definidos pela escola/rede.

Fontes: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [ANPD — poder público](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_tratamento_de_dados_pessoais_pelo_poder_publico).

## 12. Infraestrutura e ambientes

Usar o checkout original desta pasta. Na implementação, verificar instruções locais e existência de Git antes de criar estrutura. Não partir de ZIP ou de cópia não rastreada. Não há necessidade de nova worktree numa pasta ainda sem implementação.

Desenvolvimento com dados sintéticos; produção sem dados de teste. Preferir Supabase local para desenvolvimento quando Docker e recursos estiverem disponíveis; caso contrário, projeto Free de homologação separado, sujeito a cotas disponíveis. Não habilitar branching pago. Preview do Pages nunca herda escrita em produção por conveniência.

Uma organização dedicada à escola facilita separar limites e poderes. Configurar região, Auth Google, allowlist, RLS, bucket privado, limites, funções, secrets e URLs antes do piloto. Conferir versão das dependências e limites vigentes na implantação.

Interface pode chamar APIs Supabase com chave publicável e RLS. Operações privilegiadas e fluxos que exigem coordenação ficam em RPCs/Edge Functions com autorização explícita. Não criar servidor permanente ou uma função por professor. Identificar limitações de memória, duração e tráfego antes de implementar exportação.

Repositório privado, arquivo .env.example sem credenciais, configurações reproduzíveis e documentação de publicação/rollback. O subdomínio pretendido é portalsaldoeleitoral.pages.dev, sujeito à disponibilidade; ainda não reservado.

## 13. Etapas de implementação e aceite

Executar uma etapa por vez, registrar evidência e atualizar este arquivo. Não confundir aprovação de etapa com autorização para apagar dados ou ativar faturamento.

| Etapa | Entrega | Aceite mínimo | Retorno seguro |
| --- | --- | --- | --- |
| 0 — baseline e regras | Estrutura do repositório, decisões, dados sintéticos e checklist administrativo | Ambiente identificado; campos e regras pendentes registrados; amostras de tamanho medidas sem expor conteúdo | Sem dados reais; reverter arquivos da etapa preservando alterações prévias |
| 1 — infraestrutura e login | Pages de teste, Supabase de teste, Google e bootstrap da diretora | Diretora e servidor entram; estranho é negado; sessão e logout funcionam; URLs corretas | Voltar deployment; desabilitar fluxo de entrada de teste sem mexer em produção |
| 2 — banco e permissões | Migrações, RLS, vínculos e papéis | Usuário A não acessa B; não há autoelevação; revogação funciona pela API | Migração compatível/reversão ensaiada; sem migração destrutiva não planejada |
| 3 — formulário e PDFs | Rascunho, envio, análise e complemento | Um/três PDFs; cotas reais; falha e retomada; sem objetos públicos ou confirmação falsa | Desabilitar novos envios; preservar objetos finalizados e reconciliar pendências |
| 4 — crédito e folgas | Aprovação, reserva, uso, cancelamento e extrato | Fórmulas, concorrência, idempotência, datas e ajustes corretos | Bloquear novas movimentações; corrigir por estorno, preservando histórico |
| 5 — backup e recuperação | Relatórios, exportação protegida, validador e restauração assistida | Pacote completo, corrompido, parcial e versão inválida; restauração em ambiente limpo com PDFs e saldos corretos | Manter base atual; nenhum restore em produção antes do ensaio |
| 6 — operação e piloto | Ajuda, privacidade, rotina de backup e ensaio com 2–3 servidores | Uso em celular, primeiro acesso no Wi-Fi, suporte e responsável por pausa; revisão dos incidentes | Suspender novas entradas e manter consulta/registro temporário conforme incidente |
| 7 — publicação para o grupo | Versão aprovada e entrada dos aproximadamente 50 | Checklists encerrados, backup inicial validado e aceite da diretora | Deployment anterior compatível; dados e migrações seguem procedimento próprio |

SLA não foi contratado. Meta de retorno após incidente será definida com quem de fato prestará suporte; não prometer atendimento imediato se ninguém estiver disponível.

## 14. Matriz de testes obrigatórios

### Identidade e acesso

- Primeiro administrador somente por bootstrap explícito.
- Autorizado ainda sem conta entra; e-mail não autorizado não cadastra/consulta/envia.
- Login com outra conta Google, sessão expirada e erro de callback tratados.
- Conta revogada perde acesso mesmo com token ainda válido para Auth.
- Troca de e-mail preserva servidor e saldo sem liberar conta anterior indevidamente.
- Servidor/direção/secretaria respeitam suas permissões, inclusive via RPC/API/Storage direto.
- Vários acessos pelo mesmo IP não geram confirmação falsa ou repetição descontrolada ao receber HTTP 429.

### Documentos

- Um PDF e três PDFs; arquivo no limite e acima dele; MIME/estrutura inválidos; nome repetido.
- Cota por servidor e global sob envios simultâneos; tentativa de mentir tamanho e chamar upload diretamente.
- Upload parcial, internet interrompida, envio repetido e complementação depois da aprovação.
- Objeto privado, URL expirada, usuário errado e arquivo removido/indisponível.
- Original assinado preservado; limpeza não remove documento aprovado nem referência de backup ativo.

### Saldo e datas

- Crédito pendente não disponível; aprovação repetida não duplica; complemento não reaplica crédito antigo.
- Reserva, consumo, cancelamento e estorno mantêm as fórmulas.
- Duas abas/gestores no último dia; reenvio após timeout; sobreposição.
- Alteração de crédito abaixo do já comprometido exige reconciliação.
- Datas em virada de dia/mês/ano não mudam por fuso; calendário segue regra aprovada.

### Backup e restauração

- Exportação durante alterações concorrentes mantém snapshot coerente.
- Partes ausentes, senha errada, hash incorreto, corrupção e esquema incompatível são rejeitados.
- Arquivo tenta modificar papéis, executar conteúdo, atravessar caminhos ou exceder limites: nada é aplicado.
- Pacote cabe no ambiente suportado; falha de download não é anunciada como cópia guardada.
- Restaurar em ambiente vazio mantém referências, versões, contagens, hashes e saldos.
- Novo Auth exige vínculo/novo login, sem reaproveitar sessões ou conferir poder pela cópia antiga.
- Falha no meio da recuperação é retomável ou abortada sem apresentar base parcial como restaurada.
- Backup antigo não sobrescreve alterações atuais sem prévia, proteção e procedimento assistido.

### Operação

- Celular, desktop, teclado, labels e contraste.
- Indisponibilidade sem vazamento de dados e sem afirmar causa não confirmada.
- Exportações dentro do orçamento de saída; Storage e cotas monitorados.
- Publicação, migração, reversão, recuperação de conta e troca de gestão documentados.

Testes unitários serão usados para regras de saldo e validação; integração real para RLS/Auth/Storage/RPC; testes de interface para jornadas centrais. Mock não comprova isolamento real nem restauração. Build/typecheck não bastam para aceite.

## 15. Pendências de entrada e registro de evidências

Informações necessárias antes de usar dados reais:

1. Escola/rede e responsável institucional; papéis da secretaria.
2. E-mail da diretora para bootstrap e lista dos demais autorizados; coletar por canal apropriado, sem publicar no repositório.
3. Campos e identificador funcional; regras de crédito, datas, fracionamento e correções aprovadas.
4. Tamanhos de PDFs representativos e frequência provável de complementação.
5. Responsável e substituto por reativação, suporte e recuperação de contas.
6. Destino das cópias, responsáveis pela chave de backup, frequência e prazo de guarda.
7. Contas/projetos Free disponíveis e liberação OAuth no subdomínio escolhido.

Essas pendências não impedem estrutura, modelo proposto e testes sintéticos; impedem afirmar prontidão institucional e liberar dados reais.

| Marco | Estado | Evidência |
| --- | --- | --- |
| Análise e arquitetura | Concluído | ANALISE-DE-VIABILIDADE.md; escolha expressa neste chat |
| Plano de execução | Concluído | Este arquivo |
| Etapa 0 | Parcial | Git local, dependências fixadas, fontes licenciadas e regras sintéticas; dados institucionais e amostras reais pendentes |
| Etapas 1–4 | Código preparado; aceite real pendente | Telas, adaptador, SQL/RLS e upload escritos; testes locais e de navegador não substituem Supabase real |
| Etapa 5 | Parcial | Exportação protegida e verificador testados; recuperação em outro projeto ainda não implementada/homologada |
| Etapas 6–7 | Pendentes | Revisão de celular/desktop local executada; piloto institucional e publicação ainda não realizados |
| Backup funcional restaurado | Pendente | Pacotes gerados/validados com dados sintéticos; nenhum restore de desastre realizado |
| Uso oficial | Não liberado | Depende de aceite funcional, segurança, recuperação e regras |

Atualização de 16/10/2026: login Google real dos dois perfis, upload nos dois formatos previstos, download privado com conferência dos bytes, aprovação, solicitação de correção, reserva e cancelamento validados no Supabase dedicado com dados sintéticos. Saldo final do ensaio: 2 disponíveis e 0 reservados. Não encerra o gate de isolamento completo nem recuperação. Pages preparado na conta Cloudflare com login independente do PSE; publicação da prévia aguarda autorização final. Ver EVIDENCIAS-MVP.md para pacote, testes e limitações atuais.

Ao concluir cada etapa, registrar versão/commit, ambiente, comandos e testes executados, resultado, limitações, rollback e próxima etapa. Não registrar segredos nem dados pessoais reais nas evidências versionadas.

Continuação: escola identificada como Escola Estadual Edson Alves Pereira. Projeto Free dedicado em São Paulo criado pelo responsável; migração aplicada, administrador inicial confirmado, hook ativo e função de upload publicada. Diretora definitiva e política institucional pendentes. Interface simplificada para três seções da direção. Google OAuth e configuração pública local concluídos; primeiro login real da direção confirmado. Validação JWT adaptada a ECC com autorização explícita e recusa real de token inválido confirmada. Próxima ação: validar contas de servidores, isolamento real, upload e recuperação; preparar publicação no Pages antes de liberar dados reais. Testes locais usam dados fictícios. Ver EVIDENCIAS-MVP.md para resultados e limitações.
