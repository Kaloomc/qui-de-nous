// Règles de « Patate chaude » : la bombe passe de main en main, le porteur boit quand elle explose.
// Fonctions pures (le hasard et l'heure sont injectés).

export const FUSE_MIN_MS = 15000;
export const FUSE_MAX_MS = 45000;
/** On ne peut pas renvoyer la bombe à quelqu'un qui l'a passée lors des NO_RETURN_PASSES dernières passes. */
export const NO_RETURN_PASSES = 2;
export const BOOM_SIPS = 2;

/** Durée de la mèche, cachée à tout le monde : entre 15 et 45 s. */
export const fuseDuration = (rng = Math.random) => FUSE_MIN_MS + Math.floor(rng() * (FUSE_MAX_MS - FUSE_MIN_MS + 1));

/**
 * Joueurs à qui le porteur peut passer la bombe.
 * À 3 joueurs, bloquer les 2 derniers passeurs ne laisserait personne : on assouplit alors la règle
 * (seulement le dernier passeur, puis personne) pour que la bombe ne reste jamais coincée.
 */
export function allowedTargets(holderId, candidateIds, passes) {
  const others = candidateIds.filter((id) => id !== holderId);
  const recentSenders = passes.slice(-NO_RETURN_PASSES).map((p) => p.from);
  for (const blocked of [recentSenders, recentSenders.slice(-1), []]) {
    const ok = others.filter((id) => !blocked.includes(id));
    if (ok.length) return ok;
  }
  return [];
}

export function startPatate(candidateIds, rng = Math.random) {
  return { holderId: candidateIds[Math.floor(rng() * candidateIds.length)] ?? null, passes: [] };
}

const withPass = (round, to, at, random) => ({
  ...round,
  holderId: to,
  passes: [...round.passes, { from: round.holderId, to, at, random }],
});

/** Le porteur tape un nom. */
export function passBomb(round, from, to, candidateIds, at) {
  if (from !== round.holderId) return { error: 'Tu n’as pas la bombe.' };
  if (to === from) return { error: 'Tu ne peux pas te la passer à toi-même.' };
  if (!allowedTargets(from, candidateIds, round.passes).includes(to)) return { error: 'Tu ne peux pas la renvoyer tout de suite à ce joueur.' };
  return { round: withPass(round, to, at, false) };
}

/** Anti-blocage (porteur trop lent ou parti) : la bombe part au hasard. Renvoie la manche inchangée si personne n'est dispo. */
export function randomPass(round, candidateIds, at, rng = Math.random) {
  const targets = allowedTargets(round.holderId, candidateIds, round.passes);
  if (targets.length === 0) return round;
  return withPass(round, targets[Math.floor(rng() * targets.length)], at, true);
}

/** Explosion : le porteur du moment perd. */
export function explode(round) {
  const last = round.passes.at(-1);
  return { loserId: round.holderId, passCount: round.passes.length, lastFromId: last?.from ?? null, lastWasRandom: !!last?.random };
}

export const sipsPatate = (results) => (results.loserId ? { [results.loserId]: BOOM_SIPS } : {});
