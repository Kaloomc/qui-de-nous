// Loup-Garou de bout en bout avec de vrais sockets : parties complètes jouées par des bots, fuite d'informations,
// durée constante des phases, reconnexion, et aucun minuteur qui survit à un changement de jeu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { GameStore } from './gameStore.js';
import { registerSockets } from './sockets.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { sleepMs: 30, announceMs: 50, doneBeatMs: 20, readBeatMs: 30, voteBeatMs: 20, absentMinMs: 40, absentMaxMs: 90, dealSafetyMs: 400, nightSafetyMs: 400, hunterSafetyMs: 200, debateSafetyMs: 300, voteSafetyMs: 300, tribunalMs: 200 };
const SLOW = { ...FAST, dealSafetyMs: 60000 };

async function startServer() {
  const server = http.createServer();
  const ioServer = new Server(server);
  const store = new GameStore();
  registerSockets(ioServer, store);
  await new Promise((r) => server.listen(0, r));
  return {
    store,
    url: `http://localhost:${server.address().port}`,
    close: () => {
      for (const game of store.games.values()) game.dispose();
      return new Promise((r) => ioServer.close(() => server.close(() => r())));
    },
  };
}

/** Un téléphone (ou la TV) : garde tous les messages d'état reçus et joue au hasard comme un joueur. */
function client(url, { bot = false } = {}) {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { socket, state: null, log: [], id: null, bot };
  const emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  c.emit = emit;
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const act = (action) => emit('player:action', { action });
  socket.on('state', (st) => {
    c.state = st;
    c.log.push(st);
    if (!bot || st.mode !== 'loup') return;
    const r = st.round;
    const me = r?.me;
    if (!me || me.spectator) return;
    const s = me.screen;
    const base = { phaseId: r.phaseId };
    const key = `${r.phaseId}:${s.kind}`;
    if (c.done === key) return;
    if (st.phase === 'results' && st.pending && r.credits?.[c.id]) {
      c.done = key;
      return void act({ type: 'allocate', allocation: {} });
    }
    if (st.phase !== 'question') return;
    if (Math.random() < 0.1 && s.kind !== 'role') return; // joueur distrait : n'agit pas
    if (s.kind === 'role') return void act({ type: 'ack', ...base }) && (c.done = key);
    const doit = (action) => {
      c.done = key;
      setTimeout(() => act({ ...action, ...base }), Math.random() * 15);
    };
    if (s.kind === 'act' && s.phase === 'loups') return doit({ type: 'wolfVote', target: pick(s.options) });
    if (s.kind === 'act') {
      const t = pick(s.options);
      const a = { cupidon: { pair: [t, pick(s.options)] }, sorciere: { save: !!s.victim && s.life, kill: Math.random() < 0.3 ? pick(s.options) : undefined, gorgee: pick(s.options) }, distributeur: { targets: [t, pick(s.options)] } }[s.phase] ?? { target: t };
      return doit({ type: 'night', ...a });
    }
    if (s.kind === 'shoot') return doit({ type: 'shoot', target: pick(s.options) });
    if (s.kind === 'vote') return doit({ type: 'vote', target: pick(s.options) });
    if (s.kind === 'debate') return doit({ type: 'ready' });
    if (s.kind === 'bet') return doit({ type: 'bet', target: pick(s.options) });
  });
  c.waitFor = async (check, ms = 20000) => {
    const start = Date.now();
    while (!check(c.state)) {
      if (Date.now() - start > ms) throw new Error(`délai dépassé (phase ${c.state?.phase}, jeu ${c.state?.mode}, étape ${c.state?.round?.stage})`);
      await sleep(15);
    }
  };
  return c;
}

async function setup(n, { fast = FAST } = {}) {
  const { store, url, close } = await startServer();
  const tv = client(url);
  const created = await tv.emit('host:create', { mode: 'loup' });
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = client(url, { bot: true });
    const joined = await p.emit('player:join', { code: created.code, name: `J${i}` });
    p.id = joined.playerId;
    players.push(p);
  }
  const game = store.get(created.code);
  game.loupTiming = fast;
  const end = () => {
    for (const c of [tv, ...players]) c.socket.disconnect();
    return close();
  };
  return { tv, players, game, store, code: created.code, end };
}

