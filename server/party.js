// Mode soirée : composition du programme (fonctions pures, testées). L'enchaînement lui-même vit dans gameStore.js.

/** Durées proposées à l'hôte (0 = sans fin). */
export const PARTY_DURATIONS = [30 * 60 * 1000, 60 * 60 * 1000, 120 * 60 * 1000, 0];
/** Ordre des rythmes : un jeu de vote, puis un jeu rapide, puis un jeu d'ambiance, et on recommence. */
export const RHYTHMS = ['vote', 'rapide', 'ambiance'];
export const DEFAULT_PARTY_ROUNDS = [3, 5];
/** Écran de transition entre deux jeux. */
export const TRANSITION_MS = 5000;

/** Jeux jouables, cochés par l'hôte (null = tous) et dont le minimum de joueurs est atteint. */
export function eligibleGames(games, playerCount, included = null) {
  return games.filter((g) => g.playable && (!included || included.includes(g.id)) && playerCount >= (g.minToStart ?? 2));
}

/**
 * Jeu suivant : le rythme qui suit celui du dernier jeu (en sautant les rythmes sans jeu éligible),
 * puis, dans ce rythme, le jeu joué il y a le plus longtemps (jamais le même deux fois de suite s'il y a le choix).
 * allGames sert à retrouver le rythme du dernier jeu même s'il n'est plus éligible (joueur parti, case décochée).
 */
export function pickNextBlock(eligible, history = [], rng = Math.random, allGames = eligible) {
  if (eligible.length === 0) return null;
  const last = history.at(-1);
  const lastRhythm = allGames.find((g) => g.id === last)?.rhythm;
  const start = lastRhythm ? RHYTHMS.indexOf(lastRhythm) + 1 : 0;
  const rhythms = RHYTHMS.map((_, i) => RHYTHMS[(start + i) % RHYTHMS.length]);

  let candidates = [];
  for (const rhythm of rhythms) {
    candidates = eligible.filter((g) => g.rhythm === rhythm && g.id !== last);
    if (candidates.length) break;
  }
  // Jeux sans rythme connu, ou un seul jeu coché : on prend ce qu'il reste.
  if (!candidates.length) candidates = eligible.filter((g) => g.id !== last);
  if (!candidates.length) candidates = eligible;

  const lastPlayed = (g) => history.lastIndexOf(g.id);
  const oldest = Math.min(...candidates.map(lastPlayed));
  const pool = candidates.filter((g) => lastPlayed(g) === oldest);
  const game = pool[Math.floor(rng() * pool.length)];
  const [min, max] = game.partyRounds ?? DEFAULT_PARTY_ROUNDS;
  return { mode: game.id, rounds: min + Math.floor(rng() * (max - min + 1)) };
}

/** Programme de `length` jeux pour ce nombre de joueurs (aperçu et tests ; la soirée tire le suivant au fur et à mesure). */
export function buildProgram(games, playerCount, { included = null, length = 6, rng = Math.random, history = [] } = {}) {
  const eligible = eligibleGames(games, playerCount, included);
  const program = [];
  const played = [...history];
  for (let i = 0; i < length; i++) {
    const block = pickNextBlock(eligible, played, rng, games);
    if (!block) break;
    program.push(block);
    played.push(block.mode);
  }
  return program;
}
