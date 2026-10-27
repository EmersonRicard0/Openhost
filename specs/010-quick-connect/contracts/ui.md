# Contrato de interface: 010

- Tela inicial: `region` "Início".
- Barra: `combobox` "Conectar a um host" com `listbox` "Hosts sugeridos"; erro em `role="alert"`.
- Diálogo de usuário: `dialog` "Usuário para <alvo>", campo "Usuário", botão "Conectar".
- Blocos: `region` "Favoritos" e `region` "Recentes"; cada card é `button` com nome
  `<rótulo>, <usuário@endereço[:porta]>` e botão "Favoritar <rótulo>"/"Desfavoritar <rótulo>".
- Menu do host na lista lateral: item "Favoritar"/"Desfavoritar".
- Menu da aba de sessão rápida: item "Salvar como host".
