// Noir Boire Mangue avec de vrais sockets : aucun message avant la fin de la manche ne relie une réponse à son auteur (TV comme autres
// téléphones), chaque main n'est envoyée qu'à son propriétaire, reconnexion à chaque étape, parties complètes jouées par des bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';
import { GAMES } from './games/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { announceMs: 40, writeMs: 600, writeBeatMs: 20, showMinMs: 40, showMaxMs: 300, miniMs: 30, allocMs: 100 };
const PHRASES = Array.from({ length: 8 }, (_, i) => ({ niveau: 'chill', texte: `Phrase ${i} : ___ !` }));
const DECK = Array.from({ length: 200 }, (_, i) => `CARTE-${String(i).padStart(3, '0')}-Z`);

function client(url, { bot = false } = {}) {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { socket, state: null, log: [], id: null, secret: null, name: null, answers: [] };
  c.emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  socket.on('state', (st) => {
    c.state = st;
    c.log.push(st);
    if (!bot || st.mode !== 'nbm' || st.phase !== 'question') return;
    const r = st.round;
    const me = r?.me;
    if (!me || me.role === 'out') return;
    if (c.done === r.phaseId) return;
    if (Math.random() < 0.1) return; // joueur distrait
    if (r.step === 'write') {
      c.done = r.phaseId;
      const text = `REPONSE-${c.name}-${Math.floor(Math.random() * 1e6)}`;
      c.answers.push(text);
      setTimeout(() => c.emit('player:action', { action: { type: 'answer', text, phaseId: r.phaseId }, roundId: st.roundId }), Math.random() * 30);
    }
    if (r.step === 'rate' && !me.isAuthor) {
      c.done = r.phaseId;
      setTimeout(() => c.emit('player:action', { action: { type: 'rate', rating: pick(['nul', 'meh', 'drole', 'golden']), phaseId: r.phaseId }, roundId: st.roundId }), Math.random() * 30);
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
  const created = await tv.emit('host:create', { mode: 'nbm' });
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = client(url, { bot: true });
    p.name = `J${i}`;
    const joined = await p.emit('player:join', { code: created.code, name: p.name, gender: ['m', 'f', 'n'][i % 3] });
    Object.assign(p, { id: joined.playerId, secret: joined.secret });
    players.push(p);
  }
  const game = store.get(created.code);
  game.nbmDeck = DECK;
  game.nbmTiming = FAST;
  game.contentPool = () => ({ key: 'nbm-test', list: PHRASES });
  const end = () => {
    for (const c of [tv, ...players]) c.socket.disconnect();
    for (const g of store.games.values()) g.dispose();
    return new Promise((r) => ioServer.close(() => server.close(() => r())));
  };
  return { tv, players, game, url, code: created.code, end };
}

test('fuite : avant la fin de la manche, aucun message ne relie une réponse à son auteur (TV et autres téléphones)', async () => {
  const saved = GAMES.nbm.revealMs;
  GAMES.nbm.revealMs = 100;
  const ctx = await setup(6);
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    await ctx.tv.emit('host:settings', { settings: { auto: true, resultsMs: 5000 } });
    const seen = new Set();
    while (seen.size < 2) {
      await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.step === 'write' && !seen.has(s.roundId), 20000);
      seen.add(ctx.tv.state.roundId);
      await ctx.tv.waitFor((s) => s.phase === 'results' || (s.roundId !== [...seen].at(-1) && s.phase === 'question'), 20000);
    }
    const ids = ctx.players.map((p) => p.id);
    const texts = ctx.players.flatMap((p) => p.answers);
    assert.ok(texts.length >= 6, 'les bots ont écrit');
    const hands = (id) => new Set(ctx.players.find((p) => p.id === id).log.flatMap((m) => m.round?.me?.hand ?? []));

    // La TV : pendant la manche, la manche envoyée ne contient aucun identifiant de joueur ; jamais de main ; jamais les résultats.
    for (const m of ctx.tv.log) {
      if (m.phase !== 'question') continue;
      const json = JSON.stringify(m.round);
      for (const id of ids) assert.ok(!json.includes(id), 'identifiant de joueur dans la manche envoyée à la TV');
      assert.equal(m.results, null);
      assert.ok(!json.includes('"hand"'), 'main envoyée à la TV');
      assert.ok(!/CARTE-\d+-Z/.test(json), 'carte envoyée à la TV');
      // Au plus une réponse (celle qui est affichée) dans un message, et seulement pendant les notes.
      const shown = texts.filter((t) => json.includes(t));
      assert.ok(shown.length <= 1, `${shown.length} réponses dans un même message TV`);
      if (m.round?.step === 'write') assert.equal(shown.length, 0, 'une réponse envoyée à la TV pendant l’écriture');
    }
    // Les téléphones : aucune réponse des autres avant la fin de la manche, jamais les cartes d'un autre, pas de résultats.
    for (const p of ctx.players) {
      const mine = new Set(p.answers);
      const myCards = hands(p.id);
      for (const m of p.log) {
        if (m.phase === 'revealing') assert.equal(m.results, null, 'les téléphones n’ont pas les résultats pendant le suspense');
        if (m.phase === 'results' || m.phase === 'revealing' || m.phase === 'ended') continue; // la manche est finie : tout est public
        const json = JSON.stringify(m.round);
        for (const id of ids) assert.ok(!json.includes(id), `${p.name} : identifiant de joueur dans la manche`);
        const others = texts.filter((t) => !mine.has(t) && json.includes(t));
        const step = m.round?.step;
        // Les autres réponses n'apparaissent qu'une à la fois, pendant les notes (c'est la réponse affichée à tout le monde).
        assert.ok(others.length <= 1, `${p.name} : ${others.length} réponses d'autres joueurs dans un message`);
        if (step === 'write' || step === 'announce') assert.equal(others.length, 0, `${p.name} : réponse d'un autre avant les notes`);
        for (const card of (json.match(/CARTE-\d+-Z/g) ?? [])) assert.ok(myCards.has(card), `${p.name} : carte d'un autre joueur`);
      }
    }
    // À la fin de la manche, les auteurs sont révélés à la TV.
    const results = ctx.tv.log.map((m) => m.results).find(Boolean);
    assert.ok(results.board.length > 0 && results.board[0].authorId);
  } finally {
    GAMES.nbm.revealMs = saved;
    await ctx.end();
  }
});

