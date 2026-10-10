import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

/** Untouched source page available only in explicitly requested test-dev mode. */
const originalViewer: Plugin = {
  name: 'test-only-original-viewer', apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/__reference__/viewer.html') return next();
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(readFileSync(new URL('../reference/chinese-dungeon/ChineseDungeon-Viewer.html', import.meta.url)));
    });
  },
};

export default defineConfig({
  plugins: [react(), ...(process.env.ORACLE_TEST_MODE === '1' ? [originalViewer] : [])],
  // K1 (PLAN.md): source class/function names are runtime data (saves, recipe seeds, pools);
  // the default minifier would turn `class 物品` into `var e=class{}`.
  build: { rolldownOptions: { output: { keepNames: true } } },
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app', 'localhost'], port: 5173 },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app', 'localhost'], port: 4173 },
});
