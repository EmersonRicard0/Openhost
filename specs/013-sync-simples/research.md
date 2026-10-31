# Research: Sincronização simples para o usuário final

## R1. Caminho sem autorização: pasta sincronizada

- **Decision**: gravar os arquivos da 008 numa subpasta `OpenHost` dentro da pasta do Google Drive,
  OneDrive ou Dropbox instalados; o programa de cada serviço leva os arquivos entre computadores.
- **Rationale**: é o único caminho sem tela do Google; não existe token nem credencial do projeto
  envolvida, então não há o que vazar além dos arquivos já selados. Reaproveita todo o motor.
- **Alternatives considered**: servidor próprio com login por e-mail (guardaríamos cofres de
  terceiros e manteríamos um serviço no ar — contra o "nada vaza" e o Local-First); pareamento
  direto entre computadores por código (exige os dois ligados na mesma rede; não resolve o
  "computador novo" sozinho); APIs do OneDrive/Dropbox (mais três fluxos OAuth e credenciais).

## R2. Uma interface para os dois lugares

- **Decision**: `type Remote interface { List(ctx, class, pageSize); Get(ctx, id); Create(ctx,
  name, data); UpdateKeyring(ctx, id, data); Delete(ctx, id) }` com `RemoteFile{ID, Name,
  CreatedTime, Size}`. `Drive` e `Folder` implementam; `Syncer`, `onboarding`, `password` e
  `retention` trocam `*Drive` por `Remote`. `DriveFactory` vira `RemoteFactory(ctx, state)`.
- **Rationale**: o `Syncer` usa exatamente essas cinco operações; `appProperties` não é lido fora
  de `drive.go`. Troca mecânica, coberta pelos testes atuais com o Drive falso.
- **Alternatives considered**: um `Syncer` separado para pasta (duplicaria conflitos, retenção e
  troca de senha).

## R3. Onde ficam as pastas

