# Pesquisa: ícones e detecção de fabricantes de rede

Decisões técnicas da feature 005 ([spec](./spec.md)). Cada item: decisão, motivo e alternativas.

## R1. Fontes de sinal e onde capturá-las

**Decisão**: quatro fontes, todas no processo Go:

1. **Versão SSH** (`ssh.Client.ServerVersion()`): já usada por `ClassifyServerVersion`.
2. **Mensagem pré-login**: `ssh.ClientConfig.BannerCallback` em `sshx.Dial`, que guarda a
   mensagem (limitada a 8 KiB) num campo do `Client`. O callback devolve `nil` sempre: a
   mensagem nunca impede a autenticação.
3. **Texto do terminal**: em `sshx.Terminal.Start`, o `io.Writer` de saída passa por um
   observador (`vendorSniffer`) que copia para um buffer em memória só os primeiros 8 KiB ou
   os primeiros 5 s, o que vier antes, e depois se desliga (as escritas seguintes vão direto
   para a saída, sem custo).
4. **Arquivo da distribuição** (`/etc/os-release` num canal `exec` à parte): continua igual,
   com as restrições de R4.

**Motivo**: são os pontos em que o app já recebe esses bytes; nenhum canal novo é aberto e
nada é enviado ao servidor. O observador fica no `sshx` (não no `session.Batcher`) para valer
só para terminais SSH; terminais locais e SFTP não passam por ele.

**Alternativas**: observar no frontend (xterm) — rejeitada: o texto teria de voltar pela ponte
e a regra do Princípio II prefere a lógica no processo principal; enviar `display version` /
`show version` — rejeitada: FR-509 proíbe enviar qualquer coisa ao terminal.

## R2. Assinaturas por fabricante

**Decisão**: tabela fixa em Go (`internal/sshx/vendors.go`), testável sem rede, com a fonte em
que cada assinatura vale. Comparação sem diferença de maiúsculas, sobre texto com sequências de
controle removidas (R3). Assinaturas iniciais:

| Fabricante (id) | Versão SSH | Pré-login / terminal |
|---|---|---|
| Huawei (`huawei`) | `huawei` | `huawei versatile routing platform`, `vrp (r) software`, `huawei technologies`, `the max number of vty users`, `the initial password poses security risks` |
| ZTE (`zte`) | `zte` (inclui `ZTE_SSH`) | `zxr10`, `zxan`, `zte corporation` |
| Datacom (`datacom`) | `datacom`, `dmos` | `dmos`, `dmswitch`, `datacom dm` |
| Cisco (`cisco`) | `cisco` | `cisco ios`, `cisco nexus`, `cisco adaptive security appliance`, `ios-xe`, `ios xr`, `nx-os`, `type help or '?' for a list of available commands` (ASA) |
| Juniper (`juniper`) | `junos`, `juniper` | `junos`, `juniper networks` |
| Hillstone (`hillstone`) | `hillstone` | `hillstone networks`, `stoneos`, prompt `^sg-6000[\w-]*[#>] ?$` |
| Fortinet (`fortinet`) | `fortigate`, `fortinet`, `fortissh` | `fortios`, prompt `^[\w.-]+ (\([\w-]+\) )?# ?$` (nome, espaço e `#`: o FortiOS separa o nome do `#`, Cisco e Linux não) |
| MikroTik (`mikrotik`) | `rosssh`, `routeros` | `mikrotik routeros`, prompt `^\[[^@\]]+@[^\]]+\] > ?$` |
| HPE (`hpe`) | `comware`, `aruba`, `procurve` | `comware software`, `hewlett packard enterprise development`, `arubaos`, `procurve` |

O prompt `<nome>` (Huawei VRP e Comware) **não** é assinatura: os dois fabricantes o usam.

Só assinaturas compostas ou próprias do sistema do equipamento valem no texto do terminal
(ex.: `cisco ios`, não `cisco`), para não reconhecer um servidor Linux cuja mensagem de
boas-vindas cita a marca (SC-502). Os prompts usam expressão regular ancorada na linha.

**Motivo**: os textos acima são os que os sistemas desses fabricantes mostram ao entrar (tela
de boas-vindas, aviso legal padrão ou prompt). A tabela fica pequena e fácil de ampliar.

