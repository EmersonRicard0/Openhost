// Liga o gerenciador de encaminhamentos ao cofre e ao fluxo de host key/prompts.
import { randomUUID } from 'node:crypto';
import { findRule } from '../domain/forwardRules';
import { findHost } from '../domain/hosts';
import { openConnection } from '../ssh/connection';
import type { Interactions } from '../ssh/interactions';
import { planConnection, vaultKnownHosts } from '../ssh/vaultAccess';
import type { VaultStore } from '../vault/store';
import type { ForwardingDeps } from './manager';

export function vaultForwardingDeps(
  vault: VaultStore,
  interactions: Interactions,
  status: ForwardingDeps['status'],
): ForwardingDeps {
  return {
    rule: (ruleId) => findRule(vault.read(), ruleId),
    hostLabel: (hostId) => findHost(vault.read(), hostId).label,
    connect: (hostId) => {
      const plan = planConnection(vault, hostId);
      // Identificador só para os diálogos de host key/prompt desta conexão.
      const interactionId = randomUUID();
      return openConnection({
        target: plan.target,
        auth: plan.auth,
        timeoutSeconds: plan.timeoutSeconds,
        knownHosts: vaultKnownHosts(vault),
        callbacks: {
          onState: () => undefined,
          onHostKey: (info) => interactions.askHostKey(interactionId, info),
          onPrompt: (prompt) => interactions.askPrompt(interactionId, prompt),
        },
      });
    },
    status,
  };
}
