# Fixtures da importação

Arquivos de exemplo para os testes de `internal/importer` (specs/003-host-import-export, R14).

Regras:

- Nada aqui contém senha, chave ou endereço reais. Endereços usam as faixas de documentação
  (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32`) e nomes `example.net`.
- Chaves de teste são geradas só para estes testes; a passphrase de teste é `teste-123`.
- Cada pasta registra abaixo como os arquivos foram produzidos (programa e versão, ou
  "sintético" quando montado à mão a partir do formato documentado).

| Pasta | Origem | Como foi gerado |
|---|---|---|
| `openssh/` | `~/.ssh/config` | à mão, seguindo `ssh_config(5)` |
| `ppk/` | chaves do PuTTY | `puttygen` (comandos no cartão 49) |
| `putty/` | sessões do KiTTY portátil | sintético |
| `csv/` | planilhas | Excel pt-BR e à mão |
| `mobaxterm/` | `.mxtsessions`, `MobaXterm.ini` | sintético (validar com arquivo real no quickstart) |
| `securecrt/` | XML de Export Settings | sintético (validar com arquivo real no quickstart) |
