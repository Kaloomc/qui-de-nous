import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const VIRTUAL_IFACE = /^(docker|br-|veth|virbr|vbox|vmnet|lo|tun|tap|utun|zt|tailscale)/i;

function lanAddresses() {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL_IFACE.test(name))
    .flatMap(([, addrs]) => addrs ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const store = new GameStore();

app.get('/api/info', (_req, res) => {
  res.json({ lanIps: lanAddresses(), publicUrl: process.env.PUBLIC_URL || null });
});

app.get('/api/photo/:code/:playerId', (req, res) => {
  const photo = store.get(req.params.code)?.players.get(req.params.playerId)?.photo;
  if (!photo) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.type(photo.mime).send(photo.data);
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

registerSockets(io, store);

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Le port ${PORT} est déjà utilisé (le jeu tourne peut-être déjà ?). Arrête l’autre instance ou lance avec PORT=3001.`);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Qui de nous ? — serveur sur le port ${PORT}`);
  if (fs.existsSync(DIST_DIR)) {
    console.log(`  Local : http://localhost:${PORT}`);
    for (const ip of lanAddresses()) console.log(`  Réseau : http://${ip}:${PORT}`);
  } else {
    console.log('  (pas de build front : utilise `npm run dev` puis http://localhost:5173)');
  }
});
