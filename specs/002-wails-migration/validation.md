# Validação — migração Wails

## SC-109 — tamanho e memória

Execute `scripts/measure.ps1` com uma única aba local aberta e o app ocioso por 120 segundos.
O script mede o instalador (ou o executável quando ainda não houver instalador) e soma o
*private working set* do processo principal com seus descendentes `msedgewebview2.exe`.

**Estado atual**: medição pendente. Não havia uma instância com uma aba local aberta, e iniciar
uma janela sem automatizar essa pré-condição produziria um número inválido. Registrar aqui o
resultado de `measure.ps1` antes de encerrar T100; aplicar as mitigações de R19 somente se a soma
ultrapassar 150 MiB.

## SC-006 / T096 — desempenho SFTP de 1 GB

Medição em 2026-10-25 no mesmo host Windows e no mesmo contêiner OpenSSH local, com arquivo
aleatório de 1.024 MB. Upload e download tiveram o SHA-256 conferido após cada execução.

| Implementação | Upload | Download |
|---|---:|---:|
| 001 (Electron/ssh2) | 115,3 MB/s | 154,2 MB/s |
| 002 (Go/pkg/sftp) | 118,9 MB/s | 160,1 MB/s |
| Go ÷ 001 | 103% | 104% |

Na execução final da 002, o `sftp.exe` do Windows mediu 126,3 MB/s no upload e 151,1 MB/s no
download; o Go atingiu respectivamente 94% e 106% dessa referência, acima do mínimo de 80% de
SC-006. O primeiro ensaio revelou que o wrapper de progresso escondia o tamanho do leitor e
forçava uploads sequenciais; após preservar `Size()`, o `pkg/sftp` voltou a usar escritas paralelas.

Resultado: hashes idênticos, desempenho da 002 não inferior ao da 001 e SC-006 atendido.
