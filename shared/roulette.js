// Roulette des duellistes : bande de vignettes qui défile, jamais deux voisins identiques, arrêtée sur l'élu (décidé par le serveur).
import { rngOf } from './runner.js';

export const hashSeed = (text) => [...String(text)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/**
 * Bande de joueurs (identifiants) qui se termine par `finalId`. La liste est dupliquée en boucle jusqu'à au moins `minLen` vignettes ;
 * deux vignettes voisines ne sont jamais le même joueur. Nécessite au moins 2 joueurs distincts.
 */
export function buildStrip(ids, finalId, seed, minLen = 16) {
  const rng = rngOf(hashSeed(seed));
  const pool = [...new Set([...ids, finalId])];
  if (pool.length < 2) return [finalId];
  const shuffled = () => pool.map((id) => [rng(), id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const strip = [];
  while (strip.length < minLen - 1) {
    const chunk = shuffled();
    for (const id of chunk) if (id !== strip.at(-1)) strip.push(id);
  }
  if (strip.at(-1) === finalId) strip.pop();
  strip.push(finalId);
  return strip;
}

/** Part du trajet parcourue à `t` ms pour un arrêt à `lockAt` ms : rapide au départ, ralentissement progressif, arrêt net (1 à la fin). */
export function travel(t, lockAt) {
  if (t >= lockAt) return 1;
  const x = Math.max(0, t) / lockAt;
  return 1 - (1 - x) ** 3.2;
}
