// Repère les clichés de genre dans les questions réservées à un genre (champ `cible` : "homme" ou "femme").
//   node scripts/check-genre-stereotypes.js     (le test server/genre-stereotypes.test.js s'appuie sur la même fonction)
// Une question réservée n'est gardée que si elle porte sur une expérience réellement liée à ce genre (rasage, barbe, talons,
// soutien-gorge, voix qui mue…). Tout comportement ou trait de personnalité attaché à un genre est un cliché : la question
// doit passer en « tous » ou disparaître. Les exceptions vérifiées à la main sont dans server/content/genre-exceptions.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../server/', import.meta.url);
const load = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const normalize = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Mots-clés de clichés (sur texte normalisé). Ajouter ici, jamais contourner : une exception se déclare dans genre-exceptions.json. */
export const STEREOTYPE_WORDS = [
  'sac', 'sacs', 'rancun\\w*', 'boud\\w*', 'barbecue', 'bricol\\w*', 'lessive', 'cuisin\\w*', 'pleur\\w*', 'larmes?', 'maquill\\w*',
  'rouges? a levres', 'vernis', 'menage', 'shopping', 'soldes', 'parle(r)? trop', 'bavard\\w*', 'conduit', 'conduire', 'creneau',
  'jaloux', 'jalouse', 'hyster\\w*', 'caprice\\w*', 'drama', 'commerages?', 'tondeuse', 'spatule', 'telecommande', 'bagnole', 'biere',
  'bagarre', 'machos?', 'cotelettes?', 'repassage', 'vaisselle', 'poussette', 'enfants? ', 'regime', 'balance', 'poids',
];
const STEREOTYPE_RE = new RegExp(`\\b(${STEREOTYPE_WORDS.join('|')})\\b`);

export const textOf = (entry) => [entry.text, entry.question, ...(entry.choix ?? [])].filter(Boolean).join(' ');

/** Entrées réservées à un genre qui contiennent un mot-clé de cliché et ne sont pas dans la liste d'exceptions. */
export function findStereotypes(entries, exceptions = []) {
  const allowed = new Set(exceptions.map(normalize));
  const found = [];
  for (const entry of entries) {
    if (!['homme', 'femme'].includes(entry.cible)) continue;
    const text = textOf(entry);
    const hit = STEREOTYPE_RE.exec(normalize(text));
    if (hit && !allowed.has(normalize(entry.text ?? entry.question))) found.push({ text: entry.text ?? entry.question, cible: entry.cible, word: hit[0] });
  }
  return found;
}

export const GENDERED_FILES = ['questions.json', 'content/questions-18plus.json', 'content/questions-connait.json', 'content/connait-18plus.json'];

export function loadAll() {
  return GENDERED_FILES.flatMap((file) => load(file).map((entry) => ({ file, ...(typeof entry === 'string' ? { text: entry } : entry) })));
}
export const loadExceptions = () => load('content/genre-exceptions.json');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = loadAll();
  const reserved = all.filter((e) => ['homme', 'femme'].includes(e.cible));
  const bad = findStereotypes(all, loadExceptions());
  console.log(`${reserved.length} entrées réservées à un genre, ${bad.length} cliché(s) repéré(s).`);
  for (const b of bad) console.log(`  ⚠ [${b.cible}] « ${b.word} » : ${b.text}`);
  process.exit(bad.length ? 1 : 0);
}
