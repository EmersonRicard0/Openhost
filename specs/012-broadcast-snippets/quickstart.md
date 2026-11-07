# Quickstart: validar a 012

Pré-requisitos: build e2e (`npx playwright test` compila sozinho) e o servidor SSH de teste
(`node scripts/sshd.mjs up`). Comandos a partir de `frontend/`.

## Cenários (viram `tests/e2e/broadcast-snippets.spec.ts`)

1. **Digitar no grupo** (US1): 3 sessões CMD num grupo, ligar pelo botão da aba, digitar
   `echo b1` + Enter → `b1` nos três; desmarcar o 3º → `echo b2` só nos dois primeiros; trocar o
   painel ativo e digitar → sai do novo ativo; separar um painel → ele não recebe mais; fechar o
   grupo até 1 sessão → botão some.
2. **Produção** (US2): host SSH com ambiente Produção + CMD no grupo; ligar → diálogo "Digitar em
   produção?" com o rótulo; cancelar mantém desligado; aceitar → faixa "Recebendo do grupo ·
   Produção". Mudar outro host para Produção com o modo ligado → painel desmarcado + aviso.
3. **Colagem** (US2): modo ligado, colar 3 linhas → diálogo com "Vai para 2 painéis"; cancelar
   não escreve em nenhum; linha curta vai direto.
4. **Biblioteca** (US3): criar "Eco" com `echo snip`; paleta → "eco" → Enter: `echo snip` na
   linha sem executar; marcar "Executar ao enviar" → executa; bloquear e abrir → comando continua.
5. **Campos** (US4): `echo {vlan}-{vlan}` → formulário com um campo "vlan"; vazio é recusado;
   100 → `echo 100-100`; reabrir → 100 preenchido; `{{x}}` envia `{x}`.
6. **Tags e grupo** (US5): comandos `huawei` e `mikrotik`, host com tag `huawei` → `huawei`
   primeiro; num grupo, Shift+Enter envia aos painéis conectados e avisa o desconectado.
7. **Exportar/importar** (US6): exportar com comandos, importar num cofre novo → nomes, textos,
   tags e "Executar ao enviar" iguais; importar de novo → prévia mostra repetidos.

## Comandos

```text
go test ./...                       # model, domain, vault (migração 3), cloudsync, exporter, importer, bridge
npm run typecheck && npm run lint && npm test
npx playwright test tests/e2e/broadcast-snippets.spec.ts tests/e2e/split.spec.ts tests/e2e/sync.spec.ts tests/e2e/import-export.spec.ts
```

Resultado esperado: tudo verde; resultados por cenário e SC em `validation.md`.
