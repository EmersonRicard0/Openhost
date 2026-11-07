// Área de transferência do terminal pelo runtime do Wails (nativa do sistema). O
// `navigator.clipboard` do WebView2 pede permissão ou falha sem gesto do usuário, e a cópia e a
// colagem pareciam não funcionar (cartão 78-UIFIX). Fica como reserva fora do app (testes).
import { ClipboardGetText, ClipboardSetText } from '../../../wailsjs/runtime/runtime';

function hasRuntime(): boolean {
  return typeof window !== 'undefined' && 'runtime' in window;
}

export async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (hasRuntime()) {
    try {
      if (await ClipboardSetText(text)) return true;
    } catch {
      // cai na reserva abaixo
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboard(): Promise<string> {
  if (hasRuntime()) {
    try {
      return await ClipboardGetText();
    } catch {
      // cai na reserva abaixo
    }
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}
