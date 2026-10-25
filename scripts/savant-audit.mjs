// Audit d'affichage du Savant avec un vrai navigateur (Playwright) : une manche complète pour 4, 12 et 30 joueurs, réponses de
// 60 caractères, prénoms de 20 caractères, aucune photo. Captures dans docs/captures-audit/savant/, rapport RAPPORT-SAVANT.md.
//   npm run audit:savant            TV 1920×1080 + téléphone 390×844, puis TV 1366×768 + téléphone 360×640
//   npm run audit:savant -- --quick TV 1920×1080 + téléphone 390×844 seulement
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Server } from 'socket.io';
import { chromium } from 'playwright';
import { GameStore } from '../server/gameStore.js';
import { registerSockets } from '../server/sockets.js';
import { GAMES } from '../server/games/index.js';
import { pageChecks } from './lib/page-checks.js';

const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/captures-audit/savant');
const quick = process.argv.includes('--quick');
const SIZES = quick ? [[[1920, 1080], [390, 844]]] : [[[1920, 1080], [390, 844]], [[1366, 768], [360, 640]]];
const COUNTS = [4, 12, 30];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMING = { announceMs: 2500, writeMs: 9000, writeBeatMs: 600, readMinMs: 9000, readTailMs: 1500, chooseMs: 9000, voteBeatMs: 800, allocMs: 5000 };
const FACT = {
  id: 'audit',
  question: 'Dans un pays très lointain, il existe une tradition étonnante où chaque habitant doit offrir un ___ à son voisin le jour de la fête locale',
  reponse: 'bouquet de fleurs séchées',
  explication: 'Une phrase d’explication assez longue pour vérifier que le texte tient dans son cadre sur un écran de télévision comme sur un téléphone.',
  categorie: 'insolite',
  source: 'https://example.org',
};
const LONG = 'Une réponse très longue de soixante caractères pour tester le cadre';
const NAMES = ['Bartholomew-Alexandre', 'Marie-Charlotte Dupont', 'Jean-Baptiste de la T.', 'Ana'];

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server, { maxHttpBufferSize: 1e6 });
  const store = new GameStore();
  app.get('/api/photo/:code/:playerId', (req, res) => res.sendStatus(404));
  app.use(express.static(path.join(ROOT, 'dist')));
  app.use((req, res) => res.sendFile(path.join(ROOT, 'dist/index.html')));
  registerSockets(ioServer, store);
  await new Promise((r) => server.listen(0, r));
  return { store, url: `http://localhost:${server.address().port}`, close: () => new Promise((r) => ioServer.close(() => server.close(r))) };
}

function bot(url, code, name, i) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  let me = null;
  let done = '';
  s.on('state', (st) => {
    const r = st.round;
    if (st.mode !== 'savant' || !r?.me || st.phase !== 'question') return;
    if (done === r.phaseId) return;
    if (r.step === 'write' && r.me.role === 'writer') {
      done = r.phaseId;
      // Un bot sur cinq sèche, les autres écrivent une réponse de 60 caractères.
      if (i % 5 !== 3) setTimeout(() => s.emit('player:action', { action: { type: 'answer', text: `${LONG} ${i}`.slice(0, 60), phaseId: r.phaseId }, roundId: st.roundId }, () => {}), 300 + Math.random() * 1500);
    } else if (r.step === 'choice') {
      done = r.phaseId;
      const options = r.writers.filter((id) => id !== me);
      setTimeout(() => s.emit('player:vote', { choice: options[Math.floor(Math.random() * options.length)], roundId: st.roundId }, () => {}), 300 + Math.random() * 1500);
    }
  });
  s.emit('player:join', { code, name, gender: 'n' }, (ack) => (me = ack.playerId));
  return s;
}

