// Couleurs des joueurs, sans dépendance (utilisées aussi par l'image du récap, testée sous Node).
const PALETTE = [
  '#ff4f8b', '#ffc93c', '#3ee0c5', '#6c8bff', '#ff8a3d', '#b46cff', '#7ee05a', '#ff5a5a', '#3cc3ff', '#f78fd6',
  '#d4e157', '#26a69a', '#ffab91', '#9575cd', '#4dd0e1', '#ffd54f', '#e57373', '#81c784', '#64b5f6', '#ba68c8',
];

/** Mode 18+ : rouges, roses et gris, alternés pour que deux parts voisines du camembert restent distinctes. */
const ADULT_PALETTE = ['#e3173a', '#9a9499', '#ff8a96', '#5c585e', '#b3122a', '#d9d4d6', '#7a0a1e', '#ffc2c8', '#3f3b3e', '#ff4d5e'];

export const colorFor = (index, adult = false) => (adult ? ADULT_PALETTE[index % ADULT_PALETTE.length] : PALETTE[index % PALETTE.length]);

/** Couleur fixe d'un joueur sans photo, d'après son prénom. */
export function avatarColor(name = '?') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colorFor(h);
}

/** Encre lisible (sombre ou claire) sur une pastille de couleur : contraste d'au moins 4,5 sur toute la palette. */
export function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.0627 > 1.05 / (lum + 0.05) ? '#1b1530' : '#ffffff'; // encre sombre (luminance ≈ 0,0127) ou blanche : la meilleure des deux
}
