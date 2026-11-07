# Validação: ajustes de interface para o dia a dia em NOC (009)

Data: 2026-10-30 · Branch `009-noc-ui-tweaks` · Windows 11

## §1 Unidade — ✅

- Go: `go vet` e `go test` de todos os pacotes (fora `dist/`) verdes. Cobre validação de tags,
  nota e ambientes, `Update` mantendo campos omitidos, `Duplicate`, padrões de ambiente com cofre
  antigo, `nil` e `[]`, exportação v2 de ida e volta, importação v1, preferências `hostDensity` e
  `promptTitle` e ida e volta da sincronização.
- Frontend: `npx vitest run` → 28 arquivos, 231 testes verdes (`extractPromptName` com os formatos
  do SC-906 e linhas de saída comuns, contraste das cores de ambiente ≥ 3:1 nos três temas,
  título manual > prompt > rótulo, busca normalizada com 500 hosts, `settingsOpen/Active`).
- `tsc -b` e `eslint .` sem erros.

## §2 Ponta a ponta — ✅

`npx playwright test tests/e2e/noc-ui.spec.ts --repeat-each 2` → 12 verdes:

1. **Ambiente** (US1): aba com `data-environment`, nome acessível com o ambiente, borda no painel;
   trocar o ambiente muda a cor sem reconectar.
2. **Configurações como aba** (US2): uma só aba marcada; volta à sessão ao fechar.
3. **Lista** (US3): barra de destaque no selecionado; compacta com item de 28 px.
4. **Tags e notas** (US4): vírgula e Enter adicionam, repetida recusada, busca por tag e nota,
   gravado no cofre.
5. **Prompt** (US5): `PS1='<BNG.PINDORETAMA>'` no servidor SSH de teste dá o nome à aba;
   renomeada à mão, mantém.
6. **Porta** (US6): campo simples, sem − e +.

Regressão: `split` (4, incluindo o novo "agrupa com qualquer sessão da barra"), `groups`, `menus`,
`sync`, `update`, `appearance` e `personalization` verdes. O cenário de tags falhou uma vez na
primeira rodada fria (a tag digitada com vírgula não chegou ao host); passou nas repetições e o
teste agora confere o chip logo depois da vírgula.

## §3 Critérios de sucesso

| SC | Resultado |
|---|---|
| SC-901 | ✅ faixa de 3 px na aba e borda no terminal; contraste ≥ 3:1 conferido por teste |
| SC-902 | ✅ e2e de US2 e teste do store: nenhuma sessão com `aria-selected="true"` |
| SC-903 | ✅ 28 px por item na compacta contra o dobro na confortável |
| SC-904 | ✅ busca por tag e nota; 500 hosts no teste unitário |
| SC-905 | ✅ foco seleciona o valor; digitar 2222 substitui |
| SC-906 | ✅ formatos do SC-906 no teste unitário; e2e com o prompt Huawei em até 1 s |
| SC-907 | ✅ ida e volta de exportação v2, importação v1 e sincronização nos testes de Go |

## §4 Revisão de segurança (T027) — ✅ sem achados

- Tags e nota passam por `domain.NormalizeHostMetadata` ao salvar pela ponte, na importação
  (OpenHost v2) e ao aplicar itens da sincronização; ambientes por `domain.ValidateEnvironments`
  (nome, cor da lista fechada, máximo 12). Erros só com `field`, sem o conteúdo da nota.
- Nenhum log do Go ou `console.*` do frontend toca tags, nota ou ambiente; o frontend não usa
  `innerHTML` e mostra tags e nota só como texto.
- Os campos novos só saem do cofre pela sincronização já consentida (008) e pela exportação
  cifrada (`vault.Seal`). `environmentId` desconhecido é mantido no cofre e tratado como sem
  ambiente, como no data-model.
- A leitura do prompt lê só o buffer local do xterm; nada é enviado ao equipamento.

## §5 Nota de versão

`docs/release-notes/0.7.0.md` (rascunho) registra a exportação v2 e a perda dos campos novos se
uma versão anterior editar o host.
