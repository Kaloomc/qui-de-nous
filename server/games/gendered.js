// Tirage d'une question (« Qui de nous ? », « Qui me connaît le mieux ? ») avec le mélange de questions réservées à un genre.
import { chooseKind, cibleOf, genderCounts, newMix, recordKind } from '../rules/gendered.js';

/**
 * Tire une question de `normal` (ou de `adult` si le mode 18+ est actif) selon les genres des joueurs de la manche.
 * Chaque sorte de question (tous / hommes / femmes) a son propre historique anti-répétition.
 */
export function drawGendered(game, normal, adult) {
  const { key, list } = game.contentPool(normal, adult);
  const players = game.connectedPlayers();
  const mix = ((game.questionMix ??= new Map()).get(key) ?? (game.questionMix.set(key, newMix()), game.questionMix.get(key)));
  let kind = chooseKind(mix, genderCounts(players));
  let pool = list.filter((q) => cibleOf(q) === kind);
  if (!pool.length) {
    kind = 'tous';
    pool = list.filter((q) => cibleOf(q) === 'tous');
  }
  if (!pool.length) pool = list; // aucune question « tous » : on prend ce qu'il y a
  recordKind(mix, kind);
  return game.history.draw(kind === 'tous' ? key : `${key}:${kind}`, pool);
}
