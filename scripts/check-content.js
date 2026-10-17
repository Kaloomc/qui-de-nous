// Vérifie les fichiers de contenu des jeux : nombre d'entrées, doublons et quasi-doublons.
// Usage : node scripts/check-content.js   (code de sortie 1 s'il reste des doublons)
// Comparaison sur du texte normalisé : minuscules, sans accents, sans ponctuation, sans petits mots.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../server/', import.meta.url);
const load = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

export const normalize = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const STOPWORDS = new Set(
  'qui est le plus susceptible de d l la les du des un une a au aux et ou en ton ta tes son sa ses se s ce c que qu pour par sur dans avec sans il elle on y ne pas n tu te t j je m me mon ma mes nom'.split(' '),
);
const tokens = (s) => new Set(normalize(s).split(' ').filter((w) => w && !STOPWORDS.has(w)));

function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

/** Seuil de quasi-doublon (mots en commun / mots au total). */
export const NEAR_THRESHOLD = 0.75;

/**
 * Contenus des jeux. `key` : texte comparé pour les doublons exacts ; `near` : texte comparé pour les quasi-doublons
 * (absent : pas de recherche de quasi-doublons, par exemple pour des mots isolés).
 */
export const CONTENT = [
  {
    id: 'qui-de-nous',
    file: 'questions.json',
    target: 400,
    entries: (d) => d,
    key: (q) => normalize(q.text),
    near: (q) => q.text,
  },
  {
    id: 'tu-preferes',
    file: 'questionsPreferes.json',
    target: 400,
    entries: (d) => d,
    // A/B et B/A sont le même dilemme.
    key: (q) => [normalize(q.a), normalize(q.b)].sort().join(' | '),
    near: (q) => `${q.a} ${q.b}`,
  },
  {
    id: 'qui-me-connait',
    file: 'content/questions-connait.json',
    target: 250,
    entries: (d) => d,
    key: (q) => normalize(q.question),
    near: (q) => q.question,
  },
  {
    id: 'estimation',
    file: 'content/questions-estimation.json',
    target: 250,
    entries: (d) => d,
    key: (q) => normalize(q.question),
    near: (q) => q.question,
  },
  {
    id: 'imposteur',
    file: 'content/words-imposteur.json',
    target: 200,
    entries: (d) => d,
    key: (p) => [normalize(p.mot), normalize(p.proche)].sort().join(' | '),
  },
  {
    id: 'roue',
    file: 'content/defis-roue.json',
    target: 150,
    entries: (d) => d,
    key: (d) => normalize(d.texte),
    near: (d) => d.texte,
  },
  // Mode 18+ : fichiers séparés, jamais tirés en mode normal (voir Game.contentPool). Même format que le jeu `format`.
  { id: 'qui-de-nous-18', format: 'qui-de-nous', adult: true, file: 'content/questions-18plus.json', target: 250, entries: (d) => d, key: (q) => normalize(q.text), near: (q) => q.text },
  {
    id: 'tu-preferes-18',
    format: 'tu-preferes',
    adult: true,
    file: 'content/preferes-18plus.json',
    target: 250,
    entries: (d) => d,
    key: (q) => [normalize(q.a), normalize(q.b)].sort().join(' | '),
    near: (q) => `${q.a} ${q.b}`,
  },
  { id: 'qui-me-connait-18', format: 'qui-me-connait', adult: true, file: 'content/connait-18plus.json', target: 120, entries: (d) => d, key: (q) => normalize(q.question), near: (q) => q.question },
  { id: 'roue-18', format: 'roue', adult: true, file: 'content/roue-18plus.json', target: 80, entries: (d) => d, key: (d) => normalize(d.texte), near: (d) => d.texte },
  { id: 'imposteur-18', format: 'imposteur', adult: true, file: 'content/imposteur-18plus.json', target: 80, entries: (d) => d, key: (p) => [normalize(p.mot), normalize(p.proche)].sort().join(' | ') },
  {
    id: 'feu',
    file: 'content/words-feu.json',
    target: 150,
    entries: (d) => [...d.pieges, ...d.neutres],
    key: (w) => normalize(w),
  },
];

