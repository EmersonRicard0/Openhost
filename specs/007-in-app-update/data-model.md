# Modelo de dados: atualização pelo próprio app

## Release (vinda do serviço de releases, só em memória)

| Campo | Tipo | Regra |
|---|---|---|
| `version` | string SemVer | sem o `v`; `-rc.N` = versão de teste |
| `prerelease` | bool | da release; coerente com o sufixo |
| `publishedAt` | string ISO | |
| `notes` | string | Markdown das notas; mostrado como texto simples formatado, sem HTML |
| `assets` | lista `{name, size, url}` | só os nomes conhecidos (R1) |

## UpdateInfo (o que o frontend recebe)

| Campo | Tipo | Regra |
|---|---|---|
| `current` | string | versão instalada |
| `latest` | string \| null | maior versão elegível (FR-702/703) |
| `prerelease` | bool | |
| `notes` | string | |
| `install` | `nsis` \| `app` \| `appimage` \| `deb` \| `rpm` \| `manual` \| `dev` | R3 |
| `oneClick` | bool | `nsis`, `app`, `appimage` graváveis |
| `manualCommand` | string \| null | ex.: `sudo apt install ./openhost_0.5.1_amd64.deb` |
| `checkedAt` | string ISO | |
| `notify` | bool | `latest` existe, não é a pulada e já passou o `remindAfter` (o aviso aparece) |
| `state` | estado atual (abaixo) | |
| `progress` | `{received, total}` \| null | durante o download |
| `reason` | string \| null | em `failed` |

## UpdateState (máquina de estados)

```text
idle ──check──▶ checking ──▶ upToDate | available | idle (falha silenciosa)
available ──download──▶ downloading(progress) ──▶ verifying ──▶ ready | failed(reason)
downloading ──cancel──▶ available
ready ──restartNow──▶ applying (app fecha; auxiliar)  ──▶ (novo início) done | failed
ready ──applyOnQuit──▶ ready(pendingOnQuit)
```

`failed.reason`: `network`, `diskSpace`, `signature`, `checksum`, `permission`, `install`.

## UpdatePrefs (persistido em `appwin.Preferences.updates`)

| Campo | Tipo | Padrão |
|---|---|---|
| `auto` | bool | `true` |
| `prerelease` | bool | `false` |
| `skipped` | string | `""` (versão pulada) |
| `remindAfter` | string ISO | `""` |
| `lastCheck` | string ISO | `""` |
| `etag` | string | `""` |

Regras: aviso aparece se `latest != ""`, `latest != skipped` e agora ≥ `remindAfter`.
`skipped` só vale para aquela versão; nova versão maior reaparece.

## Manifesto de aplicação (`updates/<versão>/apply.json`, temporário)

`{pid, version, install, packagePath, targetPath, relaunch: [exe, args...]}` — gravado pelo app,
lido pelo auxiliar; apagado depois. Não contém nada do cofre.

## Resultado (`updates/last-update.json`)

`{version, status: ok|failed, reason?, at}` — lido no início seguinte para mostrar sucesso ou
falha (FR-713) e apagado.
