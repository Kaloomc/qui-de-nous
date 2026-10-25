// Contrôle du contenu de Noir Boire Mangue : structure des phrases (place du trou, « texte : ___ »), forme des phrases et des cartes,
// mains compatibles. `npm run check-nbm` affiche les mesures ; server/nbm-content.test.js échoue si une règle n'est plus respectée.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMES, compatible, dealHands, MIN_COMPATIBLE, HAND_SIZE, blanksIn } from '../server/rules/nbm.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'content');
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
export const FILES = {
  normal: { phrases: 'phrases-nbm.json', cartes: 'cartes-nbm.json' },
  adulte: { phrases: 'phrases-nbm-18plus.json', cartes: 'cartes-nbm-18plus.json' },
};

/** Répartition visée de la place du trou (début / milieu / fin) et marge acceptée, en points de pourcentage. */
export const TARGET = { debut: 25, milieu: 40, fin: 35 };
export const TOLERANCE = 9;
export const MAX_COLON_SHARE = 5; // « texte : ___ » : 5 % des phrases au plus

/** Début : le trou ouvre la phrase (ou une citation). Fin : il n'y a plus que de la ponctuation derrière. Sinon : milieu. */
export function holePosition(text) {
  const i = text.indexOf('___');
  if (i <= 2 || /^«\s*___/.test(text)) return 'debut';
  return text.slice(i + 3).replace(/[\s.!?«»"”’]/g, '') === '' ? 'fin' : 'milieu';
}
export const isColonForm = (text) => /:\s*(«\s*)?___/.test(text);

/** Mots qui précèdent le trou et ne vont pas avec la forme : « de un pigeon », « de aller », « à le chien »… */
const BEFORE_GN = ['de', 'd’', 'du', 'des', 'à', 'au', 'aux', 'en', 'l’'];
const BEFORE_INF = ['de', 'd’'];
export function badNeighbour(phrase) {
  const before = phrase.texte.slice(0, phrase.texte.indexOf('___')).trimEnd();
  const last = before.split(/\s+/).pop()?.replace(/^[«“"]/, '').toLowerCase() ?? '';
  if (phrase.forme === 'groupe_nominal' && BEFORE_GN.includes(last)) return last;
  if (phrase.forme === 'infinitif' && BEFORE_INF.includes(last)) return last;
  return null;
}

/** Mesures et problèmes d'une liste de phrases. */
export function analysePhrases(list) {
  const counts = { debut: 0, milieu: 0, fin: 0 };
  const problems = [];
  let colon = 0;
  const formes = Object.fromEntries(FORMES.map((f) => [f, 0]));
  for (const p of list) {
    if (blanksIn(p.texte) !== 1) { problems.push(`il faut un seul trou : ${p.texte}`); continue; }
    if (!FORMES.includes(p.forme)) problems.push(`forme manquante ou inconnue (${p.forme}) : ${p.texte}`);
    else formes[p.forme] += 1;
    counts[holePosition(p.texte)] += 1;
    if (isColonForm(p.texte)) colon += 1;
    const bad = badNeighbour(p);
    if (bad) problems.push(`« ${bad} » juste avant le trou (${p.forme}) : ${p.texte}`);
  }
  const share = (n) => (list.length ? (100 * n) / list.length : 0);
  const percent = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, Math.round(share(n))]));
  for (const [k, v] of Object.entries(TARGET)) {
    if (Math.abs(share(counts[k]) - v) > TOLERANCE) problems.push(`trou en ${k} : ${percent[k]} % (visé ${v} % ± ${TOLERANCE})`);
  }
  if (share(colon) > MAX_COLON_SHARE) problems.push(`« texte : ___ » : ${colon} phrases, soit ${Math.round(share(colon))} % (au plus ${MAX_COLON_SHARE} %)`);
  return { total: list.length, counts, percent, colon, formes, problems };
}

export function analyseCards(list) {
  const formes = Object.fromEntries(FORMES.map((f) => [f, 0]));
  const problems = [];
  for (const c of list) {
    if (typeof c.texte !== 'string' || !c.texte.trim()) { problems.push(`carte vide : ${JSON.stringify(c)}`); continue; }
    if (c.texte.includes('___')) problems.push(`trou dans une carte : ${c.texte}`);
    if (!FORMES.includes(c.forme)) problems.push(`forme manquante ou inconnue (${c.forme}) : ${c.texte}`);
    else formes[c.forme] += 1;
  }
  return { total: list.length, formes, problems };
}

/** Joue 8 manches pour 3 à 30 joueurs avec le vrai contenu : chaque main de chaque phrase doit contenir au moins MIN_COMPATIBLE cartes qui vont. */
export function checkHands(phrases, cards, rng = Math.random) {
  const problems = [];
  const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
  for (const players of [3, 8, 12, 20, 30]) {
    const seen = new Set();
    for (let round = 0; round < 8; round++) {
      const phrase = phrases[Math.floor(rng() * phrases.length)];
      const hands = dealHands(ids(players), cards, seen, rng, phrase.forme);
      const byText = new Map(cards.map((c) => [c.texte, c]));
      for (const [id, hand] of Object.entries(hands)) {
        const fits = hand.filter((t) => compatible(phrase.forme, byText.get(t).forme)).length;
        if (hand.length !== HAND_SIZE || new Set(hand).size !== HAND_SIZE) problems.push(`main incomplète (${players} joueurs) : ${hand}`);
        if (fits < MIN_COMPATIBLE) problems.push(`${players} joueurs, ${id} : ${fits} carte(s) compatible(s) seulement pour « ${phrase.texte} »`);
      }
    }
  }
  return problems;
}

export function report() {
  const out = [];
  let bad = 0;
  for (const [mode, f] of Object.entries(FILES)) {
    const phrases = read(f.phrases);
    const cards = read(f.cartes);
    const a = analysePhrases(phrases);
    const c = analyseCards(cards);
    const h = checkHands(phrases, cards);
    out.push(`== ${mode} : ${a.total} phrases, ${c.total} cartes`);
    out.push(`   trou : début ${a.percent.debut} % / milieu ${a.percent.milieu} % / fin ${a.percent.fin} % (visé ${TARGET.debut} / ${TARGET.milieu} / ${TARGET.fin})`);
    out.push(`   « texte : ___ » : ${a.colon} (${((100 * a.colon) / a.total).toFixed(1)} %, au plus ${MAX_COLON_SHARE} %)`);
    out.push(`   formes des phrases : ${JSON.stringify(a.formes)} ; des cartes : ${JSON.stringify(c.formes)}`);
    for (const p of [...a.problems, ...c.problems, ...h]) { out.push(`   ⚠ ${p}`); bad += 1; }
  }
  return { text: out.join('\n'), bad };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { text, bad } = report();
  console.log(text);
  console.log(bad ? `\n${bad} problème(s).` : '\nTout est bon.');
  process.exit(bad ? 1 : 0);
}
