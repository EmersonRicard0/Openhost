# Quickstart: validar a sincronização pelo Google Drive

## 1. Automático

```powershell
go test ./internal/cloudsync/... ./internal/vault/... ./internal/bridge/...
cd frontend; npm run typecheck; npm run lint; npm test
npm run e2e -- sync.spec.ts
```

O e2e sobe o Drive falso (`internal/cloudsync/drivefake`) e usa duas pastas de dados (A e B)
como dois computadores.

## 2. Cenários (e2e com o Drive falso)

1. **Conectar (US1)**: em A, Configurações → Sincronização → Conectar. Esperado: e-mail da conta
   e "Sincronizado agora"; o Drive falso tem `keyring.json` e um `snap-…`; os bytes não contêm
   rótulo, endereço, usuário nem senha dos hosts de teste.
2. **Mudança sobe sozinha**: criar host em A ⇒ novo `snap-…` em ≤ 10 s.
3. **Sem rede**: derrubar o fake, editar host ⇒ "Pendente de sincronizar"; subir de novo ⇒
   enviado.
4. **Computador novo (US2)**: em B, primeira tela → "Usar meu cofre do Google Drive" → senha
   errada (recusa, nada gravado) → senha certa ⇒ mesmos hosts de A.
5. **Juntar**: B com cofre próprio conecta ⇒ diálogo juntar/usar da nuvem/cancelar; "Juntar" ⇒
   itens dos dois, sem duplicar o host igual.
6. **Dois computadores (US3)**: A muda host X e B muda host Y ⇒ ambos com as duas mudanças sem
   pergunta; A e B mudam X com o fake desligado ⇒ ao religar, "Conflito em X", escolha aplica
   nos dois.
7. **Troca de senha**: trocar em A ⇒ B pede a nova senha e recusa a antiga.
8. **Histórico (US4)**: apagar host, restaurar a versão anterior ⇒ host volta em A e B.
9. **Desconectar**: "Manter cópia" ⇒ nenhuma requisição ao fake depois; "Apagar do Drive" ⇒ fake
   vazio e B mostra "cofre da nuvem removido" sem perder o local.
10. **Token revogado**: fake responde 401 ⇒ "Conexão com o Google Drive perdida" + "Conectar de
    novo".

## 3. Manual com conta Google real (depende do client id do dono do projeto)

- Conectar pelo navegador real em Windows, macOS e Linux; conferir em
  <https://myaccount.google.com/permissions> que o OpenHost aparece só com "dados de
  configuração do app".
- Dois computadores reais: cenários 2, 4, 6 e 9.
- Registrar em `specs/008-drive-sync/validation.md`.
