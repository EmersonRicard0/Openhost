# Validação da 010

Data: 2026-10-27. Worktree `010-codex-backend`, integrado localmente com a branch de interface
`010-quick-connect` para validar a funcionalidade completa.

## Resultado

- `go test ./...`: passou.
- `go vet ./...`: passou.
- `GOOS=linux go vet ./internal/...`: passou.
- `GOOS=darwin go vet ./internal/...`: passou.
- `npm run lint`, `npm run typecheck` e `npm test`: passaram; 30 arquivos e 251 testes frontend.
- `wails generate module`: terminou com código 0 e gerou bindings para `OpenQuick`, `RecordRecent`,
  `QuickTarget`, `RecentEntryInput`, `RecentEntry`, `favorite` e `recents`. O gerador reporta avisos
  preexistentes para `time.Time` e o nome reservado `int`.
- Build e2e Windows (`wails build -tags e2e`): passou.
- E2e `home.spec.ts`: 4/4 passaram; cobre conexão rápida e pergunta de senha, salvar como host,
  recentes em ordem, favorito após reiniciar, parsing e sugestões.
- E2e `secrets-scan.spec.ts`: 3/3 passaram; o fluxo rápido foi adicionado como teste próprio e a
  varredura recursiva do diretório após fechar o app não encontrou senha mestra nem senha SSH.
- E2e `sync.spec.ts`: 2/2 passaram (sincronização inicial, mudança automática e fila sem rede).
- E2e `noc-ui.spec.ts`: 3/3 passaram (configurações em aba, porta/destaque e nome pelo prompt).

## Revisão de segurança (T016)

- `OpenQuick` recebe só endereço, porta e usuário. A senha é pedida pelo prompt existente; não fica
  em `QuickTarget`, `sshx.Options.Auth.Password`, no mapa de reconexão, no log nem nos eventos.
- Reconexão mantém apenas o alvo e recria as opções; autenticação é repetida pelo agente opcional e
  pelo prompt. A mesma implementação `storeKnownHosts` verifica e persiste a chave aceita.
- `RecordRecent` permite somente `kind` e os campos do tipo correspondente. A decodificação rejeita
  chaves extras, incluindo senha; a entrada salva não tem campo de segredo e fica fora de
  `SyncPreferences`.
- A verificação de disco após conexão rápida confirmou que senha SSH e senha mestra não aparecem
  em arquivos do diretório de dados.
- `Host.favorite` é um booleano no JSON selado do host. Nenhuma alteração SQL ou versão de esquema.

## Cenários do quickstart

1. Conexão rápida com senha, prompt da chave, aba, “Salvar como host” sem preencher senha e registro
   recente: passou.
2. Endereço sem usuário abre o diálogo; cancelar não cria aba: passou.
3. Alvo idêntico a host salvo reutiliza o cadastro: passou.
4. Host B e depois A aparecem em Recentes; favoritar A a remove da lista visível e continua após
   reiniciar: passou.
5. Sugestões por rótulo, setas e Enter: passou.