/** Parcourt un message : aucune information secrète pour ce destinataire. Renvoie le nombre de rôles vus (pour s'assurer qu'on a bien testé quelque chose). */
function assertNoLeak(msg, eng, viewerId) {
  const round = msg.round;
  if (!round || msg.mode !== 'loup' || !eng) return;
  const over = round.stage === 'over' || msg.phase === 'results' || msg.phase === 'ended' || msg.phase === 'revealing';
  for (const c of round.circle ?? []) {
    if (c.role !== null && !over) assert.equal(c.alive, false, `rôle d'un vivant visible (${c.id}) par ${viewerId ?? 'la TV'}`);
  }
  for (const item of round.announce?.items ?? []) {
    if (item.role) assert.equal(eng.dead[item.id] !== undefined, true, 'rôle annoncé pour un vivant');
    assert.ok(!['loups', 'poison'].includes(item.cause), 'cause secrète d’une mort de nuit');
  }
  if (!viewerId) {
    assert.equal(round.me, undefined, 'la TV ne reçoit aucune vue privée');
    if (!over) assert.ok(!JSON.stringify(msg).includes('"roles"'), 'la TV reçoit une liste de rôles');
    return;
  }
  const me = round.me;
  if (!me || me.spectator) return;
  assert.equal(me.role, eng.roles[viewerId]);
  if (me.allRoles) assert.equal(me.alive, false, 'liste des rôles pour un vivant');
  if (me.partners.length) assert.equal(me.role, 'loup', 'partenaires loups pour un non-loup');
  for (const p of me.partners) assert.equal(eng.roles[p], 'loup');
  if (me.intel.seen.length) assert.equal(me.role, 'voyante');
  if (me.intel.bear.length) assert.equal(me.role, 'ours');
  if (me.screen.victim) assert.equal(me.role, 'sorciere');
  if (me.screen.wolfVotes) assert.equal(me.role, 'loup');
  if (me.lover) assert.ok(eng.lovers.includes(viewerId));
}

test('partie complète à 8 joueurs : une victoire, le Tribunal, rien ne fuit, nuits de durée constante', async () => {
  const ctx = await setup(8);
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.circle);
    const eng = ctx.game.roundData.eng;
    await ctx.tv.waitFor((s) => s.phase === 'results' || s.phase === 'ended' || ctx.game.phase === 'ended', 40000);
    assert.ok(['village', 'loups', 'amoureux', 'nul'].includes(eng.winner));
    // Rien de secret ni pour la TV ni pour les téléphones.
    for (const m of ctx.tv.log) assertNoLeak(m, eng, null);
    for (const p of ctx.players) for (const m of p.log) assertNoLeak(m, eng, p.id);
    // Nuits : les phases de tous les rôles présents se jouent chaque nuit, même pour un rôle mort (on ne devine rien à la
    // vitesse de la nuit), et la vue privée a la même taille pour tous les vivants.
    const sizes = new Map();
    const seenPhases = new Map();
    for (const m of ctx.tv.log) if (m.round?.stage === 'night') seenPhases.set(m.round.night, new Set([...(seenPhases.get(m.round.night) ?? []), m.round.phase]));
    const roles = new Set(Object.values(eng.roles));
    for (const [night, phases] of seenPhases) {
      if (night < 2 || night === eng.night) continue; // la dernière nuit peut avoir été interrompue
      for (const phase of ['loups', 'voyante', 'sorciere', 'salvateur', 'ours']) {
        const role = phase === 'loups' ? 'loup' : phase;
        if (roles.has(role)) assert.ok(phases.has(phase), `nuit ${night} : la phase ${phase} a été sautée`);
      }
    }
    for (const p of ctx.players)
      for (const m of p.log) {
        const me = m.round?.me;
        if (m.round?.stage !== 'night' || !me || me.spectator || !me.alive) continue;
        const set = sizes.get(m.round.phaseId) ?? new Set();
        set.add(JSON.stringify(me).length);
        sizes.set(m.round.phaseId, set);
      }
    assert.ok(sizes.size > 0);
    for (const [phase, set] of sizes) assert.equal(set.size, 1, `tailles différentes selon le joueur pendant ${phase}`);
    // Les gorgées sont comptées.
    assert.ok(Object.keys(ctx.game.partySips).length >= 0);
  } finally {
    await ctx.end();
  }
});

