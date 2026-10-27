# Contrato de interface: grupos de terminais

Nenhum método novo na ponte; o grupo usa `sessions.resize`, `sessions.close` e os eventos de
estado que já existem.

## Barra de abas

- Item de grupo: `role="tab"`, nome acessível `"<título do painel ativo> e mais N"`, selo com a
  quantidade, indicador do pior estado (FR-611). Arrastar um item de grupo não abre zonas de
  soltura (R4).
- Soltar um cabeçalho de painel (`application/x-shellvault-pane`) na barra separa o painel em
  nova aba naquela posição (FR-612).

## Área dos terminais

- Durante um arrasto de aba ou de cabeçalho: camada `data-drop-layer` cobre a área; a prévia é um
  elemento `data-drop-preview` com `data-side="left|right|top|bottom"`; recusa mostra
  `role="status"` com o motivo:
  - `full`: "Máximo de 4 sessões por grupo"
  - `group`: "Arraste uma sessão por vez para dentro do grupo"
  - `sftp`: "Sessões SFTP não entram em grupos"
  - `tooSmall`: "Não há espaço para dividir este painel"
- Painel: `role="group"`, `aria-label` = título da sessão, `data-pane`, `data-focused` no ativo;
  cabeçalho com botões "Separar em nova aba" e "Fechar painel".
- Divisória: `role="separator"`, `aria-orientation`, `aria-valuenow` (porcentagem de `a`),
  focável; setas mudam 5% e Enter iguala (acessível por teclado além do mouse).

## Atalhos novos

| Ação | Windows/Linux | macOS |
|---|---|---|
| `focusLeft` | Ctrl+Alt+Seta esquerda | ⌥⌘← |
| `focusRight` | Ctrl+Alt+Seta direita | ⌥⌘→ |
| `focusUp` | Ctrl+Alt+Seta acima | ⌥⌘↑ |
| `focusDown` | Ctrl+Alt+Seta abaixo | ⌥⌘↓ |

Aparecem em Configurações → Atalhos e na paleta de comandos, em pt-BR ("Focar painel à
esquerda" etc.).