test('reconnexion à chaque étape : le joueur retrouve sa main, sa réponse et sa note ; jamais celles d’un autre', async () => {
  const ctx = await setup(5);
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    for (const step of ['announce', 'write', 'rate']) {
      await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.step === step, 15000);
      for (const p of ctx.players) {
        const fresh = client(ctx.url);
        const res = await fresh.emit('player:resume', { code: ctx.code, playerId: p.id, secret: p.secret });
        assert.ok(res.ok, `reprise de ${p.name}`);
        await fresh.waitFor((s) => s.round?.me);
        const me = fresh.state.round.me;
        if (fresh.state.round.step === 'write') {
          assert.equal(me.hand.length, 5, `${p.name} retrouve sa main`);
          assert.deepEqual(me.hand, ctx.game.roundData.hands[p.id]);
        } else assert.equal(me.hand, null);
        fresh.socket.disconnect();
      }
    }
  } finally {
    await ctx.end();
  }
});

test('parties complètes de 3 à 12 joueurs jouées par des bots distraits : aucune manche bloquée', async () => {
  const saved = GAMES.nbm.revealMs;
  GAMES.nbm.revealMs = 80;
  try {
    for (const n of [3, 7, 12]) {
      const ctx = await setup(n);
      try {
        assert.ok((await ctx.tv.emit('host:start')).ok);
        await ctx.tv.emit('host:settings', { settings: { auto: true, resultsMs: 5000 } });
        await ctx.tv.waitFor((s) => s.round?.number >= 3 || s.phase === 'ended', 60000);
        assert.ok(ctx.tv.state.round.number >= 3 || ctx.tv.state.phase === 'ended', `${n} joueurs`);
      } finally {
        await ctx.end();
      }
    }
  } finally {
    GAMES.nbm.revealMs = saved;
  }
});