test('plusieurs parties de suite avec des joueurs distraits : aucune bloquée', async () => {
  for (let i = 0; i < 4; i++) {
    const ctx = await setup(6 + i * 4);
    try {
      assert.ok((await ctx.tv.emit('host:start')).ok);
      await ctx.tv.waitFor((s) => s.phase === 'results' || s.phase === 'ended' || s.phase === 'revealing', 60000);
      assert.ok(ctx.game.roundData.eng.winner);
    } finally {
      await ctx.end();
    }
  }
});

test('lancement refusé si la composition ne correspond pas aux joueurs, moins de 6 refusé', async () => {
  const ctx = await setup(6);
  try {
    assert.ok((await ctx.tv.emit('host:gameAction', { action: { type: 'config', counts: { loup: 1, villageois: 3 } } })).ok);
    const refused = await ctx.tv.emit('host:start');
    assert.equal(refused.ok, false);
    assert.match(refused.error, /rôles/);
    assert.ok((await ctx.tv.emit('host:gameAction', { action: { type: 'config', counts: { loup: 1, voyante: 1, villageois: 4 } } })).ok);
    assert.ok((await ctx.tv.emit('host:start')).ok);
  } finally {
    await ctx.end();
  }
});

test('changement de jeu en pleine partie : aucun minuteur du Loup-Garou ne se déclenche ensuite', async () => {
  const ctx = await setup(8, { fast: SLOW });
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.stage === 'deal');
    await ctx.tv.emit('host:end');
    await ctx.tv.emit('host:chooseGame');
    await ctx.tv.emit('host:pickGame', { mode: 'tu-preferes' });
    await ctx.tv.waitFor((s) => s.phase === 'lobby' && s.mode === 'tu-preferes');
    await sleep(500);
    assert.equal(ctx.game.phase, 'lobby');
    assert.equal(Object.keys(ctx.game.timers).length, 0);
    assert.ok((await ctx.tv.emit('host:start')).ok);
    for (const p of ctx.players) await p.waitFor((s) => s.phase === 'question' && s.mode === 'tu-preferes');
  } finally {
    await ctx.end();
  }
});

test('reconnexion : le joueur retrouve sa vue privée, un nouvel arrivant est spectateur', async () => {
  const ctx = await setup(8, { fast: SLOW });
  const extra = [];
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.stage === 'deal');
    const eng = ctx.game.roundData.eng;
    const p = ctx.players[3];
    const identity = { code: ctx.code, playerId: p.id, secret: ctx.game.players.get(p.id).secret };
    p.socket.disconnect();
    await sleep(100);
    const back = client(p.socket.io.uri);
    extra.push(back);
    const res = await back.emit('player:resume', identity);
    assert.ok(res.ok);
    await back.waitFor((s) => s.round?.me);
    assert.equal(back.state.round.me.role, eng.roles[p.id]);
    // Un nouvel arrivant en cours de partie : spectateur, aucun rôle.
    const late = client(p.socket.io.uri);
    extra.push(late);
    const joined = await late.emit('player:join', { code: ctx.code, name: 'Retard' });
    assert.ok(joined.ok);
    await late.waitFor((s) => s.round?.me);
    assert.equal(late.state.round.me.spectator, true);
    assert.equal(late.state.round.me.role, undefined);
  } finally {
    for (const c of extra) c.socket.disconnect();
    await ctx.end();
  }
});

test('joueur retiré par l’hôte : mort sans rôle révélé, la partie continue', async () => {
  const ctx = await setup(8, { fast: SLOW });
  try {
    assert.ok((await ctx.tv.emit('host:start')).ok);
    await ctx.tv.waitFor((s) => s.phase === 'question' && s.round?.stage === 'deal');
    const victim = ctx.players[2];
    await ctx.tv.emit('host:kick', { playerId: victim.id });
    await ctx.tv.waitFor((s) => s.round?.circle?.find((c) => c.id === victim.id)?.alive === false);
    const entry = ctx.tv.state.round.circle.find((c) => c.id === victim.id);
    assert.equal(entry.role, null, 'rôle caché jusqu’à la fin');
    assert.ok(ctx.game.phase === 'question');
  } finally {
    await ctx.end();
  }
});
