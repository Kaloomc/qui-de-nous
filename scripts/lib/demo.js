// Outils des scénarios de captures d'écran (scripts/capture-demo.js) : serveur de démonstration, avatars générés (aucune vraie photo),
// joueurs fictifs (bots sur sockets ou vrais téléphones dans le navigateur), contrôles d'affichage et captures.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Server } from 'socket.io';
import { GameStore } from '../../server/gameStore.js';
import { registerSockets } from '../../server/sockets.js';
import { pageChecks } from './page-checks.js';

const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TV = { width: 1920, height: 1080 };
export const PHONE = { width: 390, height: 844 };

/** 12 joueurs fictifs, prénoms variés, genres mélangés (m : homme, f : femme, n : « je préfère ne pas dire »). */
export const CAST = [
  { name: 'Camille', gender: 'f', hue: 340 },
  { name: 'Mehdi', gender: 'm', hue: 200 },
  { name: 'Inès', gender: 'f', hue: 20 },
  { name: 'Thomas', gender: 'm', hue: 140 },
  { name: 'Sacha', gender: 'n', hue: 270 },
  { name: 'Léa', gender: 'f', hue: 50 },
  { name: 'Yanis', gender: 'm', hue: 320 },
  { name: 'Aïcha', gender: 'f', hue: 170 },
  { name: 'Hugo', gender: 'm', hue: 100 },
  { name: 'Maëlys', gender: 'f', hue: 230 },
  { name: 'Louis', gender: 'm', hue: 10 },
  { name: 'Noa', gender: 'n', hue: 300 },
];
/** Joueurs supplémentaires pour les parties à 30 (cas limites). */
export const EXTRA_NAMES = ['Zélie', 'Bastien', 'Romane', 'Idriss', 'Clémence', 'Marwan', 'Eva', 'Quentin', 'Salomé', 'Nolan', 'Lina', 'Axel', 'Jade', 'Rayan', 'Olivia', 'Enzo', 'Manon', 'Théo'];

/** Avatars générés (SVG rendus en PNG par le navigateur) : un visage simple et coloré par joueur. Aucune vraie photo. */
export async function makeAvatars(browser, list) {
  const page = await browser.newPage({ viewport: { width: 160, height: 160 } });
  const out = [];
  for (const [i, p] of list.entries()) {
    const skin = ['#f2c9a0', '#e0a979', '#c68a5c', '#8d5a3b', '#f7d9bd'][i % 5];
    const hair = ['#2b1d14', '#6b3b1f', '#c9a14a', '#1a1a1a', '#a63d2f', '#8a8f9c'][(i * 7) % 6];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" fill="hsl(${p.hue ?? (i * 47) % 360},70%,${p.gender === 'm' ? 40 : 55}%)"/>
      <circle cx="130" cy="30" r="40" fill="hsl(${((p.hue ?? 0) + 40) % 360},70%,65%)" opacity="0.5"/>
      <ellipse cx="80" cy="150" rx="58" ry="40" fill="hsl(${((p.hue ?? 0) + 180) % 360},50%,35%)"/>
      <rect x="68" y="98" width="24" height="26" fill="${skin}"/>
      <ellipse cx="80" cy="76" rx="32" ry="38" fill="${skin}"/>
      <path d="M46 70 C44 38 70 26 82 28 C104 28 118 44 114 70 C108 54 96 48 80 48 C64 48 52 54 46 70 Z" fill="${hair}"/>
      <circle cx="68" cy="78" r="4" fill="#2b1d14"/><circle cx="92" cy="78" r="4" fill="#2b1d14"/>
      <path d="M68 96 Q80 106 92 96" stroke="#7a2e2e" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>`;
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const png = await page.screenshot({ type: 'png' });
    out.push(`data:image/png;base64,${png.toString('base64')}`);
  }
  await page.close();
  return out;
}

export async function startDemoServer() {
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server, { maxHttpBufferSize: 1e6 });
  const store = new GameStore();
  registerSockets(ioServer, store);
  app.get('/api/info', (_req, res) => res.json({ lanIps: [], publicUrl: null }));
  app.get('/api/recap/:code', (req, res) => {
    const game = store.get(req.params.code);
    return game ? res.json(game.recap()) : res.status(404).json({ error: 'Partie introuvable.' });
  });
  app.get('/api/photo/:code/:playerId', (req, res) => {
    const photo = store.get(req.params.code)?.players.get(req.params.playerId)?.photo;
    if (!photo) return res.sendStatus(404);
    res.type(photo.mime).send(photo.data);
  });
  app.use(express.static(path.join(ROOT, 'dist')));
  app.use((req, res) => res.sendFile(path.join(ROOT, 'dist/index.html')));
  await new Promise((r) => server.listen(0, r));
  return { store, url: `http://localhost:${server.address().port}`, close: () => new Promise((r) => ioServer.close(() => server.close(r))) };
}

/** Navigateur sans accès au réseau extérieur (polices Google…) : les captures ne dépendent pas d'internet. */
export async function launch(chromium) {
  const browser = await chromium.launch();
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    await context.route((url) => url.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort());
    return context;
  };
  return browser;
}

