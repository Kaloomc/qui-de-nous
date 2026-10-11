// Délais du moteur, dans un module à part pour que les jeux puissent les lire sans import circulaire.
export const TIMING = {
  /** Petit délai après le dernier vote, pour que la TV affiche « N / N » avant de révéler. */
  autoRevealDelayMs: 1200,
  /** Un joueur déconnecté est encore attendu pendant ce délai (rechargement de page, réseau qui saute). */
  disconnectGraceMs: 5000,
  /** Moins de 2 joueurs connectés quand un minuteur expire : on réessaie après ce délai. */
  retryMs: 5000,
};