/** Quasi-doublons vérifiés à la main et conservés : ce sont bien deux questions différentes. */
export const ALLOWED_NEAR = [
  ['Quelle est la technique de drague {de_nom} ?', 'Quelle est la technique de drague {de_nom} sur les applis ?'],
  [
    'En quelle année la France a-t-elle gagné sa première Coupe du monde de football ?',
    'En quelle année la France a-t-elle gagné sa deuxième Coupe du monde de football ?',
  ],
].map((pair) => pair.map(normalize).sort().join(' | '));

/**
 * Mots de niche (univers que tout le monde ne connaît pas) ou de boulot (tout le monde n'a pas de bureau) :
 * une entrée qui en contient un est refusée, sauf si elle est dans ALLOWED_WORDS. Écrits normalisés (sans accents),
 * le pluriel en « s » est accepté.
 */
export const BANNED_WORDS = [
  'steam', 'discord', 'twitch', 'reddit', 'github', 'lore', 'stream', 'streamer', 'speedrun', 'rage quit', 'serveur',
  'mail', 'email', 'stagiaire', 'stage', 'alternance', 'cdi', 'cdd', 'open space', 'reunion', 'bureau', 'boss',
  'patron', 'collegue', 'n 1', 'linkedin', 'impot', 'crypto', 'bitcoin', 'bourse', 'excel', 'teams', 'slack',
  'afterwork', 'boulot', 'badge', 'cv', 'entretien', 'ticket resto', 'salaire', 'manager', 'bereal',
];

/** Faux positifs vérifiés à la main (texte exact de l'entrée, ou d'un mot de l'Imposteur). */
export const ALLOWED_WORDS = [
  'Qui est le plus susceptible de tomber amoureux du serveur parce qu\'il a souri ?',
  'Mal parler aux serveurs',
  'En quelle année le premier e-mail a-t-il été envoyé ?',
].map(normalize);

const bannedRe = new RegExp(`\\b(${BANNED_WORDS.join('|')})s?\\b`);

/** Premier mot interdit trouvé dans une entrée (tous ses textes), ou null. */
export function bannedWord(entry) {
  const texts = (typeof entry === 'string' ? [entry] : Object.values(entry).flat()).filter((v) => typeof v === 'string');
  for (const t of texts.map(normalize)) {
    const m = !ALLOWED_WORDS.includes(t) && t.match(bannedRe);
    if (m) return m[1];
  }
  return null;
}

/** Doublons exacts (après normalisation) et quasi-doublons d'une liste, selon la spécification du contenu. */
export function findDuplicates(spec, list) {
  const exact = [];
  const seen = new Map();
  list.forEach((entry, i) => {
    const k = spec.key(entry);
    if (seen.has(k)) exact.push([seen.get(k), i]);
    else seen.set(k, i);
  });
  const near = [];
  if (spec.near) {
    const sets = list.map((e) => tokens(spec.near(e)));
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].size < 3) continue;
      for (let j = i + 1; j < sets.length; j++) {
        if (sets[j].size < 3 || jaccard(sets[i], sets[j]) < NEAR_THRESHOLD) continue;
        if (!ALLOWED_NEAR.includes([spec.near(list[i]), spec.near(list[j])].map(normalize).sort().join(' | '))) near.push([i, j]);
      }
    }
  }
  return { exact, near };
}

export const loadContent = (spec) => spec.entries(load(spec.file));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let problems = 0;
  for (const spec of CONTENT) {
    const list = loadContent(spec);
    const { exact, near } = findDuplicates(spec, list);
    const show = (e) => JSON.stringify(e);
    console.log(`${spec.file.padEnd(34)} ${String(list.length).padStart(4)} / ${spec.target}${list.length >= spec.target ? '' : '  (objectif non atteint)'}`);
    for (const [i, j] of exact) console.log(`  doublon      #${i} ${show(list[i])}\n               #${j} ${show(list[j])}`);
    for (const [i, j] of near) console.log(`  quasi-doublon #${i} ${show(list[i])}\n               #${j} ${show(list[j])}`);
    problems += exact.length + near.length;
  }
  if (problems) {
    console.log(`\n${problems} doublon(s) ou quasi-doublon(s).`);
    process.exit(1);
  }
}
