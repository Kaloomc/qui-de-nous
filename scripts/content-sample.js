// Échantillon de contenu : 10 exemples tirés au hasard (graine fixe, donc reproductibles) par jeu et par mode, normal et 18+.
//   npm run sample        écrit docs/captures/contenu-echantillon.md
// Sert à relire d'un coup d'œil ce que les joueurs verront vraiment (accords rendus, formes, sources).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../shared/formulation.js';
import { seeded } from '../server/rules/loupSim.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'server', name), 'utf8'));
const LEVEL = { chill: 'chill', epice: 'épicé', hardcore: 'hardcore' };
const CAMILLE = { name: 'Camille', gender: 'f' };
const MEHDI = { name: 'Mehdi', gender: 'm' };

/** 10 entrées au hasard, une graine par jeu et par mode ; on garde chaque niveau représenté quand c'est possible. */
function sample(list, seed, n = 10) {
  const rng = seeded(seed);
  const a = list.map((x, i) => [rng(), x, i]).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
  return a.slice(0, n);
}

const GAMES = [
  { title: 'Qui de nous ?', normal: 'questions.json', adult: 'content/questions-18plus.json', line: (q) => `[${LEVEL[q.niveau]}] ${q.text}${q.cible ? ` (réservée : ${q.cible === 'femme' ? 'femmes' : 'hommes'})` : ''}` },
  { title: 'Tu préfères ?', normal: 'questionsPreferes.json', adult: 'content/preferes-18plus.json', line: (q) => `[${LEVEL[q.niveau]}] ${q.a} **ou** ${q.b}` },
  {
    title: 'Qui me connaît le mieux ?',
    normal: 'content/questions-connait.json',
    adult: 'content/connait-18plus.json',
    line: (q, i) => {
      const who = i % 2 ? MEHDI : CAMILLE;
      const r = (t) => render(t, { cible: who });
      return `[${LEVEL[q.niveau]}] (cible : ${who.name}) ${r(q.question)} — ${q.choix.map(r).join(' / ')}`;
    },
  },
  { title: 'Estimation', normal: 'content/questions-estimation.json', line: (q) => `${q.question} → ${q.reponse} ${q.unite}${q.source ? ` ([source](${q.source}))` : ''}` },
  { title: 'L’Imposteur', normal: 'content/words-imposteur.json', adult: 'content/imposteur-18plus.json', line: (q) => `${q.mot} / ${q.proche} (${q.categorie})` },
  { title: 'La Roue', normal: 'content/defis-roue.json', adult: 'content/roue-18plus.json', line: (q) => `[${LEVEL[q.niveau]}, ${q.type}${q.genre ? `, ${q.genre}` : ''}] ${q.texte}` },
  { title: 'Noir Boire Mangue — phrases', normal: 'content/phrases-nbm.json', adult: 'content/phrases-nbm-18plus.json', line: (q) => `[${LEVEL[q.niveau]}, ${q.forme}] ${q.texte}` },
  { title: 'Noir Boire Mangue — cartes', normal: 'content/cartes-nbm.json', adult: 'content/cartes-nbm-18plus.json', line: (c) => `${c.texte} (${c.forme})` },
];

const out = ['# Échantillon de contenu', '', 'Dix exemples tirés au hasard (graine fixe) par jeu et par mode. Généré par `npm run sample` (scripts/content-sample.js).', ''];
let seed = 1;
for (const g of GAMES) {
  out.push(`## ${g.title}`, '');
  for (const [mode, file] of [['Normal', g.normal], ['18+', g.adult]]) {
    if (!file) continue;
    out.push(`### ${mode}`, '');
    sample(read(file), (seed += 1)).forEach((q, i) => out.push(`${i + 1}. ${g.line(q, i)}`));
    out.push('');
  }
}
const facts = read('content/facts-savant.json');
out.push('## Le Savant', '', '### Normal (pas de mode 18+)', '');
sample(facts, 99).forEach((f, i) => out.push(`${i + 1}. ${f.question} → **${f.reponse}** (${f.categorie}, [source](${f.source}))`));
out.push('');
const feu = read('content/words-feu.json');
out.push('## Réflexes', '', '### Normal (pas de mode 18+)', '', `Mots pièges : ${sample(feu.pieges, 77).join(', ')}.`, '', `Mots neutres : ${sample(feu.neutres, 78).join(', ')}.`, '');

const target = path.join(root, 'docs', 'captures', 'contenu-echantillon.md');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${out.join('\n')}\n`);
console.log(`écrit ${path.relative(root, target)}`);
