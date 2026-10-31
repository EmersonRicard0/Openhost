# Quickstart: validar a 009

## Pré-requisitos

- `wails build -tags e2e` (o `global-setup` dos e2e já faz) e Docker ligado para o servidor SSH
  de teste.
- Cofre de teste: sempre `SHELLVAULT_DATA_DIR` apontando para uma pasta temporária, nunca o cofre
  real.

## Automático

```sh
go test ./...
cd frontend && npm run lint && npm run typecheck && npm test
npx playwright test noc-ui.spec.ts
```

## Cenários

1. **Ambiente** (US1): criar host "prod-olt" com ambiente Produção e "lab-sw" sem ambiente; abrir
   os dois; a aba de "prod-olt" tem `data-environment="red"` e o leitor de tela lê
   "…, ambiente Produção"; juntar as duas num grupo dividido e conferir a borda só no painel de
   produção; trocar o ambiente para Laboratório e ver a cor mudar sem reconectar.
2. **Configurações como aba** (US2): com um terminal e um SFTP abertos, abrir as Configurações
   pelo botão, pelo atalho e pela paleta; uma só aba "Configurações" marcada; clicar no terminal,
   digitar e voltar; Ctrl+W fecha as Configurações e volta à aba anterior; reiniciar sem ela.
3. **Lista** (US3): selecionar um host e ver a barra laranja; trocar para Compacta, contar os
   itens visíveis com 30 hosts (≥ 2× o confortável); reiniciar e continuar compacta.
4. **Tags e notas** (US4): adicionar "olt", "cliente-x" e a nota "VLAN 100"; buscar "OLT" e
   "vlan 100"; tentar tag repetida e 21ª tag (recusadas); exportar, apagar e importar o host e
   conferir tags, nota e ambiente.
5. **Prompt** (US5): no servidor SSH de teste, `PS1='<BNG.PINDORETAMA>'`; a aba vira
   `BNG.PINDORETAMA` em até 1 s; renomear à mão e mudar o PS1 (nome mantido); desligar a opção.
6. **Porta** (US6): focar o campo de porta, digitar 2222, salvar; sem botões − e +.

## Testes unitários de referência

- Go: validação de tags/notas/ambientes, `Update` preservando campos omitidos, `Duplicate`,
  exportação v2 de ida e volta, importação v1, padrões de ambiente com `nil` e com `[]`.
- Frontend: `extractPromptName` com os 10 formatos do SC-906 e linhas de saída comuns (sem
  falso positivo); título exibido (manual > prompt > rótulo); estado da aba "Configurações".
