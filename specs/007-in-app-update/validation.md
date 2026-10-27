# Validação: atualização pelo próprio app (007)

Data: 2026-10-27 · Branch `007-in-app-update` · Windows 11

## §1 Unidade (Go) — ✅

`go vet ./...` e `go test ./...` verdes; `GOOS=linux` e `GOOS=darwin go vet ./internal/...`
verdes; `go test -tags e2e ./internal/bridge/...` verde. Cobre escolha da versão (estável/teste,
sem rebaixar, sem pacote compatível), formato de instalação por sistema, assinatura válida e
inválida, hash errado, download com retomada e cancelamento, `remind`/`skip`, manifesto fora de
`updates/` recusado e, novo, build de desenvolvimento sem verificação automática.

## §2 Ponta a ponta — ✅

`npx playwright test tests/e2e/update.spec.ts` → 5 testes verdes (também com `--repeat-each 2`),
contra o servidor de releases local de `tests/e2e/helpers/releases.ts` (chave Ed25519 gerada no
teste, passada por `SHELLVAULT_E2E_UPDATE_URL`/`_PUBKEY`/`_INSTALL_KIND`):

1. Release mais nova → aviso em até 10 s sem tirar o foco; novidades expansíveis.
2. "Lembrar depois" some e o indicador da barra de status reabre; "Pular esta versão" não volta
   ao reabrir o app, e a 0.7.0 volta.
3. "Atualizar" passa por "baixando" com barra de progresso e chega a "pronta para instalar".
4. Assinatura inválida → "Não foi possível confirmar a origem da atualização." e nada a reiniciar.
5. "Reiniciar para atualizar" com um terminal aberto → "1 sessão aberta será encerrada", com
   "Atualizar ao fechar" e "Reiniciar agora"; cancelado, sem reiniciar de fato.
6. Automático desligado → app reaberto sem nenhuma requisição ao servidor.
7. Sobre mostra versão, "Você já está na versão mais recente" e última verificação; a paleta
   acha a versão nova.
8. (T018) `.deb` simulado → comando `sudo apt install ./openhost_0.6.0_amd64.deb`, copiar e abrir
   pasta, sem reiniciar.

Regressão: suíte inteira com o servidor SSH de teste → 51 verdes; 4 instáveis na primeira
rodada logo após o Docker subir (`daily-use` ×2, `performance`, `split`) passaram ao repetir.

## §3 Manual em cada sistema — pendente

Depende do dono do projeto: gerar a chave com `go run ./scripts/sign-sums -gen`, trocar o
placeholder de `internal/updater/pubkey.go` pela chave pública, gravar a privada no segredo
`UPDATE_SIGNING_KEY` e publicar `v0.6.0-rc.1` e `v0.6.0-rc.2`.
