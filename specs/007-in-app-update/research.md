# Pesquisa: atualização pelo próprio app

Decisões técnicas da feature 007 ([spec](./spec.md)).

## R1. De onde vem a informação de versão

**Decisão**: API pública de releases do GitHub do repositório `EmersonRicard0/Openhost`
(`GET /repos/{owner}/{repo}/releases?per_page=20`), sem autenticação, com `User-Agent:
OpenHost/<versão>` e `If-None-Match` (ETag guardado) para que verificações sem novidade
respondam 304 e não gastem cota. Escolhe a maior versão SemVer que não seja rascunho, que seja
estável (ou de teste, se a opção estiver ligada) e que tenha o pacote do formato instalado
(FR-702, FR-703). Notas: o `body` da release (já vem de `docs/release-notes/<versão>.md`).

**Motivo**: é onde as versões já são publicadas; não exige servidor do projeto (Princípio III).
O limite de 60 consultas por hora por IP sem autenticação sobra para uma consulta a cada 6 h.

**Alternativas**: arquivo `latest.json` num site próprio — rejeitado: exige hospedar algo;
consulta ao `releases/latest` — rejeitado: não enxerga versões de teste.

## R2. Autenticidade do pacote

**Decisão**: o workflow de release passa a assinar o `SHA256SUMS.txt` com uma chave Ed25519
(`SHA256SUMS.txt.sig`, 64 bytes em base64), com a chave privada num segredo do GitHub
(`UPDATE_SIGNING_KEY`). O app traz a chave pública embutida (`internal/updater/pubkey.go`) e só
instala se: (1) a assinatura do `SHA256SUMS.txt` confere com a chave embutida; (2) o SHA-256 do
pacote baixado é o listado ali para aquele nome de arquivo. Falha em qualquer passo descarta o
arquivo (FR-710). Assinatura com `crypto/ed25519` da biblioteca padrão do Go; no workflow, um
pequeno comando Go (`scripts/sign-sums`) faz a assinatura, sem ferramenta de terceiros.

**Motivo**: o HTTPS só protege o transporte; quem invadir a conta do GitHub ou trocar um
arquivo da release não tem a chave privada. Ed25519 é padrão, pequeno e está na biblioteca
padrão (Princípios II e V).

**Alternativas**: só o hash do `SHA256SUMS.txt` — rejeitado: quem troca o pacote troca a lista;
minisign/cosign — rejeitado: dependência a mais para o mesmo resultado; certificados de
assinatura de código da Microsoft/Apple — fora do alcance agora (pagos), e não substituem a
verificação do próprio app.

**Chave**: gerada uma vez pelo dono do projeto (`go run ./scripts/sign-sums -gen`), privada
guardada como segredo do repositório e num cofre pessoal; pública commitada. Perder a privada
exige publicar uma versão com chave nova instalada à mão.

## R3. Formato de instalação

**Decisão**: detectado pelo app no início (`updater.DetectInstall`):

| Sistema | Como reconhece | Formato | Aplicação |
|---|---|---|---|
| Windows | executável dentro da pasta de instalação com a chave de desinstalação `OpenHostOpenHost` no registro | `nsis` | 1 clique |
| Windows | sem a chave (ex.: zip/portátil, build de dev) | `unmanaged` | manual |
| macOS | executável dentro de `*.app/Contents/MacOS`, pasta do `.app` gravável | `app` | 1 clique |
| macOS | `.app` em pasta sem permissão | `app-readonly` | manual |
| Linux | variável `APPIMAGE` definida e o arquivo gravável | `appimage` | 1 clique |
| Linux | executável em `/usr/bin` ou `/usr/local/bin` com `dpkg -S` ou registro do `rpm` | `deb` / `rpm` | manual com comando |
| qualquer | build de desenvolvimento (`wails dev`, tag `e2e`) | `dev` | nunca oferece |

**Motivo**: cada formato tem um jeito próprio e seguro de trocar; pacotes do sistema pedem
`sudo` e o gerenciador do sistema deve continuar sabendo da versão (FR-715).

## R4. Aplicar sem o app estar aberto

**Decisão**: um processo auxiliar. Ao confirmar o reinício, o app copia o próprio executável
para a pasta temporária da atualização e o roda como `OpenHost --apply-update <manifesto>`
destacado, depois fecha normalmente (fechando sessões e travando o cofre). O auxiliar:

1. espera o processo do app terminar (PID no manifesto, até 60 s);
2. aplica: Windows — roda o instalador com `/S` (o NSIS pede elevação pelo UAC uma vez, como na
   instalação original); macOS — monta o `.dmg` com `hdiutil attach -nobrowse -readonly`, copia
   o `.app` para uma pasta irmã temporária, troca com `rename` atômico e desmonta; AppImage —
   grava o novo arquivo ao lado, `chmod +x` e `rename` sobre o antigo;
3. em sucesso grava `last-update.json` (`ok`, versão) e reabre o app; em falha mantém o
   original (no macOS e AppImage o original só é trocado no `rename` final; no Windows o NSIS
   não remove a versão instalada se falhar) e grava `failed` com o motivo, que o app mostra no
   próximo início (FR-713).

"Atualizar ao fechar" registra o manifesto e o app, ao sair por qualquer caminho normal,
dispara o auxiliar.

**Motivo**: um executável não se substitui enquanto roda (Windows) e o `.app` aberto não deve
ser trocado por baixo; usar o próprio binário evita distribuir um segundo programa.

**Alternativas**: biblioteca de autoatualização de terceiros (ex.: go-selfupdate) — rejeitada:
não cobre NSIS/dmg/AppImage do jeito do projeto e traz dependência; atualizar só o executável
no Windows sem o instalador — rejeitado: atalhos e desinstalador ficariam com a versão velha.

## R5. Download

**Decisão**: para a pasta de dados do app, `updates/<versão>/`, com nome `.part` até terminar;
`Range` para continuar de onde parou; tamanho conferido com o da release; progresso emitido a
cada 250 ms no máximo. Cancelar apaga o `.part`. Só um download por vez. Espaço livre conferido
antes (tamanho do pacote × 2). Arquivos de versões antigas são apagados no início seguinte a
uma atualização bem-sucedida. Proxy: `http.ProxyFromEnvironment` e, no Windows/macOS, o proxy
do sistema que o Go já lê do ambiente.

## R6. Onde ficam as preferências

**Decisão**: na mesma tabela de preferências do app (`appwin.Preferences`, já persistida fora
do cofre, legível com o cofre bloqueado), campo `updates`: `{auto: bool, prerelease: bool,
skipped: string, remindAfter: string(ISO), lastCheck: string(ISO), etag: string}`. Padrão
`auto: true, prerelease: false`. A verificação não depende do cofre estar aberto.

## R7. Testes sem publicar releases de verdade

**Decisão**: a URL base da API e a chave pública são injetáveis (`updater.Config`); os testes Go
usam `httptest` com releases falsas, pacotes de poucos bytes e uma chave de teste. O e2e usa um
servidor local de releases e a tag `e2e` permite apontar o app para ele e trocar a chave pela de
teste (via `TestService`), cobrindo aviso, progresso, assinatura inválida e "pronto para
reiniciar"; a troca real do executável é validada à mão (quickstart §3) em cada sistema.
