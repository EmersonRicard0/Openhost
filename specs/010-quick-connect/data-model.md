# Data Model: Tela inicial e conexão rápida

## QuickTarget (frontend e ponte)

| Campo | Tipo | Regras |
|---|---|---|
| `address` | `string` | nome, IPv4 ou IPv6 (sem colchetes), validado por `validate` no Go |
| `port` | `number` | 1–65535; padrão 22 |
| `username` | `string` | 1–64 caracteres, sem espaço nem controle; obrigatório na ponte |

## Host (existente) — campo novo

| Campo | Tipo | Regras |
|---|---|---|
| `favorite` | `boolean` | padrão `false`; omitido no `Update` mantém o valor; `Duplicate` copia |

## RecentEntry (preferência local `recents`, não sincroniza)

| Campo | Tipo | Regras |
|---|---|---|
| `kind` | `'host' \| 'quick'` | |
| `hostId` | `string` | só com `kind = 'host'`; UUID |
| `address`, `port`, `username` | | só com `kind = 'quick'`; mesmas regras do QuickTarget |
| `at` | `string` | RFC 3339, gerado pelo Go |

Lista com no máximo 20 entradas, mais recente primeiro, sem duas iguais (mesmo `hostId`, ou mesmo
`address` normalizado + `port` + `username`).

## Tab (store `sessions`) — campo novo

- `quick: QuickTarget | null` — alvo da sessão rápida (para "Salvar como host" e o título).
