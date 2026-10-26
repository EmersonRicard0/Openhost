# Modelo de dados: grupos de terminais

Tudo em memória no frontend (`useSessions`); nada é gravado no cofre nem nas preferências, exceto
os atalhos novos (que usam o mapa de atalhos já existente).

## Tab (existente, uma por sessão)

Sem campos novos. `activeId` continua apontando para uma sessão.

## Group

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string | gerado ao criar o grupo |
| `root` | `Node` | árvore com 2 a 4 folhas |

Derivados: `members(group)` = folhas da árvore; uma sessão pertence a no máximo um grupo.

## Node

```text
Leaf  { kind: 'leaf', sessionId }
Split { kind: 'split', dir: 'row' | 'column', ratio: 0 < r < 1, a: Node, b: Node }
```

- `row`: `a` à esquerda, `b` à direita; `column`: `a` em cima, `b` embaixo.
- `ratio` é a fração de `a`; limitada pelo mínimo de cada lado (R5).

## Operações (funções puras, `layout.ts`)

| Operação | Efeito |
|---|---|
| `insert(root, targetId, side, newId)` | troca a folha `targetId` por `Split` com a folha nova no lado pedido, `ratio = 0,5` |
| `remove(root, id)` | remove a folha; o irmão ocupa o lugar do pai; `null` se a árvore ficar com uma folha |
| `move(root, id, targetId, side)` | `remove` + `insert` |
| `setRatio(root, path, ratio)` / `equalize(root, path)` | ajustam uma divisória |
| `rects(root)` | retângulo `{x, y, w, h}` em frações para cada folha e para cada divisória |
| `neighbor(root, id, dir)` | folha vizinha mais próxima na direção, ou `null` |
| `dropVerdict(...)` | `ok`, `full`, `group`, `sftp`, `tooSmall` ou `self` |

## Transições do store

| Ação | Antes | Depois |
|---|---|---|
| soltar sessão avulsa B sobre A (avulsa) | abas A, B | grupo {A, B}; aba B some da barra |
| soltar B sobre painel A de um grupo | grupo com A | B entra ao lado de A |
| separar painel B | grupo {…, B} | B avulsa logo após a aba do grupo; grupo sem B |
| fechar painel B | grupo {…, B} | sessão B encerrada; grupo sem B |
| grupo fica com 1 sessão | grupo {A} | grupo removido; A avulsa |
| fechar aba do grupo | grupo {A, B, …} | todas encerradas |
