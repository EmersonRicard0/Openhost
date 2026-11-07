// Envio de um comando salvo (specs/012, US3–US5): campos → (grupo com produção: confirmação) →
// escrita pela fila do `writer`. Os valores dos campos só ficam em memória (R10).
import { create } from 'zustand';
import type { Snippet } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { groupOf, useSessions, type Tab } from '../../stores/sessions';
import { useSnippets } from '../../stores/snippets';
import { toastInfo } from '../../ui/Toast';
import { productionPanes } from '../terminal/broadcast';
import { activeTerminalId } from '../terminal/commands';
import { leaves } from '../terminal/layout';
import { focusTerminal } from '../terminal/terminalRegistry';
import { send } from '../terminal/writer';
import { fill, parseFields } from './fields';
import { snippetPayload } from './send';

export type SendTarget = 'pane' | 'group';

interface Pending {
  snippet: Snippet;
  target: SendTarget;
  /** Sessão ativa quando o envio começou; o envio vale para ela e o grupo dela. */
  from: string;
  stage: 'fields' | 'production';
  values: Record<string, string>;
}

export const useSnippetSend = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Painéis do grupo da sessão `from` que recebem um comando enviado ao grupo. */
export function groupMembers(from: string): Tab[] {
  const { tabs, groups } = useSessions.getState();
  const group = groupOf(groups, from);
  if (!group) return [];
  const ids = leaves(group.root);
  // Com "Digitar no grupo" ligado, quem foi desmarcado também não recebe comandos.
  const excluded = new Set(group.broadcast?.excluded ?? []);
  return tabs.filter((tb) => ids.includes(tb.id) && (tb.id === from || !excluded.has(tb.id)));
}

/** Quantos painéis "Enviar ao grupo" alcançaria agora (0 = sessão fora de grupo). */
export function groupSize(): number {
  const from = activeTerminalId();
  return from ? groupMembers(from).length : 0;
}

export function startSend(snippet: Snippet, target: SendTarget): void {
  const from = activeTerminalId();
  if (!from) return;
  const pending: Pending = { snippet, target, from, stage: 'fields', values: {} };
  if (parseFields(snippet.text).length > 0) {
    useSnippetSend.setState({ pending });
    return;
  }
  proceed(pending);
}

/** Campos preenchidos (já validados pelo formulário). */
export function submitFields(values: Record<string, string>): void {
  const pending = useSnippetSend.getState().pending;
  if (!pending) return;
  useSnippets.getState().remember(pending.snippet.id, values);
  proceed({ ...pending, values });
}

/** Produção confirmada. */
export function confirmProduction(): void {
  const pending = useSnippetSend.getState().pending;
  if (!pending) return;
  deliver(pending);
}

export function cancelSend(): void {
  const pending = useSnippetSend.getState().pending;
  useSnippetSend.setState({ pending: null });
  if (pending) focusTerminal(pending.from);
}

/** Painéis de produção que receberiam o envio pendente. */
export function pendingProduction(): Tab[] {
  const pending = useSnippetSend.getState().pending;
  if (!pending) return [];
  return productionPanes(groupMembers(pending.from), useHosts.getState().hosts);
}

function proceed(pending: Pending): void {
  if (pending.target === 'group' && pendingProductionOf(pending).length > 0) {
    useSnippetSend.setState({ pending: { ...pending, stage: 'production' } });
    return;
  }
  deliver(pending);
}

function pendingProductionOf(pending: Pending): Tab[] {
  return productionPanes(groupMembers(pending.from), useHosts.getState().hosts);
}

function deliver(pending: Pending): void {
  useSnippetSend.setState({ pending: null });
  const { snippet, target, from, values } = pending;
  const payload = snippetPayload(fill(snippet.text, values), snippet.execute);
  if (target === 'pane') {
    send(from, payload);
  } else {
    let missed = 0;
    for (const tab of groupMembers(from)) {
      if (tab.state === 'connected') send(tab.id, payload);
      else missed++;
    }
    if (missed > 0) toastInfo(t.snippets.notSent(missed));
  }
  focusTerminal(from);
}
