// Audit d'affichage et de performance du Loup-Garou avec un vrai navigateur (Playwright, devDependency seulement).
//   npm run audit:display                 4 tailles d'écran × 4 nombres de joueurs (6, 12, 20, 30) : captures + vérifications automatiques
//   npm run audit:display -- --only 30    un seul nombre de joueurs ;  --quick : TV 1366×768 et téléphone 390×844 seulement
//   npm run audit:display -- --perf       mesure FPS (CPU ×4), longues tâches, mutations du DOM et trafic réseau avec 30 joueurs
// Le serveur tourne dans ce processus (build `dist/`), avec des durées raccourcies et sans voix ; chaque écran de la partie
// est capturé une fois (docs/captures-audit/) et passé au crible : débordements, texte coupé, contraste, boutons < 44 px,
// avatars qui se chevauchent, erreurs de console. Rapport : docs/captures-audit/RAPPORT.md.
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

const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/captures-audit');
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? Number(argv[argv.indexOf('--only') + 1]) : null;
const quick = argv.includes('--quick');
const perf = argv.includes('--perf');

const TVS = quick ? [[1366, 768]] : [[1920, 1080], [1366, 768]];
const PHONES = quick ? [[390, 844]] : [[390, 844], [360, 640]];
const COUNTS = only ? [only] : perf ? [30] : [6, 12, 20, 30];
const FAST = { sleepMs: 700, announceBeatMs: 1300, doneBeatMs: 600, readBeatMs: 900, voteBeatMs: 600, absentMinMs: 900, absentMaxMs: 1500, dealSafetyMs: 6000, nightSafetyMs: 2600, hunterSafetyMs: 2500, debateSafetyMs: 3500, voteSafetyMs: 3500, tribunalMs: 5000, narrate: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (l) => l[Math.floor(Math.random() * l.length)];

// ---------- Serveur ----------

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server, { maxHttpBufferSize: 1e6 });
  const store = new GameStore();
  app.get('/api/photo/:code/:playerId', (req, res) => res.sendStatus(404)); // pas de photo : les avatars de remplacement doivent tenir
  app.use(express.static(path.join(ROOT, 'dist')));
  app.use((req, res) => res.sendFile(path.join(ROOT, 'dist/index.html')));
  registerSockets(ioServer, store);
  await new Promise((r) => server.listen(0, r));
  return { store, url: `http://localhost:${server.address().port}`, close: () => new Promise((r) => ioServer.close(() => server.close(r))) };
}

// ---------- Bots (jouent au hasard, comme de vrais joueurs) ----------

const botStats = { msgs: 0, bytes: 0 }; // trafic reçu par les téléphones (bots)

function bot(url, code, name) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  let me = null;
  let done = '';
  const act = (a) => s.emit('player:action', { action: a }, () => {});
  s.on('state', (st) => {
    botStats.msgs += 1;
    botStats.bytes += JSON.stringify(st).length;
    const r = st.round;
    if (st.mode !== 'loup' || !r?.me || r.me.spectator) return;
    const sc = r.me.screen;
    const base = { phaseId: r.phaseId };
    if (st.phase === 'results' && st.pending && r.credits?.[me]) {
      if (done !== 'tri') {
        done = 'tri';
        act({ type: 'allocate', allocation: {} });
      }
      return;
    }
    if (st.phase !== 'question') return;
    const key = r.phaseId + sc.kind;
    if (done === key) return;
    done = key;
    const go = (a) => setTimeout(() => act({ ...a, ...base }), 300 + Math.random() * 900);
    if (sc.kind === 'role') go({ type: 'ack' });
    else if (sc.kind === 'act' && sc.phase === 'loups') go({ type: 'wolfVote', target: pick(sc.options) });
    else if (sc.kind === 'act') {
      const t = pick(sc.options);
      go({ type: 'night', ...({ cupidon: { pair: [t, pick(sc.options)] }, sorciere: { save: false, gorgee: pick(sc.options) }, distributeur: { targets: [t] } }[sc.phase] ?? { target: t }) });
    } else if (sc.kind === 'shoot') go({ type: 'shoot', target: pick(sc.options) });
    else if (sc.kind === 'vote') go({ type: 'vote', target: pick(sc.options) });
    else if (sc.kind === 'debate' && !sc.ready) go({ type: 'ready' });
  });
  s.emit('player:join', { code, name }, (ack) => (me = ack.playerId));
  return s;
}

// ---------- Vérifications dans la page ----------

