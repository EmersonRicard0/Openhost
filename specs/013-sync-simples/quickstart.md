# Quickstart: validar a sincronização simples

## 1. Automático

```powershell
go test ./internal/cloudsync/... ./internal/bridge/...
cd frontend; npm run typecheck; npm run lint; npm test
npx playwright test tests/e2e/sync-folder.spec.ts tests/e2e/sync.spec.ts tests/e2e/sync-devices.spec.ts
```

Os e2e usam `SHELLVAULT_DATA_DIR` temporário para A e B e uma pasta comum temporária como "pasta
sincronizada" (`SHELLVAULT_E2E_SYNC_FOLDER` faz a detecção devolvê-la como Google Drive).

## 2. Cenários

1. **Pasta, um clique (US1, US2)**: A cria cofre → convite "Sincronizar pela pasta do Google
   Drive" → clique → "✓ Sincronizado pela pasta do Google Drive"; a pasta tem `OpenHost/keyring.json`
   e um `snap-…`; nenhum nome de arquivo contém rótulo, endereço ou o nome do computador.
2. **Outro computador (US1, US3)**: B na primeira tela → "Usar o cofre da pasta do Google Drive" →
   senha errada (erro no campo, nada gravado) → senha certa ⇒ hosts de A.
3. **Juntar sem perguntar (US3)**: B com hosts próprios liga a pasta ⇒ uma senha, frase de
   "juntar", hosts dos dois sem duplicar; "Mais opções" mostra "Usar só o cofre de lá".
4. **Mudanças (US1)**: editar em A ⇒ aparece em B em ≤ 1 min; editar o mesmo host com a pasta
   "parada" (renomeada) ⇒ conflito ao voltar.
5. **Arquivo chegando (R6)**: copiar metade de um `snap` para a pasta de B ⇒ nenhum erro; completar
   ⇒ aplicado.
6. **Chave órfã (US4)**: pasta e Drive falso só com `keyring.json` ⇒ Conectar envia sem pedir senha.
7. **Agora não (US2)**: dispensar ⇒ não volta ao reiniciar; ícone de nuvem reabre o convite.
8. **Erros (US5)**: pasta removida ⇒ "Pendente" e "A pasta do Google Drive não está disponível",
   sem aviso repetido; "Detalhes" só com código, operação e hora.
9. **Google (US6)**, manual: conta não cadastrada como teste conecta pela versão de release sem
   aviso de app não verificado.

## 3. Nada vaza (SC-1305)

- `git log --all -S` pelos valores do cliente OAuth ⇒ nada; `site/` sem credencial, ID de projeto
  ou e-mail; logs do app e do CI sem senha, token, caminho ou e-mail.
