// Règles de « Qui me connaît le mieux ? » : la cible répond pour elle, les autres devinent. Fonctions pures.

export const CHOICES = ['a', 'b', 'c', 'd'];

/** Cible du tour : chaque joueur connecté à tour de rôle (dans l'ordre d'arrivée). */
export function pickTarget(playerIds, round) {
  if (playerIds.length === 0) return null;
  return playerIds[(round - 1) % playerIds.length];
}

/**
 * votes : Map joueur → 'a' | 'b' | 'c' | 'd' (celui de la cible = sa vraie réponse).
 * Ceux qui se trompent (ou ne répondent pas) boivent. Personne n'a trouvé : la cible boit aussi.
 * Tout le monde a trouvé : la cible boit (« trop prévisible »). Si la cible n'a pas répondu, elle seule boit.
 */
export function computeConnait(playerIds, votes, targetId) {
  const answer = CHOICES.includes(votes.get(targetId)) ? votes.get(targetId) : null;
  const guessers = playerIds.filter((id) => id !== targetId);
  const choices = {};
  for (const id of playerIds) if (CHOICES.includes(votes.get(id))) choices[id] = votes.get(id);

  if (!answer) {
    return { targetId, answer: null, choices, correctIds: [], wrongIds: [], nonVoterIds: [], targetDrinks: true, reason: 'noAnswer' };
  }
  const correctIds = guessers.filter((id) => choices[id] === answer);
  const nonVoterIds = guessers.filter((id) => !choices[id]);
  const wrongIds = guessers.filter((id) => choices[id] && choices[id] !== answer);
  let reason = null;
  if (guessers.length > 0 && correctIds.length === 0) reason = 'nobody';
  else if (guessers.length > 0 && correctIds.length === guessers.length) reason = 'everyone';
  return { targetId, answer, choices, correctIds, wrongIds, nonVoterIds, targetDrinks: reason !== null, reason };
}

export function sipsConnait(results) {
  const sips = {};
  for (const id of [...results.wrongIds, ...results.nonVoterIds]) sips[id] = (sips[id] ?? 0) + 1;
  if (results.targetDrinks) sips[results.targetId] = (sips[results.targetId] ?? 0) + 1;
  return sips;
}

/** Statistiques « qui connaît le mieux le groupe » : bonnes réponses / tentatives en tant que devineur. */
export function updateConnaitStats(stats, results) {
  if (!results.answer) return;
  for (const id of [...results.correctIds, ...results.wrongIds, ...results.nonVoterIds]) {
    const s = stats[id];
    if (!s) continue;
    s.guesses = (s.guesses ?? 0) + 1;
    if (results.correctIds.includes(id)) s.correct = (s.correct ?? 0) + 1;
  }
}
