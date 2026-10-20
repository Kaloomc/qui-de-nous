// Règles pures du Savant (aucune dépendance au serveur ni au navigateur, tout est testé).
// Une manche : un Chercheur (tourne), un Savant (tiré au hasard, connaît la vraie réponse) et des Bluffeurs (inventent).
// Tout le monde écrit, le Chercheur désigne le Savant, les autres votent aussi, puis on compte gorgées et points.

export const MIN_PLAYERS = 4; // Chercheur + Savant + au moins 2 Bluffeurs
export const MAX_ANSWER = 60;
export const SIP_CAP = 6; // gorgées reçues au maximum par joueur et par manche
export const NO_ANSWER = 'a séché';

/** Nombre de manches proposé à l'hôte : 5, 8, 10, « une par joueur » (10 au plus), ou sans fin (0). */
export const ROUND_CHOICES = [5, 8, 10, 'players', 0];
export const DEFAULT_ROUNDS = 'players';
export const PLAYER_ROUNDS_CAP = 10;

export function roundsFor(choice, playerCount) {
  if (choice === 0) return 0;
  if (choice === 'players') return Math.min(PLAYER_ROUNDS_CAP, Math.max(playerCount, 1));
  return Number.isInteger(choice) && choice > 0 ? choice : roundsFor(DEFAULT_ROUNDS, playerCount);
}

// ---------- Réponses ----------

/** Texte brut de 60 caractères au plus, espaces superflus retirés, caractères de contrôle et d'inversion de sens supprimés. */
export function cleanAnswer(text) {
  if (typeof text !== 'string') return { error: 'Écris une réponse.' };
  const clean = text
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ANSWER)
    .trim();
  return clean ? { text: clean } : { error: 'Écris une réponse.' };
}

/** Forme comparable d'une réponse : sans accents, majuscules ni ponctuation (pour repérer deux réponses identiques). */
export const normalizeAnswer = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---------- Rotation du Chercheur ----------

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ordre aléatoire fixé au début ; `done` = ceux qui ont déjà cherché pendant ce tour. */
export const newRotation = (ids, rng = Math.random) => ({ order: shuffle(ids, rng), done: new Set(), last: null });

/**
 * Prochain Chercheur : chacun une fois avant que quelqu'un repasse. Les joueurs arrivés en cours de partie sont ajoutés à la fin
 * de l'ordre ; les absents gardent leur tour pour plus tard dans le tour. Quand tout le monde (présent) est passé, un nouveau tour
 * commence dans un nouvel ordre, sans reprendre tout de suite le dernier Chercheur.
 * all : joueurs de la partie ; present : ceux qui peuvent jouer maintenant. Renvoie null s'il n'y a personne.
 */
export function nextSeeker(rot, all, present, rng = Math.random) {
  const inGame = new Set(all);
  rot.order = rot.order.filter((id) => inGame.has(id));
  for (const id of all) if (!rot.order.includes(id)) rot.order.push(id);
  for (const id of [...rot.done]) if (!inGame.has(id)) rot.done.delete(id);
  const ok = new Set(present);
  let pick = rot.order.find((id) => !rot.done.has(id) && ok.has(id));
  if (!pick) {
    // Tour terminé (ou il ne reste que des absents) : nouveau tour.
    rot.done.clear();
    rot.order = shuffle(rot.order, rng);
    const candidates = rot.order.filter((id) => ok.has(id));
    pick = candidates.find((id) => id !== rot.last) ?? candidates[0] ?? null;
  }
  if (pick) {
    rot.done.add(pick);
    rot.last = pick;
  }
  return pick;
}

// ---------- Tirage du Savant ----------

/**
 * Savant : au hasard parmi ceux qui l'ont été le moins souvent, jamais deux manches de suite le même joueur si possible.
 * counts : joueur → nombre de fois Savant ; last : Savant de la manche précédente.
 */
export function pickSavant(counts, last, candidates, rng = Math.random) {
  if (!candidates.length) return null;
  const pool = candidates.length > 1 ? candidates.filter((id) => id !== last) : candidates;
  const fewest = Math.min(...pool.map((id) => counts[id] ?? 0));
  const best = pool.filter((id) => (counts[id] ?? 0) === fewest);
  const id = best[Math.floor(rng() * best.length)];
  counts[id] = (counts[id] ?? 0) + 1;
  return id;
}

// ---------- Fin de manche : gorgées et points ----------

const add = (map, id, n) => {
  if (n > 0) map[id] = (map[id] ?? 0) + n;
};