**Alternativas**: lista de palavras simples (o nome da marca) — rejeitada pelos falsos
positivos; aprendizado ou heurística de prompt genérico — fora de escopo (Princípio V).

## R3. Normalização do texto

**Decisão**: antes de comparar, remover sequências ANSI (CSI `ESC [ … letra`, OSC
`ESC ] … BEL|ESC \`, outros `ESC x`), trocar `\r` por `\n`, descartar bytes de controle
restantes e converter para minúsculas. Bytes inválidos em UTF-8 viram espaço. A função é pura e
testada com amostras com cores.

**Motivo**: equipamentos colorem o prompt e reescrevem a linha com `\r`; sem normalizar, as
âncoras de linha falham.

**Alternativas**: usar o parser do xterm no frontend — rejeitada (R1).

## R4. Ordem, momento e o canal extra

**Decisão**:

- A detecção roda numa goroutine depois de `Dial` devolver o terminal; `dialHost` não espera
  mais por ela (FR-512). A goroutine termina em no máximo ~5,5 s (janela do observador + folga)
  ou quando a sessão fecha.
- Ordem de confiança (FR-507): versão SSH → mensagem pré-login → texto do terminal →
  `/etc/os-release`. A primeira fonte que reconhece um fabricante de rede decide. Se a leitura
  de `/etc/os-release` reconhecer uma distribuição Linux, ela decide mesmo que o terminal tenha
  sugerido um fabricante (Linux confirmado vence o texto do terminal).
- O canal extra de `/etc/os-release` só abre quando: (a) a versão SSH é OpenSSH/dropbear
  genérica, como hoje; (b) a mensagem pré-login não reconheceu fabricante; (c) o
  `detectedOs` atual do host não é um fabricante de rede (FR-513). Ele roda em paralelo com a
  janela do terminal, não antes do terminal abrir.
- Resultado vazio não grava nada (FR-510); resultado diferente do atual grava pelo
  `domain.SetDetectedOS` existente.

**Motivo**: elimina a espera de até 3 s; a ordem prioriza o que o próprio servidor declara.

**Alternativas**: manter a leitura síncrona com timeout menor — rejeitada: ainda atrasa e
continua mandando um comando a equipamentos de rede já conhecidos.

## R5. Privacidade do texto examinado

**Decisão**: o buffer do observador e a mensagem pré-login vivem só na memória da goroutine de
detecção e são descartados ao fim dela; nunca entram em erro, log, evento para o frontend ou
cofre. Só o id do fabricante é gravado (FR-508). Teste: a função de classificação recebe o texto
e devolve só o id; um teste de integração confere que nenhum evento ou log contém trechos da
amostra.

## R6. Ícones de ZTE, Datacom e Hillstone

**Decisão**: SVGs próprios 24×24, um `path` cada, desenhados no projeto em
`frontend/src/ui/osIcons.tsx` (ao lado do Windows), seguindo o estilo dos ícones do Simple
Icons (silhueta preenchida). Formas: ZTE e Datacom como monogramas geométricos ("Z" e "D"
estilizados dentro de forma própria), Hillstone como uma silhueta de pedra/montanha. Nenhum
traço copiado dos logos oficiais (Princípio I). Cores em `EXTRA_HEX`, tiradas do material
público de cada marca na tarefa de implementação e registradas em `docs/licenses.md`.

**Motivo**: o usuário não tem os logos e eles não estão no Simple Icons; ícones próprios evitam
problema de licença e mantêm o padrão visual.

**Alternativas**: iniciais em texto ("ZTE") — rejeitada: fica ilegível a 16 px e diferente dos
demais; ícone genérico de rede — rejeitada: não distingue o fabricante.

## R7. Compatibilidade

**Decisão**: os ids novos (`zte`, `datacom`, `hillstone`) entram em `validOSIDs` e em `OS_IDS`.
O formato do cofre não muda (os campos já são texto); não há migração. Uma versão anterior que
abra um cofre com esses ids mostra o ícone genérico de rede (o frontend antigo cai no
`NetworkIcon` para id sem logo) — aceitável. O `.openhost` exportado leva o `osIcon`; na
importação por versão antiga, um id desconhecido vira "Automático" (já é o comportamento de
`importer/commit.go`).
