// Test de charge du Loup-Garou côté serveur : N parties complètes (6 à 30 joueurs, compositions variées), horloge simulée,
// joueurs variés (actifs, inactifs, qui se déconnectent, qui cliquent deux fois). Vérifie que rien ne reste coincé ni en mémoire.
//   npm run loupsoak            500 parties        npm run loupsoak -- 100
import { Game } from '../server/gameStore.js';
import { LOUP_TIMING } from '../server/games/loup.js';
import { seeded } from '../server/rules/loupSim.js';

const GAMES = Number(process.argv[2]) || 500;

class FakeClock {
  t = 1_000_000;
  timers = new Map();
  seq = 0;
  now() {
    return this.t;
  }
  setTimeout(fn, ms) {
    this.timers.set(++this.seq, { at: this.t + ms, fn });
    return this.seq;
  }
  clearTimeout(id) {
    this.timers.delete(id);
  }
  tick(ms) {
    const end = this.t + ms;
    for (;;) {
      let next = null;
      for (const [id, timer] of this.timers) if (timer.at <= end && (!next || timer.at < next[1].at)) next = [id, timer];
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

function playOne(seed) {
  const rng = seeded(seed);
  const pick = (l) => l[Math.floor(rng() * l.length)];
  const n = 6 + Math.floor(rng() * 25);
  const clock = new FakeClock();
  const game = new Game(`S${seed}`, 'loup', { clock });
  game.loupTiming = { ...LOUP_TIMING, narrate: false };
  const players = [];
  for (let i = 0; i < n; i++) {
    const { player } = game.upsertPlayer({ name: `J${i}` });
    game.connectPlayer(player, `s${seed}-${i}`);
    // 0 : actif, 1 : inactif (ne fait jamais rien), 2 : se déconnecte en cours de partie, 3 : double clic
    players.push({ id: player.id, player, kind: rng() < 0.55 ? 0 : pick([1, 1, 2, 3]) });
  }
  if (game.start()) throw new Error(`partie ${seed} non lancée`);
  let slowest = 0;
  let steps = 0;
  const act = (p, action) => {
    const t = process.hrtime.bigint();
    game.action(p.id, action);
    if (p.kind === 3) game.action(p.id, action); // double clic
    slowest = Math.max(slowest, Number(process.hrtime.bigint() - t) / 1e6);
  };
  // « Bloquée » = plus aucun changement de phase pendant 15 minutes de jeu simulées (un garde-fou invisible dure au plus 5 minutes).
  let lastPhase = null;
  let lastChange = clock.t;
  while (game.phase !== 'ended' && steps < 50000 && clock.t - lastChange < 15 * 60_000) {
    steps += 1;
    const marker = `${game.phase}:${game.roundData?.phaseId}`;
    if (marker !== lastPhase) {
      lastPhase = marker;
      lastChange = clock.t;
    }
    const state = game.publicState({ host: true });
    if (game.phase === 'results' && !game.pending) break;
    for (const p of players) {
      if (p.kind === 1) continue;
      if (p.kind === 2 && rng() < 0.004 && p.player.sockets.size) game.disconnectPlayer(p.player, [...p.player.sockets][0]);
      if (p.kind === 2 && !p.player.sockets.size && rng() < 0.05) game.connectPlayer(p.player, `s${seed}-${p.id}-${steps}`);
      const r = game.publicState({ playerId: p.id }).round;
      const me = r?.me;
      if (!me || me.spectator) continue;
      if (game.phase === 'results' && game.pending) {
        if (r.credits?.[p.id]) act(p, { type: 'allocate', allocation: {} });
        continue;
      }
      if (game.phase !== 'question') continue;
      const sc = me.screen;
      const base = { phaseId: r.phaseId };
      if (rng() < 0.3) continue; // les joueurs prennent leur temps
      if (sc.kind === 'role') act(p, { type: 'ack', ...base });
      else if (sc.kind === 'act' && sc.phase === 'loups') act(p, { type: 'wolfVote', target: pick(sc.options), ...base });
      else if (sc.kind === 'act') {
        const t = pick(sc.options);
        act(p, { type: 'night', ...({ cupidon: { pair: [t, pick(sc.options)] }, sorciere: { save: rng() < 0.5, gorgee: pick(sc.options) }, distributeur: { targets: [t] } }[sc.phase] ?? { target: t }), ...base });
      } else if (sc.kind === 'shoot') act(p, { type: 'shoot', target: pick(sc.options), ...base });
      else if (sc.kind === 'vote') act(p, { type: 'vote', target: pick(sc.options), ...base });
      else if (sc.kind === 'debate' && !sc.ready && rng() < 0.5) act(p, { type: 'ready', ...base });
    }
    void state;
    clock.tick(1000);
  }
  const done = game.phase === 'ended' || (game.phase === 'results' && !game.pending);
  const sim = clock.t - 1_000_000;
  const where = `phase ${game.phase}, stage ${game.roundData?.stage}/${game.roundData?.phase}, timers ${Object.keys(game.timers)}, nuit ${game.roundData?.eng?.night}, vivants ${game.roundData?.eng?.order.filter((i) => !game.roundData.eng.dead[i]).length}`;
  game.dispose();
  return { where, done, n, steps, slowest, timersLeft: Object.keys(game.timers).length + clock.timers.size, simMs: sim };
}

const heap = () => {
  global.gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};
heap();
const before = heap();
let stuck = 0;
let leaks = 0;
let slowest = 0;
let sim = 0;
const t0 = Date.now();
for (let seed = 1; seed <= GAMES; seed++) {
  const r = playOne(seed);
  if (!r.done) {
    stuck += 1;
    console.log(`partie ${seed} (${r.n} joueurs) bloquée après ${r.steps} pas : ${r.where}`);
  }
  if (r.timersLeft) leaks += 1;
  slowest = Math.max(slowest, r.slowest);
  sim += r.simMs;
  if (seed % 100 === 0) console.log(`${seed} parties… mémoire ${heap().toFixed(1)} Mo`);
}
const after = heap();
console.log(`${GAMES} parties en ${((Date.now() - t0) / 1000).toFixed(1)} s (${((Date.now() - t0) / GAMES).toFixed(0)} ms par partie, ${(sim / GAMES / 60000).toFixed(1)} min de jeu simulées en moyenne)`);
console.log(`bloquées : ${stuck} · minuteurs restants après la fin : ${leaks} partie(s) · action la plus lente : ${slowest.toFixed(2)} ms`);
console.log(`mémoire : ${before.toFixed(1)} Mo avant, ${after.toFixed(1)} Mo après (${(after - before).toFixed(1)} Mo)`);
process.exit(stuck || leaks ? 1 : 0);
