# Amostras de login (feature 005)

Textos típicos que equipamentos de rede (`vendors/<id>/`) e servidores (`servers/`) mostram ao
conectar, montados a partir de documentação pública. Nomes, IPs (faixa de documentação
192.0.2.0/24) e datas são fictícios; nada aqui veio de um ambiente real sem ser anonimizado.

Cada arquivo começa com cabeçalhos e depois o texto exatamente como chega (com `\r\n` e
sequências ANSI, por isso `-text` no `.gitattributes`):

```text
# fonte: banner|terminal      onde o texto aparece (mensagem pré-login ou saída do terminal)
# versao: SSH-2.0-...          versão SSH anunciada pelo servidor
# os-release: ID=...           (opcional) o que a leitura de /etc/os-release devolveria
```

`TestVendorSamples` espera que cada amostra de `vendors/<id>/` resolva para `<id>`;
`TestServerSamplesAreNotNetwork` espera que nenhuma amostra de `servers/` resolva para um
fabricante de rede. Os dois passam os cabeçalhos para `ResolveOS`. As amostras
`servers/motd-*.txt` citam fabricantes de propósito (SC-502).

Gerador: as amostras foram escritas por um script descartável; para acrescentar, crie o arquivo
à mão seguindo o formato.
