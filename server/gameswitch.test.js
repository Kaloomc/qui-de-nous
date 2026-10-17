// Changements de jeu rapides avec de vrais sockets : le dernier jeu choisi gagne, aucun vote ni minuteur
// d'un jeu précédent ne fuit dans le suivant, et chaque joueur peut voter dans la nouvelle manche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';
import { currentVoteOf, roundKey } from '../client/src/vote.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const server = http.createServer();
  const ioServer = new Server(server);
  const store = new GameStore();
  registerSockets(ioServer, store);
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const close = () => {
    for (const game of store.games.values()) game.dispose();
    return new Promise((r) => ioServer.close(() => server.close(() => r())));
  };
  return { url, close };
}

/** Client minimal : garde le dernier état reçu et, comme le téléphone, le vote local de la manche. */
function client(url) {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { socket, state: null, myVote: null };
  socket.on('state', (s) => (c.state = s));
  c.emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  c.waitFor = async (check, ms = 4000) => {
    const start = Date.now();
    while (!check(c.state)) {
      if (Date.now() - start > ms) throw new Error(`délai dépassé (phase ${c.state?.phase}, jeu ${c.state?.mode})`);
      await sleep(20);
    }
  };
  /** Vote comme le téléphone : enregistre le vote local pour la manche affichée. */
  c.vote = async (choice) => {
    const res = await c.emit('player:vote', { choice, roundId: c.state.roundId });
    if (res.ok) c.myVote = { round: roundKey(c.state), choice };
    return res;
  };
  return c;
}

test('changements de jeu rapides : dernier choix gagnant, pas de vote fantôme, tout le monde peut voter', async () => {
  const { url, close } = await startServer();
  const host = client(url);
  const created = await host.emit('host:create', { mode: 'qui-de-nous', settings: { auto: true, voteMs: 15000, resultsMs: 5000 } });
  assert.ok(created.ok);
  const players = Array.from({ length: 6 }, () => client(url));
  for (const [i, p] of players.entries()) assert.ok((await p.emit('player:join', { code: created.code, name: `J${i}` })).ok);
  try {
    // Manche 1 de « Qui de nous ? » : tout le monde vote, révélation automatique.
    assert.ok((await host.emit('host:start')).ok);
    await host.waitFor((s) => s.phase === 'question');
    for (const p of players) await p.waitFor((s) => s.phase === 'question');
    const someone = host.state.players[0].id;
    for (const p of players) assert.ok((await p.vote(someone)).ok);
    await host.waitFor((s) => s.phase === 'revealing' || s.phase === 'results');

    // Pendant le suspense : fin de partie, puis rafale de changements de jeu sans attendre les réponses.
    const burst = ['tu-preferes', 'roue', 'imposteur', 'estimation', 'patate', 'imposteur', 'feu', 'tu-preferes'];
    const pending = [host.emit('host:end'), host.emit('host:chooseGame')];
    for (const mode of burst) pending.push(host.emit('host:pickGame', { mode }), host.emit('host:chooseGame'));
    pending.push(host.emit('host:pickGame', { mode: 'qui-de-nous' }));
    await Promise.all(pending);
    await host.waitFor((s) => s.phase === 'lobby');
    assert.equal(host.state.mode, 'qui-de-nous', 'le dernier jeu demandé gagne');

    // Jeu inconnu : refusé, jamais remplacé par un autre.
    const unknown = await host.emit('host:pickGame', { mode: 'jeu-qui-n-existe-pas' });
    assert.equal(unknown.ok, false);
    assert.equal(host.state.mode, 'qui-de-nous');

    // Aucun minuteur de l'ancienne partie ne doit relancer ou faire avancer quoi que ce soit.
    await sleep(1500);
    assert.equal(host.state.phase, 'lobby');

    // Nouvelle manche 1 : chaque téléphone doit afficher l'écran de vote (pas « vote enregistré »).
    assert.ok((await host.emit('host:start')).ok);
    for (const p of players) await p.waitFor((s) => s.phase === 'question' && s.mode === 'qui-de-nous');
    assert.deepEqual(host.state.votedIds, []);
    for (const p of players) assert.equal(currentVoteOf(p.myVote, p.state), null, 'vote de la partie précédente pris pour un vote de la nouvelle manche');
    for (const p of players) assert.ok((await p.vote(someone)).ok);
  } finally {
    for (const c of [host, ...players]) c.socket.disconnect();
    await close();
  }
});

test('mode soirée : sauts de jeu rapides puis fin, plus aucun minuteur de la soirée ensuite', async () => {
  const { url, close } = await startServer();
  const host = client(url);
  const created = await host.emit('host:create', { mode: null });
  const players = Array.from({ length: 5 }, () => client(url));
  for (const [i, p] of players.entries()) await p.emit('player:join', { code: created.code, name: `J${i}` });
  try {
    assert.ok((await host.emit('host:partyStart', { durationMs: 0 })).ok);
    await Promise.all([host.emit('host:partySkip'), host.emit('host:partySkip'), host.emit('host:partySkip'), host.emit('host:partyEnd'), host.emit('host:partyEnd')]);
    await host.waitFor((s) => s.phase === 'ended');
    await Promise.all([host.emit('host:chooseGame'), host.emit('host:pickGame', { mode: 'tu-preferes' })]);
    await host.waitFor((s) => s.phase === 'lobby');
    await sleep(6000); // plus long que la transition du mode soirée (5 s)
    assert.equal(host.state.phase, 'lobby');
    assert.equal(host.state.mode, 'tu-preferes');
    assert.ok((await host.emit('host:start')).ok);
    for (const p of players) await p.waitFor((s) => s.phase === 'question');
    for (const p of players) assert.ok((await p.vote('a')).ok);
  } finally {
    for (const c of [host, ...players]) c.socket.disconnect();
    await close();
  }
});
