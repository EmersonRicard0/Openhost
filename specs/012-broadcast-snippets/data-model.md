# Data Model: Digitar no grupo inteiro e biblioteca de comandos

## Snippet (Go `model.Snippet`, cofre, tabela `snippets`)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string | gerado com `domain.NewID` |
| `name` | string | 1–64 runas depois de `trim`; único sem diferenciar maiúsculas |
| `text` | string | 1–4.000 runas; sem caracteres de controle além de `\n` (`\r\n` normalizado para `\n`); até 10 campos `{nome}` diferentes (R8) |
| `tags` | string[] | mesmas regras das tags de host (`domain.NormalizeHostMetadata`, 0–20, 1–32 cada, sem repetição em minúsculas) |
| `execute` | bool | padrão `false` |
| `createdAt`, `updatedAt` | RFC3339 | definidos pelo Go |

- Até 500 por cofre; o 501º → `InvalidInput` com `field: "snippets"`.
- Erros de validação: `InvalidInput` com `field: "name" | "text" | "tags"`; a mensagem nunca leva
  o texto do comando.
- Guardado como JSON selado (`sealed`), igual a `hosts`. Migração 2 → 3 cria a tabela vazia.
- Sincronização: item `snippet:<id>` com o JSON do snippet; conflito por item (spec 008).
- Exportação OpenHost v3: `{name, text, tags, execute}` (sem id nem datas).

## Campo do comando (frontend, derivado)

- `{nome}` com `[A-Za-z0-9_-]{1,32}`; `{{`/`}}` literais; ordem da primeira ocorrência; repetido
  pedido uma vez.
- Valor: obrigatório, sem `\r` nem `\n`, até 1.000 caracteres.
- Último valor: memória (`snippetId → campo → valor`), limpo ao bloquear o cofre.

## Transmissão (frontend, store `sessions`)

```ts
interface Group {
  id: string;
  root: LayoutNode;
  focusId: string;
  /** Ausente = desligado. */
  broadcast?: { excluded: string[] };
}
```

| Evento | Efeito |
|---|---|
| ligar (sem painel `prod`) | `broadcast = { excluded: [] }` |
| ligar (com painel `prod`) | confirmação; aceitar → `{ excluded: [] }`; cancelar → nada |
| desmarcar / marcar painel | entra / sai de `excluded` |
| painel passa a `prod` com o modo ligado | entra em `excluded` + aviso |
| `splitOut(id)`, sessão fecha | `id` sai do grupo e de `excluded` |
| grupo fica com 1 sessão ou é fechado | grupo some, modo junto |
| bloquear cofre / fechar app | tudo some (não persistido) |

Destinos de uma entrada no painel ativo `a`: membros do grupo − `a` − `excluded` − painéis não
`connected`.
