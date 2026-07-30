import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/verdu-ekonomi-dev/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index:   resolve(__dirname, 'index.html'),
        ekonomi: resolve(__dirname, 'ekonomi.html'),
        fire:    resolve(__dirname, 'fire.html'),
        uttag:   resolve(__dirname, 'uttag.html'),
      },
    },
  },
});
