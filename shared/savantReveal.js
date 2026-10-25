// Déroulé de la révélation du Savant sur la TV (partagé : le serveur en tire la durée de la phase `revealing`,
// l'écran en tire les étapes). Chaque étape remplace la précédente ; à la fin, les résultats restent affichés.
export const REVEAL_STAGES = [
  ['attention', 1500], // « Attention… »
  ['savant', 3000], // bandeau plein écran « LE SAVANT ÉTAIT [photo, prénom] »
  ['truth', 3500], // la vraie réponse dans un cadre doré, avec son explication ; couronne, loupe et votes sur les cartes
  ['verdict', 2000], // « DÉMASQUÉ ! » ou « PASSÉ INAPERÇU ! » en plein écran
];
export const REVEAL_MS = REVEAL_STAGES.reduce((total, [, ms]) => total + ms, 0);

/** Étape affichée `elapsed` ms après le début de la révélation (la dernière une fois le temps écoulé). */
export function stageAt(elapsed) {
  let end = 0;
  for (const [name, ms] of REVEAL_STAGES) {
    end += ms;
    if (elapsed < end) return name;
  }
  return REVEAL_STAGES.at(-1)[0];
}
