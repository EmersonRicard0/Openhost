// Nome do equipamento lido do prompt da última linha (specs/009, FR-922, research R5).

const NAME = String.raw`[A-Za-z0-9][\w.\-/]*`;

/** Formas reconhecidas; o grupo 1 é o nome. A ordem importa: as mais específicas primeiro. */
const PATTERNS: RegExp[] = [
  // [admin@MikroTik] >
  new RegExp(String.raw`^\[[\w.-]+@(${NAME})\]\s*>$`),
  // [root@srv01 ~]#
  new RegExp(String.raw`^\[[\w.-]+@(${NAME})\s[^\]]*\][$#]$`),
  // user@srv:~$
  new RegExp(String.raw`^[\w.-]+@(${NAME}):\S*[$#%]$`),
  // ops@MX-CORE>
  new RegExp(String.raw`^[\w.-]+@(${NAME})[>#%]$`),
  // <BNG.PINDORETAMA>
  new RegExp(String.raw`^<(${NAME})>$`),
  // [~BNG.PINDORETAMA], [*OLT-01], [OLT-01]
  new RegExp(String.raw`^\[[~*]?(${NAME})\]$`),
  // R1#, R1>, R1(config-if)#
  new RegExp(String.raw`^(${NAME})(?:\([\w.\-/]+\))?[#>]$`),
];

const SHELL = /^(?:ba|z|k|da)?sh(?:-[\d.]+)?$/;

/** Nome extraído do prompt, ou `null` se a linha não parece um prompt de equipamento. */
export function extractPromptName(line: string): string | null {
  const text = line.trimEnd();
  // eslint-disable-next-line no-control-regex -- recusar caracteres de controle é o objetivo
  if (text.length === 0 || /[\u0000-\u001f\u007f]/.test(text)) return null;
  for (const pattern of PATTERNS) {
    const name = pattern.exec(text)?.[1];
    if (name === undefined) continue;
    if (name.length > 64 || !/[A-Za-z]/.test(name) || SHELL.test(name)) return null;
    return name;
  }
  return null;
}

/** Pedaço do xterm que a leitura do prompt usa. */
interface PromptSource {
  buffer: {
    active: {
      baseY: number;
      cursorX: number;
      cursorY: number;
      getLine: (y: number) => { translateToString: (trimRight?: boolean) => string } | undefined;
    };
  };
}

/** Espera depois da última escrita, para ler o prompt já completo. */
const SETTLE_MS = 150;
/** No máximo uma leitura por segundo (FR-923). */
const INTERVAL_MS = 1000;

/**
 * Lê a linha do cursor depois das escritas e avisa o nome quando ela termina num prompt
 * reconhecido. Linha que não é prompt não apaga o nome anterior. Devolve `schedule` (chamar a cada
 * escrita) e `dispose`.
 */
export function watchPrompt(term: PromptSource, onName: (name: string) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const read = () => {
    timer = null;
    last = Date.now();
    const buffer = term.buffer.active;
    const text = buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? '';
    // Cursor no fim da linha (o prompt pode ter um espaço depois): à espera de digitação.
    if (buffer.cursorX < text.length || buffer.cursorX > text.length + 1) return;
    const name = extractPromptName(text);
    if (name) onName(name);
  };
  return {
    schedule() {
      if (timer) return;
      timer = setTimeout(read, Math.max(SETTLE_MS, INTERVAL_MS - (Date.now() - last)));
    },
    dispose() {
      if (timer) clearTimeout(timer);
    },
  };
}
