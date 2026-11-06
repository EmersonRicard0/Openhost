# Research: Digitar no grupo inteiro e biblioteca de comandos

## R1. Por onde a transmissão replica a entrada

- **Decision**: no frontend, no mesmo ponto em que `TerminalView` recebe `term.onData` do painel
  ativo. A fila de escrita por sessão (hoje uma variável local `pending`/`writing` dentro do
  efeito) sai para um módulo `features/terminal/writer.ts` com `send(sessionId, data)`, uma fila
  por sessão. Digitação própria, transmissão, colagem e comandos salvos passam todos por ela.
- **Rationale**: atalhos do app já são interceptados antes do `onData` (spec 002), então só o que
  iria ao terminal é replicado (edge case "atalhos não são transmitidos"). Uma fila por sessão
  mantém a ordem em cada equipamento sem um painel lento segurar os outros (FR-1202). Nenhum
  método novo na ponte: `SessionService.Write` já existe.
- **Alternatives considered**: método `WriteMany(ids, data)` no Go — uma chamada só, mas a
  ordem por sessão continuaria dependendo da fila do frontend e a ponte ganharia superfície sem
  necessidade (Princípio V).

## R2. Onde vive o estado da transmissão

- **Decision**: no store `sessions`, junto do grupo: `Group.broadcast?: { excluded: string[] }`
  (ausente = desligado). `join`, `splitOut`, `closeTab` e o desfazer de grupo já recalculam os
  grupos; o modo cai junto quando o grupo some e o membro que sai é tirado de `excluded`.
- **Rationale**: o estado tem a mesma vida do grupo (FR-1205, FR-1206) e não é persistido, como
  os grupos hoje.
- **Alternatives considered**: store separado indexado por id de grupo — exigiria sincronizar dois
  stores a cada mudança de grupo.

## R3. "Ambiente Produção"

- **Decision**: o ambiente com id `prod` (o que vem pronto na 009), mesmo renomeado. A cor do
  painel vem do host pelo store `hosts`, como na 009 (FR-906), então trocar o ambiente com o modo
  ligado é observado no mesmo seletor e dispara o FR-1209.
- **Rationale**: decisão registrada na spec (Assumptions); não pede dado novo no ambiente.

## R4. Colagem durante a transmissão

- **Decision**: `paste.ts` ganha `needsBroadcastConfirm(text)` (2 linhas ou mais, ou > 200
  caracteres) e o diálogo de colagem existente (FR-144) passa a receber o número de painéis
  quando o grupo transmite. Cancelar descarta para todos, inclusive o ativo (FR-1210).
- **Rationale**: reaproveita diálogo, prévia e escape de caracteres de controle que já existem.

## R5. Guarda dos comandos no cofre

- **Decision**: tabela nova `snippets (id TEXT PRIMARY KEY, sealed BLOB NOT NULL)` pela migração
  2 → 3 (`SchemaVersion = 3`), com o comando inteiro como JSON selado, igual a hosts.
- **Rationale**: até 500 comandos de até 4.000 caracteres não cabem bem no JSON único de
  `VaultSettings`, e a sincronização precisa de conflito por item (FR-1221). Uma versão antiga do
  app que abrir o cofre já mostra o aviso de "cofre de versão mais nova" (correção ac0833b) sem
  apagar nada (FR-1223).
- **Alternatives considered**: lista em `VaultSettings` — sem migração, mas o conflito da 008
  seria do bloco inteiro e qualquer edição de ambiente brigaria com edição de comando.

## R6. Sincronização com tipo novo

- **Decision**: tipo de item `snippet:<id>` em `cloudsync/items.go`. Junto, `DecodeItems` passa a
  **ignorar e preservar** tipos desconhecidos em vez de devolvê-los em `rejected`, e
  `applyVersions` só acusa `CloudCorrupt` para item de tipo conhecido inválido.
- **Rationale**: hoje um tipo desconhecido vira `CloudCorrupt` no computador que não o conhece.
  A sincronização ainda não saiu em release (commit 7d82e0c, 0.6.0 a declara indisponível), então
  não há cliente antigo a proteger; tornar o leitor tolerante agora evita o mesmo problema com
  qualquer tipo futuro.
- **Alternatives considered**: subir `cloudFormat` para 2 — obrigaria todos os computadores a
  atualizar juntos por causa de um tipo opcional.

## R7. Exportação OpenHost

- **Decision**: `exporter.Version = 3` com `snippets: [{name, text, tags, execute}]`;
  `ExportRequest.includeSnippets` (padrão `true` no formulário); importação aceita v1–v3 e trata
  nome repetido como host repetido (pular ou cópia "Nome (2)"). Versão > 3 → aviso de versão mais
  nova, como hoje.
- **Rationale**: mesmo caminho da v2 na 009.

## R8. Campos `{nome}`

- **Decision**: parser puro no frontend (`features/snippets/fields.ts`): `\{\{` → `{`, `\}\}` →
  `}`, `\{([A-Za-z0-9_-]{1,32})\}` → campo; o resto é literal. O Go valida só nome, tamanho,
  caracteres de controle e o limite de 10 campos com a mesma regra (função espelhada e testada
  nos dois lados com a mesma tabela de casos).
- **Rationale**: preencher e enviar é só frontend; o Go precisa recusar ao salvar o que a
  interface recusaria.

## R9. Envio do texto

- **Decision**: linhas unidas por `\r` (Enter do terminal); `\r` no fim só com `execute`. Envio
  como digitação (sem colagem entre colchetes), pela fila do R1, em um único `send` por sessão.
- **Rationale**: equipamentos de rede raramente entendem colagem entre colchetes; uma escrita só
  mantém o comando inteiro em ordem.

## R10. Últimos valores dos campos

- **Decision**: mapa em memória `snippetId → {campo: valor}` num store do frontend, limpo quando
  o cofre bloqueia (mesmo evento que já limpa sessões).
- **Rationale**: FR-1217 proíbe gravar em disco; valores podem ser senhas de enable ou nomes de
  cliente.
