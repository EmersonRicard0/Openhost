# Validação: atualização pelo próprio app

Contrato em [contracts/bridge-updater.md](./contracts/bridge-updater.md); estados em
[data-model.md](./data-model.md).

## 1. Unidade (Go)

```bash
go test ./internal/updater/... ./internal/bridge/... -run Update
```

Esperado: escolha da versão (estável/teste, sem rebaixar, sem pacote compatível = nada),
detecção do formato de instalação por sistema, assinatura válida/inválida, hash errado,
download com retomada e cancelamento, `remind`/`skip`, manifesto fora de `updates/` recusado.

## 2. Ponta a ponta (app real, servidor de releases local)

```bash
cd frontend && npx playwright test tests/e2e/update.spec.ts
```

1. Release falsa mais nova → aviso com versão e notas em até 10 s; o terminal mantém o foco.
2. "Lembrar depois" some; "Pular esta versão" não volta para essa versão e volta para uma maior.
3. "Atualizar" mostra progresso e chega a "Reiniciar para atualizar".
4. Pacote com assinatura inválida → "Não foi possível confirmar a origem da atualização".
5. "Reiniciar" com sessões abertas mostra a contagem.
6. Verificação automática desligada → nenhuma requisição ao servidor local.
7. Configurações mostram versão, última verificação e "Procurar atualizações"; paleta também.

## 3. Manual em cada sistema (release de teste real)

Com `v0.6.0-rc.1` e `v0.6.0-rc.2` publicadas e "Receber versões de teste" ligado, instalar a rc.1
e atualizar para a rc.2 pelo app: Windows (instalador), macOS (`.app` em Aplicativos), Linux
AppImage (1 clique) e `.deb` (comando mostrado). Conferir versão no "Sobre", cofre abrindo com a
mesma senha, hosts e preferências iguais. Registrar em `validation.md`.
