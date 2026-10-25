// Étapes d'une manche à plusieurs temps (Savant, Noir Boire Mangue…) : une manche du moteur commun = plusieurs étapes enchaînées.
// Chaque étape a un identifiant unique (`phaseId`, jamais réutilisé) et un minuteur `g:phase`, annulé au même endroit que ceux
// des autres jeux (nextQuestion / reveal / reset) ; la suite ne s'exécute que si l'étape est toujours la courante.

const data = (game) => game.roundData;

/**
 * Passe à une nouvelle étape : identifiant unique, `next` ne s'exécute que si l'étape est toujours la courante.
 * `ms` : durée de l'étape (minuteur gelé pendant la pause) ; `soon()` l'écourte quand tout le monde a agi.
 */
export function go(game, step, ms, next, extra = {}) {
  const d = data(game);
  d.seq += 1;
  Object.assign(d, { step, phaseId: `${game.roundId}:${d.seq}`, advance: next, soonFor: null, startedAt: game.clock.now(), ...extra });
  const id = d.phaseId;
  game.cancel('g:phase');
  game.cancel('g:soon');
  game.schedulePausable('g:phase', ms, () => data(game).phaseId === id && next());
}

/** Termine l'étape courante dans `ms` (une seule fois par étape). */
export function soon(game, ms) {
  const d = data(game);
  if (d.soonFor === d.phaseId) return;
  d.soonFor = d.phaseId;
  const id = d.phaseId;
  const next = d.advance;
  game.schedulePausable('g:soon', ms, () => data(game).phaseId === id && next());
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
