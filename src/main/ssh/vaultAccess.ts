// Liga a conexão SSH ao cofre: credenciais lidas na hora de conectar, host keys gravadas.
import { findCredential } from '../domain/credentials';
import { findHost } from '../domain/hosts';
import { acceptHostKey, checkHostKey } from '../domain/knownHosts';
import type { VaultStore } from '../vault/store';
import type { KnownHostsAccess, ResolvedAuth } from './connection';

export interface ConnectionPlan {
  target: { address: string; port: number; username: string };
  label: string;
  auth: ResolvedAuth;
  timeoutSeconds: number;
}

/** Monta o necessário para conectar; exige cofre desbloqueado. */
export function planConnection(vault: VaultStore, hostId: string): ConnectionPlan {
  const content = vault.read();
  const host = findHost(content, hostId);
  let auth: ResolvedAuth = { kind: 'ask' };
  if (host.authMethod !== 'ask' && host.credentialId) {
    const cred = findCredential(content, host.credentialId);
    auth =
      cred.kind === 'password'
        ? { kind: 'password', password: cred.password }
        : { kind: 'key', privateKey: cred.privateKey, passphrase: cred.passphrase };
  }
  return {
    target: { address: host.address, port: host.port, username: host.username },
    label: host.label,
    auth,
    timeoutSeconds: content.settings.connectTimeoutSeconds,
  };
}

export function vaultKnownHosts(vault: VaultStore): KnownHostsAccess {
  return {
    check: (endpoint, keyType, fingerprint) =>
      checkHostKey(vault.read(), endpoint, keyType, fingerprint),
    accept: (endpoint, keyType, fingerprint) =>
      vault.mutate((c) => {
        acceptHostKey(c, endpoint, keyType, fingerprint, new Date().toISOString());
      }),
  };
}
