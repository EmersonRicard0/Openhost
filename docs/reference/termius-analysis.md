# Análise de referência: Termius (desktop, Windows)

> Documento de insumo para a spec. Abordagem **clean room**: registra apenas
> comportamento, arquitetura e funcionalidades observáveis. Nenhum código,
> asset, nome ou design do Termius deve ser copiado para este projeto.

- **Fonte:** instalação local do Termius em `%LOCALAPPDATA%\Programs\Termius`
  (`resources\app.asar`, 161 MB, SHA-256 `18015ef4…7fff9`).
- **Ferramenta:** REA 6.7.0, `analyze-javascript-application`, análise estática
  (nenhum código do app foi executado).
- **Data:** 2026-10-23.

## Limitações da análise

- A análise semântica completa excedeu o tempo (300 s) e os bundles principais
  (`main-process.js`, 1,6 MB; `preload.js`, 0,8 MB) excederam 6 GB de heap.
  Por isso **não há mapeamento de canais IPC nem de APIs expostas**; as
  conclusões abaixo vêm do inventário de arquivos, dependências e nomes de
  componentes.
- Nomes de componentes indicam a existência de uma funcionalidade, não como
  ela é implementada.

## Arquitetura observada

App Electron com processos separados:

| Processo | Papel inferido |
|---|---|
| `main-process` | Ciclo de vida do app, janelas, integração com o SO |
| `ui-process` | Interface (bundle Vite com code-splitting por tela/diálogo) |
| `preload` | Ponte entre interface e processo principal |
| `background-process` | Serviços em segundo plano (provável sincronização) |
| `utilities-process/service-process` | Serviço utilitário isolado |
| `utilities-process/fido-process` | Processo dedicado a chaves FIDO2 |

### Módulos nativos

| Módulo | Função | Equivalente aberto |
|---|---|---|
| `@termius/libtermius` | Núcleo proprietário (provável SSH, cripto, sync) | `ssh2` + libsodium |
| `@termius/node-pty` | Terminal local (PTY/ConPTY) | `node-pty` |
| `@termius/keytar` | Segredos no cofre do SO | `safeStorage` do Electron / `keytar` |
| `@termius/libfido2` | Chaves de hardware FIDO2 | `libfido2` / WebAuthn |
| `@termius/mosh` | Protocolo Mosh | `mosh` |
| `@termius/serialport-bindings` | Conexão serial | `serialport` |
| `@termius/registry-js` | Leitura do registro do Windows | `registry-js` |

### Integrações

- **Azure** (`@azure/arm-compute`, `arm-network`, `identity`, `msal-*`):
  importação de VMs como hosts.
- **Autocomplete de comandos**: centenas de specs por comando (`ssh`, `rsync`,
  `docker`, `ansible`, `brew`…) e `figterm`, no formato do projeto open source
  `withfig/autocomplete` (MIT).

## Funcionalidades (por nomes de componentes)

| Área | Evidência |
|---|---|
| Hosts com filtros e grupos | `HostsScreenSidebar`, `HostsFiltersHeader`, `FiltersButton` |
| Terminal SSH, local, Mosh, serial | módulos nativos acima |
| SFTP | `SftpSettings`, spec `sftp` |
| Port forwarding | `PortForwardingRulePresenter` |
| Vaults criptografados | `Vaults`, `ChangeVault`, `DecryptionKeyNotFoundDialog`, `MigrateToNewCryptoSystemScreen` |
| Compartilhamento em equipe | `ShareEntities`, `GrantVaultsAccess`, `CreateTeam`, `SelectMemberRole` |
| Identidade SSH com passkey/FIDO2 | `SSHid*`, `AddFIDO2KeyButton`, `ProcessingFIDO2Passkey` |
| Conta e 2FA | `SignInScreen`, `CreateAccountDialog`, `OtpLogin`, `OTPTokenDialog` |
| Planos pagos | `ProFeatures`, `ChoosePlanDialog`, `EnterprisePlanDialog`, `GracePeriod` |
| Configurações | `SettingsSection`, `FontAutocomplete`, `LogsSettings` |

## Proposta de escopo do MVP

Dentro:
1. Cadastro de hosts (nome, endereço, porta, usuário, autenticação) com grupos e busca.
2. Terminal SSH em abas (senha e chave privada; verificação de host key).
3. Terminal local (PowerShell/cmd).
4. Cofre local criptografado com senha mestra para hosts, senhas e chaves.
5. SFTP básico (navegar, enviar, baixar).
6. Port forwarding local.

Fora (versões futuras): sincronização em nuvem, equipes, FIDO2, Mosh, serial,
integração Azure, autocomplete, planos pagos.
