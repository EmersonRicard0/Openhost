// Teste de abertura (specs/004-linux-macos, R11): só no build `-tags smoke` com VITE_SMOKE. Depois
// da tela de criar o cofre aparecer, cria cofre, host com senha e chave com passphrase pela ponte
// normal, bloqueia e avisa o Go, que encerra com código 0. `scripts/smoke.mjs` varre o diretório
// de dados atrás destes segredos.
import secrets from './smoke-secrets.json';

interface SmokeService {
  Ready: () => Promise<void>;
}

function smokeService(): SmokeService | undefined {
  return (window as unknown as { go?: { smokesvc?: { Smoke?: SmokeService } } }).go?.smokesvc
    ?.Smoke;
}

async function must<T>(
  step: string,
  res: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
) {
  const r = await res;
  if (!r.ok) throw new Error(`${step}: ${JSON.stringify(r.error)}`);
  return r.value;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => {
      resolve();
    }),
  );
}

export async function runSmoke(): Promise<void> {
  if (!import.meta.env.VITE_SMOKE) return;
  const api = window.shellvault;
  try {
    // A tela de criar o cofre precisa ter aparecido: é ela que prova que o WebView abriu o app.
    for (let i = 0; i < 600 && !document.querySelector('input[type=password]'); i++)
      await nextFrame();
    if (!document.querySelector('input[type=password]'))
      throw new Error('a tela de criar o cofre não apareceu');

    await must('criar cofre', api.vault.create(secrets.master, secrets.master));
    const password = await must(
      'senha do host',
      api.credentials.createPassword('smoke-senha', secrets.hostPassword),
    );
    await must(
      'host',
      api.hosts.create({
        label: 'smoke-host',
        address: '127.0.0.1',
        port: 22,
        username: 'smoke',
        authMethod: 'password',
        credentialId: password.id,
        groupId: null,
        legacyAlgorithms: false,
      }),
    );
    await must('chave', api.credentials.generateEd25519('smoke-chave', secrets.passphrase));
    await must('bloquear', api.vault.lock());

    const smoke = smokeService();
    if (!smoke) throw new Error('Smoke.Ready não está ligado neste build');
    await smoke.Ready();
  } catch (err) {
    // Sem Ready o processo não sai e o smoke.mjs falha pelo tempo, com esta linha no log.
    // eslint-disable-next-line no-console -- só aparece no `wails dev`, onde ajuda a achar o passo
    console.error('[smoke] falhou:', err);
  }
}
