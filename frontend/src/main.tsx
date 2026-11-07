import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { runSmoke } from './app/smoke';
import { installBridge } from './bridge';
import { installAutoReconnect } from './features/terminal/autoReconnect';
import { subscribeData } from './features/terminal/dataBus';
import { subscribeForwards } from './stores/forwards';
import { subscribeInteractions } from './stores/interactions';
import { subscribeProfiles } from './stores/profiles';
import { subscribeSessions } from './stores/sessions';
import { subscribeSnippets } from './stores/snippets';
import { subscribeTransfers } from './stores/transfers';
import { loadUi, useUi } from './stores/ui';
import { dismissBoot, installMotion } from './ui/motion';
import { loadSync } from './stores/sync';
import { loadUpdates } from './stores/updates';
import { subscribeBroadcastSafety } from './features/terminal/broadcastSafety';
import './styles/fonts.css';
import './theme/tokens.css';
import './theme/base.css';
import './styles/global.css';

/** Se o Go nunca responder, a abertura não fica por cima de tudo (specs/015). */
const BOOT_GIVE_UP_MS = 8_000;

async function start(): Promise<void> {
  // Antes de tudo: o nível de animação vale desde a primeira tela (specs/015).
  installMotion(
    () => useUi.getState().settings?.motion,
    (onChange) =>
      useUi.subscribe((next, prev) => {
        if (next.settings?.motion !== prev.settings?.motion) onChange();
      }),
  );
  setTimeout(() => {
    dismissBoot();
  }, BOOT_GIVE_UP_MS);
  installBridge();
  subscribeData();
  subscribeSessions();
  subscribeBroadcastSafety();
  subscribeSnippets();
  subscribeInteractions();
  subscribeTransfers();
  subscribeForwards();
  installAutoReconnect();
  // Perfil antes da primeira aba, para o terminal já nascer com a fonte e as cores certas. Se o Go
  // não responder (cofre ilegível, falha inesperada), a tela abre assim mesmo, com os padrões, e
  // mostra o estado do cofre em vez de ficar preta.
  await Promise.race([
    Promise.all([loadUi(), subscribeProfiles()]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Atualizações não atrasam a abertura (FR-701); o Go decide quando consultar a rede.
  void loadUpdates();
  void loadSync();
  void runSmoke();
}

void start();
