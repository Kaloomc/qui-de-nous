import { readFileSync } from 'node:fs';

/** Lit un fichier JSON relatif au dossier server/games/. */
export const loadJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
