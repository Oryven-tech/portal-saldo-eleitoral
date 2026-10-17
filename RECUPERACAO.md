# Recuperação assistida do Portal Saldo Eleitoral

Este procedimento reconstrói dados e PDFs em um **novo projeto vazio**. Não é importação sobre a base em uso. A direção guarda o conjunto `.psebackup` e sua frase; o responsável técnico conduz a recuperação. O site continua com três seções.

## Preparação

1. Preserve todas as partes da cópia, a frase de recuperação e o acesso ao projeto anterior, se ainda existir. Não apague a origem nem a cópia para liberar espaço.
2. Use o repositório original, Node 24 e as dependências do `package-lock.json` (`npm.cmd ci`). Separe uma pasta contendo apenas as partes do mesmo backup. A leitura é feita parte a parte, com PDFs temporários na pasta privada de temporários do usuário.
3. Execute a inspeção local:

   ```powershell
   npm.cmd run recovery -- inspect "C:\Copias\PSE"
   ```

   A frase é solicitada no terminal e aparece somente como asteriscos. Se não aparecer nenhum asterisco ao colar, a entrada não chegou ao programa; use a opção de colar do terminal. Enter sem valor pede novamente a entrada. Espaços e acentos são preservados: cole a frase exata, sem aspas adicionais. Não a coloque em argumento, `.env`, mensagem ou repositório. O resumo mostra escola, referência, contagens, volume e envios interrompidos. Uma cópia parcial de servidor, saldo negativo, folgas sobrepostas, crédito sem análise compatível ou arquivos incompletos impedem a recuperação.

4. Crie um projeto Supabase Free dedicado e vazio, com senha guardada pelo responsável. Confirme as cotas disponíveis antes de começar. Não reutilize o projeto que atende a escola.
5. Aplique **em ordem** as migrações `202610160001_portal.sql` e `202610170001_recovery.sql`. Não reaplique a migração inicial em banco já existente. Confira RLS e bucket `evidence` privado.
6. Configure um administrador novo e conhecido, conforme o bootstrap do README. Seu e-mail deve ser diferente dos servidores da cópia. Não copie o administrador, os papéis ou identidades Auth do arquivo como autorização. O projeto precisa ter somente os administradores de bootstrap, sem servidores, lançamentos ou arquivos de outra operação.

## Aplicação no destino

```powershell
npm.cmd run recovery -- apply "C:\Copias\PSE" REFERENCIA_DO_NOVO_PROJETO
```

A referência é o identificador de 20 caracteres do novo projeto, não o nome da escola. O programa mostra a URL e exige digitar `RESTAURAR referencia`. A chave secreta/service_role **desse destino** é solicitada em seguida no terminal sem exibição. Nunca informar chave administrativa no chat, no navegador do portal ou em argumentos do comando. O programa não salva frase ou chave.

O comando segue esta ordem:

1. Abre e valida todas as partes localmente: criptografia, versões, hashes, referências, contagens e regras de saldo.
2. Confere no banco que o destino está vazio. Projeto ocupado é recusado; nenhum registro é sobrescrito.
3. Envia cada PDF para `_recovery/referencia-da-copia/id-do-documento.pdf`, sem sobrescrita. Nomes e caminhos presentes no pacote não definem caminhos locais ou do Storage.
4. Baixa cada objeto do destino e compara tamanho e SHA-256. Em uma retomada, objeto já existente só é aceito se for idêntico.
5. Grava todos os registros em uma transação. Falha de vínculo, saldo, quota, data ou arquivo deixa os registros sem aplicação parcial.

Se houver interrupção, execute novamente com **as mesmas partes, frase e destino**. Arquivos já enviados continuam privados e sem vínculo público até a conclusão. Uma aplicação concluída não é repetida. Se o conteúdo for diferente com o mesmo identificador, o destino recusa. Não remover arquivos ou tabelas para contornar uma recusa.

Não crie pastas manualmente no Storage para preparar o comando: o upload estabelece os caminhos. O painel pode criar objetos `.emptyFolderPlaceholder` de zero bytes para conservar pastas vazias. Esses marcadores contam como objetos fora do conjunto validado e impedem a recuperação; ausência visual de PDFs não prova bucket vazio. A limpeza de um ensaio exige conferência pelo painel/API, inclusive desses marcadores, sem apagar metadados de `storage.objects` diretamente por SQL.

## Conferência e liberação

- Compare contagens, créditos, folgas usadas/reservadas, saldo e amostras dos PDFs com a cópia e os registros administrativos. O retorno do comando não substitui essa conferência.
- Os servidores são recriados com novos acessos **inativos**. Em **Gerenciar acessos**, confira os e-mails e reative individualmente as pessoas autorizadas. Papéis administrativos históricos, usuários Auth, sessões e credenciais não são reaplicados. Cada pessoa fará novo login Google.
- Os IDs funcionais de servidores, créditos, folgas, envios e documentos são preservados. Os caminhos de arquivos mudam para a área de recuperação; os PDFs mantêm seus bytes e hashes. Histórico de atores é informativo, não autenticação de identidades antigas.
- Rascunhos de upload sem PDFs concluídos viram solicitações de correção, sem crédito, para permitir reenvio. O pacote original e o registro privado da recuperação preservam a referência anterior.
- Quotas técnicas não fazem parte do formato v1. A recuperação usa pelo menos 10 MB por servidor, até o volume já recuperado, limitado a 30 MB; o responsável deve revisar a margem antes de novas cargas. O orçamento total continua limitado a 700 MB e não substitui a conferência das cotas do provedor.
- Configure Google OAuth, hook, função de upload, URL de retorno e origem exata para o novo ambiente. Confira os dois perfis e as recusas de acesso antes de alterar o site em uso. Faça nova cópia após a conferência.
- Objetos temporários de tentativas recusadas podem consumir Storage. A limpeza exige conferir o identificador da recuperação e a ausência de vínculos; não apagar arquivos por nome ou idade sem essa reconciliação.

## Ensaio de 17/10/2026

O projeto `PSE Homologacao` (`fjhvkxxvkarilenfjzsy`) foi criado pelo responsável, no plano Free, em São Paulo. Não é o projeto da prévia. Foi conferido vazio antes de aplicar as migrações. Dados sintéticos foram reconstruídos com um PDF privado de 686 bytes, dois servidores, um crédito de três dias, uma folga usada e uma reservada: um dia disponível. A repetição manteve um único crédito. Nenhum servidor restaurado ficou autorizado.

Asserções no PostgreSQL hospedado confirmaram leitura apenas do próprio registro, bloqueio de restauração/edição direta para a sessão comum e revogação de leitura do PDF após desativação. A identidade sintética dessas asserções foi descartada por rollback. Isso verifica RLS com claims de teste; não equivale a dois logins Google reais nem a tentativas HTTP de download cruzado.

O leitor do pacote foi executado em Node 24 sobre uma cópia criptografada sintética. O envio ao Storage e a chamada de restauração hospedada foram conduzidos pelo painel, sem ler chave administrativa. O transporte completo do comando com credencial administrativa ainda precisa de ensaio pelo responsável antes de ser considerado operacionalmente homologado. Evidências e limites atuais estão em `EVIDENCIAS-MVP.md`.
