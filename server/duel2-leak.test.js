// Mode Duel, partie 2, sur de vrais sockets : aucun secret (code, choix du Dilemme, point d'explosion du Crash, séquence de Simon croisé)
// n'est envoyé à la TV, aux parieurs ou à l'autre duelliste avant la fin de la manche concernée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { duelistsMs: 40, gameMs: 30, betsMs: 200, betsBeatMs: 20, betsRevealMs: 40, readyMs: 800, readyBeatMs: 20, introMs: 20, resultMs: 100 };

function client(url) {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { socket, state: null, log: [], id: null, secret: null, name: null };
  c.emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  socket.on('state', (st) => {
    c.state = st;
    c.log.push(st);
  });
  socket.on('latency:ping', (ack) => typeof ack === 'function' && ack());
  c.waitFor = async (check, ms = 8000) => {
    const start = Date.now();
    while (!check(c.state)) {
      if (Date.now() - start > ms) throw new Error(`délai dépassé (phase ${c.state?.phase}, étape ${c.state?.round?.step})`);
      await sleep(5);
    }
  };
  return c;
}

async function setup(gameId) {
  const server = http.createServer();
  const ioServer = new Server(server);
  const store = new GameStore();
  registerSockets(ioServer, store);
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const tv = client(url);
  const created = await tv.emit('host:create', { mode: 'duel' });
  const players = [];
  for (let i = 0; i < 5; i++) {
    const p = client(url);
    p.name = `J${i}`;
    const joined = await p.emit('player:join', { code: created.code, name: p.name, gender: 'n' });
    Object.assign(p, { id: joined.playerId, secret: joined.secret });
    players.push(p);
  }
  const game = store.get(created.code);
  game.duelTiming = FAST;
  game.duelOptions = { king: false, cote: 'standard', games: [gameId] };
  const end = () => {
    for (const c of [tv, ...players]) c.socket.disconnect();
    for (const g of store.games.values()) g.dispose();
    return new Promise((r) => ioServer.close(() => server.close(() => r())));
  };
  return { tv, players, game, end };
}

/** Lance un duel jusqu'à l'étape de jeu ; renvoie les duellistes (rouge, bleu) et un parieur. */
async function toPlay(ctx) {
  assert.ok((await ctx.tv.emit('host:start')).ok);
  await ctx.tv.waitFor((s) => s.round?.step === 'ready');
  const byId = Object.fromEntries(ctx.players.map((p) => [p.id, p]));
  const d = ctx.game.roundData;
  const [red, blue] = [byId[d.red], byId[d.blue]];
  const roundId = ctx.tv.state.roundId;
  for (const p of [red, blue]) assert.ok((await p.emit('player:action', { action: { type: 'ready' }, roundId })).ok);
  await ctx.tv.waitFor((s) => s.round?.step === 'play');
  return { red, blue, bettor: byId[d.bettors[0]], bettors: d.bettors.map((id) => byId[id]), roundId, others: (self) => [ctx.tv, ...ctx.players.filter((p) => p !== self)] };
}
const play = (p, roundId, data) => p.emit('player:action', { action: { type: 'play', data }, roundId });
const messagesBeforeEnd = (c) => c.log.filter((m) => m.phase === 'question' && m.round?.step === 'play');

test('Le Code : le code secret et les essais d’un duelliste ne sortent jamais vers les autres écrans', async () => {
  const ctx = await setup('code');
  try {
    const t = await toPlay(ctx);
    const secret = ctx.game.roundData.mg.secret;
    assert.ok((await play(t.red, t.roundId, { guess: [0, 1, 2, 3] })).ok);
    await sleep(60);
    assert.ok(t.red.state.round.play.mine.length === 1, 'ROUGE retrouve ses essais');
    for (const c of t.others(t.red)) {
      for (const m of messagesBeforeEnd(c)) {
        const json = JSON.stringify(m.round.play);
        assert.equal(json.includes('"secret"'), false, 'code envoyé');
        assert.equal(json.includes('"guess"'), false, 'essai d’un duelliste envoyé à un autre écran');
        assert.equal(json.includes(JSON.stringify(secret)), false);
      }
    }
  } finally {
    await ctx.end();
  }
});

test('Dilemme en or : le choix d’un duelliste n’arrive à personne d’autre avant que les deux aient choisi', async () => {
  const ctx = await setup('dilemme');
  try {
    const t = await toPlay(ctx);
    await ctx.tv.waitFor((s) => s.round?.play?.phase === 'choose', 25000);
    assert.ok((await play(t.red, t.roundId, { choice: 'trahir' })).ok);
    await sleep(80);
    assert.equal(t.red.state.round.play.mine, 'trahir');
    for (const c of t.others(t.red)) {
      for (const m of c.log.filter((x) => x.round?.step === 'play' && x.phase === 'question')) {
        const json = JSON.stringify(m.round.play);
        assert.equal(json.includes('"mine":"trahir"') || json.includes('"shown"'), false, 'choix de ROUGE visible');
      }
    }
  } finally {
    await ctx.end();
  }
});

test('Le Crash : le point d’explosion n’est envoyé à personne avant l’explosion', async () => {
  const ctx = await setup('crash');
  try {
    const t = await toPlay(ctx);
    const crash = ctx.game.roundData.mg.crash;
    for (let i = 0; i < 5; i++) {
      await sleep(40);
      for (const c of [ctx.tv, ...ctx.players]) {
        const m = c.state;
        if (m.round?.play && m.round.play.crashed == null) assert.equal(JSON.stringify(m.round.play).includes(`"crashed":${crash}`), false, 'point d’explosion visible');
      }
    }
    for (const c of [ctx.tv, ...ctx.players]) for (const m of messagesBeforeEnd(c)) if (m.round.play.crashed == null) assert.equal(JSON.stringify(m.round.play).includes('"crash"'), false);
    assert.ok(t.red.state);
  } finally {
    await ctx.end();
  }
});

test('Simon croisé : la séquence n’est jamais envoyée pendant la saisie, et jamais aux téléphones', async () => {
  const ctx = await setup('simon2');
  try {
    const t = await toPlay(ctx);
    const first = ctx.game.roundData.mg.turn;
    const starter = first === 'rouge' ? t.red : t.blue;
    assert.ok((await play(starter, t.roundId, { pad: 2 })).ok);
    await sleep(60);
    for (const p of ctx.players) {
      for (const m of p.log) assert.equal(m.round?.play?.seq, undefined, `${p.name} a reçu la séquence`);
    }
    await ctx.tv.waitFor((s) => s.round?.play?.phase === 'input' && s.round.play.steps === 1, 6000);
    for (const m of ctx.tv.log.filter((x) => x.round?.play?.phase === 'input')) assert.equal(m.round.play.seq, undefined, 'séquence envoyée à la TV pendant la saisie');
    assert.ok(ctx.tv.log.some((m) => m.round?.play?.phase === 'replay' && Array.isArray(m.round.play.seq)), 'la TV reçoit la séquence pendant le rejeu');
  } finally {
    await ctx.end();
  }
});
