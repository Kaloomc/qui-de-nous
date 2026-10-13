// Règles de « Réflexes » (Feu !) : la TV dit des mots, on tape uniquement sur « FEU ». Fonctions pures (hasard injecté).

export const FEU = 'FEU';
/** Nombre de mots pièges avant « FEU » : il peut tomber tôt ou tard, jamais en premier. */
export const MIN_TRAPS = 2;
export const MAX_TRAPS = 12;
/**
 * Pauses avant chaque mot (d'un début de mot au suivant), sans aucune cadence : surtout entre 1,2 et 3 s,
 * parfois deux mots enchaînés vite, parfois un long silence pour faire craquer les impatients.
 * Le plus court laisse toujours finir le mot d'avant (0,75 s au plus). La pause avant « FEU » suit la même loi.
 */
export const GAPS = { normal: [1200, 3000], quick: [900, 1100], long: [4000, 5000], quickRate: 0.15, longRate: 0.12 };
/** Un mot dit dans une des dernières manches n'est pas repris tout de suite. */
export const RECENT_ROUNDS = 5;
/** Marge de latence : un toucher reçu plus tôt que ça avant le vrai début du « FEU » est un faux départ. */
export const LATENCY_MARGIN_MS = 150;
/** Temps laissé pour taper après « FEU ». */
export const REACT_WINDOW_MS = 3000;
/** Part des mots pièges (le reste : mots neutres, pour casser la monotonie). */
export const PIEGE_RATE = 0.8;

const between = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));

export function drawGap(rng = Math.random) {
  const r = rng();
  if (r < GAPS.longRate) return between(...GAPS.long, rng);
  if (r < GAPS.longRate + GAPS.quickRate) return between(...GAPS.quick, rng);
  return between(...GAPS.normal, rng);
}

/**
 * Séquence d'une manche : 2 à 12 mots (surtout des pièges, quelques neutres, jamais deux fois le même dans la manche,
 * et pas ceux des manches récentes tant qu'il en reste), puis « FEU », qui termine la séquence.
 * previousTraps : nombre de mots avant « FEU » à la manche précédente, jamais repris deux fois de suite.
 * recent : mots déjà dits récemment. gaps[i] = pause avant le mot i.
 */
export function buildSequence({ pieges, neutres }, rng = Math.random, previousTraps = null, recent = []) {
  let traps = between(MIN_TRAPS, MAX_TRAPS, rng);
  if (traps === previousTraps) traps = traps < MAX_TRAPS ? traps + 1 : MIN_TRAPS;
  const words = [];
  const avoid = new Set(recent);
  for (let i = 0; i < traps; i++) {
    const list = rng() < PIEGE_RATE ? pieges : neutres;
    const fresh = list.filter((w) => !avoid.has(w) && !words.includes(w));
    const pool = fresh.length ? fresh : list.filter((w) => !words.includes(w));
    words.push(pool[Math.floor(rng() * pool.length)]);
  }
  words.push(FEU);
  return { words, feuIndex: traps, gaps: words.map(() => drawGap(rng)) };
}

/**
 * Faux départ : toucher pendant un mot piège (ou avant le premier mot), ou reçu avant le vrai début du « FEU »
 * (feuAt, signalé par la TV quand la voix commence), à la marge de latence près.
 */
export const isFalseStart = (tap, feuIndex, feuAt) => tap.index < feuIndex || feuAt == null || tap.at < feuAt - LATENCY_MARGIN_MS;

/**
 * Résultats, calculés sur l'heure de RÉCEPTION par le serveur, par rapport au vrai début du « FEU » :
 * on compare les temps des joueurs entre eux, la latence réseau est absorbée.
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
    else ranking.push({ id, ms: Math.max(0, tap.at - feuAt) });
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
    // Tout le monde a tiré trop tôt : manche annulée (chacun boit pour son faux départ), on rejoue.
    allFalseStart: participantIds.length > 0 && falseStarts.length === participantIds.length,
    loserIds: [...new Set([...falseStarts.map((f) => f.id), ...missed, ...realLast])],
  };
}

export const sipsFeu = (results) => Object.fromEntries(results.loserIds.map((id) => [id, 1]));
