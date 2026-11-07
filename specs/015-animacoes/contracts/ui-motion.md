# Contrato: movimento na interface (015)

## Ponte (Go ↔ interface)

`AppService.GetPreferences()` / `UpdatePreferences(patch)` ganham o campo:

```ts
motion: 'system' | 'full' | 'reduced' | 'off'; // padrão 'system'; não sincroniza
```

Nenhum método ou evento novo.

## Atributos e tokens

| Item | Contrato |
|---|---|
| `<html data-motion>` | `full` \| `reduced` \| `off`; definido antes da primeira tela entrar |
| `--motion-fast/base/slow` | `0ms` com `off`; valores atuais (120/180/240 ms) nos outros |
| `--motion-shift` | `1` com `full`; `0` com `reduced` e `off`. Todo deslocamento/escala animado MUST multiplicar por ele |
| `#boot` | tela de abertura no `index.html`; `data-leaving` durante a saída; removida depois |
| `[data-busy]` / `aria-busy="true"` | ação demorada pendente no elemento; clique repetido ignorado |
| `[data-pressed]` | pressionado por teclado (Enter/espaço), igual ao `:active` do mouse |
| `data-testid="connecting"` | indicador de conexão no painel |

## Regras para quem escreve componente

- Só animar `transform`, `opacity`, `background-color`, `color`, `border-color` (e `flex-grow` na
  divisão de painéis, com `fit()` único no fim).
- Nenhuma ação, foco ou entrada de teclado espera `animationend`/`transitionend`.
- Nenhuma animação em loop fora do indicador de conexão e do pulso da abertura; ambos param quando
  somem.
