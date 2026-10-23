// Ponte mínima: expõe só funções nomeadas do contrato, nunca o ipcRenderer (Princípio II).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { API_SHAPE, channelOf, type ApiModule, type ShellVaultApi } from '@shared/ipc/api';

function buildModule(module: ApiModule): Record<string, unknown> {
  const shape = API_SHAPE[module];
  const out: Record<string, unknown> = {};
  for (const name of shape.invoke) {
    const channel = channelOf(module, name as never);
    out[name] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
  }
  for (const name of shape.events) {
    const channel = channelOf(module, name as never);
    out[name] = (handler: (payload: unknown) => void) => {
      // O `event` do Electron não é repassado à interface.
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        handler(payload);
      };
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    };
  }
  return Object.freeze(out);
}

const api = Object.freeze(
  Object.fromEntries(
    (Object.keys(API_SHAPE) as ApiModule[]).map((module) => [module, buildModule(module)]),
  ),
) as unknown as ShellVaultApi;

contextBridge.exposeInMainWorld('shellvault', api);
