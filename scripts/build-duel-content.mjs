// Assemble les contenus des mini-jeux de la partie 2 du mode Duel à partir des lots de lignes (scripts/*-rows-N.mjs, scripts/chrono-pool.mjs) :
//   server/content/vrai-faux-duel.json, ordre-chrono-duel.json, qui-suis-je-duel.json
// Lancer : node scripts/build-duel-content.mjs   puis   npm run check-duel-content
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rngOf } from '../shared/runner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (name, data) => writeFileSync(path.join(here, '../server/content', name), `${JSON.stringify(data, null, 1)}\n`);
const rowsOf = async (prefix) => {
  const files = readdirSync(here).filter((f) => new RegExp(`^${prefix}-rows-\\d+\\.mjs$`).test(f)).sort();
  const rows = [];
  for (const f of files) rows.push(...(await import(pathToFileURL(path.join(here, f)).href)).default);
  return rows;
};

// Vrai ou Faux : { id, texte, vrai, explication, source }
const vf = (await rowsOf('vf')).map(([texte, vrai, explication, source], i) => ({ id: `vf${String(i + 1).padStart(3, '0')}`, texte, vrai, explication, source }));
out('vrai-faux-duel.json', vf);

// Qui suis-je ? : { id, indices: [4], choix: [4], bonne, categorie, source } ; la bonne réponse change de place de façon déterministe.
const qui = (await rowsOf('qui')).map(([indices, [right, ...wrong], categorie, source], i) => {
  const bonne = (i * 5 + 1) % 4;
  const w = [...wrong];
  const choix = Array.from({ length: 4 }, (_, k) => (k === bonne ? right : w.shift()));
  return { id: `qs${String(i + 1).padStart(3, '0')}`, indices, choix, bonne, categorie, source };
});
out('qui-suis-je-duel.json', qui);

// Ordre chronologique : séries de 5 événements tirées d'un fonds daté, écarts d'au moins 8 ans, sans doublon.
const pool = (await import(pathToFileURL(path.join(here, 'chrono-pool.mjs')).href)).default;
const rng = rngOf(2024);
const GAP = 8;
const SERIES = 60;
const seen = new Set();
const series = [];
const used = new Map();
for (let attempt = 0; attempt < 200000 && series.length < SERIES; attempt++) {
  const picks = [];
  const bag = [...pool].sort(() => rng() - 0.5);
  for (const e of bag) {
    if (picks.length === 5) break;
    if (picks.every((p) => Math.abs(p[0] - e[0]) >= GAP) && (used.get(e[1]) ?? 0) < 6) picks.push(e);
  }
  if (picks.length < 5) continue;
  const key = picks.map((p) => p[1]).sort().join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  for (const p of picks) used.set(p[1], (used.get(p[1]) ?? 0) + 1);
  const cats = [...new Set(picks.map((p) => p[2]))];
  series.push({ id: `oc${String(series.length + 1).padStart(3, '0')}`, evenements: picks.map(([annee, texte]) => ({ texte, annee })), categorie: cats.length === 1 ? cats[0] : 'mélange', source: [...new Set(picks.map((p) => p[3]))].join(' ; ') });
}
out('ordre-chrono-duel.json', series);
console.log(`vrai-faux : ${vf.length} (${vf.filter((x) => x.vrai).length} vraies) · qui suis-je : ${qui.length} · ordre chrono : ${series.length} séries (${pool.length} événements)`);