async function playGame(browser, srv, { n, tv: tvSize, phone: phoneSize, report }) {
  const tag = `tv${tvSize[0]}-ph${phoneSize[0]}-${n}j`;
  const dir = path.join(OUT, tag);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const consoleIssues = new Set();
  const watch = (page, who) => {
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !m.text().includes('ERR_FAILED') && consoleIssues.add(`${who} console ${m.type()} : ${m.text().slice(0, 140)}`));
    page.on('pageerror', (e) => consoleIssues.add(`${who} exception : ${e.message.slice(0, 140)}`));
  };
  const tvCtx = await browser.newContext({ viewport: { width: tvSize[0], height: tvSize[1] } });
  const tvPage = await tvCtx.newPage();
  watch(tvPage, 'TV');
  await tvPage.goto(srv.url, { waitUntil: 'domcontentloaded' });
  await tvPage.getByRole('button', { name: /Créer une partie/ }).click();
  await tvPage.waitForURL(/\/host\/[A-Z0-9]{4}/);
  await tvPage.getByRole('button', { name: /^Le Savant/ }).first().click();
  const code = tvPage.url().split('/').pop();
  const game = srv.store.get(code);
  game.savantFacts = [FACT, { ...FACT, id: 'audit2' }];
  game.savantTiming = TIMING;
  game.settings.auto = true;

  // Trois téléphones réels : le Chercheur, le Savant et un Écrivain (rôles imposés au début de la manche).
  const phones = [];
  for (const name of ['Chercheur', 'Savant', 'Ecrivain']) {
    const ctx = await browser.newContext({ viewport: { width: phoneSize[0], height: phoneSize[1] }, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, `Téléphone ${name}`);
    await page.goto(`${srv.url}/join/${code}`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Ton prénom').fill(name);
    await page.getByRole('radio', { name: 'Je préfère ne pas dire' }).click();
    await page.locator('button.btn-primary.btn-block').click();
    phones.push({ name, ctx, page, seen: new Set() });
  }
  const bots = [];
  for (let i = phones.length; i < n; i++) bots.push(bot(srv.url, code, NAMES[i % NAMES.length].slice(0, 20) + (i >= NAMES.length ? ` ${i}` : ''), i));
  const t0 = Date.now();
  while (game.connectedCount() < n && Date.now() - t0 < 15000) await sleep(200);

  const shoot = async (page, file, tvMode, key, who) => {
    await sleep(200);
    await page.screenshot({ path: path.join(dir, `${file}.png`) });
    for (const issue of await page.evaluate(pageChecks, { tv: tvMode, lobby: key === 'lobby' })) report.push({ tag, key: `${who} · ${key}`, issue });
  };
  await tvPage.waitForSelector('text=Nombre de manches', { timeout: 10000 }).catch(() => {});
  await shoot(tvPage, '00-lobby', true, 'lobby', 'TV');
  await tvPage.getByRole('button', { name: /Lancer la partie/ }).click();

  const d = () => game.roundData;
  for (let i = 0; i < 100 && !d()?.seekerId; i++) await sleep(50);
  // Rôles imposés : on échange avec ceux qui les avaient.
  const idOf = (name) => [...game.players.values()].find((p) => p.name === name)?.id;
  const [seeker, savant, writer] = ['Chercheur', 'Savant', 'Ecrivain'].map(idOf);
  const all = [...game.players.keys()];
  d().seekerId = seeker;
  d().savantId = savant;
  d().writers = all.filter((id) => id !== seeker);
  game.savantRun.rot.done.add(seeker);

  const tvSeen = new Set();
  const deadline = Date.now() + 90000;
  let censored = false;
  let shots = 0;
  while (Date.now() < deadline) {
    const st = game.publicState({ host: true });
    const r = st.round ?? {};
    const key = [st.phase, r.step].join('|');
    if (!tvSeen.has(key)) {
      tvSeen.add(key);
      await shoot(tvPage, `tv-${String(++shots).padStart(2, '0')}-${st.phase}-${r.step ?? ''}`, true, key, 'TV');
      if (st.phase === 'revealing') {
        await sleep(3800);
        await shoot(tvPage, `tv-${String(++shots).padStart(2, '0')}-revealing-fin`, true, 'revealing-fin', 'TV');
      }
      if (r.step === 'read' && !censored) {
        censored = true;
        await sleep(1500);
        await tvPage.locator('.savant-card').first().click();
        await shoot(tvPage, `tv-${String(++shots).padStart(2, '0')}-censure`, true, 'censure', 'TV');
        if ((await tvPage.locator('.savant-card.is-censored').count()) !== 1) report.push({ tag, key: 'censure', issue: 'la réponse masquée n’apparaît pas comme censurée' });
      }
    }
    for (const ph of phones) {
      const me = game.publicState({ playerId: idOf(ph.name) }).round?.me;
      const pkey = [st.phase, r.step, me?.role, !!me?.truth, st.pending, !!me?.myAnswer].join('|');
      if (!ph.seen.has(pkey)) {
        ph.seen.add(pkey);
        await shoot(ph.page, `tel-${ph.name}-${String(ph.seen.size).padStart(2, '0')}-${st.phase}-${r.step ?? ''}`, false, pkey, `Téléphone ${ph.name}`);
      }
      // Les téléphones réels jouent : écrire, puis voter.
      if (r.step === 'write' && ph.name !== 'Chercheur' && !me?.myAnswer) {
        const input = ph.page.locator('input.savant-input');
        if (await input.count()) {
          await input.fill(LONG);
          await ph.page.getByRole('button', { name: 'Envoyer' }).click().catch(() => {});
        }
      }
      if (r.step === 'choice' && !st.votedIds.includes(idOf(ph.name))) {
        const option = ph.page.locator('.savant-option').first();
        if (await option.count()) await option.click().catch(() => {});
      }
    }
    if (st.phase === 'results' && !st.pending && st.roundSips) break;
    await sleep(300);
  }
  for (const c of consoleIssues) report.push({ tag, key: 'console', issue: c });
  for (const b of bots) b.disconnect();
  for (const ph of phones) await ph.ctx.close();
  await tvCtx.close();
  game.dispose();
  return { screens: tvSeen.size, writer };
}

fs.mkdirSync(OUT, { recursive: true });
const saved = GAMES.savant.revealMs;
const srv = await startServer();
const browser = await chromium.launch();
// Aucune requête hors de la machine (polices Google…) : l'audit ne dépend pas d'internet et ne reste pas bloqué hors ligne.
const newContext = browser.newContext.bind(browser);
browser.newContext = async (options) => {
  const context = await newContext(options);
  await context.route((url) => url.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort());
  return context;
};
const report = [];
try {
  for (const n of COUNTS)
    for (const [tv, phone] of SIZES) {
      const t = Date.now();
      const res = await playGame(browser, srv, { n, tv, phone, report });
      console.log(`${n} joueurs, TV ${tv.join('×')}, tél. ${phone.join('×')} : ${res.screens} écrans TV, ${((Date.now() - t) / 1000).toFixed(0)} s`);
    }
} finally {
  GAMES.savant.revealMs = saved;
  await browser.close();
  await srv.close();
}
const grouped = new Map();
for (const r of report) {
  const k = `${r.key.replace(/^(TV|Téléphone \w+) · .*/, '$1')} — ${r.issue.replace(/[\d.]+ px|\d+×\d+|contraste [\d.]+/g, '#')}`;
  grouped.set(k, [...(grouped.get(k) ?? []), `${r.tag} ${r.key} → ${r.issue}`]);
}
const md = [`# Audit d'affichage du Savant — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '', `${report.length} constats (${grouped.size} distincts).`, ''];
for (const [k, where] of grouped) md.push(`- **${k}** (${where.length}×, ex. ${where[0]})`);
fs.writeFileSync(path.join(OUT, 'RAPPORT-SAVANT.md'), `${md.join('\n')}\n`);
console.log(`${report.length} constats, ${grouped.size} distincts → docs/captures-audit/savant/RAPPORT-SAVANT.md`);
process.exit(0);
