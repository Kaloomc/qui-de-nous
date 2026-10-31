// Audit automatique de l'affichage du mode Duel, mesuré dans un vrai navigateur (Playwright), SANS aucune capture d'image.
//   npm run audit:affichage                  tout : 19 mini-jeux, 3 tailles de TV, 3 tailles de téléphone, puis les variantes
//   npm run audit:affichage -- --quick       un seul jeu par catégorie de mise en page, tailles principales seulement
//   npm run audit:affichage -- --games des,russe --no-variants
// Le serveur tourne dans ce processus avec une horloge factice : chaque phase de chaque jeu est atteinte en un instant, puis mesurée sur la TV,
// l'écran d'un duelliste et celui d'un parieur (défilement, débordements, chevauchements, boutons, contraste, tailles de texte, couleur seule…).
// Rapport : docs/AUDIT-AFFICHAGE.md. Code de sortie 1 s'il reste un défaut bloquant (défilement, débordement, chevauchement, bouton, contraste).
// Prérequis : `npm run build` (le serveur sert dist/). Polices Google bloquées (hors ligne) : les mesures utilisent les polices de secours.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { MINIGAMES } from '../server/duel/minigames/index.js';
import { CAST, EXTRA_NAMES, ROOT, TV, bot, launch, makeAvatars, sleep } from './lib/demo.js';
import { auditChecks } from './lib/audit-checks.js';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { GameStore } from '../server/gameStore.js';
import { registerSockets } from '../server/sockets.js';
import { fakeClock } from '../server/testClock.js';

const argv = process.argv.slice(2);
const quick = argv.includes('--quick');
const noVariants = argv.includes('--no-variants') || quick;
const gamesArg = argv.includes('--games') ? argv[argv.indexOf('--games') + 1].split(',') : null;
const ALL = Object.keys(MINIGAMES);
const GAMES = gamesArg ?? (quick ? ['pfc', 'code', 'geo', 'des', 'russe', 'course'] : ALL);

const TV_SIZES = quick ? [[1920, 1080], [1366, 768]] : [[1920, 1080], [1366, 768], [1280, 720]];
const PHONE_SIZES = quick ? [[390, 844], [320, 568]] : [[390, 844], [360, 640], [320, 568]];

// ---------- Serveur à horloge factice ----------

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server, { maxHttpBufferSize: 1e6 });
  const clock = fakeClock();
  clock.t = Date.now();
  const store = new GameStore({ clock });
  registerSockets(ioServer, store);
  app.get('/api/info', (_req, res) => res.json({ lanIps: [], publicUrl: null }));
  app.get('/api/photo/:code/:playerId', (req, res) => {
    const photo = store.get(req.params.code)?.players.get(req.params.playerId)?.photo;
    if (!photo) return res.sendStatus(404);
    return res.type(photo.mime).send(photo.data);
  });
  app.use(express.static(path.join(ROOT, 'dist')));
  app.use((req, res) => res.sendFile(path.join(ROOT, 'dist/index.html')));
  await new Promise((r) => server.listen(0, r));
  return { store, clock, url: `http://localhost:${server.address().port}`, close: () => new Promise((r) => ioServer.close(() => server.close(r))) };
}

// ---------- Résultats ----------

const defects = new Map(); // clé → { cat, blocking, msg, game, phase, view, sizes:Set, variant }
const consoleIssues = new Set();
let measures = 0;
const record = (found, ctx, size) => {
  for (const f of found) {
    const key = `${f.cat}|${ctx.variant}|${ctx.game}|${ctx.view}|${f.msg}`;
    const cur = defects.get(key) ?? { ...f, ...ctx, phases: new Set(), sizes: new Set() };
    cur.phases.add(ctx.phase);
    cur.sizes.add(size);
    defects.set(key, cur);
  }
};

// ---------- Environnement d'une série ----------

const PERSON = (name, i) => ({ name, gender: ['f', 'm', 'n'][i % 3], hue: (i * 37) % 360 });
const LONG_NAMES = ['ÉLÉONORE-ALEXANDRINE', 'JEAN-CHRISTOPHE ÉMILE', 'MARIE-CHARLOTTE ÇELIK', 'ÉTIENNE DE LA FAYETTE', 'ÂNGELA MARÍA SÁNCHEZ'];

