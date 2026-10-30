# Contrato de interface: 012

Nomes acessíveis e marcações que os e2e usam.

## Transmissão

- Botão na aba do grupo: `aria-pressed`, nome "Digitar no grupo"; `data-broadcast` na aba quando
  ligado, nome da aba com ", digitando no grupo".
- Paleta: comando "Digitar no grupo: ligar" / "Digitar no grupo: desligar".
- Atalho configurável `broadcast` (padrão Ctrl+Shift+G / ⇧⌘G; Ctrl+Shift+B já é a barra lateral), sem efeito fora de grupo.
- O cabeçalho do painel (`[data-pane-header]`) vira a faixa, sem mudar a altura do painel:
  `data-broadcast="receive"` com `role="status"` "Recebendo do grupo" (+ " · Produção" no `prod`;
  "Desconectado — não recebe" sem conexão); painel desmarcado fica sem `data-broadcast`.
- Painel ativo: `data-broadcast="send"` no cabeçalho, status "Transmitindo para N painéis".
- Cabeçalho do painel: checkbox "Receber do grupo" (só com o modo ligado).
- Confirmação de produção: `dialog` "Digitar em produção?", lista com os rótulos, botões
  "Transmitir mesmo assim" e "Cancelar".
- Confirmação de colagem: `dialog` "Colar no grupo?" com "Vai para N painéis" (N conta o ativo) e
  botão "Colar em todos".

## Biblioteca

- Configurações → seção "Comandos": lista (`role="list"`), botões "Novo comando", "Duplicar",
  "Apagar"; formulário com "Nome", "Comando" (área de texto), "Tags" (`TagInput` da 009) e
  checkbox "Executar ao enviar".
- Paleta: grupo "Comandos"; item com nome e a primeira linha do texto; desativado sem terminal com
  a dica "Abra um terminal para enviar".
- Num grupo: Enter = "Enviar ao painel", Shift+Enter = "Enviar ao grupo (N)", ambos visíveis no
  rodapé da paleta.
- Formulário de campos: `dialog` com o nome do comando, um campo por `{nome}` com o rótulo igual
  ao nome, botão "Enviar"; erro "Preencha o campo <nome>" e "O campo <nome> não pode ter quebra
  de linha".
- Aviso depois de enviar ao grupo com painel desconectado: toast "1 painel desconectado não
  recebeu" / "N painéis desconectados não receberam".
