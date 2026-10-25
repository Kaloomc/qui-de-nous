// Règles de « La Roue » : une roue désigne un joueur, une deuxième tire son défi. Fonctions pures (hasard injecté).
import { TARGET_GENDER } from '../../shared/formulation.js';

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
  // Défis qui ciblent un genre (champ `genre` : "homme" ou "femme" ; `vers` : le genre qui reçoit). Les joueurs qui préfèrent
  // ne pas dire leur genre ne sont jamais visés. Ni dénudage, ni contact, ni photo, et jamais de stigmatisation.
  'genre-boit': { interactive: false, gendered: true }, // tous les joueurs de ce genre boivent n
  'genre-distribue': { interactive: true, gendered: true }, // chaque joueur de ce genre distribue n gorgées à des joueurs du genre `vers`
  'genre-choisit': { interactive: true, gendered: true }, // le premier du genre à répondre choisit qui boit n parmi le genre `vers` (pas de concertation)
  'genre-dernier': { interactive: true, gendered: true }, // le dernier du genre à toucher son téléphone boit n
};
export const GENRES = ['homme', 'femme'];
/** Un défi de genre est sauté si l'un des genres concernés compte moins de GENDER_MIN joueurs dans la partie. */
export const GENDER_MIN = 2;
export const isGendered = (defi) => !!TYPES[defi?.type]?.gendered;
export const needsReceivers = (defi) => defi.type === 'genre-distribue' || defi.type === 'genre-choisit';
export const WHAT_SEGMENTS = 10;

export function isValidDefi(d) {
  if (isGendered(d) && !(GENRES.includes(d.genre) && (!needsReceivers(d) || (GENRES.includes(d.vers) && d.vers !== d.genre)))) return false;
  if (d && !isGendered(d) && (d.genre !== undefined || d.vers !== undefined)) return false;
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
 * Joueurs concernés par un défi de genre. `players` : [{ id, gender }] (joueurs de la manche). Ceux qui préfèrent ne pas dire
 * leur genre ('n') ne sont dans aucun des deux groupes : ils sont épargnés.
 */
export function groupsFor(defi, players) {
  const of = (genre) => players.filter((p) => p.gender === TARGET_GENDER[genre]).map((p) => p.id);
  return { actors: of(defi.genre), receivers: needsReceivers(defi) ? of(defi.vers) : [] };
}

/** Un défi de genre n'est tiré que si chaque genre concerné compte au moins GENDER_MIN joueurs. */
export function isEligible(defi, players) {
  if (!isGendered(defi)) return true;
  const { actors, receivers } = groupsFor(defi, players);
  return actors.length >= GENDER_MIN && (!needsReceivers(defi) || receivers.length >= GENDER_MIN);
}

/**
 * Tire le joueur (jamais deux fois de suite le même s'il y a le choix) et le défi,
 * plus les cases affichées sur la deuxième roue (le défi tiré + des leurres variés).
 * `chosenDefi` : défi déjà tiré par l'appelant (anti-répétition) ; sinon, tiré ici au hasard.
 */
export function drawRoue(playerIds, defis, rng = Math.random, lastTargetId = null, chosenDefi = null, chosenTargetId = null, players = []) {
  const pool = playerIds.length > 1 ? playerIds.filter((id) => id !== lastTargetId) : playerIds;
  const targetId = chosenTargetId ?? pick(pool, rng);
  const defi = chosenDefi ?? pick(defis, rng);
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
    whatSegments: whatSegments.map((d) => ({ type: d.type, n: d.n, ...(isGendered(d) ? { genre: d.genre } : {}) })),
    whatIndex,
    picks: {},
    responses: {},
    gage: null,
    // Défi de genre : qui agit et qui reçoit (identifiants), figés au tirage. gives/chosen/touches : réponses sur les téléphones.
    groups: isGendered(defi) ? groupsFor(defi, players) : null,
    gives: {},
    chosen: null,
    touches: {},
  };
}

export const isInteractive = (results) => TYPES[results.defi.type].interactive;

const given = (results) => Object.values(results.picks).reduce((a, b) => a + b, 0);

