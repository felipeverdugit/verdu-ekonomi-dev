import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/verdu-ekonomi-dev/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index:   resolve(import.meta.dirname, 'index.html'),
        ekonomi: resolve(import.meta.dirname, 'ekonomi.html'),
        fire:    resolve(import.meta.dirname, 'fire.html'),
        uttag:   resolve(import.meta.dirname, 'uttag.html'),
        hinkar:  resolve(import.meta.dirname, 'hinkar.html'),
        historik: resolve(import.meta.dirname, 'historik.html'),
        skatt:    resolve(import.meta.dirname, 'skatt.html'),
        budget:   resolve(import.meta.dirname, 'budget.html'),
        kvartal:    resolve(import.meta.dirname, 'kvartal.html'),
        avkastning: resolve(import.meta.dirname, 'avkastning.html'),
      },
    },
  },
});
