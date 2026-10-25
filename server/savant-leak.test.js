// Le Savant avec de vrais sockets : aucun message vers la TV ou un joueur non autorisé ne contient la vraie réponse, son explication
// ni l'identité du Savant avant la révélation ; reconnexion à chaque étape ; manches complètes jouées par des bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';
import { GAMES } from './games/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { announceMs: 40, writeMs: 500, writeBeatMs: 20, readMinMs: 60, readTailMs: 20, chooseMs: 400, voteBeatMs: 20, allocMs: 150 };
const FACTS = Array.from({ length: 8 }, (_, i) => ({
  id: `f${i}`,
  question: `Question ${i} : ___ ?`,
  reponse: `LAVERITE${i}XQ`,
  explication: `LEXPLICATION${i}ZW`,
  categorie: 'insolite',
  source: 'https://example.org',
}));

function client(url, { bot = false } = {}) {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { socket, state: null, log: [], id: null, secret: null, bot, name: null };
  c.emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  socket.on('state', (st) => {
    c.state = st;
    c.log.push(st);
    if (!bot || st.mode !== 'savant') return;
    const r = st.round;
    const me = r?.me;
    if (!me) return;
    if (st.phase === 'results' && st.pending && r.credits?.[c.id]) return;
    if (st.phase !== 'question' || me.role === 'out') return;
    const key = `${r.phaseId}`;
    if (c.done === key) return;
    if (Math.random() < 0.1) return; // joueur distrait
    if (r.step === 'write' && me.role === 'writer') {
      c.done = key;
      setTimeout(() => c.emit('player:action', { action: { type: 'answer', text: `réponse de ${c.name}`, phaseId: r.phaseId }, roundId: st.roundId }), Math.random() * 40);
    }
    if (r.step === 'choice') {
      c.done = key;
      const options = r.writers.filter((id) => id !== c.id);
      setTimeout(() => c.emit('player:vote', { choice: pick(options), roundId: st.roundId }), Math.random() * 40);
    }
  });
  c.waitFor = async (check, ms = 15000) => {
    const start = Date.now();
    while (!check(c.state)) {
      if (Date.now() - start > ms) throw new Error(`délai dépassé (phase ${c.state?.phase}, étape ${c.state?.round?.step})`);
      await sleep(10);
    }
  };
  return c;
}

async function setup(n) {
  const server = http.createServer();
  const ioServer = new Server(server);
  const store = new GameStore();
  registerSockets(ioServer, store);
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const tv = client(url);
  const created = await tv.emit('host:create', { mode: 'savant' });
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = client(url, { bot: true });
    p.name = `J${i}`;
    const joined = await p.emit('player:join', { code: created.code, name: p.name, gender: 'n' });
    Object.assign(p, { id: joined.playerId, secret: joined.secret });
    players.push(p);
  }
  const game = store.get(created.code);
  game.savantFacts = FACTS;
  game.savantTiming = FAST;
  const end = () => {
    for (const c of [tv, ...players]) c.socket.disconnect();
    for (const g of store.games.values()) g.dispose();
    return new Promise((r) => ioServer.close(() => server.close(() => r())));
  };
  return { tv, players, game, url, code: created.code, end };
}

const secretsIn = (message, savantId) => {
  const json = JSON.stringify(message);
  return { truth: /LAVERITE\dXQ/.test(json), explanation: /LEXPLICATION\dZW/.test(json), savantKey: json.includes('"savantId"') && !!savantId };
};

