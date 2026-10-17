// Simulateur de parties complètes de Loup-Garou (moteur de règles seul, bots au comportement aléatoire).
// Sert aux tests (500 parties) et à `node scripts/loup-sim.js`. Il lève une erreur dès qu'un invariant est violé.
import * as L from './loup.js';

/** Générateur pseudo-aléatoire à graine (mulberry32), pour des parties reproductibles. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ROUNDS = 80;

function check(s, where) {
  const fail = (m) => {
    throw new Error(`${where} : ${m}`);
  };
  const deaths = s.events.filter((e) => e.type === 'death').map((e) => e.id);
  if (new Set(deaths).size !== deaths.length) fail('joueur mort deux fois');
  if (deaths.length !== Object.keys(s.dead).length) fail('morts incohérents');
  if (!s.queue.length && !s.awaitingHunter && s.lovers) {
    const [a, b] = s.lovers;
    if (L.isAlive(s, a) !== L.isAlive(s, b)) fail('un amoureux survit à l’autre');
  }
  if (s.winner === 'village' && L.livingIds(s).some((id) => L.isWolf(s, id))) fail('victoire du village avec un loup en vie');
}

/** Joue une partie. chaos : part des joueurs inactifs / qui ne votent pas. Renvoie { state, rounds, tribunal }. */
export function runGame(rng, { n = 6 + Math.floor(rng() * 25), chaos = 0.25, counts = null } = {}) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const comp = counts ?? L.recommendedComposition(n);
  const s = L.createGame(ids, comp, { rng, options: { dernieresParoles: rng() < 0.5, potionGorgee: rng() < 0.8, rolesMaison: rng() < 0.7 } });
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const lazy = () => rng() < chaos;
  const shoot = (status) => {
    while (status === 'hunter') {
      const hunter = s.awaitingHunter;
      const target = lazy() ? null : pick(L.livingIds(s).filter((id) => id !== hunter));
      status = L.hunterShoot(s, hunter, target).status;
      check(s, 'après tir');
    }
  };
  let rounds = 0;
  while (!s.winner && rounds < MAX_ROUNDS) {
    rounds += 1;
    L.startNight(s);
    const living = L.livingIds(s);
    for (const phase of L.nightPhases(s)) {
      const role = Object.keys(L.ROLES).find((r) => L.ROLES[r].phase === phase);
      const actor = phase === 'loups' ? null : L.actorOf(s, role);
      if (phase === 'loups') {
        const votes = {};
        for (const w of living.filter((id) => L.isWolf(s, id))) if (!lazy()) votes[w] = pick(living.filter((id) => !L.isWolf(s, id)).concat(living));
        L.nightAct(s, 'loups', null, { victim: L.tallyWolves(votes, rng) });
        continue;
      }
      if (!actor || lazy()) continue;
      const others = living.filter((id) => id !== actor);
      if (phase === 'cupidon') L.nightAct(s, 'cupidon', actor, { pair: [pick(living), pick(living)] });
      else if (phase === 'salvateur') L.nightAct(s, 'salvateur', actor, { target: pick(living) });
      else if (phase === 'voyante') L.seerReveal(s, actor, pick(others));
      else if (phase === 'ours') L.bearSniff(s, actor, pick(living));
      else if (phase === 'sorciere')
        L.nightAct(s, 'sorciere', actor, { save: rng() < 0.6, kill: rng() < 0.3 ? pick(others) : undefined, gorgee: rng() < 0.5 ? pick(living) : undefined });
      else if (phase === 'distributeur') L.nightAct(s, 'distributeur', actor, { targets: [pick(living), pick(living), pick(living)] });
    }
    for (const ghost of s.order.filter((id) => !L.isAlive(s, id))) {
      if (rng() < 0.7) L.ghostBet(s, ghost, pick(L.livingIds(s)));
      if (rng() < 0.3) L.ghostCampBet(s, ghost, pick(['village', 'loups', 'amoureux']));
    }
    shoot(L.dawn(s));
    check(s, 'après l’aube');
    if (s.winner) break;

    // Vote du village, avec second tour en cas d'égalité.
    const voters = L.eligibleVoters(s);
    const alive = L.livingIds(s);
    const ballot = (only) => Object.fromEntries(voters.filter(() => !lazy()).map((v) => [v, pick((only ?? alive).filter((t) => t !== v).length ? (only ?? alive).filter((t) => t !== v) : alive)]));
    let r = L.voteCounts(s, ballot());
    if (r.top.length > 1) r = L.voteCounts(s, ballot(r.top), r.top);
    if (r.top.length === 1) shoot(L.eliminate(s, r.top[0], r.valid));
    else L.clearGhostBets(s);
    check(s, 'après le vote');
  }
  if (!s.winner) throw new Error(`partie sans fin après ${MAX_ROUNDS} tours (${n} joueurs)`);
  const alloc = Object.fromEntries(s.order.map((id) => [id, lazy() ? {} : { [pick(s.order)]: 2 }]));
  const tribunal = L.settleTribunal(s, alloc, rng);
  for (const [id, k] of Object.entries(tribunal.sips)) if (!(k >= 0 && k <= L.TRIBUNAL_CAP) || !(id in s.roles)) throw new Error(`Tribunal : gorgées invalides pour ${id}`);
  return { state: s, rounds, tribunal };
}
