import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          list: resolve(__dirname, 'src/renderer/list.html'),
          note: resolve(__dirname, 'src/renderer/note.html'),
        },
      },
    },
    plugins: [react()],
  },
});
