import { join } from 'node:path';
import { BrowserWindow, app, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import { applyAppearance, currentAppearance, watchAppearance } from './appearance';
import { CloseGuard } from './closeGuard';
import type { MainContext } from './context';
import { ForwardingManager } from './forwarding/manager';
import { vaultForwardingDeps } from './forwarding/vaultDeps';
import { registerIpcModules } from './ipc';
import { createEmitter, createRegistrar } from './ipc/register';
import { SessionRegistry } from './sessions/registry';
import { SettingsStore } from './settings';
import { TransferManager } from './sftp/transfers';
import { Interactions } from './ssh/interactions';
import { testHooks } from './testHooks';
import { AutoLock } from './vault/autolock';
import { VaultStore } from './vault/store';

const dataDir = testHooks.dataDir ?? app.getPath('userData');
app.setPath('userData', dataDir);
// Nenhum crash dump nem log em arquivo (FR-030): crashReporter nunca é iniciado.

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? null;
let mainWindow: BrowserWindow | null = null;

// Em dev o React Refresh precisa de script inline (mesma exceção do electron.vite.config.ts).
const CSP =
  `default-src 'self'; script-src 'self'${devServerUrl ? " 'unsafe-inline'" : ''}; ` +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";

function isAllowedUrl(raw: string): boolean {
  const url = new URL(raw);
  if (['file:', 'devtools:', 'data:', 'blob:'].includes(url.protocol)) return true;
  if (devServerUrl) {
    const dev = new URL(devServerUrl);
    return url.hostname === dev.hostname && url.port === dev.port;
  }
  return false;
}

function hardenSession(): void {
  const ses = session.defaultSession;
  // App offline: nada sai da máquina pelo Chromium (FR-027).
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedUrl(details.url) });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] },
    });
  });
  // Só a área de transferência, usada no copiar/colar explícito do terminal.
  const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write']);
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission) && wc === mainWindow?.webContents);
  });
  ses.setPermissionCheckHandler((wc, permission) => {
    return allowed.has(permission) && wc === mainWindow?.webContents;
  });
}

function createWindow(settings: SettingsStore, closeGuard: CloseGuard): BrowserWindow {
  const bounds = settings.get().window;
  const appearance = currentAppearance();
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== null && bounds.y !== null ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'ShellVault',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: appearance.dark ? '#e8eaee' : '#1d2026',
      height: 36,
    },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  applyAppearance(win, appearance);
  if (bounds.maximized) win.maximize();

  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => {
    win.show();
  });
  win.on('close', (event) => {
    if (closeGuard.intercept()) {
      event.preventDefault();
      return;
    }
    const b = win.getNormalBounds();
    settings.saveWindow({ ...b, maximized: win.isMaximized() });
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    const page = join(import.meta.dirname, '../renderer/index.html');
    void win.loadFile(page, testHooks.e2e ? { query: { e2e: '1' } } : undefined);
  }
  return win;
}

function isTrustedSender(event: unknown): boolean {
  const e = event as IpcMainInvokeEvent;
  return (
    mainWindow !== null &&
    e.sender === mainWindow.webContents &&
    e.senderFrame === mainWindow.webContents.mainFrame
  );
}

async function main(): Promise<void> {
  await app.whenReady();
  hardenSession();

  const settings = SettingsStore.load(dataDir);
  const vault = await VaultStore.open(dataDir);
  const events = createEmitter((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  });
  const reg = createRegistrar({
    ipc: ipcMain,
    isTrustedSender,
    isUnlocked: () => vault.state === 'unlocked',
  });
  const sessions = new SessionRegistry({
    data: (sessionId, data) => {
      events.emit('sessions', 'onData', { sessionId, data });
    },
    state: (event) => {
      events.emit('sessions', 'onState', event);
    },
  });
  const autoLock = new AutoLock(vault);
  const interactions = new Interactions({
    hostKey: (e) => {
      events.emit('sessions', 'onHostKey', e);
    },
    prompt: (e) => {
      events.emit('sessions', 'onPrompt', e);
    },
  });

  const transfers = new TransferManager({
    transfer: (t) => {
      events.emit('sftp', 'onTransfer', t);
    },
    conflict: (c) => {
      events.emit('sftp', 'onConflict', c);
    },
  });

  const forwards = new ForwardingManager(
    vaultForwardingDeps(vault, interactions, (e) => {
      events.emit('forwards', 'onStatus', e);
    }),
  );

  const closeGuard = new CloseGuard({
    summary: () => ({
      sessions: sessions.activeCount(),
      transfers: transfers.activeCount(),
      forwards: forwards.activeCount(),
    }),
    request: (summary) => {
      events.emit('app', 'onCloseRequested', summary);
    },
    close: () => {
      mainWindow?.close();
    },
  });

  const ctx: MainContext = {
    reg,
    events,
    dataDir,
    getWindow: () => mainWindow,
    settings,
    sessions,
    interactions,
    transfers,
    forwards,
    vault,
    autoLock,
    closeGuard,
  };
  registerIpcModules(ctx);

  mainWindow = createWindow(settings, closeGuard);
  watchAppearance(mainWindow, (a) => {
    events.emit('app', 'onAppearanceChanged', a);
  });

  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on('window-all-closed', () => {
    sessions.closeAll();
    forwards.closeAll();
    vault.lock();
    app.quit();
  });
}

void main();
