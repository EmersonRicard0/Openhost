# Quickstart: validar a 010

Pré-requisitos e comandos como na 009 (`SHELLVAULT_DATA_DIR` temporário; Docker para o SSH de
teste). E2e em `frontend/tests/e2e/home.spec.ts`.

1. **Conexão rápida** (US1): cofre vazio; digitar `pwuser@<SSHD.host>:<SSHD.port>`, Enter,
   aceitar a chave, responder a senha; shell aberto; aba `pwuser@<host>`. "Salvar como host" abre
   o editor com endereço, porta e usuário. Reconectar pede a senha de novo. Varredura de segredos:
   a senha não aparece no diretório de dados.
2. **Sem usuário** (US1): digitar só o endereço → diálogo "Usuário para …".
3. **Alvo igual a host salvo** (US1): abre o host salvo sem pedir senha.
4. **Recentes e favoritos** (US2): conectar A e depois B, fechar as abas, ver B, A em "Recentes";
   favoritar A pela estrela → A em "Favoritos" e fora de "Recentes"; reiniciar o app e conferir.
5. **Sugestões** (US3): digitar parte do rótulo, seta para baixo, Enter → abre o host salvo.
6. **Unitários**: `parseTarget` com os 12 válidos e 6 inválidos do SC-1004; filtro de recentes
   (excluídos, favoritos, limite 8); Go: `OpenQuick` valida e não grava nada no cofre além da
   chave do servidor; `recordRecent` ordena, deduplica e corta.
