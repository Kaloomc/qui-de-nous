// Simulateur de parties de Savant (règles pures, bots au comportement aléatoire) : lève une erreur dès qu'un invariant est violé.
import * as S from './savant.js';
import { Spotlight } from '../spotlight.js';

/**
 * Joue une partie de `rounds` manches avec `n` joueurs. chaos : part de joueurs inactifs / qui se déconnectent / qui ne votent pas.
 * Renvoie { rounds, points, sips, seekers, savants }.
 */
export function runGame(rng, { n = 4 + Math.floor(rng() * 27), rounds = 3 * n, chaos = 0.25 } = {}) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const spot = new Spotlight();
  const points = {};
  const sips = {};
  const seekers = [];
  const savants = [];
  let lastSavant = null;
  for (let r = 1; r <= rounds; r++) {
    const present = ids.filter(() => rng() > chaos * 0.3);
    if (present.length < S.MIN_PLAYERS) continue; // la manche attend des joueurs
    const seekerId = spot.pick('chercheur', present, { rng });
    if (!present.includes(seekerId)) throw new Error('Chercheur absent');
    const candidates = present.filter((id) => id !== seekerId);
    const savantId = spot.pick('savant', candidates, { rng, avoid: lastSavant });
    if (savantId === seekerId) throw new Error('Savant = Chercheur');
    lastSavant = savantId;
    seekers.push(seekerId);
    savants.push(savantId);
    const writers = candidates;
    const votes = {};
    for (const id of present) {
      if (rng() < chaos) continue; // ne vote pas
      const options = writers.filter((w) => w !== id);
      if (rng() < chaos * 0.2) votes[id] = id; // vote pour soi : refusé
      else if (rng() < chaos * 0.2) votes[id] = seekerId; // vote pour le Chercheur : refusé
      else votes[id] = options[Math.floor(rng() * options.length)];
    }
    const res = S.resolveRound({ seekerId, savantId, writers, votes });
    check(res, { seekerId, savantId, writers, votes });
    const allocations = {};
    for (const holder of Object.keys(res.credits)) if (rng() < 0.5) allocations[holder] = { [pickOther(rng, ids, holder)]: res.credits[holder] };
    const out = S.settleSips({ direct: res.direct, credits: res.credits, allocations, ids, rng });
    for (const [id, k] of Object.entries(out.sips)) {
      if (k > S.SIP_CAP) throw new Error('plafond dépassé');
      sips[id] = (sips[id] ?? 0) + k;
    }
    for (const [id, k] of Object.entries(res.points)) points[id] = (points[id] ?? 0) + k;
  }
  return { rounds, points, sips, seekers, savants };
}

const pickOther = (rng, ids, not) => {
  const list = ids.filter((id) => id !== not);
  return list[Math.floor(rng() * list.length)];
};

function check(res, { seekerId, savantId, writers, votes }) {
  const fail = (m) => {
    throw new Error(m);
  };
  if (res.found !== (votes[seekerId] === savantId)) fail('found incohérent');
  if (res.found && res.direct[seekerId]) fail('le Chercheur qui trouve ne boit pas');
  if (res.direct[savantId] && res.found) fail('le Savant trouvé ne boit pas');
  if (res.bluffers.includes(savantId) || res.bluffers.includes(seekerId)) fail('mauvais Bluffeurs');
  for (const id of Object.keys(res.points)) if (!writers.includes(id) && id !== seekerId) fail('points à un étranger');
  for (const n of Object.values(res.points)) if (n < 0) fail('points négatifs');
  for (const voter of Object.keys(res.spectatorVotes)) if (voter === seekerId || res.spectatorVotes[voter] === voter) fail('vote invalide compté');
  const credit = Object.values(res.credits).reduce((a, b) => a + b, 0);
  if (credit < 0) fail('crédit négatif');
}
