# Ligar a sincronização com o Google Drive

O código do OpenHost já traz a sincronização (specs/008). Falta só uma coisa que não dá para
colocar no repositório: o **cliente OAuth** do projeto no Google, que identifica o OpenHost na
tela "O OpenHost quer acessar sua conta Google". É feito **uma vez**, pelo dono do projeto.
Quem usa o app não configura nada: só clica em "Conectar Google Drive".

Sem esse cliente, o app funciona normalmente e a seção Sincronização mostra que a sincronização
não está disponível nesta versão.

## 1. Criar o projeto no Google Cloud

1. Abra <https://console.cloud.google.com/> com a conta Google do projeto.
2. No seletor de projetos (barra de cima) → **Novo projeto** → nome `OpenHost` → **Criar**.
3. Confira que o projeto `OpenHost` está selecionado antes de seguir.

## 2. Ativar a Google Drive API

1. Menu → **APIs e serviços** → **Biblioteca**.
2. Procure **Google Drive API** → **Ativar**.

## 3. Tela de consentimento (Google Auth Platform)

1. Menu → **Google Auth Platform** (ou **APIs e serviços → Tela de consentimento OAuth**) →
   **Começar**.
2. **Informações do app**: nome `OpenHost`, e-mail de suporte (o seu). **Próxima**.
3. **Público-alvo**: **Externo**. **Próxima**.
4. **Dados de contato**: o seu e-mail. Aceite a política e **Criar**.
5. Em **Acesso a dados** → **Adicionar ou remover escopos**, marque só estes três e salve:
   - `.../auth/drive.appdata` (ver, criar e apagar os próprios dados de configuração no Drive)
   - `openid`
   - `.../auth/userinfo.email`

   Não adicione nenhum outro escopo de Drive: com só esses três, o app é classificado como
   **não sensível** e não passa pela verificação longa do Google.

## 4. Criar o cliente do app de computador

1. **Google Auth Platform → Clientes** → **Criar cliente**.
2. Tipo de aplicativo: **App para computador** (Desktop app). Nome: `OpenHost desktop`.
3. **Criar**. Baixe o JSON ou copie na hora o **ID do cliente** e a **Chave secreta do cliente**
   (o Google pode não mostrar a chave de novo depois).

Para app de computador, o próprio Google considera a "chave secreta" não confidencial: ela vai
dentro do executável. A segurança vem do PKCE e do retorno só para `127.0.0.1`.

## 5. Público: teste ou produção

- Enquanto estiver em **Teste**, só entram as contas em **Público-alvo → Usuários de teste**
  (adicione as suas), e **a autorização expira em 7 dias**: o app vai pedir "Conectar de novo"
  toda semana. Serve para validar.
- Para liberar para qualquer pessoa: **Público-alvo → Publicar app** (fica **Em produção**). Com
  só escopos não sensíveis, não há verificação longa; se você adicionar logotipo, o Google pode
  pedir uma conferência rápida da marca.

## 6. Colocar o cliente na release

No repositório do GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | o ID do cliente (termina em `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | a chave secreta do cliente |

Ou pelo terminal:

```powershell
gh secret set GOOGLE_CLIENT_ID
gh secret set GOOGLE_CLIENT_SECRET
```

A próxima tag de versão já sai com a sincronização. Se faltar algum dos dois, a release sai do
mesmo jeito e o workflow avisa: "esta versão sai sem sincronização com o Google Drive".

## 7. Testar antes de publicar (build local)

Builds que não são de release leem o cliente de variáveis de ambiente:

```powershell
$env:OPENHOST_GOOGLE_CLIENT_ID = '<id>.apps.googleusercontent.com'
$env:OPENHOST_GOOGLE_CLIENT_SECRET = '<chave>'
wails dev
```

Depois: Configurações → Sincronização → **Conectar Google Drive**, autorize no navegador e confira
em <https://myaccount.google.com/permissions> que o OpenHost aparece só com acesso aos "dados de
configuração do app". No Drive (drive.google.com) não aparece nenhum arquivo novo: a pasta do
app é oculta.

## Se der errado

| Mensagem do Google | O que fazer |
|---|---|
| `access_denied` / "app não verificado" | conta fora dos usuários de teste, ou app em Teste: adicione a conta ou publique (passo 5) |
| `invalid_client` | ID/chave copiados errado, ou cliente não é do tipo App para computador |
| `redirect_uri_mismatch` | cliente criado como "Aplicativo da Web"; crie um do tipo App para computador |
| Pede para conectar de novo toda semana | app ainda em Teste (passo 5) |
| `accessNotConfigured` | Google Drive API não ativada (passo 2) |
