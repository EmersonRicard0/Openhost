# Contrato: artefatos da release

Gerados pelo `release.yml` a partir da tag `v<versão>`. `<v>` é a versão sem o `v`
(`0.4.0`). O job `publish` falha se faltar algum artefato obrigatório.

| Sistema | Arquitetura | Formato | Nome do arquivo | Obrigatório |
|---|---|---|---|---|
| Windows | amd64 | instalador NSIS | `OpenHost-<v>-windows-amd64-installer.exe` | sim |
| macOS | universal (arm64 + amd64) | `.dmg` | `OpenHost-<v>-macos-universal.dmg` | sim |
| Linux | x86_64 | AppImage | `OpenHost-<v>-x86_64.AppImage` | sim |
| Linux | amd64 | `.deb` | `openhost_<v>_amd64.deb` | sim |
| Linux | x86_64 | `.rpm` | `openhost-<v>-1.x86_64.rpm` | sim |
| Linux | aarch64 | AppImage | `OpenHost-<v>-aarch64.AppImage` | não |
| Linux | arm64 | `.deb` | `openhost_<v>_arm64.deb` | não |
| Linux | aarch64 | `.rpm` | `openhost-<v>-1.aarch64.rpm` | não |

A release também publica `SHA256SUMS.txt` com o hash de cada arquivo.

## Conteúdo mínimo de cada pacote

**`.dmg`**: `OpenHost.app`, link `Applications` → `/Applications` e
`LEIA-ME — primeira abertura.txt`. O `Info.plist` tem `CFBundleName` = `OpenHost`,
`CFBundleShortVersionString` = `<v>` e `LSMinimumSystemVersion` = `12.0`.

**`.deb` e `.rpm`**:

| Caminho | Conteúdo |
|---|---|
| `/usr/bin/openhost` | binário |
| `/usr/share/applications/openhost.desktop` | `Name=OpenHost`, `Exec=openhost`, `Icon=openhost`, `Categories=Network;RemoteAccess;System;TerminalEmulator;`, `StartupWMClass=openhost` |
| `/usr/share/icons/hicolor/{128x128,512x512}/apps/openhost.png` | ícone da marca |
| `/usr/share/doc/openhost/copyright` | licença |

| Metadado | `.deb` | `.rpm` |
|---|---|---|
| pacote | `openhost` | `openhost` |
| dependências | `libgtk-3-0 \| libgtk-3-0t64`, `libwebkit2gtk-4.1-0` | `libgtk-3.so.0()(64bit)`, `libwebkit2gtk-4.1.so.0()(64bit)` |
| scripts de remoção | nenhum (o cofre do usuário fica intocado) | nenhum |

**AppImage**: o mesmo `.desktop` e ícone na raiz, mais um `AppRun` que confere o WebKitGTK 4.1
antes de executar (R9).

## Notas da release

Arquivo `docs/release-notes/<v>.md`, usado como corpo da release, com as seções:

1. Novidades
2. Qual arquivo baixar: tabela por sistema
3. Requisitos: versões mínimas da spec
4. Primeira abertura no macOS:
   - clicar com o botão direito → Abrir; ou
   - Ajustes do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim";
   - alternativa pelo Terminal: `xattr -dr com.apple.quarantine /Applications/OpenHost.app`.
5. Linux: comandos de instalação (`sudo apt install ./openhost_<v>_amd64.deb`,
   `sudo dnf install ./openhost-<v>-1.x86_64.rpm`, `chmod +x` no AppImage).
