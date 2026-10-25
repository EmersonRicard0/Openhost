import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installBridge } from './bridge';
import { installAutoReconnect } from './features/terminal/autoReconnect';
import { subscribeData } from './features/terminal/dataBus';
import { subscribeForwards } from './stores/forwards';
import { subscribeInteractions } from './stores/interactions';
import { subscribeProfiles } from './stores/profiles';
import { subscribeSessions } from './stores/sessions';
import { subscribeTransfers } from './stores/transfers';
import { loadUi } from './stores/ui';
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
  // Perfil antes da primeira aba, para o terminal já nascer com a fonte e as cores certas.
  await Promise.all([loadUi(), subscribeProfiles()]);
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