/* eslint-disable no-undef */
function pageChecks({ tv, lobby }) {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const root = document.documentElement;
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} « ${(el.textContent || '').trim().slice(0, 30)} »`;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  if (root.scrollWidth > vw + 1) issues.push(`débordement horizontal : ${root.scrollWidth} px pour ${vw}`);
  if (tv && !lobby && root.scrollHeight > vh + 1) issues.push(`débordement vertical sur la TV : ${root.scrollHeight} px pour ${vh}`);
  const parse = (c) => {
    const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)/.exec(c);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let layers = [];
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base = [12, 14, 40];
    for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    return base;
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const add = (msg) => {
      if (!seen.has(msg)) {
        seen.add(msg);
        issues.push(msg);
      }
    };
    if (r.right > vw + 1 || r.left < -1) add(`texte hors de l'écran : ${label(el)}`);
    if (tv && !lobby && r.bottom > vh + 1) add(`texte sous le bas de l'écran TV : ${label(el)}`);
    if (s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis') add(`texte coupé (largeur) : ${label(el)}`);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        const scrollY = ps.overflowY === 'auto' || ps.overflowY === 'scroll';
        if (r.right > pr.right + 2 || r.left < pr.left - 2 || (!scrollY && (r.bottom > pr.bottom + 2 || r.top < pr.top - 2))) add(`texte sorti de son cadre (${label(p)}) : ${label(el)}`);
        break;
      }
    }
    const fg = parse(s.color);
    if (fg) {
      const bg = bgOf(el);
      const a = fg[3];
      const mixed = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
      const l1 = lum(mixed);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) add(`contraste ${ratio.toFixed(1)} : ${label(el)}`);
    }
  }
  if (!tv) {
    for (const el of document.querySelectorAll('button, [role=button], input:not([type=hidden]):not([type=file]), a.btn, .ctrl')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) issues.push(`bouton trop petit (${Math.round(r.width)}×${Math.round(r.height)}) : ${label(el)}`);
    }
  }
  const av = Array.from(document.querySelectorAll('.village-avatar')).filter(visible).map((e) => e.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < av.length; i++) for (let j = i + 1; j < av.length; j++) if (Math.min(av[i].right, av[j].right) - Math.max(av[i].left, av[j].left) > 3 && Math.min(av[i].bottom, av[j].bottom) - Math.max(av[i].top, av[j].top) > 3) overlaps++;
  if (overlaps) issues.push(`${overlaps} paires d'avatars du village se chevauchent`);
  // Un prénom recouvert par l'avatar d'un autre siège (ou par un autre prénom).
  const seats = Array.from(document.querySelectorAll('.village-seat')).filter(visible);
  const names = seats.map((s) => s.querySelector('.village-name').getBoundingClientRect());
  const faces = seats.map((s) => s.querySelector('.village-avatar').getBoundingClientRect());
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
  let covered = 0;
  for (let i = 0; i < seats.length; i++) for (let j = 0; j < seats.length; j++) if (i !== j && (hit(names[i], faces[j]) || (j > i && hit(names[i], names[j])))) covered++;
  if (covered) issues.push(`${covered} prénoms du village recouverts par un autre siège`);
  return issues;
}
/* eslint-enable no-undef */

// ---------- Une partie complète pour une taille d'écran et un nombre de joueurs ----------

