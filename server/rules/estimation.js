// Règles d'« Estimation » : la réponse est un nombre, le plus éloigné boit. Fonctions pures.

const add = (sips, id, n = 1) => {
  sips[id] = (sips[id] ?? 0) + n;
};

export const isValidEstimate = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;

/**
 * guesses : Map joueur → nombre. Le plus éloigné boit (tous les ex æquo), les non-votants aussi.
 * Si tous les écarts sont égaux (ou un seul joueur a répondu), personne n'est « le plus loin ».
 * Un plus proche unique (chooserId) peut désigner quelqu'un qui boit avec le plus loin.
 */
export function computeEstimation(playerIds, guesses, answer) {
  const values = {};
  const distances = {};
  for (const id of playerIds) {
    const value = guesses.get(id);
    if (isValidEstimate(value)) {
      values[id] = value;
      distances[id] = Math.abs(value - answer);
    }
  }
  const guessers = Object.keys(distances);
  const nonVoterIds = playerIds.filter((id) => !(id in distances));
  let closestIds = [];
  let furthestIds = [];
  if (guessers.length > 0) {
    const min = Math.min(...guessers.map((id) => distances[id]));
    const max = Math.max(...guessers.map((id) => distances[id]));
    closestIds = guessers.filter((id) => distances[id] === min);
    if (max > min) furthestIds = guessers.filter((id) => distances[id] === max);
  }
  return {
    answer,
    values,
    distances,
    closestIds,
    furthestIds,
    exactIds: guessers.filter((id) => distances[id] === 0),
    nonVoterIds,
    chooserId: closestIds.length === 1 ? closestIds[0] : null,
    chosenId: null,
  };
}

/** Le plus proche désigne quelqu'un (pas lui-même) qui boit avec le plus loin. */
export function applyEstimationPick(results, chooserId, targetId, playerIds) {
  if (results.chooserId !== chooserId) return { error: 'Ce n’est pas à toi de choisir.' };
  if (targetId === chooserId || !playerIds.includes(targetId)) return { error: 'Choix invalide.' };
  return { results: { ...results, chosenId: targetId } };
}

export function sipsEstimation(results) {
  const sips = {};
  for (const id of results.furthestIds) add(sips, id);
  for (const id of results.nonVoterIds) add(sips, id);
  if (results.chosenId) add(sips, results.chosenId);
  return sips;
}
