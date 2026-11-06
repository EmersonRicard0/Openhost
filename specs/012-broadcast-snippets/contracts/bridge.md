# Contrato da ponte: mudanças da 012

## SnippetService (novo)

| Método | Entrada | Saída | Erros |
|---|---|---|---|
| `List()` | — | `Snippet[]` ordenados por nome (sem diferenciar maiúsculas) | `VaultLocked` |
| `Create(input)` | `SnippetInput {name, text, tags, execute}` | `Snippet` | `InvalidInput` (`field`: `name`, `text`, `tags`, `snippets`), `VaultLocked` |
| `Update(id, input)` | `SnippetInput`; chave ausente mantém o valor | `Snippet` | os de `Create` + `NotFound` |
| `Remove(id)` | — | — | `NotFound`, `VaultLocked` |
| `Duplicate(id)` | — | `Snippet` com nome "Nome (2)", "(3)"… | `NotFound`, `InvalidInput` (`snippets` no limite) |

```ts
interface Snippet {
  id: string;
  name: string;
  text: string;      // linhas separadas por "\n"
  tags: string[];    // nunca null
  execute: boolean;
  createdAt: string; // RFC3339
  updatedAt: string;
}
```

- Mudou a lista (criar, editar, apagar, sincronização aplicada) → evento `snippets:changed` sem
  carga; o frontend chama `List()` de novo.
- Nenhuma mensagem de erro, log ou evento leva `text`.

## SessionService

- Sem mudança. Transmissão e envio de comando usam `Write(sessionId, data)`, um pedido por
  sessão, em fila no frontend.

## ExportService / ImportService (OpenHost)

- `ExportRequest.includeSnippets: boolean` (OpenHost apenas; outros formatos ignoram).
- `ExportCount` ganha `snippets: number`.
- Arquivo `version: 3` com `snippets: [{name, text, tags, execute}]`; importar aceita 1, 2 e 3.
- Prévia de importação: `snippets: [{name, duplicateOf?: string}]` e decisão por item
  `skip | copy`, como hosts.

## Sincronização (008)

- Item `snippet:<id>`. `DecodeItems` ignora e preserva tipos desconhecidos (R6), em vez de
  `CloudCorrupt`.
