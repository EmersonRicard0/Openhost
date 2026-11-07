# Data Model: Ajustes de interface para o dia a dia em NOC

## Host (existente, `model.Host`) — campos novos

| Campo | Tipo | Regras |
|---|---|---|
| `environmentId` | `string \| null` | id de um `Environment` de `VaultSettings`; id desconhecido é tratado como `null` na interface e mantido no cofre |
| `tags` | `string[]` | 0–20; cada uma 1–32 caracteres depois de `trim`, sem caracteres de controle; sem repetição comparando em minúsculas; ordem do usuário preservada |
| `notes` | `string` | 0–2.000 caracteres (contados em runas); quebras de linha permitidas |

`HostInput` ganha os mesmos três campos. Omitidos no `Update`, mantêm o valor atual (mesmo padrão
de `legacyAlgorithms`/`osIcon`). `Duplicate` copia os três.

Validação no Go (`domain`): erros `InvalidInput` com campo `tags` ou `notes`; o frontend repete as
regras para mostrar o erro antes de salvar.

## Environment (novo, em `model.VaultSettings.Environments`)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `string` | gerado (`domain.NewID`); os quatro padrões têm ids fixos `prod`, `staging`, `lab`, `customer` |
| `name` | `string` | 1–24 caracteres depois de `trim`; único sem diferenciar maiúsculas |
| `color` | `EnvironmentColor` | um de `red`, `orange`, `amber`, `green`, `teal`, `blue`, `slate`, `pink` |

- `Environments == nil` (cofre antigo) → os padrões: Produção/`red`, Homologação/`amber`,
  Laboratório/`green`, Cliente/`slate`.
- No máximo 12 ambientes.
- `VaultService.UpdateSettings` aceita a chave `environments` com a lista inteira (substitui).

## Preferências locais (`appwin.Preferences`) — campos novos

| Campo | Tipo | Padrão | Sincroniza |
|---|---|---|---|
| `hostDensity` | `'comfortable' \| 'compact'` | `comfortable` | não |
| `promptTitle` | `boolean` | `true` | sim (`SyncPreferences.PromptTitle`) |

## Estado de interface (frontend, não persistido)

- `useWorkspace`: `settingsOpen: boolean`, `settingsActive: boolean`. Abrir → ambos `true`; ativar
  uma sessão → `settingsActive = false`; fechar → ambos `false` e o id ativo das sessões volta a
  valer.
- `Tab` (store `sessions`): `promptTitle?: string`, `manualTitle: boolean`. Título exibido:
  `manualTitle ? title : (prefs.promptTitle && promptTitle) || hostLabel`.

## Exportação OpenHost (formato próprio), versão 2

Host exportado ganha `tags`, `notes` e `environment: {name, color} | null`. Arquivos da versão 1
continuam sendo importados (campos vazios).
