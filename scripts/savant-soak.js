// Test de charge du Savant côté serveur : N parties complètes (4 à 30 joueurs), horloge simulée, joueurs variés (actifs, inactifs,
// réponses vides, déconnexions, double clics, Chercheur qui disparaît). Rien ne doit rester coincé ni en mémoire.
//   npm run savantsoak            300 parties        npm run savantsoak -- 50
import { Game } from '../server/gameStore.js';
import { seeded } from '../server/rules/loupSim.js';

const GAMES = Number(process.argv[2]) || 300;
const FACTS = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, question: `Question ${i} : ___ ?`, reponse: `vraie ${i}`, explication: `Explication ${i}.`, categorie: 'insolite', source: 'https://example.org' }));

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
  const n = 4 + Math.floor(rng() * 27);
  const clock = new FakeClock();
  const game = new Game(`V${seed}`, 'savant', { clock });
  game.savantFacts = FACTS;
  game.gameHostAction({ type: 'config', rounds: pick([5, 8, 'players', 0]), writeMs: pick([15000, 20000, 30000]) });
  const players = [];
  for (let i = 0; i < n; i++) {
    const { player } = game.upsertPlayer({ name: `J${i}` });
    game.connectPlayer(player, `s${seed}-${i}`);
    // 0 : actif, 1 : inactif, 2 : se déconnecte parfois, 3 : double clic, 4 : réponses vides
    players.push({ id: player.id, player, kind: rng() < 0.5 ? 0 : pick([1, 2, 3, 4]) });
  }
  if (game.start()) throw new Error(`partie ${seed} non lancée`);
  let steps = 0;
  let lastMarker = null;
  let lastChange = clock.t;
  let rounds = 0;
  let slowest = 0;
  let sipMax = 0;
  const act = (p, action) => {
    const t = process.hrtime.bigint();
    game.action(p.id, action);
    if (p.kind === 3) game.action(p.id, action);
    slowest = Math.max(slowest, Number(process.hrtime.bigint() - t) / 1e6);
  };
  while (game.phase !== 'ended' && steps < 100000 && clock.t - lastChange < 10 * 60_000) {
    steps += 1;
    const marker = `${game.phase}:${game.roundId}:${game.roundData?.phaseId}:${game.pending}`;
    if (marker !== lastMarker) {
      lastMarker = marker;
      lastChange = clock.t;
    }
    if (game.phase === 'results' && !game.pending) {
      rounds += 1;
      for (const v of game.roundSips ? Object.values(game.roundSips) : []) sipMax = Math.max(sipMax, v);
      if (game.isLastRound || rounds > 40) game.end();
      else game.nextQuestion();
      continue;
    }
    for (const p of players) {
      if (p.kind === 1) continue;
      if (p.kind === 2 && rng() < 0.01 && p.player.sockets.size) game.disconnectPlayer(p.player, [...p.player.sockets][0]);
      if (p.kind === 2 && !p.player.sockets.size && rng() < 0.08) game.connectPlayer(p.player, `s${seed}-${p.id}-${steps}`);
      const r = game.publicState({ playerId: p.id }).round;
      const me = r?.me;
      if (!me) continue;
      if (game.phase === 'results' && game.pending) {
        if (game.results.credits?.[p.id]) act(p, { type: 'allocate', allocation: rng() < 0.5 ? {} : { [pick(players).id]: 5 } });
        continue;
      }
      if (game.phase !== 'question' || rng() < 0.35) continue;
      if (r.step === 'write' && me.role === 'writer') act(p, { type: 'answer', text: p.kind === 4 ? '   ' : `réponse ${p.id}`, phaseId: r.phaseId });
      else if (r.step === 'choice' && me.role !== 'out') game.vote(p.id, pick(r.writers), game.roundId);
    }
    clock.tick(1000);
  }
  const done = game.phase === 'ended';
  const where = `phase ${game.phase}, étape ${game.roundData?.step}, manche ${game.round}, timers ${Object.keys(game.timers)}`;
  game.dispose();
  return { done, n, steps, slowest, where, timersLeft: Object.keys(game.timers).length + clock.timers.size, sim: clock.t - 1_000_000, rounds, sipMax };
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
let sipMax = 0;
const t0 = Date.now();
for (let seed = 1; seed <= GAMES; seed++) {
  const r = playOne(seed);
  if (!r.done) {
    stuck += 1;
    console.log(`partie ${seed} (${r.n} joueurs) bloquée : ${r.where}`);
  }
  if (r.timersLeft) leaks += 1;
  slowest = Math.max(slowest, r.slowest);
  sim += r.sim;
  sipMax = Math.max(sipMax, r.sipMax);
  if (seed % 100 === 0) console.log(`${seed} parties… mémoire ${heap().toFixed(1)} Mo`);
}
const after = heap();
console.log(`${GAMES} parties en ${((Date.now() - t0) / 1000).toFixed(1)} s (${(sim / GAMES / 60000).toFixed(1)} min de jeu simulées en moyenne)`);
console.log(`bloquées : ${stuck} · minuteurs restants : ${leaks} partie(s) · action la plus lente : ${slowest.toFixed(2)} ms · gorgées reçues max par manche : ${sipMax}`);
console.log(`mémoire : ${before.toFixed(1)} Mo avant, ${after.toFixed(1)} Mo après (${(after - before).toFixed(1)} Mo)`);
process.exit(stuck || leaks || sipMax > 6 ? 1 : 0);
