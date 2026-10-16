import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Lit un fichier JSON relatif au dossier server/games/ ; s'il est mal formé, message clair au lieu d'une pile d'erreur. */
export function loadJson(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch (err) {
    console.error(`\nFichier de contenu illisible : ${fileURLToPath(url)}\n  ${err.message}\n  Corrige-le (virgule ou guillemet en trop ?) puis relance ; npm test indique l'entrée fautive.\n`);
    process.exit(1);
  }
}
