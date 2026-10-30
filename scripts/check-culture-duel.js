// Contrôle de server/content/culture-g-duel.json : format, volume (150 au moins), doublons, sources. Lancer : npm run check-culture
import { readFileSync } from 'node:fs';
import { checkCulture } from '../server/duel/cultureCheck.js';

const list = JSON.parse(readFileSync(new URL('../server/content/culture-g-duel.json', import.meta.url), 'utf8'));
const errors = checkCulture(list);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const sources = new Set(list.map((q) => q.source));
console.log(`${list.length} questions, ${sources.size} sources distinctes : contenu valide.`);
