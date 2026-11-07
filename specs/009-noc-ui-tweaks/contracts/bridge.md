# Contrato da ponte: mudanças da 009

Só acréscimos; nenhum método novo.

## HostService

- `Create(input)`, `Update(id, input)`: `HostInput` aceita `environmentId: string | null`,
  `tags: string[]`, `notes: string`. No `Update`, chave ausente mantém o valor atual.
- `List()`, `Create`, `Update`, `Duplicate`: `HostView` devolve os três campos (`tags: []` e
  `notes: ""` quando vazios, nunca `null`).
- Erro `InvalidInput` com `field: "tags"` (quantidade, tamanho, repetida) ou `field: "notes"`
  (tamanho).

## VaultService

- `GetSettings()` devolve `environments: Environment[]` (padrões quando o cofre não tem a lista).
- `UpdateSettings({environments: Environment[]})` substitui a lista inteira. Erro `InvalidInput`
  com `field: "environments"` para nome vazio ou repetido, cor desconhecida ou mais de 12 itens.
  Novos itens chegam com `id: ""` e o Go gera o id.

## AppService (preferências)

- `getUiSettings()` devolve `hostDensity` e `promptTitle`.
- `setUiSetting("hostDensity", "comfortable" | "compact")` e
  `setUiSetting("promptTitle", boolean)`; outros valores → `InvalidInput`.

## Sincronização (008)

- `SyncPreferences` ganha `promptTitle`. Hosts e `VaultSettings` já seguem por `model.Content`.

## Importação e exportação OpenHost

- `exporter.Version = 2`; hosts com `tags`, `notes`, `environment: {name, color} | null`.
- Importar a versão 1 continua aceito; versão > 2 → aviso de versão mais nova.
- Ambiente importado: associado pelo nome (sem diferenciar maiúsculas) ou criado no fim da lista
  (se já houver 12, o host fica sem ambiente e a prévia avisa).