async function playGame(browser, srv, { n, tv: tvSize, phone: phoneSize, winner, report }) {
  const tag = `tv${tvSize[0]}-ph${phoneSize[0]}-${n}j`;
  const dir = path.join(OUT, tag);
  fs.mkdirSync(dir, { recursive: true });
  const consoleIssues = new Set();
  const watch = (page, who) => {
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleIssues.add(`${who} console ${m.type()} : ${m.text().slice(0, 140)}`));
    page.on('pageerror', (e) => consoleIssues.add(`${who} exception : ${e.message.slice(0, 140)}`));
  };
  const tvCtx = await browser.newContext({ viewport: { width: tvSize[0], height: tvSize[1] } });
  const tvPage = await tvCtx.newPage();
  watch(tvPage, 'TV');
  await tvPage.goto(srv.url);
  await tvPage.getByRole('button', { name: /Créer une partie/ }).click();
  await tvPage.waitForURL(/\/host\/[A-Z0-9]{4}/);
  await tvPage.getByRole('button', { name: /^Loup-Garou/ }).first().click();
  const code = tvPage.url().split('/').pop();
  const game = srv.store.get(code);
  game.loupConfig = { counts: null, options: { dernieresParoles: true, potionGorgee: true, rolesMaison: true } };

  // Téléphones réels (rôle choisi pour voir chaque écran) : loup, voyante, sorcière, fantôme.
  const phoneNames = ['Loup', 'Voyante', 'Sorciere', 'Fantome'];
  const phones = [];
  for (const name of phoneNames) {
    const ctx = await browser.newContext({ viewport: { width: phoneSize[0], height: phoneSize[1] }, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, `Téléphone ${name}`);
    await page.goto(`${srv.url}/join/${code}`);
    await page.getByPlaceholder('Ton prénom').fill(name);
    await page.locator('button.btn-primary.btn-block').click();
    phones.push({ name, ctx, page, seen: new Set() });
  }
  // Les autres joueurs : des bots, dont deux avec un prénom de 25 caractères (jamais de photo).
  const bots = [];
  for (let i = phones.length; i < n; i++) bots.push(bot(srv.url, code, i < phones.length + 2 ? `Bartholomew-Alexandre-J${i}`.slice(0, 25) : `Bot${i}`));
  const t0 = Date.now();
  while (game.connectedCount() < n && Date.now() - t0 < 15000) await sleep(200);
  if (game.connectedCount() < n) report.push({ tag, key: 'connexion', issue: `seulement ${game.connectedCount()} joueurs connectés sur ${n}` });
  game.loupTiming = FAST;

  const shoot = async (page, file, tvMode, key, who) => {
    await sleep(250);
    await page.screenshot({ path: path.join(dir, `${file}.png`) });
    for (const issue of await page.evaluate(pageChecks, { tv: tvMode, lobby: key === 'lobby' })) report.push({ tag, key: `${who} · ${key}`, issue });
  };

  // Lobby : composition de la partie.
  await tvPage.waitForSelector('text=Composition', { timeout: 10000 }).catch(() => {});
  await shoot(tvPage, '00-lobby-composition', true, 'lobby', 'TV');
  await shoot(phones[0].page, '00-lobby-telephone', false, 'lobby', 'Téléphone');
  await tvPage.getByRole('button', { name: /Lancer la partie/ }).click();

  // Rôles imposés (échange avec le joueur qui les avait) puis le fantôme.
  const eng = () => game.roundData?.eng;
  for (let i = 0; i < 100 && !eng(); i++) await sleep(100);
  const idOf = (name) => [...game.players.values()].find((p) => p.name === name)?.id;
  const swap = (a, b) => {
    const e = eng();
    [e.roles[a], e.roles[b]] = [e.roles[b], e.roles[a]];
  };
  for (const [name, role] of [['Loup', 'loup'], ['Voyante', 'voyante'], ['Sorciere', 'sorciere']]) {
    const me = idOf(name);
    const other = eng().order.find((id) => eng().roles[id] === role && id !== me);
    if (other) swap(me, other);
  }
  const ghost = idOf('Fantome');
  if (eng().roles[ghost] === 'loup') swap(ghost, eng().order.find((id) => eng().roles[id] === 'villageois'));
  eng().dead[ghost] = { cause: 'loups', night: 0, role: eng().roles[ghost] };

  // Boucle de capture : un cliché par écran inédit.
  const tvSeen = new Set();
  const deadline = Date.now() + 120000;
  let forced = false;
  let shots = 0;
  while (Date.now() < deadline) {
    const state = game.publicState({ host: true });
    const r = state.round ?? {};
    const a = r.announce?.items?.[r.announce.i];
    const tvKey = [state.phase, r.stage, r.phase, a?.type, a?.cause, r.tie ? 'tie' : '', r.winner ?? ''].join('|');
    if (!tvSeen.has(tvKey)) {
      tvSeen.add(tvKey);
      await shoot(tvPage, `tv-${String(++shots).padStart(2, '0')}-${[r.stage ?? state.phase, r.phase, a?.type].filter(Boolean).join('-')}`, true, tvKey, 'TV');
    }
    for (const ph of phones) {
      const me = game.publicState({ playerId: idOf(ph.name) }).round?.me;
      const key = me ? [state.phase, r.stage, me.screen?.kind, me.screen?.phase, me.alive].join('|') : state.phase;
      if (!ph.seen.has(key)) {
        ph.seen.add(key);
        await shoot(ph.page, `tel-${ph.name}-${String(ph.seen.size).padStart(2, '0')}-${[me?.screen?.kind, me?.screen?.phase].filter(Boolean).join('-') || state.phase}`, false, key, `Téléphone ${ph.name}`);
      }
    }
    // Pour voir la victoire de chaque camp sans attendre une longue partie : on déclare le vainqueur au premier vote.
    if (!forced && r.stage === 'vote' && eng()) {
      forced = true;
      eng().winner = winner;
    }
    if ((state.phase === 'results' && !state.pending) || state.phase === 'ended') break;
    await sleep(350);
  }
  for (const c of consoleIssues) report.push({ tag, key: 'console', issue: c });
  for (const b of bots) b.disconnect();
  for (const ph of phones) await ph.ctx.close();
  await tvCtx.close();
  game.dispose();
  return { tvScreens: tvSeen.size };
}

// ---------- Performance (30 joueurs) ----------

