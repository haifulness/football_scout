/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The game engine runs in a Web Worker, which Vite does not hot-reload: after an
 * engine change the page would keep talking to the old worker. Reload the page instead.
 */
function reloadOnEngineChange(): Plugin {
  return {
    name: 'reload-on-engine-change',
    handleHotUpdate({ file, server }) {
      if (/\/src\/(engine|worker|persistence)\//.test(file)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), reloadOnEngineChange()],
  worker: { format: 'es' },
  // One test file at a time: each builds a full 45,000-player world, and running them in parallel thrashes (18 min vs 1.5 min).
  test: { include: ['tests/**/*.test.ts'], environment: 'node', fileParallelism: false },
});
