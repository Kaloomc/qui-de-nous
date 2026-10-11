// Couleurs des joueurs, sans dépendance (utilisées aussi par l'image du récap, testée sous Node).
const PALETTE = [
  '#ff4f8b', '#ffc93c', '#3ee0c5', '#6c8bff', '#ff8a3d', '#b46cff', '#7ee05a', '#ff5a5a', '#3cc3ff', '#f78fd6',
  '#d4e157', '#26a69a', '#ffab91', '#9575cd', '#4dd0e1', '#ffd54f', '#e57373', '#81c784', '#64b5f6', '#ba68c8',
];

export const colorFor = (index) => PALETTE[index % PALETTE.length];

/** Couleur fixe d'un joueur sans photo, d'après son prénom. */
export function avatarColor(name = '?') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colorFor(h);
}
