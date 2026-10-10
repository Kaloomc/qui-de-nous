// Règles de « La Roue » : une roue désigne un joueur, une deuxième tire son défi. Fonctions pures (hasard injecté).

export const LEVELS = ['chill', 'epice', 'hardcore'];
/** Types de défis. `interactive` : le résultat attend une action sur les téléphones. */
export const TYPES = {
  boire: { interactive: false }, // le joueur boit n
  groupe: { interactive: false }, // tout le monde boit n
  echange: { interactive: false }, // tout le monde change de place, personne ne boit
  duo: { interactive: true }, // le joueur choisit quelqu'un qui boit n avec lui
  distribuer: { interactive: true }, // le joueur distribue n gorgées, une par une
  tous: { interactive: true }, // « tous ceux qui ont déjà… » : chacun avoue sur son téléphone
  vote: { interactive: true }, // le groupe vote, le plus désigné boit n
  gage: { interactive: true }, // gage inoffensif, ou boire n
};
export const WHAT_SEGMENTS = 10;

export function isValidDefi(d) {
  return (
    d &&
    typeof d.texte === 'string' &&
    d.texte.trim().length > 0 &&
    Object.hasOwn(TYPES, d.type) &&
    LEVELS.includes(d.niveau) &&
    Number.isInteger(d.n) &&
    d.n >= (d.type === 'echange' ? 0 : 1) &&
    d.n <= 5
  );
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/**
 * Tire le joueur (jamais deux fois de suite le même s'il y a le choix) et le défi,
 * plus les cases affichées sur la deuxième roue (le défi tiré + des leurres variés).
 */
export function drawRoue(playerIds, defis, rng = Math.random, lastTargetId = null) {
  const pool = playerIds.length > 1 ? playerIds.filter((id) => id !== lastTargetId) : playerIds;
  const targetId = pick(pool, rng);
  const defi = pick(defis, rng);
  const decoys = [];
  const others = defis.filter((d) => d !== defi);
  // Des leurres de types différents d'abord, pour une roue bien variée.
  for (const d of [...others].sort(() => rng() - 0.5)) {
    if (decoys.length >= WHAT_SEGMENTS - 1) break;
    if (!decoys.some((x) => x.type === d.type && x.n === d.n)) decoys.push(d);
  }
  const whatIndex = Math.floor(rng() * (decoys.length + 1));
  const whatSegments = [...decoys];
  whatSegments.splice(whatIndex, 0, defi);
  return {
    targetId,
    defi,
    whoSegments: [...playerIds],
    whoIndex: playerIds.indexOf(targetId),
    whatSegments: whatSegments.map((d) => ({ type: d.type, n: d.n })),
    whatIndex,
    picks: {},
    responses: {},
    gage: null,
  };
}

export const isInteractive = (results) => TYPES[results.defi.type].interactive;

const given = (results) => Object.values(results.picks).reduce((a, b) => a + b, 0);

/** Action d'un joueur pendant la résolution du défi. Renvoie { results } ou { error }. */
export function applyRoueAction(results, playerId, action, playerIds) {
  const { type, n } = results.defi;
  const isTarget = playerId === results.targetId;
  const other = (id) => playerIds.includes(id) && id !== playerId;
  if (type === 'duo') {
    if (!isTarget) return { error: 'Ce n’est pas à toi de choisir.' };
    if (Object.keys(results.picks).length) return { error: 'Déjà choisi.' };
    if (!other(action.targetId)) return { error: 'Choix invalide.' };
    return { results: { ...results, picks: { [action.targetId]: n } } };
  }
  if (type === 'distribuer') {
    if (!isTarget) return { error: 'Ce n’est pas à toi de distribuer.' };
    if (given(results) >= n) return { error: 'Tout est déjà distribué.' };
    if (!other(action.targetId)) return { error: 'Choix invalide.' };
    return { results: { ...results, picks: { ...results.picks, [action.targetId]: (results.picks[action.targetId] ?? 0) + 1 } } };
  }
  if (type === 'tous') {
    if (typeof action.yes !== 'boolean') return { error: 'Choix invalide.' };
    return { results: { ...results, responses: { ...results.responses, [playerId]: action.yes } } };
  }
  if (type === 'vote') {
    if (!other(action.targetId)) return { error: 'Choix invalide.' };
    return { results: { ...results, responses: { ...results.responses, [playerId]: action.targetId } } };
  }
  if (type === 'gage') {
    if (!isTarget) return { error: 'Ce n’est pas ton gage.' };
    if (results.gage) return { error: 'Déjà répondu.' };
    if (typeof action.done !== 'boolean') return { error: 'Choix invalide.' };
    return { results: { ...results, gage: action.done ? 'fait' : 'boit' } };
  }
  return { error: 'Rien à faire pour ce défi.' };
}

/** Le défi est-il entièrement résolu ? `expectedIds` : joueurs dont on attend la réponse (connectés). */
export function isRoueComplete(results, expectedIds) {
  const { type, n } = results.defi;
  if (type === 'duo') return Object.keys(results.picks).length > 0;
  if (type === 'distribuer') return given(results) >= n;
  if (type === 'gage') return results.gage != null;
  if (type === 'tous') return expectedIds.every((id) => id in results.responses);
  if (type === 'vote') return expectedIds.every((id) => id in results.responses);
  return true;
}

/** Plus désignés au vote (égalité : tous boivent). */
export function voteLosers(responses) {
  const counts = {};
  for (const target of Object.values(responses)) counts[target] = (counts[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  return max > 0 ? Object.keys(counts).filter((id) => counts[id] === max) : [];
}

/**
 * Gorgées du défi. Sans réponse à temps : le duo boit seul, les gorgées non distribuées
 * reviennent au distributeur, un gage sans réponse se boit.
 */
export function sipsRoue(results, playerIds = results.whoSegments) {
  const { type, n } = results.defi;
  const sips = {};
  const add = (id, k) => k > 0 && (sips[id] = (sips[id] ?? 0) + k);
  if (type === 'boire') add(results.targetId, n);
  if (type === 'groupe') playerIds.forEach((id) => add(id, n));
  if (type === 'duo') {
    add(results.targetId, n);
    for (const [id, k] of Object.entries(results.picks)) add(id, k);
  }
  if (type === 'distribuer') {
    for (const [id, k] of Object.entries(results.picks)) add(id, k);
    add(results.targetId, n - given(results));
  }
  if (type === 'tous') for (const [id, yes] of Object.entries(results.responses)) if (yes) add(id, n);
  if (type === 'vote') voteLosers(results.responses).forEach((id) => add(id, n));
  if (type === 'gage' && results.gage !== 'fait') add(results.targetId, n);
  return sips;
}
