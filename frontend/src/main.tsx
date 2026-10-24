import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installBridge } from './bridge';
import { subscribeData } from './features/terminal/dataBus';
import { subscribeForwards } from './stores/forwards';
import { subscribeInteractions } from './stores/interactions';
import { subscribeSessions } from './stores/sessions';
import { subscribeTransfers } from './stores/transfers';
import { loadUi } from './stores/ui';
import './styles/fonts.css';
import './styles/global.css';

async function start(): Promise<void> {
  installBridge();
  subscribeData();
  subscribeSessions();
  subscribeInteractions();
  subscribeTransfers();
  subscribeForwards();
  await loadUi();
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
