// Assemble server/content/culture-g-duel.json à partir des lots scripts/culture-rows-*.mjs.
// Chaque ligne : [question, bonne réponse, 3 mauvaises, catégorie, source]. La bonne réponse change de position de façon déterministe.
// Lancer : node scripts/build-culture-duel.mjs
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => /^culture-rows-\d+\.mjs$/.test(f)).sort();
const out = [];
let n = 0;
for (const f of files) {
  const rows = (await import(pathToFileURL(path.join(here, f)).href)).default;
  for (const [question, right, w1, w2, w3, categorie, source] of rows) {
    n += 1;
    const bonne = (n * 7 + 3) % 4;
    const wrong = [w1, w2, w3];
    const choix = [];
    for (let i = 0; i < 4; i++) choix.push(i === bonne ? right : wrong.shift());
    out.push({ id: `cg${String(n).padStart(3, '0')}`, question, choix, bonne, categorie, source });
  }
}
writeFileSync(path.join(here, '../server/content/culture-g-duel.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.length} questions écrites.`);
