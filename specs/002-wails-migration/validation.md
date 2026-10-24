# Validação — migração Wails

## SC-109 — tamanho e memória

Execute `scripts/measure.ps1` com uma única aba local aberta e o app ocioso por 120 segundos.
O script mede o instalador (ou o executável quando ainda não houver instalador) e soma o
*private working set* do processo principal com seus descendentes `msedgewebview2.exe`.

**Estado atual**: medição pendente. Não havia uma instância com uma aba local aberta, e iniciar
uma janela sem automatizar essa pré-condição produziria um número inválido. Registrar aqui o
resultado de `measure.ps1` antes de encerrar T100; aplicar as mitigações de R19 somente se a soma
ultrapassar 150 MiB.