async function joinPhone(env, code, person, avatar) {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: env.v.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  watch(page, `téléphone ${person.name}`);
  await page.goto(`${env.srv.url}/join/${code}`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Ton prénom').fill(person.name);
  if (avatar) {
    const png = Buffer.from(avatar.split(',')[1], 'base64');
    await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
    await sleep(300);
  }
  const label = { m: 'Homme', f: 'Femme', n: 'Je préfère ne pas dire' }[person.gender];
  await page.getByRole('radio', { name: label }).click();
  await page.locator('button.btn-primary.btn-block').click();
  await page.waitForSelector('.waiting, .vote, .center', { timeout: 10000 });
  return { ctx, page, name: person.name };
}

const watch = (page, who) => {
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/ERR_FAILED|ERR_INTERNET|net::|Failed to load resource/.test(m.text()) && consoleIssues.add(`${who} : ${m.type()} : ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => consoleIssues.add(`${who} : exception : ${e.message.slice(0, 200)}`));
};

async function makeEnv(browser, srv, avatars, v) {
  const env = { browser, srv, v, avatars };
  const ctx = await browser.newContext({ viewport: v.tvSize ? { width: v.tvSize[0], height: v.tvSize[1] } : TV, reducedMotion: v.reduced ? 'reduce' : 'no-preference' });
  env.tv = await ctx.newPage();
  watch(env.tv, 'TV');
  await env.tv.goto(srv.url, { waitUntil: 'domcontentloaded' });
  await env.tv.getByRole('button', { name: /Créer une partie/ }).click();
  await env.tv.waitForURL(/\/host\/[A-Z0-9]{4}/);
  const code = env.tv.url().split('/').pop();
  env.game = srv.store.get(code);
  if (v.adult) env.game.adult = { active: true, pending: false, confirmed: new Set(), refused: new Set(), changedAt: 0 };
  await env.tv.getByRole('button', { name: /Mode Duel/ }).first().click();
  await env.tv.waitForSelector('.duel-setup');
  const names = v.longNames ? [...LONG_NAMES, ...EXTRA_NAMES] : [...CAST.map((c) => c.name), ...EXTRA_NAMES];
  env.phones = [];
  for (let i = 0; i < 3; i++) env.phones.push(await joinPhone(env, code, PERSON(names[i], i), v.noPhotos ? null : avatars[i % avatars.length]));
  env.bots = [];
  for (let i = 3; i < v.players; i++) {
    const b = bot(srv.url, code, PERSON(names[i % names.length] + (i >= names.length ? ` ${i}` : ''), i), v.noPhotos ? undefined : avatars[i % avatars.length]);
    await b.ready;
    env.bots.push(b);
  }
  const t0 = Date.now();
  while (env.game.connectedCount() < v.players) {
    if (Date.now() - t0 > 30000) throw new Error('joueurs non connectés');
    await sleep(50);
  }
  // Les 3 vrais téléphones sont toujours les premiers tirés : deux duellistes + un parieur.
  const role = 'duel:duelliste';
  env.game.spotlight.pick(role, [...env.game.players.keys()]);
  const counts = env.game.spotlight.counts.get(role);
  const phoneIds = new Set(env.phones.map((p) => [...env.game.players.values()].find((q) => q.name === p.name)?.id));
  for (const [pid] of counts) counts.set(pid, phoneIds.has(pid) ? 0 : 6);
  env.game.settings.auto = false;
  return env;
}

// ---------- Pilotage du jeu ----------

const d = (env) => env.game.roundData;
const push = (env) => env.game.onChange?.(env.game);
const advance = (env, pred, maxMs = 400000, step = 100) => {
  let t = 0;
  while (!pred() && t < maxMs) {
    env.srv.clock.tick(step);
    t += step;
  }
  if (!pred()) throw new Error(`étape jamais atteinte (${maxMs} ms) : ${env.game.phase}/${d(env).step}`);
  push(env);
};
const atStep = (env, s) => () => env.game.phase === 'question' && d(env).step === s;
const idOf = (env, camp) => (camp === 'rouge' ? d(env).red : d(env).blue);
const playAs = (env, camp, data) => {
  const r = env.game.action(idOf(env, camp), { type: 'play', data });
  push(env);
  return r;
};
const vote = (env) => {
  let k = 0;
  for (const pid of d(env).bettors) env.game.vote(pid, k++ % 3 === 0 ? 'bleu' : 'rouge');
  push(env);
};

/** Mesure l'état courant : la TV aux 3 tailles, le téléphone de chaque joueur réel aux 3 tailles (duelliste ou parieur). */
async function measure(env, game, phase, { landscape = false, tvOnly = false } = {}) {
  push(env);
  await sleep(230);
  const base = { variant: env.v.name, game, phase };
  const tvSizes = env.v.tvSizes ?? TV_SIZES;
  for (const [w, h] of tvSizes) {
    await env.tv.setViewportSize({ width: w, height: h });
    await sleep(160);
    measures += 1;
    record(await env.tv.evaluate(auditChecks, { tv: true, scale: w / 1920 }), { ...base, view: 'TV' }, `${w}×${h}`);
  }
  await env.tv.setViewportSize({ width: tvSizes[0][0], height: tvSizes[0][1] });
  if (tvOnly) return;
  const { red, blue } = d(env);
  const phoneSizes = env.v.phoneSizes ?? PHONE_SIZES;
  for (const ph of env.phones) {
    const id = [...env.game.players.values()].find((p) => p.name === ph.name)?.id;
    const view = id === red || id === blue ? 'duelliste' : 'parieur';
    const sizes = landscape && view === 'duelliste' ? [...phoneSizes, [844, 390]] : phoneSizes;
    for (const [w, h] of sizes) {
      await ph.page.setViewportSize({ width: w, height: h });
      await sleep(60);
      measures += 1;
      record(await ph.page.evaluate(auditChecks, { tv: false, scale: 1 }), { ...base, view }, `${w}×${h}`);
    }
    await ph.page.setViewportSize({ width: 390, height: 844 });
  }
}

/** Actions plausibles pendant la partie (une liste par camp, essayées toutes : les refus sont ignorés). */
const ACT = {
  pfc: () => ({ rouge: [{ choice: 'pierre' }], bleu: [{ choice: 'ciseaux' }] }),
  culture: (e) => ({ rouge: [{ choice: 0, n: d(e).mg.n }], bleu: [{ choice: 1, n: d(e).mg.n }] }),
  feu: () => ({ rouge: [{ type: 'tap' }], bleu: [] }),
  simon: () => ({ rouge: [{ pad: 0 }, { pad: 1 }], bleu: [{ pad: 2 }] }),
  couleur: () => ({ rouge: [{ choice: 0 }, { color: 'rouge' }], bleu: [{ choice: 1 }, { color: 'bleu' }] }),
  defuse: () => ({ rouge: [{ wire: 0 }], bleu: [{ wire: 1 }] }),
  code: () => ({ rouge: [{ guess: [0, 1, 2, 3] }], bleu: [{ guess: [4, 5, 0, 1] }] }),
  simon2: () => ({ rouge: [{ pad: 0 }], bleu: [] }),
  crash: () => ({ rouge: [{ type: 'bank' }], bleu: [] }),
  dilemme: () => ({ rouge: [{ choice: 'trahir' }], bleu: [] }),
  soleil: () => ({ rouge: [{ type: 'hold', down: true }], bleu: [{ type: 'hold', down: true }] }),
  plateau: (e) => ({ rouge: [{ choice: 0, n: d(e).mg.n }], bleu: [{ choice: 1, n: d(e).mg.n }] }),
  course: () => ({ rouge: [{ k: 'j', f: 40 }], bleu: [{ k: 'd1', f: 40 }] }),
  geo: (e) => ({ rouge: [{ pin: { lat: 48.8, lon: 2.3 }, n: d(e).mg.n }], bleu: [{ pin: { lat: -33.9, lon: 151.2 }, n: d(e).mg.n }] }),
  quisuisje: (e) => ({ rouge: [{ choice: d(e).mg.right, n: d(e).mg.n }], bleu: [{ choice: (d(e).mg.right + 1) % 4, n: d(e).mg.n }] }),
  chrono: () => ({ rouge: [{ card: 0 }, { card: 1 }], bleu: [{ card: 3 }] }),
  vf: (e) => ({ rouge: [{ value: true, n: d(e).mg.n }], bleu: [{ value: false, n: d(e).mg.n }] }),
};
const WAIT = { dilemme: 21000, plateau: 8500, des: 0, russe: 0 };

/** Joue les phases spécifiques de Dés menteurs et de la Roulette russe (secret des parieurs). */
const SPECIAL = {
  async des(env) {
    await measure(env, 'des', 'négociation');
    playAs(env, 'rouge', { type: 'ready' });
    await measure(env, 'des', 'un joueur prêt');
    playAs(env, 'bleu', { type: 'ready' });
    await measure(env, 'des', 'décision');
    playAs(env, 'rouge', { choice: 'relancer' });
    await measure(env, 'des', 'un choix enregistré');
    playAs(env, 'bleu', { choice: 'garder' });
    await measure(env, 'des', 'choix enregistrés (secret parieurs)');
    env.srv.clock.tick(2600);
    await measure(env, 'des', 'révélation de la manche');
  },
  async russe(env) {
    const mg = () => d(env).mg;
    await measure(env, 'russe', 'annonce du premier');
    env.srv.clock.tick(2900);
    await measure(env, 'russe', 'tour du premier joueur');
    const free = () => mg().taken.findIndex((c, i) => !c && i !== mg().trap);
    playAs(env, mg().turn, { slot: free() });
    await measure(env, 'russe', 'CLIC (case sûre)');
    env.srv.clock.tick(1300);
    playAs(env, mg().turn, { pass: true });
    env.srv.clock.tick(1300);
    for (let i = 0; i < 3 && mg().taken.filter(Boolean).length < 5; i++) {
      playAs(env, mg().turn, { slot: free() });
      env.srv.clock.tick(1300);
    }
    await measure(env, 'russe', 'plusieurs cases retournées');
    while (mg().taken.filter(Boolean).length < 5 && mg().phase === 'turn') {
      playAs(env, mg().turn, { slot: free() });
      env.srv.clock.tick(1300);
    }
    if (mg().phase === 'turn' && mg().forced) await measure(env, 'russe', 'dernière case (suspense)');
    if (mg().phase === 'turn') playAs(env, mg().turn, { slot: mg().trap });
    await measure(env, 'russe', 'SPLASH');
  },
};

async function playOne(env, id, { common = false } = {}) {
  const { game } = env;
  game.duelOptions = { ...(game.duelOptions ?? {}), games: [id], king: false, cote: 'standard' };
  // On passe les duels déjà tirés avec un autre jeu, jusqu'à celui qu'on veut mesurer.
  for (let tries = 0; tries < 15; tries++) {
    advance(env, atStep(env, 'bets'), 200000);
    if (d(env).mgId === id) break;
    game.gameHostAction({ type: 'skip' });
  }
  if (common) {
    await measure(env, id, 'paris');
  }
  vote(env);
  advance(env, atStep(env, 'betsReveal'), 60000);
  if (common) await measure(env, id, 'paris révélés');
  advance(env, atStep(env, 'ready'), 60000);
  if (common) await measure(env, id, 'prêt');
  game.action(d(env).red, { type: 'ready' });
  await sleep(50);
  if (common) await measure(env, id, 'prêt (un joueur prêt)');
  game.action(d(env).blue, { type: 'ready' });
  advance(env, atStep(env, 'intro'), 60000);
  await measure(env, id, 'carte d’intro');
  if (common) {
    env.srv.clock.tick(2200);
    await measure(env, id, 'carte d’intro (décompte)');
  }
  advance(env, atStep(env, 'play'), 60000);
  const land = id === 'course';
  await measure(env, id, 'début du jeu', { landscape: land });
  if (SPECIAL[id]) await SPECIAL[id](env);
  else {
    if (WAIT[id]) env.srv.clock.tick(WAIT[id]);
    else env.srv.clock.tick(3500);
    await measure(env, id, 'en cours', { landscape: land });
    const acts = ACT[id]?.(env) ?? { rouge: [], bleu: [] };
    for (const camp of ['rouge', 'bleu']) for (const a of acts[camp]) game.action(idOf(env, camp), { type: 'play', data: a });
    push(env);
    env.srv.clock.tick(600);
    await measure(env, id, 'après les actions', { landscape: land });
    if (id === 'geo') {
      env.srv.clock.tick(15200);
      await measure(env, id, 'révélation des distances');
    }
    if (id === 'quisuisje' || id === 'plateau' || id === 'culture') {
      env.srv.clock.tick(5000);
      await measure(env, id, 'plus tard');
    }
  }
  // Fin forcée : suspense de la roulette du vainqueur, puis écran de résultat.
  if (game.phase === 'question' && !d(env).outcome) {
    d(env).outcome = { winner: 'rouge', details: null, sips: null };
    game.reveal(game.roundId);
  }
  advance(env, () => game.phase === 'revealing' || game.phase === 'results', 60000, 200);
  if (game.phase === 'revealing') {
    await measure(env, id, 'suspense du vainqueur');
    advance(env, () => game.phase === 'results', 60000, 200);
  }
  await measure(env, id, 'résultat');
  if (common) {
    env.srv.clock.tick(500);
    await measure(env, id, 'résultat (décompte)');
  }
  game.hostNext();
  push(env);
}

async function runSeries(browser, srv, avatars, v, games) {
  const env = await makeEnv(browser, srv, avatars, v);
  try {
    await measure(env, 'options', 'options', { tvOnly: true });
    env.game.duelOptions = { games: [games[0]], king: false, cote: 'standard' };
    // Roulette des duellistes, annonce, roulette des mini-jeux.
    const g0 = env.game;
    g0.start();
    push(env);
    advance(env, atStep(env, 'duelists'), 20000, 50);
    await measure(env, games[0], 'roulette des duellistes (début)');
    env.srv.clock.tick(3000);
    await measure(env, games[0], 'roulette des duellistes (fin)');
    advance(env, atStep(env, 'game'), 60000, 100);
    await measure(env, games[0], 'roulette des mini-jeux');
    for (let i = 0; i < games.length; i++) await playOne(env, games[i], { common: i === 0 });
    // Duel annulé (« passé par l'hôte ») et bannière.
    if (!v.skipNotice) {
      env.game.duelOptions = { ...env.game.duelOptions, games: [games[0]] };
      advance(env, atStep(env, 'bets'), 200000);
      env.game.gameHostAction({ type: 'skip' });
      advance(env, atStep(env, 'notice'), 20000, 50);
      await measure(env, games[0], 'duel passé par l’hôte');
    }
  } finally {
    for (const ph of env.phones) await ph.ctx.close();
    for (const b of env.bots) b.close();
    await env.tv.context().close();
  }
}

// ---------- Rapport ----------

function report() {
  const list = [...defects.values()];
  const blocking = list.filter((x) => x.blocking);
  const cats = {};
  for (const x of list) {
    cats[x.cat] ??= { blocking: 0, other: 0 };
    cats[x.cat][x.blocking ? 'blocking' : 'other'] += 1;
  }
  const lines = ['# Audit d’affichage du mode Duel', '', `Généré par \`npm run audit:affichage\` (scripts/audit-affichage.js) : ${measures} mesures dans le navigateur, aucune image enregistrée. Polices Google bloquées (hors ligne) : polices de secours.`, ''];
  lines.push(`**${blocking.length} défaut(s) bloquant(s)**, ${list.length - blocking.length} avertissement(s) (non bloquants : tailles de texte, écarts entre boutons, espace).`, '');
  lines.push('| Catégorie | Bloquants | Avertissements |', '|---|---|---|');
  for (const [c, n] of Object.entries(cats)) lines.push(`| ${c} | ${n.blocking} | ${n.other} |`);
  lines.push('');
  const fmt = (x) => `- **${x.game}** · ${[...x.phases].slice(0, 4).join(' / ')}${x.phases.size > 4 ? ` (+${x.phases.size - 4})` : ''} · ${x.view} · ${[...x.sizes].join(', ')}${x.variant !== 'standard' ? ` · variante « ${x.variant} »` : ''} : ${x.msg}`;
  for (const [title, set] of [['Défauts bloquants', blocking], ['Avertissements', list.filter((x) => !x.blocking)]]) {
    lines.push(`## ${title}`, '');
    if (!set.length) lines.push('Aucun.', '');
    for (const c of Object.keys(cats)) {
      const rows = set.filter((x) => x.cat === c);
      if (!rows.length) continue;
      lines.push(`### ${c}`, '', ...rows.map(fmt), '');
    }
  }
  lines.push('## Console du navigateur', '', ...(consoleIssues.size ? [...consoleIssues].map((c) => `- ${c}`) : ['Aucune erreur ni avertissement.']), '');
  fs.writeFileSync(path.join(ROOT, 'docs/AUDIT-AFFICHAGE.md'), lines.join('\n'));
  console.log(`${measures} mesures : ${blocking.length} défaut(s) bloquant(s), ${list.length - blocking.length} avertissement(s), ${consoleIssues.size} message(s) de console.`);
  for (const x of blocking.slice(0, 40)) console.log(`  ✘ [${x.cat}] ${x.game} · ${[...x.phases][0]} · ${x.view} · ${[...x.sizes][0]} : ${x.msg}`);
  if (blocking.length > 40) console.log(`  … et ${blocking.length - 40} autres (voir docs/AUDIT-AFFICHAGE.md)`);
  return blocking.length + consoleIssues.size;
}

// ---------- Programme ----------

if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) {
  console.error('dist/ introuvable : lancez `npm run build` d’abord.');
  process.exit(1);
}
const srv = await startServer();
const browser = await launch(chromium);
const avatars = await makeAvatars(browser, [...CAST, ...EXTRA_NAMES.map((name, i) => ({ name, gender: 'n', hue: (i * 29) % 360 }))]);
const VARIANTS = [
  { name: 'standard', players: 8 },
  ...(noVariants
    ? []
    : [
        { name: '30 joueurs', players: 30, games: ['pfc', 'quisuisje', 'des'], phoneSizes: [[390, 844], [320, 568]], tvSizes: [[1920, 1080], [1366, 768]], skipNotice: true },
        { name: 'prénoms de 20 caractères', players: 8, longNames: true, games: ['pfc', 'des', 'russe'], phoneSizes: [[390, 844], [320, 568]], tvSizes: [[1920, 1080], [1280, 720]], skipNotice: true },
        { name: 'sans photos', players: 8, noPhotos: true, games: ['pfc', 'code'], phoneSizes: [[390, 844], [320, 568]], tvSizes: [[1920, 1080]], skipNotice: true },
        { name: 'thème 18+', players: 8, adult: true, games: ['pfc', 'des', 'russe'], phoneSizes: [[390, 844]], tvSizes: [[1920, 1080], [1366, 768]], skipNotice: true },
        { name: 'mouvement réduit', players: 8, reduced: true, games: ['pfc', 'geo', 'russe'], phoneSizes: [[390, 844]], tvSizes: [[1920, 1080]], skipNotice: true },
        { name: 'zoom 125 %', players: 8, games: ['pfc', 'geo', 'des'], phoneSizes: [[312, 675], [256, 454]], tvSizes: [[1536, 864], [1093, 614]], skipNotice: true },
      ]),
];
let failed = 0;
try {
  for (const v of VARIANTS) {
    const t0 = Date.now();
    try {
      await runSeries(browser, srv, avatars, v, v.games ?? GAMES);
      console.log(`✔ ${v.name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (err) {
      failed += 1;
      console.error(`✘ ${v.name} : ${err.stack ?? err}`);
    }
  }
} finally {
  await browser.close();
  await srv.close();
}
const bad = report();
process.exit(bad || failed ? 1 : 0);
