import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Só no `wails dev`: o React Refresh injeta um script inline no HTML, que a CSP estrita barra.
// O build de produção mantém `script-src 'self'`.
const devCsp: Plugin = {
  name: 'shellvault-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
};

export default defineConfig({
  plugins: [react(), devCsp],
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  build: { outDir: 'dist', emptyOutDir: true },
});
