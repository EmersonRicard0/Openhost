# Contrato: detecção de fabricante e ponte

Complementa `specs/002-wails-migration/contracts/bridge.md` (seção de hosts, FR-178). Nenhum
método novo na ponte.

## Ponte (inalterada na forma)

- `Host.detectedOs: OsId | null` e `Host.osIcon: OsId | "auto"`: `OsId` ganha `zte`,
  `datacom` e `hillstone`.
- Evento `hosts:changed` `{ hostId, detectedOs }`: continua sendo emitido quando a detecção
  muda o valor. Agora pode chegar alguns segundos **depois** de a aba ficar `connected` (a
  detecção roda em segundo plano). O payload nunca contém texto do servidor.

## Backend (Go, interno)

```text
sshx.Dial(...) (*Client, error)
  Client.PreAuthBanner() string        // mensagem pré-login, ≤ 8 KiB, "" se não houver

sshx.NewTerminal(c *Client) *Terminal
  Terminal.Start(cols, rows, out)      // a saída passa pelo observador (≤ 8 KiB / 5 s)
  Terminal.InitialOutput(ctx) []byte   // bloqueia até a janela fechar ou ctx acabar

sshx.ClassifyBanner(text string) string     // fabricante pela mensagem pré-login, "" se nenhum
sshx.ClassifyTerminal(text []byte) string   // fabricante pelo trecho do terminal, "" se nenhum
sshx.ResolveOS(signals Signals) string      // aplica a ordem de data-model.md
domain.IsNetworkOS(id string) bool
```

`Signals` = `{ Version, Banner string; Terminal []byte; OSRelease string; ProbeOSRelease bool }`.

Regras:

1. `dialHost` devolve o terminal sem esperar a detecção (FR-512).
2. A goroutine de detecção só chama `DetectOS`-canal-extra se `ProbeOSRelease` for verdadeiro:
   versão genérica, pré-login sem fabricante e `detectedOs` atual fora de `IsNetworkOS`
   (FR-513).
3. Nenhuma dessas funções escreve no stdin da sessão, registra log com o texto ou devolve o
   texto em erro (FR-508, FR-509).
4. Resultado `""` não chama `SetDetectedOS` (FR-510).

## Frontend

- `OS_IDS` ganha `zte`, `datacom`, `hillstone`; `LABELS` ganha `ZTE`, `Datacom`, `Hillstone`.
- `pathOf` devolve os SVGs próprios; `EXTRA_HEX` traz a cor de cada marca (FR-501, FR-502).
- O seletor de ícone do formulário do host lista os três em ordem alfabética (FR-503).
