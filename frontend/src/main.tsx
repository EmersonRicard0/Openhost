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
import { subscribeTransfers } from './stores/transfers';
import { loadUi } from './stores/ui';
import { loadSync } from './stores/sync';
import { loadUpdates } from './stores/updates';
import './styles/fonts.css';
import './theme/tokens.css';
import './theme/base.css';
import './styles/global.css';

async function start(): Promise<void> {
  installBridge();
  subscribeData();
  subscribeSessions();
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