/** Joueur fictif sans navigateur : une simple connexion socket avec sa photo, que le scénario fait jouer à la main. */
export function bot(url, code, person, avatar) {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  const b = { socket, name: person.name, id: null, secret: null, state: null, person };
  socket.on('state', (st) => (b.state = st));
  b.emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  b.ready = b.emit('player:join', { code, name: person.name, gender: person.gender, photo: avatar }).then((ack) => {
    if (!ack.ok) throw new Error(`${person.name} : ${ack.error}`);
    Object.assign(b, { id: ack.playerId, secret: ack.secret });
    return b;
  });
  b.act = (action, roundId = b.state?.roundId) => b.emit('player:action', { action, roundId });
  b.vote = (choice, roundId = b.state?.roundId) => b.emit('player:vote', { choice, roundId });
  b.close = () => socket.disconnect();
  return b;
}

/**
 * Séance de captures : un dossier de sortie, un journal (INDEX), les contrôles d'affichage et les erreurs de console de chaque page.
 * `shot(page, fichier, légende, { tv })` enregistre l'image, ajoute sa description à l'index et signale les problèmes d'affichage.
 */
export class Session {
  constructor(outDir, { onlyCheck = true } = {}) {
    this.outDir = outDir;
    this.index = [];
    this.issues = [];
    this.consoleIssues = new Set();
    this.onlyCheck = onlyCheck;
    fs.mkdirSync(outDir, { recursive: true });
  }

  watch(page, who) {
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/ERR_FAILED|ERR_INTERNET|net::/.test(m.text()) && this.consoleIssues.add(`${who} : console ${m.type()} : ${m.text().slice(0, 160)}`));
    page.on('pageerror', (e) => this.consoleIssues.add(`${who} : exception : ${e.message.slice(0, 160)}`));
  }

  async shot(page, file, caption, { tv = false, lobby = false, section = '' } = {}) {
    await sleep(250);
    const name = file.endsWith('.png') ? file : `${file}.png`;
    await page.screenshot({ path: path.join(this.outDir, name) });
    const problems = await page.evaluate(pageChecks, { tv, lobby });
    // Les `.ctrl` de l'hôte et le numéro de version ne comptent pas comme contenu à vérifier.
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (/\{[^}]*\}/.test(bodyText)) problems.push(`champ {...} visible : ${(/\{[^}]*\}/.exec(bodyText) ?? [''])[0]}`);
    for (const p of problems) this.issues.push({ file: name, issue: p });
    this.index.push({ file: name, caption, section, problems });
    return name;
  }

  /** Index Markdown : chaque image et ce qu'elle montre, regroupées par section, avec les constats éventuels. */
  indexMarkdown(title, intro = '') {
    const sections = [...new Set(this.index.map((i) => i.section))];
    const lines = [`# ${title}`, '', intro, ''].filter((l, i) => l !== '' || i > 1);
    for (const section of sections) {
      lines.push(`## ${section || 'Divers'}`, '');
      for (const item of this.index.filter((i) => i.section === section)) {
        lines.push(`- **${item.file}** — ${item.caption}`);
        for (const p of item.problems) lines.push(`  - ⚠️ ${p}`);
      }
      lines.push('');
    }
    return `${lines.join('\n')}\n`;
  }
}
