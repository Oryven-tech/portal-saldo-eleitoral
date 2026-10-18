# Migração para Oryven Tech

Em 18/10/2026, o repositório `williandevbr/portal-saldo-eleitoral` foi transferido para
[`Oryven-tech/portal-saldo-eleitoral`](https://github.com/Oryven-tech/portal-saldo-eleitoral) por solicitação do proprietário.
A visibilidade permanece privada. A mudança organiza a propriedade do código;
não representa aprovação de novas funcionalidades ou liberação para produção.

## Preservação conferida

O ID do repositório, branches, tags, histórico, issues, pull requests e atribuições
foram comparados com os inventários anteriores à transferência. Os workflows
continuam ativos; os nomes dos secrets de Actions existentes foram preservados.
Os registros brutos e os espelhos Git de recuperação ficam fora do repositório,
em armazenamento privado do responsável. Nenhum valor secreto entra neste guia.

As URLs antigas do GitHub redirecionam para o destino novo. Evidências históricas
mantêm os endereços originais; o README usa os endereços atuais.

## Clones e continuidade

Em clones existentes, atualizar o remoto:

```sh
git remote set-url origin https://github.com/Oryven-tech/portal-saldo-eleitoral.git
git fetch origin
```

Alterações locais devem ser preservadas. Não é necessário recriar o repositório,
reescrever commits, alterar o nome do produto ou refazer migrations de banco.
A conferência da CI é feita na [página de execuções](https://github.com/Oryven-tech/portal-saldo-eleitoral/actions).
Um workflow habilitado, sozinho, não comprova uma execução aprovada.

Rastreamento: [issue #1](https://github.com/Oryven-tech/portal-saldo-eleitoral/issues/1).