- **Decision** (ordem Google Drive > OneDrive > Dropbox; só pastas que existem e são graváveis):
  - **Windows**: Google Drive para computador — unidades com `Meu Drive` ou `My Drive` na raiz
    (padrão `G:\`); OneDrive — variáveis `OneDriveConsumer`, `OneDriveCommercial`, `OneDrive`;
    Dropbox — `personal.path`/`business.path` de `%APPDATA%\Dropbox\info.json` ou
    `%LOCALAPPDATA%\Dropbox\info.json`.
  - **macOS**: `~/Library/CloudStorage/GoogleDrive-*/{Meu Drive,My Drive}`,
    `~/Library/CloudStorage/OneDrive-*`, Dropbox por `~/.dropbox/info.json`.
  - **Linux**: Dropbox por `~/.dropbox/info.json` (Google Drive e OneDrive não têm cliente
    oficial; "Escolher uma pasta" cobre rclone/insync).
- **Rationale**: caminhos documentados pelos próprios programas; leitura de um JSON pequeno no
  caso do Dropbox. Sem varrer o disco.
- **Alternatives considered**: perguntar a pasta sempre (perde o "um clique").

## R4. Saber que algo mudou na pasta

- **Decision**: o mesmo ciclo da 008 — enviar com 3 s de espera após a mudança; consultar a cada
  1 min, ao desbloquear e ao voltar o foco para a janela. Listar uma pasta local é barato.
- **Rationale**: atende o ≤ 1 min da spec sem dependência nova; o programa da pasta já tem atraso
  próprio de segundos a minutos.
- **Alternatives considered**: observador de arquivos (dependência nova, comportamento diferente
  por sistema e por programa de nuvem, eventos duplicados).

## R5. Estado e compatibilidade

- **Decision**: `sync_state` ganha `place: "drive" | "folder"` (ausente = `drive`) e
  `folderPath`; `SyncAccount` (e-mail + token) só existe em `drive`. A validação do estado passa a
  exigir e-mail/token só em `drive` e caminho absoluto só em `folder`.
- **Rationale**: estados gravados pela 008 continuam válidos sem migração.

## R6. Arquivos incompletos e cópias de conflito do programa da pasta

- **Decision**: gravar como `.openhost-<aleatório>.tmp` e renomear (atômico na mesma pasta);
  `List` ignora o que não casa com `keyring.json` ou `snap-*.ohs`. Um `snap` que não abre (AEAD)
  vindo de `Folder` é tratado como "ainda não chegou": não vira `CLOUD_CORRUPT`, é tentado de novo
  na próxima consulta e só vira erro depois de 30 min sem mudar de tamanho. `keyring.json`
  ilegível segue a mesma regra.
- **Rationale**: o programa da nuvem pode estar baixando o arquivo; cópias como
  `keyring (cópia em conflito).json` não casam com o padrão e são ignoradas, nunca apagadas.

## R7. Chave órfã (envio interrompido)

- **Decision**: ao conectar (Drive ou pasta), "nuvem com cofre" = existe `keyring.json` **e** pelo
  menos um `snap-*.ohs`. Só a chave ⇒ nuvem vazia: `upload` substitui a chave
  (`UpdateKeyring`) e envia o primeiro snapshot. Regressão do teste real da 008.
- **Rationale**: uma chave sem nenhum snapshot não guarda dado nenhum; perguntar a senha dela só
  trava o usuário.

## R8. Decisão automática (`Start("auto")`)

- **Decision**: novo modo `auto`: nuvem vazia ⇒ `upload` (senha vazia); nuvem com cofre e cofre
  local sem hosts, grupos, credenciais nem encaminhamentos ⇒ `replace`; senão ⇒ `merge`. A decisão
  é no Go, que conhece o conteúdo; o frontend só mostra o campo de senha e, quando o resultado
  será `merge`, a frase sobre a senha. `FolderCandidates`/`Connect` devolvem `willMerge` para a
  tela saber qual texto mostrar antes da senha.
- **Rationale**: tira a pergunta "Juntar / Usar o do Drive" sem esconder a consequência (a senha
  deste computador passa a ser a da nuvem). `replace` e `merge` continuam disponíveis em "Mais
  opções".

## R9. Convite

- **Decision**: `VaultSettings.syncInvite`: `"pending"` gravado ao criar cofre novo; `"dismissed"`
  ao clicar "Agora não"; ausente (cofres antigos) ⇒ sem convite. Some sozinho ao ligar a
  sincronização.
- **Rationale**: atende "só para cofres novos" e "lembrado entre execuções" sem preferência nova.

## R10. Erros em linguagem simples

- **Decision**: `syncErrors.ts` mapeia código ⇒ frase + ação (ex.: `NETWORK` ⇒ "Não deu para falar
  com o Google Drive. Vamos tentar de novo sozinhos."; pasta indisponível ⇒ "A pasta do
  <programa> não está disponível"). "Detalhes" recolhido com código, operação e hora; sem
  `detail`, e-mail ou caminho. Falhas de rede/pasta não abrem aviso: só o estado "Pendente".
- **Rationale**: o texto genérico já existe em `i18n/errors.ts`; falta a frase da ação e esconder o
  técnico.

## R11. Publicar no Google

- **Decision**: `site/index.html` e `site/privacidade.html`, estáticos, publicados por
  `.github/workflows/pages.yml` a partir de `site/` (não de `docs/`, para não publicar documentos
  internos). No Console: Branding com nome OpenHost, logotipo, página inicial e política; Público
  → "Publicar app". O usuário confirma a publicação.
- **Rationale**: repositório público já permite Pages; escopos não confidenciais dispensam a
  verificação demorada.
- **Riscos**: o Google pode pedir verificação de marca (domínio da página inicial); se pedir,
  domínio próprio fica para depois e o caminho da pasta não é afetado.

## R12. Segredo OAuth de app instalado

- **Decision**: manter no `-ldflags` do release; documentar que vai embutido no binário e é tratado
  pelo Google como não confidencial; proteção pela PKCE e pelo retorno só em `127.0.0.1`. O CI
  nunca imprime o valor (passado por variável de ambiente mascarada).
- **Rationale**: é a limitação de qualquer app de computador; "não vazar" = nunca em texto fora do
  binário.
