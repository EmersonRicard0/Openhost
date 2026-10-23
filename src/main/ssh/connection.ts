// Conexão SSH com verificação obrigatória de host key e prompts ao usuário (FR-013, FR-014).
import ssh2, {
  type AnyAuthMethod,
  type AuthenticationType,
  type Client,
  type ConnectConfig,
  type NextAuthHandler,
  type Prompt,
} from 'ssh2';
import { endpointOf, fingerprintOf, keyTypeOf, type HostKeyCheck } from '../domain/knownHosts';
import { fail, toAppError } from '../ipc/messages';

export type ConnectPhase = 'connecting' | 'awaitingHostKey' | 'authenticating' | 'awaitingPrompt';

export type ResolvedAuth =
  | { kind: 'password'; password: string }
  | { kind: 'key'; privateKey: string; passphrase: string | null }
  | { kind: 'ask' };

export interface HostKeyPromptInfo {
  kind: 'new' | 'changed';
  keyType: string;
  fingerprint: string;
  previousFingerprint: string | null;
}

export interface UserPrompt {
  name: string;
  instructions: string;
  prompts: { text: string; echo: boolean }[];
}

export interface ConnectCallbacks {
  onState(phase: ConnectPhase): void;
  /** Resolve `true` só com aceite explícito do usuário. */
  onHostKey(info: HostKeyPromptInfo): Promise<boolean>;
  /** Respostas na ordem dos prompts, ou `null` se o usuário cancelar. */
  onPrompt(prompt: UserPrompt): Promise<string[] | null>;
}

export interface KnownHostsAccess {
  check(endpoint: string, keyType: string, fingerprint: string): HostKeyCheck;
  accept(endpoint: string, keyType: string, fingerprint: string): Promise<void>;
}

export interface ConnectOptions {
  target: { address: string; port: number; username: string };
  auth: ResolvedAuth;
  timeoutSeconds: number;
  knownHosts: KnownHostsAccess;
  callbacks: ConnectCallbacks;
}

/** Ordem de métodos por tipo de credencial; "ask" prefere os prompts do servidor. */
const METHOD_ORDER: Record<ResolvedAuth['kind'], AuthenticationType[]> = {
  password: ['password', 'keyboard-interactive'],
  key: ['publickey', 'keyboard-interactive'],
  ask: ['keyboard-interactive', 'password'],
};

export function openConnection(options: ConnectOptions): Promise<Client> {
  const { target, auth, callbacks, knownHosts } = options;
  const endpoint = endpointOf(target.address, target.port);
  const client = new ssh2.Client();

  return new Promise<Client>((resolve, reject) => {
    let settled = false;
    let hostKeyRejected = false;
    let failure: unknown = null;

    const finish = (err: unknown, value?: Client) => {
      if (settled) return;
      settled = true;
      if (value) {
        resolve(value);
        return;
      }
      client.end();
      // Motivo registrado (recusa de host key, prompt cancelado) prevalece sobre o erro do ssh2.
      const reason = hostKeyRejected ? fail('HOST_KEY_REJECTED') : (failure ?? err);
      reject(fail(toAppError(reason).code));
    };

    const ask = async (prompt: UserPrompt): Promise<string[] | null> => {
      callbacks.onState('awaitingPrompt');
      const answers = await callbacks.onPrompt(prompt);
      callbacks.onState('authenticating');
      return answers;
    };

    const keyboardInteractive = (
      name: string,
      instructions: string,
      _lang: string,
      prompts: Prompt[],
      done: (answers: string[]) => void,
    ) => {
      // Servidor pode mandar rodada sem prompts (só instruções).
      if (prompts.length === 0) {
        done([]);
        return;
      }
      void ask({
        name,
        instructions,
        prompts: prompts.map((p) => ({ text: p.prompt, echo: p.echo ?? false })),
      }).then((answers) => {
        if (answers === null) {
          failure = fail('AUTH_FAILED');
          client.end();
          finish(fail('AUTH_FAILED'));
          return;
        }
        done(answers);
      });
    };

    const tried = new Set<AuthenticationType>();
    const authHandler = (
      methodsLeft: AuthenticationType[] | null,
      _partial: boolean | null,
      next: NextAuthHandler,
    ): void => {
      if (methodsLeft === null) {
        next({ type: 'none', username: target.username });
        return;
      }
      const method = METHOD_ORDER[auth.kind].find((m) => methodsLeft.includes(m) && !tried.has(m));
      if (!method) {
        next(false as unknown as AuthenticationType);
        return;
      }
      tried.add(method);
      const username = target.username;
      let chosen: AnyAuthMethod;
      if (method === 'keyboard-interactive') {
        chosen = { type: method, username, prompt: keyboardInteractive };
      } else if (method === 'publickey' && auth.kind === 'key') {
        chosen = {
          type: method,
          username,
          key: auth.privateKey,
          ...(auth.passphrase ? { passphrase: auth.passphrase } : {}),
        };
      } else if (auth.kind === 'password') {
        chosen = { type: 'password', username, password: auth.password };
      } else {
        // "Perguntar ao conectar" quando o servidor só aceita senha.
        void ask({
          name: '',
          instructions: '',
          prompts: [{ text: `Senha de ${username}@${target.address}:`, echo: false }],
        }).then((answers) => {
          const password = answers?.[0];
          if (password === undefined) {
            failure = fail('AUTH_FAILED');
            finish(fail('AUTH_FAILED'));
            return;
          }
          next({ type: 'password', username, password });
        });
        return;
      }
      next(chosen);
    };

    const hostVerifier = (key: Buffer, verify: (valid: boolean) => void): void => {
      const keyType = keyTypeOf(key);
      const fingerprint = fingerprintOf(key);
      const check = knownHosts.check(endpoint, keyType, fingerprint);
      if (check.kind === 'match') {
        callbacks.onState('authenticating');
        verify(true);
        return;
      }
      callbacks.onState('awaitingHostKey');
      void callbacks
        .onHostKey({
          kind: check.kind,
          keyType,
          fingerprint,
          previousFingerprint: check.kind === 'changed' ? check.previous.fingerprint : null,
        })
        .then(async (accepted) => {
          if (!accepted) {
            hostKeyRejected = true;
            verify(false);
            finish(fail('HOST_KEY_REJECTED'));
            return;
          }
          await knownHosts.accept(endpoint, keyType, fingerprint);
          callbacks.onState('authenticating');
          verify(true);
        })
        .catch((e: unknown) => {
          hostKeyRejected = false;
          failure = e;
          verify(false);
          finish(e);
        });
    };

    client.once('ready', () => {
      finish(null, client);
    });
    client.on('error', (err) => {
      finish(err);
    });
    client.once('close', () => {
      finish(failure ?? fail('SESSION_CLOSED'));
    });

    const config: ConnectConfig = {
      host: target.address,
      port: target.port,
      username: target.username,
      readyTimeout: options.timeoutSeconds * 1000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      tryKeyboard: true,
      hostVerifier,
      authHandler,
    };
    callbacks.onState('connecting');
    client.connect(config);
  });
}