test('fuite : pendant les manches, ni la TV ni les non-Savants ne reçoivent la vraie réponse, l’explication ou l’identité du Savant', async () => {
  const saved = GAMES.savant.revealMs;
  GAMES.savant.revealMs = 120;
  const ctx = await setup(6);
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    const savants = new Set();
    // Deux manches complètes : le mode auto enchaîne.
    await ctx.tv.emit('host:settings', { settings: { auto: true, resultsMs: 5000 } });
    const seen = new Set();
    while (seen.size < 2) {
      await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.step === 'write' && !seen.has(s.roundId), 20000);
      seen.add(ctx.tv.state.roundId);
      savants.add(ctx.game.roundData.savantId);
      await ctx.tv.waitFor((s) => s.phase === 'results' || s.roundId !== [...seen].at(-1), 20000);
    }
    assert.ok(seen.size >= 2);
    // La TV : jamais avant le début de la révélation.
    for (const m of ctx.tv.log) {
      if (m.phase === 'question') {
        const r = secretsIn(m);
        assert.equal(r.truth, false, 'vraie réponse envoyée à la TV avant la révélation');
        assert.equal(r.explanation, false, 'explication envoyée à la TV');
        assert.equal(m.results, null);
        assert.ok(!JSON.stringify(m.round).includes('"savantId"'));
      }
    }
    // Les téléphones : seul le Savant de la manche reçoit la vraie réponse, uniquement dans sa vue privée.
    let savantTruths = 0;
    for (const p of ctx.players) {
      for (const m of p.log) {
        const me = m.round?.me;
        const json = JSON.stringify(m);
        if (m.phase === 'results') continue; // après la révélation tout est public
        if (m.phase === 'revealing') assert.equal(m.results, null, 'les téléphones n’ont pas les résultats pendant le suspense');
        if (me?.truth) {
          savantTruths += 1;
          assert.ok(savants.has(p.id) || ctx.game.roundData.savantId === p.id, `${p.name} a reçu une vraie réponse sans être Savant`);
        } else assert.equal(/LAVERITE\dXQ/.test(json), false, `${p.name} : vraie réponse hors de sa vue de Savant`);
        assert.equal(/LEXPLICATION\dZW/.test(json), false, `${p.name} : explication avant la révélation`);
        assert.ok(!json.includes('"savantId"'), `${p.name} : identité du Savant avant la révélation`);
      }
    }
    assert.ok(savantTruths > 0, 'le Savant reçoit bien sa vraie réponse');
    // Et la révélation montre bien la vérité à tout le monde.
    const results = ctx.tv.log.map((m) => m.results).find(Boolean);
    assert.match(results.answer, /LAVERITE/);
    assert.ok(results.savantId);
  } finally {
    GAMES.savant.revealMs = saved;
    await ctx.end();
  }
});

test('reconnexion à chaque étape : le Savant retrouve sa vraie réponse, jamais un autre joueur', async () => {
  const ctx = await setup(5);
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    const d = () => ctx.game.roundData;
    for (const step of ['announce', 'write', 'read', 'choice']) {
      await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.step === step, 15000);
      const savantId = d().savantId;
      for (const p of ctx.players) {
        const fresh = client(ctx.url);
        const res = await fresh.emit('player:resume', { code: ctx.code, playerId: p.id, secret: p.secret });
        assert.ok(res.ok, `reprise de ${p.name}`);
        await fresh.waitFor((s) => s.round?.me);
        const me = fresh.state.round.me;
        const expected = p.id === savantId && step !== 'announce';
        if (fresh.state.round.step === step) {
          assert.equal(!!me.truth, expected, `${p.name} à l’étape ${step}`);
          if (!expected) assert.equal(/LAVERITE/.test(JSON.stringify(fresh.state)), false);
        }
        fresh.socket.disconnect();
      }
    }
  } finally {
    await ctx.end();
  }
});

test('parties complètes de 4 à 12 joueurs jouées par des bots distraits : aucune manche bloquée', async () => {
  const saved = GAMES.savant.revealMs;
  GAMES.savant.revealMs = 80;
  try {
    for (const n of [4, 8, 12]) {
      const ctx = await setup(n);
      try {
        assert.ok((await ctx.tv.emit('host:start')).ok);
        await ctx.tv.emit('host:settings', { settings: { auto: true, resultsMs: 5000 } });
        await ctx.tv.waitFor((s) => s.round?.number >= 3, 40000);
        assert.ok(ctx.tv.state.round.number >= 3, `${n} joueurs`);
      } finally {
        await ctx.end();
      }
    }
  } finally {
    GAMES.savant.revealMs = saved;
  }
});
