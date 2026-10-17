// Vote du téléphone pour la manche en cours (pur, testé sous Node : server/gameswitch.test.js).

/**
 * Identifiant de la manche affichée, auquel le vote local est rattaché : l'identifiant unique du serveur,
 * jamais réutilisé dans la partie. (Le numéro de manche repart à 1 à chaque jeu : la manche 1 d'un nouveau jeu
 * passait pour déjà votée, d'où l'écran « vote enregistré » sans avoir voté.)
 */
export const roundKey = (state) => state?.roundId ?? null;

/** Vote local encore valable pour la manche affichée, sinon null (écran de vote). */
export const currentVoteOf = (myVote, state) => (myVote && myVote.round != null && myVote.round === roundKey(state) ? myVote : null);