/**
 * Résolution d'une manche.
 *  seekerId, savantId ; writers = tous ceux qui ont écrit (ou séché) : le Savant et les Bluffeurs ;
 *  votes : voteur → joueur désigné (le vote du Chercheur est son choix).
 * Renvoie : found, choice, bluffers, spectatorVotes (voteur → cible), voteCounts, trompeurs,
 *  direct (gorgées sans choix), credits (gorgées à distribuer), points.
 */
export function resolveRound({ seekerId, savantId, writers, votes }) {
  const bluffers = writers.filter((id) => id !== savantId);
  const valid = (target) => target && target !== seekerId && writers.includes(target);
  const choice = valid(votes[seekerId]) && votes[seekerId] !== seekerId ? votes[seekerId] : null;
  const found = choice === savantId;

  const spectatorVotes = {};
  for (const [voter, target] of Object.entries(votes)) if (voter !== seekerId && writers.includes(voter) && voter !== target && valid(target)) spectatorVotes[voter] = target;
  const voteCounts = {};
  for (const target of Object.values(spectatorVotes)) voteCounts[target] = (voteCounts[target] ?? 0) + 1;

  const best = Math.max(0, ...bluffers.map((id) => voteCounts[id] ?? 0));
  const trompeurs = best > 0 ? bluffers.filter((id) => voteCounts[id] === best) : [];

  const direct = {};
  const credits = {};
  const points = {};
  if (found) {
    for (const id of bluffers) add(direct, id, 1);
    add(credits, seekerId, 2);
    add(points, seekerId, 2);
  } else {
    add(direct, seekerId, 2);
    add(direct, savantId, 1);
    add(points, savantId, 2);
    // Le Bluffeur désigné à tort est récompensé ; si personne n'a été désigné, personne ne l'est.
    if (choice) {
      add(credits, choice, 2);
      add(points, choice, 2);
    }
  }
  for (const [voter, target] of Object.entries(spectatorVotes)) {
    if (target === savantId) {
      add(credits, voter, 1);
      add(points, voter, 1);
    } else add(points, target, 1); // un spectateur trompé : +1 pour le Bluffeur
  }
  for (const id of trompeurs) add(credits, id, 1);

  return { found, choice, bluffers, spectatorVotes, voteCounts, trompeurs, direct, credits, points };
}

/**
 * Gorgées définitives : les gorgées directes, plus la distribution. Un joueur qui n'a pas réparti son crédit (ou pas en entier)
 * le voit tiré au hasard : jamais de blocage. Personne ne se désigne soi-même ; plafond de SIP_CAP gorgées reçues par joueur.
 * allocations : distributeur → { cible: n }. Renvoie { sips, given } (given : distributeur → { cible: n } réellement donné).
 */
export function settleSips({ direct, credits, allocations = {}, ids, rng = Math.random }) {
  const inGame = new Set(ids);
  const received = { ...direct };
  const given = {};
  for (const [holder, credit] of Object.entries(credits)) {
    if (!inGame.has(holder)) continue;
    const targets = ids.filter((id) => id !== holder);
    if (!targets.length) continue;
    const mine = {};
    let left = credit;
    for (const [target, n] of Object.entries(allocations[holder] ?? {})) {
      if (!inGame.has(target) || target === holder || !Number.isInteger(n) || n <= 0 || left <= 0) continue;
      const k = Math.min(n, left);
      add(mine, target, k);
      left -= k;
    }
    while (left > 0) {
      add(mine, targets[Math.floor(rng() * targets.length)], 1);
      left -= 1;
    }
    given[holder] = mine;
    for (const [target, n] of Object.entries(mine)) add(received, target, n);
  }
  const sips = {};
  for (const [id, n] of Object.entries(received)) if (inGame.has(id)) sips[id] = Math.min(n, SIP_CAP);
  return { sips, given };
}

// ---------- Titres moqueurs du podium ----------

const TITLES = [
  'Le Savant du village',
  'Le menteur le plus crédible',
  'Le détective de comptoir',
  'Le bluffeur qui ne rougit jamais',
  'Quelqu’un qui sait tout, ou presque',
  'Le tricheur au visage d’ange',
];
/** Un titre par joueur du podium : choisi dans l'ordre, au hasard parmi les titres non encore pris. */
export function podiumTitles(ids, rng = Math.random) {
  const pool = shuffle(TITLES, rng);
  return Object.fromEntries(ids.map((id, i) => [id, pool[i % pool.length]]));
}

/** Classement par points (égalités départagées par le nom d'ordre fourni), du meilleur au moins bon. */
export function ranking(points, ids) {
  return [...ids].sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
}
