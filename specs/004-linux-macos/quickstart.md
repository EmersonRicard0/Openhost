# Quickstart: validar o OpenHost no Linux e no macOS

**Feature**: `004-linux-macos`

## Pré-requisitos

- **Linux**: Ubuntu 22.04+ ou Fedora 39+, com Docker para o servidor SSH de teste
  (`node scripts/sshd.mjs up`). Para compilar, Go, Node, Wails CLI e
  `libgtk-3-dev libwebkit2gtk-4.1-dev` (ou `gtk3-devel webkit2gtk4.1-devel`).
- **macOS**: 12+ (um Mac Apple Silicon e, se possível, um Intel), Xcode Command Line Tools,
  Docker Desktop.
- Os artefatos da release ([contracts/release.md](contracts/release.md)) ou um build local.

## Automatizado

```sh
go vet ./... && go test ./...                         # nos três sistemas (CI)
cd frontend && npm run lint && npm run typecheck && npm test
node scripts/smoke.mjs                                # abre o app (-tags smoke), varre segredos
```

No Linux, o `go test` do pacote `main` e o build usam `-tags webkit2_41`, e o teste de abertura
roda com `xvfb-run node scripts/smoke.mjs`.

O esperado é tudo verde nos três jobs do CI. O E2E com Playwright continua só no Windows.

## Cenários manuais

1. **Instalar no Linux (US1, SC-401)**: num Ubuntu limpo,
   `sudo apt install ./openhost_0.4.0_amd64.deb`. O app aparece no menu com o ícone; abrir,
   criar o cofre e cadastrar o host do servidor de teste. Cronometrar até conectar: no máximo
   5 min. Repetir no Fedora com o `.rpm` e numa terceira distribuição com o AppImage.
2. **Roteiro da 002 no Linux (SC-402)**:
   - conectar por senha, por chave e por agente (`eval $(ssh-agent)`, `ssh-add`);
   - enviar e baixar 100 MB por SFTP;
   - abrir um encaminhamento local;
   - abrir terminais locais `bash`, `zsh` e `fish`: cores (`ls --color`), `htop`, redimensionar
     a janela, Ctrl+C num `sleep 100`;
   - testar perfis e esquemas de cores.
   - Sem `SSH_AUTH_SOCK`, o "Agente SSH" mostra "agente SSH indisponível".
3. **Janela no Linux**: arrastar, maximizar por duplo clique na moldura, encaixar à esquerda,
   testar em Wayland e em X11 e em escala de 200%. Os textos ficam nítidos e o terminal
   recalcula colunas.
4. **Instalar no macOS (US2)**: abrir o `.dmg`, arrastar para Aplicativos e abrir. O primeiro
   aviso de desenvolvedor não identificado é esperado; seguir o `LEIA-ME` (Privacidade e
   Segurança → Abrir Mesmo Assim). As aberturas seguintes não pedem nada. Conferir no Monitor
   de Atividade que roda como "Apple" no Apple Silicon (sem Rosetta).
5. **Atalhos no macOS (SC-404)**:
   - ⌘T, ⌘W, ⌘F, ⇧⌘P, ⌘B, ⌘= e ⌘, funcionam;
   - a página de atalhos e as dicas mostram ⌘;
   - no terminal, ⌃C interrompe um `sleep`, ⌃D sai do shell e ⌃R busca no histórico do zsh;
   - ⌘C/⌘V copiam e colam, com a confirmação de várias linhas;
   - ⌘Q com uma sessão aberta pede confirmação.
6. **Janela no macOS**: os botões nativos ficam à esquerda sem cobrir o conteúdo; arrastar pelo
   cabeçalho; tela cheia pelo botão verde; vidro ligado e desligado nas configurações; tema
   claro e escuro seguindo o sistema.
7. **Roteiro da 002 no macOS (SC-402)**: o mesmo do cenário 2 com `zsh` e `bash`. O terminal
   local enxerga o `PATH` do Homebrew mesmo com o app aberto pelo Finder.
8. **Levar hosts entre sistemas (US3, SC-403)**:
   - gerar no Windows um `.openhost` com 200 hosts e 10 chaves e importar no Linux e no macOS;
   - repetir nos sentidos Linux → Windows e macOS → Linux;
   - conferir contagens e conectar por uma chave importada.
9. **Importação fora do Windows (FR-415)**: os cartões "PuTTY" e "KiTTY (registro)" não
   aparecem; o cartão KiTTY mostra só "Escolher pasta…" e importa uma pasta `Sessions`.
   Exportar para "Acrescentar ao `~/.ssh/config`" cria a cópia `.bak` e o `ssh <apelido>` do
   sistema conecta.
10. **Segredos e permissões (SC-405, FR-403)**:
    - `ls -la ~/.config/ShellVault` (ou `~/Library/Application Support/ShellVault`): o diretório
      está em `drwx------` e os arquivos em `-rw-------`;
    - o `scripts/smoke.mjs` varre e não acha nada.
11. **Tamanho e memória (SC-406)**: os instaladores têm no máximo 40 MB. Com uma aba local e o
    app ocioso por 2 min, o processo do app mais o do WebKit somam no máximo 250 MB
    (`ps -o rss` ou Monitor de Atividade).
12. **Release (US4, SC-407)**:
    - publicar uma tag de teste (`v0.4.0-rc.1`) e ver os 5 artefatos obrigatórios, o
      `SHA256SUMS.txt` e as notas na página da release;
    - instalar cada artefato numa máquina limpa.

Registrar os resultados em `specs/004-linux-macos/validation.md`.
