// Contrôle des faits du Savant (server/content/facts-savant.json) : format, doublons, sources, volume minimal.
//   npm run check-facts          (le test automatique server/facts-savant.test.js s'appuie sur la même fonction)
// Un fait = une question avec un seul trou « ___ », une réponse courte (1 à 5 mots), une explication d'une phrase,
// une catégorie connue et l'URL d'une source fiable qui confirme le fait.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = ['animaux', 'sciences', 'histoire', 'pays et voyages', 'bouffe', 'technologie', 'sport', 'culture pop', 'corps humain', 'insolite'];
export const MIN_FACTS = 150;
export const MIN_PER_CATEGORY = 8;

const normalize = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const words = (text) => normalize(text).split(' ').filter(Boolean);

/** Part de mots communs entre deux textes (0 à 1) : repère les quasi-doublons. */
function overlap(a, b) {
  const x = new Set(words(a));
  const y = new Set(words(b));
  let common = 0;
  for (const w of x) if (y.has(w)) common += 1;
  return common / Math.max(1, Math.min(x.size, y.size));
}

/** Renvoie la liste des problèmes (vide = tout est bon). */
export function checkFacts(list) {
  const problems = [];
  if (!Array.isArray(list)) return ['le fichier doit contenir une liste de faits'];
  const ids = new Set();
  const questions = new Map();
  const perCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  list.forEach((fact, i) => {
    const where = `fait ${i + 1}${fact?.id ? ` (${fact.id})` : ''}`;
    const bad = (msg) => problems.push(`${where} : ${msg}`);
    if (!fact || typeof fact !== 'object') return bad('entrée invalide');
    for (const key of ['id', 'question', 'reponse', 'explication', 'categorie', 'source']) {
      if (typeof fact[key] !== 'string' || !fact[key].trim()) bad(`champ « ${key} » manquant`);
    }
    if (problems.length && typeof fact.question !== 'string') return;
    if (ids.has(fact.id)) bad('identifiant en double');
    ids.add(fact.id);
    if (typeof fact.question === 'string') {
      const holes = fact.question.split('___').length - 1;
      if (holes !== 1) bad(`la question doit contenir un seul trou « ___ » (${holes} trouvé${holes > 1 ? 's' : ''})`);
      if (/\s{2,}/.test(fact.question) || fact.question !== fact.question.trim()) bad('espaces en trop dans la question');
      if (fact.question.length > 220) bad('question trop longue');
      const key = normalize(fact.question);
      if (questions.has(key)) bad(`question en double de « ${questions.get(key)} »`);
      questions.set(key, fact.id);
    }
    if (typeof fact.reponse === 'string') {
      const n = words(fact.reponse).length;
      if (n < 1 || n > 5) bad(`la réponse doit faire 1 à 5 mots (${n})`);
      if (/^\s|\s$|\s{2,}/.test(fact.reponse)) bad('espaces en trop dans la réponse');
      // La réponse ne doit pas déjà figurer dans la question.
      if (typeof fact.question === 'string' && normalize(fact.reponse).length > 3 && ` ${normalize(fact.question)} `.includes(` ${normalize(fact.reponse)} `)) bad('la réponse apparaît dans la question');
    }
    if (typeof fact.explication === 'string') {
      if (fact.explication.length < 25 || fact.explication.length > 260) bad('explication : une phrase de 25 à 260 caractères');
      if (!/[.!?]$/.test(fact.explication)) bad('explication : doit se terminer par un point');
    }
    if (!CATEGORIES.includes(fact.categorie)) bad(`catégorie inconnue « ${fact.categorie} »`);
    else perCategory[fact.categorie] += 1;
    try {
      const url = new URL(fact.source);
      if (url.protocol !== 'https:' || !url.hostname.includes('.')) bad('source : URL https attendue');
    } catch {
      bad('source : URL invalide');
    }
  });
  // Quasi-doublons : deux questions qui se ressemblent trop.
  const entries = [...questions];
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) if (overlap(entries[i][0], entries[j][0]) > 0.85) problems.push(`quasi-doublon : ${entries[i][1]} et ${entries[j][1]}`);
  if (list.length < MIN_FACTS) problems.push(`${list.length} faits : il en faut au moins ${MIN_FACTS}`);
  for (const [category, n] of Object.entries(perCategory)) if (n < MIN_PER_CATEGORY) problems.push(`catégorie « ${category} » : ${n} fait(s), au moins ${MIN_PER_CATEGORY} attendus`);
  return problems;
}

export const FACTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/content/facts-savant.json');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const list = JSON.parse(fs.readFileSync(FACTS_FILE, 'utf8'));
  const problems = checkFacts(list);
  const perCategory = {};
  for (const f of list) perCategory[f.categorie] = (perCategory[f.categorie] ?? 0) + 1;
  console.log(`${list.length} faits :`, perCategory);
  if (problems.length) {
    console.error(`\n${problems.length} problème(s) :\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Tout est bon.');
}
