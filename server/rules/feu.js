// Règles de « Réflexes » (Feu !) : la TV dit des mots, on tape uniquement sur « FEU ». Fonctions pures (hasard injecté).

export const FEU = 'FEU';
export const MIN_WORDS = 4;
export const MAX_WORDS = 10;
export const GAP_MIN_MS = 800;
export const GAP_MAX_MS = 2500;
/** Plus rapide que ça après « FEU » (reçu par le serveur), c'est de l'anticipation : faux départ. */
export const MIN_REACTION_MS = 120;
/** Temps laissé pour taper après « FEU ». */
export const REACT_WINDOW_MS = 3000;

const between = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));

/**
 * Séquence de 4 à 10 mots, avec un seul « FEU », jamais en premier et pas toujours en dernier.
 * Surtout des mots pièges, quelques neutres, jamais deux fois le même mot d'affilée.
 * gaps[i] = délai avant le mot i.
 */
export function buildSequence({ pieges, neutres }, rng = Math.random) {
  const length = between(MIN_WORDS, MAX_WORDS, rng);
  const feuIndex = between(1, length - 1, rng);
  const words = [];
  for (let i = 0; i < length; i++) {
    if (i === feuIndex) {
      words.push(FEU);
      continue;
    }
    const pool = rng() < 0.7 ? pieges : neutres;
    let word;
    do word = pool[Math.floor(rng() * pool.length)];
    while (pool.length > 1 && word === words[i - 1]);
    words.push(word);
  }
  const gaps = words.map(() => between(GAP_MIN_MS, GAP_MAX_MS, rng));
  return { words, feuIndex, gaps };
}

/** Un toucher est un faux départ s'il arrive avant « FEU », ou trop vite après pour être un réflexe. */
export const isFalseStart = (tap, feuIndex, feuAt) => tap.index < feuIndex || feuAt == null || tap.at - feuAt < MIN_REACTION_MS;

/**
 * Résultats, calculés sur l'heure de RÉCEPTION par le serveur : on compare les joueurs entre eux,
 * la latence de la TV est la même pour tout le monde.
 * Boivent : les faux départs, ceux qui n'ont pas tapé, et le dernier à avoir tapé (s'il y a au moins 2 réflexes valides).
 */
export function computeFeu(participantIds, taps, { words, feuIndex }, feuAt) {
  const ranking = [];
  const falseStarts = [];
  const missed = [];
  for (const id of participantIds) {
    const tap = taps[id];
    if (!tap) missed.push(id);
    else if (isFalseStart(tap, feuIndex, feuAt)) falseStarts.push({ id, word: tap.index >= 0 ? words[tap.index] : null });
    else ranking.push({ id, ms: tap.at - feuAt });
  }
  ranking.sort((a, b) => a.ms - b.ms);
  const slowest = ranking.length >= 2 ? ranking.at(-1).ms : null;
  const lastIds = slowest == null ? [] : ranking.filter((r) => r.ms === slowest).map((r) => r.id);
  // Égalité parfaite entre tous les réflexes valides : personne n'est « le dernier ».
  const realLast = lastIds.length < ranking.length ? lastIds : [];
  return {
    words,
    feuIndex,
    ranking,
    falseStarts,
    missed,
    lastIds: realLast,
    loserIds: [...new Set([...falseStarts.map((f) => f.id), ...missed, ...realLast])],
  };
}

export const sipsFeu = (results) => Object.fromEntries(results.loserIds.map((id) => [id, 1]));
