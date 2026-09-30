import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
const localChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal', '--', 'src', 'package.json', 'package-lock.json', 'vite.config.ts'], { encoding: 'utf8' }).trim();

export default defineConfig({
  define: { __APP_REVISION__: JSON.stringify(`${revision}${localChanges ? '+local' : ''}`) },
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 5173,
    open: false,
    host: true,
  },
  preview: {
    port: 4173,
    open: true,
  },
});