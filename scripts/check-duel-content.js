// Contrôle de tous les contenus des mini-jeux du mode Duel (partie 2) : npm run check-duel-content
import { readFileSync } from 'node:fs';
import { checkChrono, checkGeo, checkQui, checkVf } from '../server/duel/contentCheck.js';
import { checkCulture } from '../server/duel/cultureCheck.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../server/content/${f}`, import.meta.url), 'utf8'));
const files = [
  ['culture-g-duel.json', checkCulture],
  ['vrai-faux-duel.json', checkVf],
  ['qui-suis-je-duel.json', checkQui],
  ['ordre-chrono-duel.json', checkChrono],
  ['villes-geo-duel.json', checkGeo],
];
let failed = 0;
for (const [file, check] of files) {
  const list = read(file);
  const errors = check(list);
  if (errors.length) {
    failed += 1;
    console.error(`✘ ${file}\n  ${errors.slice(0, 15).join('\n  ')}`);
  } else console.log(`✔ ${file} : ${list.length} entrées valides`);
}
process.exit(failed ? 1 : 0);
