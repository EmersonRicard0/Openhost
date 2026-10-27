# Research: Ajustes de interface para o dia a dia em NOC

## R1. Onde guardar tags, nota e ambiente do host

- **Decision**: campos novos no `model.Host` (`environmentId`, `tags`, `notes`), dentro do JSON
  selado que a tabela `hosts` já guarda. Sem tabela nova e sem mudar `SchemaVersion`.
- **Rationale**: o host já é um blob JSON cifrado lido com `json.Unmarshal` tolerante; campos
  opcionais novos são lidos como vazios pelos cofres existentes, e versões antigas os ignoram. A
  sincronização (008) carrega `model.Content` inteiro, então os campos seguem na nuvem sem
  mudança no `cloudsync`.
- **Risco aceito**: uma versão anterior a esta que editar o host regrava o JSON sem os campos
  novos. Como a 008 e a 009 saem juntas na 0.7.0 e o app se atualiza sozinho desde a 0.6.0, não há
  cliente de sincronização antigo; a restrição fica registrada nas notas de versão.
- **Alternatives considered**: tabela `host_tags` com migração de esquema (exige migração, deixa a
  busca no Go e não traz ganho para até 20 tags por host); guardar as tags só no frontend (não
  sincroniza, quebra o FR-919).
- **Ajuste na spec**: FR-920 passa a pedir compatibilidade de leitura e teste de ida e volta em vez
  de migração de esquema.

## R2. Lista de ambientes

- **Decision**: `VaultSettings.Environments []Environment{ID, Name, Color}` no cofre, com os 4
  padrões criados quando a lista está ausente (`nil`); lista vazia (`[]`) é válida e significa que o
  usuário removeu todos. A cor é um id de uma paleta fixa de 8 (`red`, `orange`, `amber`, `green`,
  `teal`, `blue`, `slate`, `pink`); o frontend mapeia o id para a cor de cada tema.
- **Rationale**: `VaultSettings` já é cifrado e já vai em `model.Content`, ou seja, sincroniza e não
  precisa de dado novo na nuvem. Id de cor no lugar de hex garante contraste nos dois temas e no
  alto contraste sem validar cor livre.
- **Alternatives considered**: preferências locais (`appwin.Preferences`) — o host sincronizado
  apontaria para um ambiente que a outra máquina não tem; cor livre — sem garantia de contraste.
- Remover um ambiente não reescreve os hosts; um `environmentId` sem ambiente correspondente é
  tratado como "Nenhum" (edge case da spec).

## R3. Configurações como aba

- **Decision**: a aba "Configurações" é um item da barra de abas derivado do estado de interface
  (`settingsOpen`, `settingsActive`), fora da lista de sessões do store `sessions`. O id ativo das
  sessões continua guardado; quando as Configurações estão ativas, a barra marca só elas e o
  `Workspace` esconde os terminais (mantendo-os montados) e mostra a `SettingsPage` no lugar.
- **Rationale**: as Configurações não têm sessão, estado de conexão, grupo nem fechamento com
  confirmação; colocá-las em `sessions.tabs` obrigaria todos os comandos de terminal a ignorar um
  tipo novo. Manter os terminais montados evita remontar o xterm (mesma regra da 006).
- **Alternatives considered**: `Tab.kind = 'settings'` no store de sessões (toca `commands.ts`,
  grupos, arrastar, restauração e reconexão); página que esconde a barra de abas (perde o contexto
  das sessões abertas).
- Atalhos de terminal checam `settingsActive` e não agem; fechar aba (Ctrl+W) e Esc com as
  Configurações ativas fecham as Configurações.

## R4. Densidade da lista

- **Decision**: preferência local `hostDensity: 'comfortable' | 'compact'` em
  `appwin.Preferences`, não sincronizada (como o tema). A densidade é uma classe na lista; o item
  compacto tem 28 px de altura contra 56 px do confortável.
- **Rationale**: densidade depende do tamanho da tela de cada máquina.

## R5. Nome da aba pelo prompt

- **Decision**: módulo puro `promptTitle.ts` com `extractPromptName(line): string | null` para os
  formatos do FR-922. O `TerminalView` lê a linha do cursor no buffer do xterm depois de cada
  escrita, com no máximo uma leitura por segundo (throttle), e só aplica quando o cursor está no fim
  da linha. O título vindo do prompt fica em `Tab.promptTitle`; o título exibido é `title` renomeado
  à mão > `promptTitle` (se a opção estiver ligada) > rótulo do host. Renomear à mão grava
  `manualTitle = true`.
- **Rationale**: ler a linha do cursor cobre o caso "prompt à espera de digitação" sem analisar a
  saída inteira; o throttle evita trocas a cada linha.
- **Alternatives considered**: sequência OSC de título do terminal (equipamentos de rede não
  enviam); pedir o hostname ao equipamento (depende de fabricante e envia comando sem o usuário).
- Preferência `promptTitle: boolean` (padrão `true`) em `appwin.Preferences` e em
  `SyncPreferences`, junto das outras de comportamento do terminal.
- O nome base em modo de configuração sai tirando `~`, `*`, `-`, `(config…)` e sufixos de modo
  (`#`, `>`, `]`).

## R6. Campo de porta

- **Decision**: `NumberField` ganha `steppers={false}`; o campo de porta usa essa opção, seleciona o
  valor ao receber foco e mantém as setas do teclado e a validação atual.
- **Rationale**: muda só o uso no formulário de host; os outros usos (fonte, tempo de bloqueio)
  continuam com os botões.

## R7. Cor do ambiente na interface

- **Decision**: aba com barra de 3 px no topo na cor do ambiente; terminal e painel dividido com
  borda interna de 2 px. O foco do painel continua o anel na cor de destaque, por fora da borda do
  ambiente. O nome do ambiente entra no `aria-label` da aba, na dica e no `PaneHeader`.
- **Rationale**: a borda interna não muda o tamanho em células do terminal de forma diferente entre
  hosts com e sem ambiente (o espaço é reservado sempre, transparente sem ambiente).
- Contraste: cada id de cor tem valor por tema, conferido em teste contra o fundo da barra de abas
  (≥ 3:1).

## R8. Exportação no formato OpenHost

- **Decision**: `exporter.Version` sobe para 2. O host exportado leva `tags`, `notes` e
  `environment: {name, color}` (por valor, não por id). Na importação, o ambiente é associado pelo
  nome (sem diferenciar maiúsculas) a um existente, ou criado.
- **Rationale**: o importador lê o próprio formato no modo estrito; um app sem os campos novos
  recusa o arquivo com "versão mais nova", em vez de falhar com "arquivo ilegível". Ambiente por
  valor funciona entre cofres com listas diferentes.
