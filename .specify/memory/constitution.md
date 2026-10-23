<!--
Sync Impact Report
- Versão: (template não preenchido) → 1.0.0
- Princípios definidos (todos novos):
  I. Clean Room (INEGOCIÁVEL)
  II. Segurança e Segredos em Primeiro Lugar (INEGOCIÁVEL)
  III. Local-First e Offline
  IV. Testes Primeiro
  V. Simplicidade e Escopo Incremental
- Seções adicionadas: Restrições de Arquitetura e Tecnologia; Fluxo de Desenvolvimento
- Seções removidas: nenhuma
- Templates dependentes: lidos em tempo de execução; nenhum alterado
- TODOs adiados: nenhum
-->

# ShellVault Constitution

## Core Principles

### I. Clean Room (INEGOCIÁVEL)

O ShellVault é um cliente SSH desktop inspirado no comportamento observável de produtos
existentes (ver `docs/reference/termius-analysis.md`), mas implementado do zero.

- É PROIBIDO copiar código, assets, ícones, textos de interface, nomes de componentes,
  marcas ou design visual de qualquer produto de referência.
- Documentos de referência MUST registrar apenas comportamento, arquitetura e
  funcionalidades observáveis; nunca trechos de código decompilado.
- Dependências de terceiros MUST ter licença compatível com o projeto (MIT, Apache-2.0,
  BSD, ISC ou equivalente) e ser verificadas antes de adotadas.

**Justificativa:** protege o projeto juridicamente e garante que cada decisão tenha sido
tomada e entendida por quem a implementou.

### II. Segurança e Segredos em Primeiro Lugar (INEGOCIÁVEL)

O app guarda credenciais que dão acesso a servidores; um vazamento é a pior falha possível.

- Senhas, chaves privadas e passphrases MUST ser armazenadas apenas no cofre local
  criptografado (algoritmos autenticados e padronizados, ex.: XChaCha20-Poly1305 ou
  AES-256-GCM, com derivação de chave por Argon2id ou scrypt). Criptografia própria é proibida.
- Segredos MUST NOT aparecer em logs, mensagens de erro, telemetria, arquivos temporários
  ou na área de transferência sem ação explícita do usuário.
- A verificação de host key SSH MUST ser obrigatória; mudança de chave MUST bloquear a
  conexão até confirmação explícita.
- O processo de interface MUST rodar isolado (sem acesso direto a Node/sistema de
  arquivos); toda operação privilegiada passa por uma ponte com API mínima e validada.
- Toda mudança que toque cofre, criptografia, autenticação ou a ponte entre processos MUST
  incluir revisão de segurança explícita no plano.

**Justificativa:** confiança é o produto; uma única falha de segredo invalida todo o resto.

### III. Local-First e Offline

- Todas as funcionalidades do MVP MUST funcionar sem conta, sem internet (exceto a própria
  conexão ao host) e sem servidor do projeto.
- Nenhum dado do usuário sai da máquina sem consentimento explícito e opt-in.
- O formato do cofre MUST ser versionado e ter caminho de migração documentado a cada
  mudança de esquema.

**Justificativa:** o usuário é dono dos seus dados; sincronização em nuvem é extensão
futura, não requisito de base.

### IV. Testes Primeiro

- Lógica de domínio (cofre, criptografia, modelo de hosts, parsing de configuração,
  regras de port forwarding) MUST ter testes unitários escritos antes ou junto da
  implementação, e falhando antes de passar.
- Fluxos SSH, SFTP e port forwarding MUST ter testes de integração contra um servidor
  SSH real em contêiner ou processo local de teste.
- Bugs corrigidos MUST ganhar um teste de regressão.
- Nenhuma tarefa é considerada concluída com testes falhando.

**Justificativa:** um cliente SSH com regressões silenciosas corrompe conexões e dados;
testes são a única rede de proteção confiável.

### V. Simplicidade e Escopo Incremental

- O escopo segue o MVP definido em `docs/reference/termius-analysis.md`; itens marcados
  como "fora" (nuvem, equipes, FIDO2, Mosh, serial, Azure, autocomplete, planos pagos)
  MUST NOT ser implementados sem nova spec aprovada.
- Preferir bibliotecas abertas consolidadas (ex.: `ssh2`, `node-pty`) a implementações
  próprias de protocolo.
- Toda abstração, processo extra ou dependência nova MUST ser justificada no plano
  (seção de complexidade); YAGNI é o padrão.

**Justificativa:** entregar um núcleo pequeno, seguro e funcional antes de expandir.

## Restrições de Arquitetura e Tecnologia

- Plataforma alvo inicial: Windows 10/11 desktop; o código SHOULD evitar dependências
  que impeçam portar para macOS/Linux depois.
- Arquitetura desktop com separação de processos: principal (SO, janelas, SSH, cofre),
  interface (renderização, sem privilégios) e ponte tipada entre eles. A stack concreta é
  definida em `/speckit-plan` e MUST respeitar o Princípio II.
- Linguagem com tipagem estática em todo o código (ex.: TypeScript em modo `strict`).
- Idioma: documentação e specs em português; identificadores de código em inglês.

## Fluxo de Desenvolvimento

- Toda funcionalidade segue o fluxo Spec Kit: specify → (clarify) → plan → (checklist) →
  tasks → (analyze) → implement → converge. Correções pontuais (typo, configuração) estão
  dispensadas.
- O plano de cada feature MUST conter um "Constitution Check" verificando os Princípios
  I–V antes de gerar tarefas.
- Commits pequenos e descritivos, no padrão Conventional Commits (`feat:`, `fix:`,
  `docs:`...).
- Lint, checagem de tipos e testes MUST passar antes de considerar uma tarefa concluída.

## Governance

- Esta constituição prevalece sobre qualquer outra prática ou preferência do projeto.
- Emendas são feitas via `/speckit-constitution`, com Sync Impact Report e justificativa,
  e registradas em commit próprio (`docs: amend constitution to vX.Y.Z`).
- Versionamento semântico: MAJOR para remoção ou redefinição incompatível de princípio;
  MINOR para princípio ou seção nova ou ampliação material; PATCH para esclarecimentos.
- Conformidade é verificada no "Constitution Check" de cada plano e em `/speckit-analyze`;
  qualquer violação MUST ser justificada por escrito na seção de complexidade do plano ou
  corrigida.

**Version**: 1.0.0 | **Ratified**: 2026-10-23 | **Last Amended**: 2026-10-23
