// Gorgée en mode « à distance » : lance le serveur + un tunnel Cloudflare gratuit, puis affiche l'adresse publique.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = process.env.PORT || '3000';
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('Le front n’est pas buildé : lance d’abord `npm run build`.');
  process.exit(1);
}

const children = [];
const stopAll = (code = 0) => {
  for (const child of children) child.kill();
  process.exit(code);
};
process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());

const server = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: { ...process.env, PORT } });
children.push(server);
server.on('exit', (code) => stopAll(code ?? 1));

const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
children.push(tunnel);

tunnel.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('\ncloudflared est introuvable. Installe-le (voir README, section « Jouer à distance »).');
  } else {
    console.error(err);
  }
  stopAll(1);
});

let announced = false;
const onOutput = (chunk) => {
  const match = URL_PATTERN.exec(chunk.toString());
  if (match && !announced) {
    announced = true;
    const rule = '='.repeat(Math.max(match[0].length, 62) + 4);
    console.log(`\n${rule}\n  Gorgée est en ligne ! Ouvre cette adresse sur la TV / le PC :\n  ${match[0]}\n${rule}`);
    console.log('Les joueurs scannent le QR code affiché, depuis n’importe quel réseau. Ctrl+C pour arrêter.\n');
  }
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
tunnel.on('exit', (code) => {
  if (!announced) console.error('Le tunnel s’est arrêté avant de fournir une adresse.');
  stopAll(code ?? 1);
});
