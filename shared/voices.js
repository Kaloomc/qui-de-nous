// Voix enregistrées de « Réflexes » (générées une fois par scripts/voices.js, servies depuis client/public/voix/).
// Partagé par le script de génération et la TV : un mot → un nom de fichier.

export const VOICE_DIR = '/voix';
/** Phrases dites par la TV en plus des mots de la liste. */
export const VOICE_EXTRAS = ['FEU', 'PRÊTS ?'];

/** Nom de fichier d'un mot ou d'une phrase : minuscules, sans accents ni ponctuation (« ŒUF » → oeuf.mp3, « Feu ! » → feu.mp3). */
export function voiceFile(text) {
  return `${text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.mp3`;
}
