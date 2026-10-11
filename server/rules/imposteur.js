// Règles de « L'Imposteur » : tout le monde a le même mot, sauf un. Fonctions pures (le hasard est injecté).

export const SPEAKING_LAPS = 2;

const shuffleWith = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Tire l'imposteur et l'ordre de parole. L'imposteur reçoit le mot « proche » sans savoir qu'il est l'imposteur. */
export function setupImposteur(playerIds, pair, rng = Math.random) {
  const imposterId = playerIds[Math.floor(rng() * playerIds.length)];
  const words = Object.fromEntries(playerIds.map((id) => [id, id === imposterId ? pair.proche : pair.mot]));
  return { imposterId, words, order: shuffleWith(playerIds, rng) };
}

/** Tours de parole : l'ordre est parcouru SPEAKING_LAPS fois. */
export const speakingTurns = (order, laps = SPEAKING_LAPS) => Array.from({ length: laps }, () => order).flat();

export const CLUE_MAX_LENGTH = 20;
export const CLUE_MAX_WORDS = 2;
/** Indice d'un joueur qui n'a rien envoyé à temps (ou qui a été passé). */
export const NO_CLUE = '—';

/** Minuscules, sans accents ni ponctuation : « Uber Eats ! » → « ubereats ». */
const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Valide l'indice écrit d'un joueur : { clue } nettoyé, ou { error } à afficher sur son téléphone.
 * Refuse un indice vide, trop long, de plus de deux mots, ou qui contient son mot secret.
 */
export function checkClue(text, secret) {
  const clue = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : '';
  if (!clue) return { error: 'Écris un indice avant d’envoyer.' };
  if (clue.length > CLUE_MAX_LENGTH) return { error: `Trop long : ${CLUE_MAX_LENGTH} caractères maximum.` };
  if (clue.split(' ').length > CLUE_MAX_WORDS) return { error: 'Un ou deux mots maximum.' };
  const flat = normalize(clue).replace(/ /g, '');
  if (!flat) return { error: 'Écris un vrai mot.' };
  const word = normalize(secret ?? '');
  // Le mot entier (« ubereats ») ou l'un de ses mots importants (« uber », « eats ») ne doit pas apparaître.
  const forbidden = [word.replace(/ /g, ''), ...word.split(' ').filter((w) => w.length >= 4)].filter(Boolean);
  if (forbidden.some((w) => flat.includes(w))) return { error: 'Ton indice ne peut pas contenir ton mot secret !' };
  return { clue };
}

/**
 * Démasqué = l'imposteur est seul en tête des votes (égalité = pas démasqué).
 * On ne peut pas voter pour soi ; les non-votants comptent comme s'étant trompés.
 */
export function computeImposteur(playerIds, votes, imposterId, pair) {
  const counts = Object.fromEntries(playerIds.map((id) => [id, 0]));
  for (const voter of playerIds) {
    const target = votes.get(voter);
    if (target in counts && target !== voter) counts[target] += 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const topIds = max > 0 ? playerIds.filter((id) => counts[id] === max) : [];
  const present = playerIds.includes(imposterId);
  const unmasked = present && topIds.length === 1 && topIds[0] === imposterId;
  const civilians = playerIds.filter((id) => id !== imposterId);
  return {
    imposterId,
    present,
    mot: pair.mot,
    proche: pair.proche,
    counts,
    topIds,
    unmasked,
    votersForImposter: civilians.filter((id) => votes.get(id) === imposterId),
    wrongVoterIds: civilians.filter((id) => votes.get(id) !== imposterId),
    lastChance: null,
  };
}

/** Dernière chance : 4 propositions, dont le mot des autres. */
export function lastChanceOptions(pair, otherPairs, rng = Math.random) {
  const decoys = shuffleWith(
    [...new Set(otherPairs.map((p) => p.mot).filter((w) => w !== pair.mot && w !== pair.proche))],
    rng,
  ).slice(0, 3);
  return shuffleWith([pair.mot, ...decoys], rng);
}

export function applyLastChance(results, guess) {
  return { ...results, lastChance: { guess, success: guess === results.mot } };
}

/**
 * Pas démasqué : tous les autres boivent, l'imposteur est épargné.
 * Démasqué : l'imposteur boit, et ceux qui ne l'ont pas désigné aussi.
 * Démasqué mais il trouve le mot des autres : il est épargné, ceux qui l'ont démasqué boivent à sa place.
 */
export function sipsImposteur(results) {
  const sips = {};
  const add = (id) => (sips[id] = (sips[id] ?? 0) + 1);
  if (!results.present) return sips;
  if (!results.unmasked) {
    results.wrongVoterIds.forEach(add);
    results.votersForImposter.forEach(add);
    return sips;
  }
  results.wrongVoterIds.forEach(add);
  if (results.lastChance?.success) results.votersForImposter.forEach(add);
  else add(results.imposterId);
  return sips;
}
