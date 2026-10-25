// Questions réservées à un genre (champ `cible` : "homme", "femme" ou "tous", "tous" par défaut). Fonctions pures, testées.
// - Les candidats d'une question réservée sont les joueurs de ce genre ; ceux qui préfèrent ne pas dire ne sont jamais candidats
//   (ils votent normalement, ou devinent normalement).
// - Moins de MIN_CANDIDATES candidats : la question est sautée et une autre est tirée ; un genre absent du groupe n'est jamais tiré.
// - Environ 15 à 20 % des tirages sont des questions réservées, réparties équitablement entre hommes et femmes, jamais plus de
//   MAX_RUN de suite.
import { CIBLES, TARGET_GENDER } from '../../shared/formulation.js';

export const MIN_CANDIDATES = 3;
export const SHARE_MIN = 0.15;
export const SHARE_MAX = 0.2;
export const MAX_RUN = 2;

export const cibleOf = (question) => (CIBLES.includes(question?.cible) ? question.cible : 'tous');
export const isReserved = (question) => cibleOf(question) !== 'tous';

/** Identifiants des joueurs candidats pour cette `cible` (tous les joueurs si elle est « tous »). */
export function candidatesFor(players, cible) {
  if (!TARGET_GENDER[cible]) return players.map((p) => p.id);
  return players.filter((p) => p.gender === TARGET_GENDER[cible]).map((p) => p.id);
}

/** Nombre de candidats possibles pour chaque genre. */
export function genderCounts(players) {
  return { homme: candidatesFor(players, 'homme').length, femme: candidatesFor(players, 'femme').length };
}

export const newMix = () => ({ drawn: 0, reserved: 0, run: 0, byCible: { homme: 0, femme: 0 } });

/**
 * Quelle sorte de question tirer maintenant : "tous", "homme" ou "femme".
 * `counts` : candidats par genre (genderCounts). Rattrape vers 15 % quand on est en dessous, s'arrête au-delà de 20 %.
 */
export function chooseKind(mix, counts, rng = Math.random) {
  const open = ['homme', 'femme'].filter((c) => counts[c] >= MIN_CANDIDATES);
  if (!open.length || mix.run >= MAX_RUN) return 'tous';
  const share = mix.drawn ? mix.reserved / mix.drawn : 0;
  const chance = share < SHARE_MIN ? 0.5 : share > SHARE_MAX ? 0 : 0.17;
  if (rng() >= chance) return 'tous';
  // Équité entre les genres : celui qui a eu le moins de questions réservées, au hasard entre ex æquo.
  const least = Math.min(...open.map((c) => mix.byCible[c]));
  const pool = open.filter((c) => mix.byCible[c] === least);
  return pool[Math.floor(rng() * pool.length)];
}

export function recordKind(mix, kind) {
  mix.drawn += 1;
  if (kind === 'tous') mix.run = 0;
  else {
    mix.reserved += 1;
    mix.run += 1;
    mix.byCible[kind] += 1;
  }
}
