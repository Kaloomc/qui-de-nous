// Mode Duel avec de vrais sockets : tous les messages reçus par chaque écran sont capturés.
// Avant la fin de la manche, ni la TV, ni les parieurs, ni l'autre duelliste ne reçoivent le choix secret d'un duelliste ;
// les paris restent secrets jusqu'à leur révélation ; les emojis n'arrivent qu'à la TV ; la mesure de latence répond.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { duelistsMs: 60, gameMs: 40, betsMs: 600, betsBeatMs: 30, betsRevealMs: 80, readyMs: 800, readyBeatMs: 30, resultMs: 100 };

function client(url) {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { socket, state: null, log: [], id: null, secret: null, name: null, pings: 0 };
  c.emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  socket.on('state', (st) => {
    c.state = st;
    c.log.push(st);
  });
  socket.on('latency:ping', (ack) => {
    c.pings += 1;
    if (typeof ack === 'function') ack();
  });
  c.waitFor = async (check, ms = 8000) => {
    const start = Date.now();
    while (!check(c.state)) {
      if (Date.now() - start > ms) throw new Error(`délai dépassé (phase ${c.state?.phase}, étape ${c.state?.round?.step})`);
      await sleep(5);
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
  const created = await tv.emit('host:create', { mode: 'duel' });
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = client(url);
    p.name = `J${i}`;
    const joined = await p.emit('player:join', { code: created.code, name: p.name, gender: 'n' });
    Object.assign(p, { id: joined.playerId, secret: joined.secret });
    players.push(p);
  }
  const game = store.get(created.code);
  game.duelTiming = FAST;
  game.duelOptions = { king: false, cote: 'standard', games: ['pfc'] };
  const end = () => {
    for (const c of [tv, ...players]) c.socket.disconnect();
    for (const g of store.games.values()) g.dispose();
    return new Promise((r) => ioServer.close(() => server.close(() => r())));
  };
  return { tv, players, game, end };
}

test('fuite : choix secrets, paris secrets et emojis réservés à la TV, sur de vrais sockets', async () => {
  const ctx = await setup(6);
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    const byId = Object.fromEntries(ctx.players.map((p) => [p.id, p]));
    await ctx.tv.waitFor((s) => s.round?.step === 'bets');
    const d = ctx.game.roundData;
    const [red, blue] = [byId[d.red], byId[d.blue]];
    const bettors = d.bettors.map((id) => byId[id]);
    // Paris : chacun parie, modifiable ; les noms restent secrets.
    const roundId = ctx.tv.state.roundId;
    for (const [i, p] of bettors.entries()) assert.ok((await p.emit('player:vote', { choice: i % 2 ? 'rouge' : 'bleu', roundId })).ok);
    assert.equal(ctx.tv.state.round.bets, null);
    assert.deepEqual(ctx.tv.state.votedIds, []);
    await ctx.tv.waitFor((s) => s.round?.step === 'ready');
    // Les deux duellistes sont prêts et la mesure de latence a répondu.
    for (const p of [red, blue]) assert.ok((await p.emit('player:action', { action: { type: 'ready' }, roundId })).ok);
    await ctx.tv.waitFor((s) => s.round?.step === 'play');
    assert.ok(red.pings >= 1 && blue.pings >= 1, 'les duellistes ont été sondés (latence)');
    // Emojis : seulement la TV les reçoit.
    assert.ok((await bettors[0].emit('player:action', { action: { type: 'cheer', kind: 'emoji', emoji: '🔥' }, roundId })).ok);
    await sleep(60);
    assert.equal(ctx.tv.state.round.cheers?.length, 1);
    for (const p of ctx.players) assert.ok(p.log.every((m) => !m.round?.cheers), `${p.name} a reçu le fil d’emojis`);
    // ROUGE choisit en secret : personne d'autre ne le voit avant la révélation de la manche.
    assert.ok((await red.emit('player:action', { action: { type: 'play', data: { choice: 'pierre' } }, roundId })).ok);
    await sleep(60);
    assert.equal(red.state.round.play.mine, 'pierre', 'son propre choix lui revient');
    const others = [ctx.tv, blue, ...bettors];
    for (const c of others) {
      for (const m of c.log) {
        if (m.round?.step === 'play' && !m.round.play?.shown) assert.equal(/pierre|feuille|ciseaux/.test(JSON.stringify(m.round.play)), false, `choix de ROUGE visible par ${c.name ?? 'la TV'}`);
      }
    }
    // Les paris ne sont révélés qu'à partir de la révélation, jamais avant.
    for (const c of [ctx.tv, ...ctx.players]) {
      for (const m of c.log) {
        if (m.round?.step === 'bets') {
          assert.equal(m.round.bets, null);
          assert.equal(m.round.odds, null);
          assert.deepEqual(m.votedIds, []);
          if (c.id) for (const [otherId, other] of Object.entries(byId)) if (otherId !== c.id && other.id) assert.ok(!JSON.stringify(m).includes(`"${otherId}":"rouge"`) && !JSON.stringify(m).includes(`"${otherId}":"bleu"`));
        }
        if (c.id && m.round?.me && m.round.step === 'bets') assert.ok([null, 'rouge', 'bleu'].includes(m.round.me.bet));
      }
    }
    // Fin de la manche, résultat côté serveur.
    assert.ok((await blue.emit('player:action', { action: { type: 'play', data: { choice: 'ciseaux' } }, roundId })).ok);
    // Manche 1 pour ROUGE, révélée aux deux ; la manche 2 (après la pause) donne la victoire.
    await ctx.tv.waitFor((s) => s.round?.play?.shown?.winner === 'rouge');
    await ctx.tv.waitFor((s) => s.round?.play?.round === 2 && !s.round.play.shown, 6000);
    assert.ok((await red.emit('player:action', { action: { type: 'play', data: { choice: 'pierre' } }, roundId })).ok);
    assert.ok((await blue.emit('player:action', { action: { type: 'play', data: { choice: 'ciseaux' } }, roundId })).ok);
    await ctx.tv.waitFor((s) => s.phase === 'revealing' || s.phase === 'results');
    assert.equal(ctx.tv.state.results.winner, 'rouge');
    await ctx.tv.waitFor((s) => s.phase === 'results');
    await bettors[0].waitFor((s) => s.phase === 'results' && s.results);
    assert.equal(bettors[0].state.results.winner, 'rouge');
  } finally {
    await ctx.end();
  }
});