async function perfRun(browser, srv, report) {
  const n = 30;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  let frames = 0;
  let bytes = 0;
  cdp.on('Network.webSocketFrameReceived', (e) => {
    frames += 1;
    bytes += e.response.payloadData.length;
  });
  await page.addInitScript(() => {
    window.__perf = { frames: 0, last: performance.now(), worst: 0, long: 0, longMs: 0, mutations: 0, fps: [] };
    const tick = (t) => {
      const p = window.__perf;
      p.frames += 1;
      p.worst = Math.max(p.worst, t - p.last);
      p.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((l) => l.getEntries().forEach((e) => ((window.__perf.long += 1), (window.__perf.longMs += e.duration)))).observe({ entryTypes: ['longtask'] });
    document.addEventListener('DOMContentLoaded', () => new MutationObserver((m) => (window.__perf.mutations += m.length)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }));
  });
  await page.goto(srv.url);
  await page.getByRole('button', { name: /Créer une partie/ }).click();
  await page.waitForURL(/\/host\/[A-Z0-9]{4}/);
  await page.getByRole('button', { name: /^Loup-Garou/ }).first().click();
  const code = page.url().split('/').pop();
  const game = srv.store.get(code);
  const bots = Array.from({ length: n }, (_, i) => bot(srv.url, code, `Bot${i}`));
  while (game.connectedCount() < n) await sleep(200);
  game.loupTiming = FAST;
  frames = 0;
  bytes = 0;
  Object.assign(botStats, { msgs: 0, bytes: 0 });
  await page.getByRole('button', { name: /Lancer la partie/ }).click();
  const t0 = Date.now();
  await page.evaluate(() => Object.assign(window.__perf, { frames: 0, worst: 0, long: 0, longMs: 0, mutations: 0, last: performance.now() }));
  while (Date.now() - t0 < 60000 && game.phase !== 'results' && game.phase !== 'ended') await sleep(500);
  const sec = (Date.now() - t0) / 1000;
  const p = await page.evaluate(() => window.__perf);
  const line = `30 joueurs, TV 1366×768, CPU ×4, ${sec.toFixed(0)} s de partie : ${(p.frames / sec).toFixed(0)} images/s (pire image ${p.worst.toFixed(0)} ms), ${p.long} longues tâches (${p.longMs.toFixed(0)} ms au total), ${(p.mutations / sec).toFixed(0)} mutations DOM/s ; réseau TV : ${(frames / sec).toFixed(1)} messages/s, ${(bytes / 1024 / sec).toFixed(1)} Ko/s (${(bytes / Math.max(frames, 1) / 1024).toFixed(1)} Ko par message)`;
  const phones = `30 téléphones : ${(botStats.msgs / n / sec).toFixed(2)} messages/s et ${(botStats.bytes / n / 1024 / sec).toFixed(2)} Ko/s chacun, ${(botStats.bytes / 1024 / 1024).toFixed(1)} Mo reçus au total`;
  console.log(line);
  console.log(phones);
  report.push({ tag: 'perf', key: 'mesure', issue: line });
  for (const b of bots) b.disconnect();
  await ctx.close();
  game.dispose();
}

// ---------- Main ----------

fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch();
const report = [];
try {
  if (perf) await perfRun(browser, srv, report);
  else {
    const winners = ['village', 'loups', 'amoureux', 'nul'];
    let i = 0;
    for (const n of COUNTS)
      for (const tv of TVS)
        for (const phone of PHONES) {
          const winner = winners[i++ % winners.length];
          const t = Date.now();
          const res = await playGame(browser, srv, { n, tv, phone, winner, report });
          console.log(`${n} joueurs, TV ${tv.join('×')}, tél. ${phone.join('×')}, victoire ${winner} : ${res.tvScreens} écrans TV, ${((Date.now() - t) / 1000).toFixed(0)} s`);
        }
  }
} finally {
  await browser.close();
  await srv.close();
}
const real = report.filter((r) => r.issue);
const grouped = new Map();
for (const r of real) {
  const k = `${r.key.replace(/^(TV|Téléphone \w+) · .*/, '$1')} — ${r.issue.replace(/[\d.]+ px|\d+×\d+|\d+ paires|contraste [\d.]+/g, '#')}`;
  grouped.set(k, [...(grouped.get(k) ?? []), `${r.tag} ${r.key} → ${r.issue}`]);
}
const md = [`# Audit d'affichage — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '', `${real.length} constats (${grouped.size} distincts).`, ''];
for (const [k, where] of grouped) md.push(`- **${k}** (${where.length}×, ex. ${where[0]})`);
fs.writeFileSync(path.join(OUT, 'RAPPORT.md'), `${md.join('\n')}\n`);
console.log(`${real.length} constats, ${grouped.size} distincts → docs/captures-audit/RAPPORT.md`);
process.exit(0);
