# Modelo de dados: ícones e detecção de fabricantes de rede

Sem mudança de esquema do cofre. Os campos do host continuam os da 002 (FR-178); o que muda é
o conjunto de valores aceitos e as regras de atualização.

## Host (campos já existentes)

| Campo | Tipo | Regra |
|---|---|---|
| `detectedOs` | id de sistema ou `null` | Escrito só pela detecção do backend (`domain.SetDetectedOS`). Aceita os ids de `validOSIDs`, agora com `zte`, `datacom` e `hillstone`. Uma conexão sem reconhecimento não o altera (FR-510). |
| `osIcon` | `"auto"` ou id de sistema | Escolhido pelo usuário. Aceita os ids novos. `"auto"` mostra `detectedOs` (FR-511). |

## Id de sistema (conjunto fechado)

Já existentes: `ubuntu`, `debian`, `centos`, `rhel`, `fedora`, `rocky`, `almalinux`, `alpine`,
`arch`, `opensuse`, `oracle`, `amazon`, `linux`, `freebsd`, `openbsd`, `windows`, `macos`,
`mikrotik`, `cisco`, `huawei`, `juniper`, `hpe`, `fortinet`, `openwrt`.

Novos: `zte`, `datacom`, `hillstone`.

**Fabricante de rede** (subconjunto usado em FR-513 para não abrir o canal extra): `mikrotik`,
`cisco`, `huawei`, `juniper`, `hpe`, `fortinet`, `zte`, `datacom`, `hillstone`. Fica em
`domain.IsNetworkOS(id)` para backend e testes; o frontend não precisa dele.

## Assinatura de fabricante (embutida, não persistida)

| Campo | Descrição |
|---|---|
| `id` | id de sistema do fabricante |
| `source` | `version`, `banner` (pré-login) ou `terminal` |
| `needle` | texto em minúsculas procurado no texto normalizado, ou |
| `pattern` | expressão regular ancorada na linha (prompts) |

Lista inicial em [research.md R2](./research.md#r2-assinaturas-por-fabricante).

## Sinais de uma conexão (só em memória)

| Sinal | Origem | Limite | Vida |
|---|---|---|---|
| versão SSH | handshake | a do protocolo (255 bytes) | a da conexão |
| mensagem pré-login | `BannerCallback` | 8 KiB | até o fim da detecção |
| trecho do terminal | observador da saída | 8 KiB ou 5 s | até o fim da detecção |
| arquivo da distribuição | canal `exec` | 8 KiB, 3 s | até o fim da detecção |

## Resolução

```text
versão reconhece fabricante?            → esse fabricante
pré-login reconhece fabricante?         → esse fabricante
os-release reconhece distribuição?      → essa distribuição (vence o terminal)
terminal reconhece fabricante?          → esse fabricante
nada                                    → não grava (mantém o anterior)
```

A versão SSH que já identifica um sistema não-rede (ex.: `Ubuntu`, `Windows`) continua decidindo
como hoje, antes de qualquer outra fonte.
