# Contrato: interface

## Convite (`SyncInvite`)

- Mostrado quando `syncInvite === "pending"` e a sincronização está desligada; não modal, no topo
  da área vazia de sessões.
- Título "Usar estes hosts em outros computadores?"; botão principal pela ordem: "Sincronizar pela
  pasta do <programa>" (primeiro candidato) → "Conectar Google Drive" (build com OAuth) →
  "Escolher uma pasta"; "Agora não"; "Mais opções" com os demais.
- "Agora não" grava `dismissed`.

## Ícone de nuvem (`SyncStatusIcon`)

- Na barra de status; nome acessível "Sincronização: <estado>"; dica com "pasta do <programa>"
  ou o e-mail.
- Desligada ⇒ abre o convite (mesmo dispensado); ligada ⇒ abre Configurações → Sincronização.

## Senha da nuvem (`CloudPasswordDialog`, substitui `StartChoiceDialog`)

- Um campo: "Senha que você usa no outro computador".
- `willMerge` ⇒ frase "Os hosts deste computador serão juntados aos do outro, e a senha daqui
  passa a ser a de lá."
- "Mais opções": "Usar só o cofre de lá (o deste computador vira cópia de segurança)".
- Senha errada ⇒ erro no próprio campo.

## Configurações → Sincronização (`SyncSettings`)

- Ligada: "✓ Sincronizado pela pasta do <programa>" ou "✓ Sincronizado com <e-mail>", estado
  pendente/erro na mesma linha, "Desconectar", "Mais opções" fechado (nome do computador, versões
  anteriores, sincronizar agora, conflitos).
- Desligada: o mesmo conteúdo do convite.

## Erros

- Frase + ação (`syncErrors.ts`); "Detalhes" recolhido com código, operação e hora.
- Rede/pasta indisponível: sem aviso; estado "Pendente".

Tudo operável por teclado, nomes acessíveis, preto piano com laranja do chevron.