const actorsOf = (results) => results.groups?.actors ?? [];
const receiversOf = (results) => results.groups?.receivers ?? [];
const gaveBy = (results, id) => Object.values(results.gives?.[id] ?? {}).reduce((a, b) => a + b, 0);
/** Le joueur est-il visé par ce défi de genre ? (Ceux qui préfèrent ne pas dire leur genre ne le sont jamais.) */
export const isConcerned = (results, playerId) => !results.groups || actorsOf(results).includes(playerId) || receiversOf(results).includes(playerId);

/** Action d'un joueur pendant la résolution du défi. Renvoie { results } ou { error }. */
export function applyRoueAction(results, playerId, action, playerIds) {
  const { type, n } = results.defi;
  if (isGendered(results.defi) && !isConcerned(results, playerId)) return { error: 'Ce défi ne te concerne pas.' };
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
  if (type === 'genre-distribue') {
    if (!actorsOf(results).includes(playerId)) return { error: 'Ce défi ne te concerne pas.' };
    if (gaveBy(results, playerId) >= n) return { error: 'Tout est déjà distribué.' };
    if (!receiversOf(results).includes(action.targetId)) return { error: 'Choix invalide.' };
    const mine = { ...(results.gives[playerId] ?? {}), [action.targetId]: (results.gives[playerId]?.[action.targetId] ?? 0) + 1 };
    return { results: { ...results, gives: { ...results.gives, [playerId]: mine } } };
  }
  if (type === 'genre-choisit') {
    if (!actorsOf(results).includes(playerId)) return { error: 'Ce défi ne te concerne pas.' };
    if (results.chosen) return { error: 'Quelqu’un a déjà choisi.' };
    if (!receiversOf(results).includes(action.targetId)) return { error: 'Choix invalide.' };
    return { results: { ...results, chosen: action.targetId, chosenBy: playerId } };
  }
  if (type === 'genre-dernier') {
    if (!actorsOf(results).includes(playerId)) return { error: 'Ce défi ne te concerne pas.' };
    if (playerId in results.touches) return { results }; // double toucher : le premier compte
    return { results: { ...results, touches: { ...results.touches, [playerId]: Object.keys(results.touches).length + 1 } } };
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
  // Défis de genre : on n'attend que les joueurs de ce genre qui sont là.
  const present = actorsOf(results).filter((id) => expectedIds.includes(id));
  if (type === 'genre-distribue') return present.every((id) => gaveBy(results, id) >= n);
  if (type === 'genre-choisit') return results.chosen != null;
  if (type === 'genre-dernier') return present.every((id) => id in results.touches);
  return true;
}

/**
 * Fin de la fenêtre de réponse d'un défi de genre : ce qui n'a pas été décidé l'est au hasard (jamais de blocage).
 * Gorgées non distribuées : tirées parmi les joueurs qui reçoivent. Personne n'a choisi : un joueur du genre visé, au hasard.
 * Dernier à toucher : ceux qui n'ont pas touché, sinon le dernier à l'avoir fait.
 */
export function settleGendered(results, rng = Math.random) {
  const { type, n } = results.defi;
  if (!isGendered(results.defi) || !results.groups) return results;
  if (type === 'genre-distribue') {
    const receivers = receiversOf(results);
    const gives = {};
    for (const id of actorsOf(results)) {
      const mine = { ...(results.gives[id] ?? {}) };
      for (let left = n - gaveBy(results, id); left > 0; left--) {
        const target = pick(receivers, rng);
        mine[target] = (mine[target] ?? 0) + 1;
      }
      gives[id] = mine;
    }
    return { ...results, gives };
  }
  if (type === 'genre-choisit') {
    if (results.chosen || !receiversOf(results).length) return results;
    return { ...results, chosen: pick(receiversOf(results), rng), chosenBy: null };
  }
  if (type === 'genre-dernier') {
    const silent = actorsOf(results).filter((id) => !(id in results.touches));
    const order = Object.entries(results.touches).sort((a, b) => b[1] - a[1]);
    return { ...results, losers: silent.length ? silent : order.length ? [order[0][0]] : [] };
  }
  return results;
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
  if (type === 'genre-boit') actorsOf(results).forEach((id) => add(id, n));
  if (type === 'genre-distribue') for (const mine of Object.values(results.gives ?? {})) for (const [id, k] of Object.entries(mine)) add(id, k);
  if (type === 'genre-choisit' && results.chosen) add(results.chosen, n);
  if (type === 'genre-dernier') (results.losers ?? []).forEach((id) => add(id, n));
  return sips;
}
