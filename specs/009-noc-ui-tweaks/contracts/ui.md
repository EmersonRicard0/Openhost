# Contrato de interface: 009

Seletores estáveis usados pelos e2e.

## Aba "Configurações"

- Item da barra de abas `role="tab"`, nome acessível "Configurações", `aria-selected="true"`
  quando ativa; botão de fechar "Fechar Configurações".
- Com ela ativa, nenhuma outra aba tem `aria-selected="true"`.
- A região continua `role="region"` com nome "Configurações" (os e2e da 008 e da 007 dependem
  disso).

## Ambiente

- Editor de host: `combobox` "Ambiente", opções "Nenhum" e os nomes da lista.
- Aba de sessão: atributo `data-environment="<color id>"`; nome acessível termina com
  `, ambiente <nome>`.
- Terminal e painel: atributo `data-environment="<color id>"` no contêiner do terminal.
- Configurações → Aparência → "Ambientes": lista editável (nome, cor, remover) e "Adicionar
  ambiente".

## Lista de hosts

- Item selecionado: `aria-selected="true"` e `data-selected` (barra laranja via CSS).
- Lista com `data-density="comfortable" | "compact"`.
- Configurações → Aparência: grupo de rádio "Densidade da lista" (Confortável, Compacta).

## Tags e notas

- Editor de host: campo "Tags" (Enter ou vírgula adiciona; cada tag com botão "Remover tag <nome>")
  e área de texto "Notas" com contador `n/2000`.
- Item do host: tags como `<span data-tag>`.

## Porta

- Editor de host: `spinbutton` "Porta" sem os botões "Diminuir"/"Aumentar".

## Nome pelo prompt

- Configurações → Terminal: checkbox "Nome da aba pelo prompt".
- Aba: dica (`title`) mostra `rótulo — usuário@endereço:porta` mesmo com nome vindo do prompt.
