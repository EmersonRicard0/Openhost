// Texto do comando como digitação (specs/012, R9): linhas unidas por Enter (\r); Enter no fim só
// se o comando estiver marcado para executar. Sem colagem entre colchetes.
export function snippetPayload(text: string, execute: boolean): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return lines.join('\r') + (execute ? '\r' : '');
}
