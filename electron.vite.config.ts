import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const shared = { '@shared': resolve(import.meta.dirname, 'frontend/src/shared') };

// Só no `npm run dev`: o React Refresh injeta um script inline no HTML, que a CSP estrita barra.
// O build de produção mantém `script-src 'self'`.
const devCsp: Plugin = {
  name: 'shellvault-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
};

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      // ssh2, node-pty e libsodium ficam fora do bundle (dependências de produção).
      externalizeDeps: true,
      rolldownOptions: { input: { index: resolve(import.meta.dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      externalizeDeps: true,
      rolldownOptions: {
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        // Preload em sandbox não suporta ESM.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'frontend'),
    resolve: { alias: shared },
    plugins: [react(), devCsp],
    build: {
      rolldownOptions: {
        input: { index: resolve(import.meta.dirname, 'frontend/index.html') },
      },
    },
  },
});
