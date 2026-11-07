# Data Model: Animações (015)

## Preferência de movimento (neste computador)

| Campo | Onde | Tipo | Valores | Padrão | Sincroniza |
|---|---|---|---|---|---|
| `motion` | `appwin.Preferences` (JSON `motion`) | string | `system`, `full`, `reduced`, `off` | `system` | **Não** (fora de `SyncPreferences`) |

Valor desconhecido ou vazio → `system` (normalização igual às outras preferências).

## Nível efetivo (só na interface, não persiste)

`data-motion` em `<html>`:

| `motion` | Sistema pede "reduzir movimento" | `data-motion` |
|---|---|---|
| `system` | não | `full` |
| `system` | sim | `reduced` |
| `full` | qualquer | `full` |
| `reduced` | qualquer | `reduced` |
| `off` | qualquer | `off` |

Muda na hora quando a preferência ou a configuração do sistema mudam.

## Estado da abertura

`boot` (no `index.html`) → `leaving` (primeira tela montou; transição de saída até 250 ms) →
removido do DOM. Se a primeira tela montar antes do fim da entrada do símbolo, vai direto para
`leaving`.

## Estado de conexão mostrado no painel

`connecting` sem nenhum byte recebido → indicador visível. Some em: primeiro `data`, pedido de
chave do servidor ou de senha/keyboard-interactive, erro, fechamento.
