import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SERVER = `http://localhost:${process.env.PORT || 3000}`;

// Version affichée en bas à gauche de l'appli : numéro du package, commit et heure du build.
// Permet de vérifier d'un coup d'œil que le PC de la TV et les téléphones ont bien la même version.
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = git('rev-parse --short HEAD');
const dirty = git('status --porcelain -- client server shared') ? '+' : '';
const builtAt = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default defineConfig({
  root: 'client',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${version}${commit ? ` · ${commit}${dirty}` : ''} · ${builtAt}`),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/socket.io': { target: SERVER, ws: true },
    },
  },
});
