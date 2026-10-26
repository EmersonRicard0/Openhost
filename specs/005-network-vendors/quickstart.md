# Validação: ícones e detecção de fabricantes de rede

Roteiro para provar a feature de ponta a ponta. Contratos em [contracts/detection.md](./contracts/detection.md).

## Pré-requisitos

- Go e Node conforme o README; `wails` instalado.
- Servidor SSH de teste do projeto (`scripts/sshd.mjs`), que já sobe um OpenSSH local.
- Amostras em `internal/sshx/testdata/vendors/` (uma pasta por fabricante, arquivos `.txt` com
  o texto pré-login e o trecho do terminal, sem IPs, nomes ou senhas) e
  `internal/sshx/testdata/servers/` (servidores Linux/Windows/macOS, incluindo mensagens de
  boas-vindas que citam fabricantes).

## 1. Classificação (SC-501, SC-502)

```bash
go test ./internal/sshx -run 'TestVendorSamples|TestServerSamplesAreNotNetwork'
```

Esperado: ≥ 90% das amostras de fabricante reconhecidas (o teste imprime a taxa por
fabricante); zero servidores classificados como fabricante de rede.

## 2. Sem envio ao terminal (SC-504)

```bash
go test ./internal/sshx -run TestDetectionNeverWritesStdin
```

Esperado: o servidor de teste registra zero bytes recebidos no stdin do shell durante a janela
de detecção.

## 3. Abertura sem espera (SC-503)

```bash
go test ./internal/bridge -run TestDialDoesNotWaitForDetection
```

O servidor de teste simula um OpenSSH sem `/etc/os-release` que demora a responder ao `exec`.
Esperado: `dialHost` devolve em menos de 0,2 s acima do tempo de autenticação; o evento
`hosts:changed` chega depois.

## 4. Interface (FR-501 a FR-503)

```bash
cd frontend && npx vitest run src/ui/osIcons.test.ts
npx playwright test tests/e2e/os-icon.spec.ts
```

Esperado: ZTE, Datacom e Hillstone no seletor, em ordem alfabética; avatar com o ícone na cor
da marca; nos temas escuro e claro o logo nunca some no quadrado.

## 5. Manual com equipamento real

Com acesso a equipamentos (ou laboratório/emulador) dos oito fabricantes, criar um host por
equipamento com ícone "Automático", conectar uma vez e conferir:

- o logo certo na lista de hosts depois da conexão;
- o terminal aparece imediatamente, sem pausa, nos que se anunciam como OpenSSH;
- reconectar a um Juniper ou Datacom já reconhecido não gera, no log do equipamento, nenhum
  `exec` de `cat /etc/os-release`.

Registrar o resultado em `validation.md` desta pasta.
