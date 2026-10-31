# Contrato: formato na pasta

Mesmos arquivos e mesmo formato (versão 1) de specs/008-drive-sync/contracts/cloud-format.md,
dentro de `<pasta escolhida>/OpenHost/`:

- `keyring.json` — regravado só ao criar e ao trocar a senha; gravação atômica.
- `snap-<lamport:012d>-<deviceId>.ohs` — imutáveis; `deviceId` é aleatório, nunca o nome do
  computador.

Regras:

- Gravação: `.openhost-<16 hex>.tmp` na mesma subpasta e renomear; temporários com mais de 1 h
  são apagados pelo app (só os seus, pelo prefixo).
- Leitura: ignora tudo o que não casa com os dois padrões (cópias de conflito, arquivos do
  sistema, temporários).
- Retenção e exclusão: as mesmas da 008 (30 versões/30 dias); "Desconectar → Apagar" remove só os
  arquivos dos dois padrões e a subpasta se ficar vazia.
- Nada é lido nem gravado fora de `OpenHost/`.
