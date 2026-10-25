// Repère, dans les fichiers de contenu, les formulations qui supposent un genre (masculin par défaut) et qui devraient passer par
// le moteur d'accords (shared/formulation.js) : « il », « lui », « son copain »… Ne modifie rien.
// Usage : node scripts/audit-genre.js [--all]   (--all : montre aussi les entrées déjà accordées)
import { readFileSync } from 'node:fs';
import { hasAgreement } from '../shared/formulation.js';
import { CONTENT, loadContent } from './check-content.js';

const IMPERSONAL = /\b(il|elle) (y a|y avait|y aura|faut|fallait|faudrait|reste|restait|vaut|suffit|manque|paraît|arrive|se passe|existe|fait (beau|nuit|jour|froid|chaud|noir|gris|bon))\b|-t-(il|elle)\b|\b(faut|y a|reste|suffit|vaut)-il\b|\bqu'il (y|faut|reste|fait (beau|nuit|jour|froid|chaud))\b/i;
const ADJECTIVES = 'fatigué|saoul|ivre|content|ravi|gêné|vexé|jaloux|amoureux|prêt|honteux|fier|surpris|ému|touché|endormi|allongé|sorti|rentré|parti|devenu|resté|tombé|arrivé|excité|stressé|énervé|vénère|bourré|soûl|malade|nul|bon|gentil|timide|drôle|têtu|jaloux|romantique|sérieux|discret|débrouillard|fêtard|pressé|invité';
const PATTERNS = [
  // Sujet « il » / « elle » / « ils » qui renvoie à la personne dont on parle (pas les formes impersonnelles).
  [(t) => !IMPERSONAL.test(t) && /\b(il|ils|elle|elles)\b/i.test(t), 'pronom sujet'],
  // « lui » après une préposition (« d'après lui », « chez lui », « avec lui »).
  [(t) => /\b(après|chez|avec|sans|pour|contre|devant|derrière|selon|sur|vers|à côté de) (lui|elle)\b/i.test(t), 'pronom après préposition'],
  [(t) => new RegExp(`\\b(est|était|serait|devient|reste|se sent|a l'air|s'est|suis|es|as été|a été|aurait été|se retrouve|finit|termine) (très |trop |vraiment |toujours |encore |plutôt |un peu )?(${ADJECTIVES})\\b`, 'i').test(t), 'adjectif ou participe'],
  // Choix de réponse qui décrit la personne : « Le plus discret », « Premier de la classe », « Fatigué ».
  [(t) => new RegExp(`^(le (plus|moins) \\w+|premier de la classe|dernier à partir|(${ADJECTIVES}))\\b`, 'i').test(t), 'choix qui décrit la personne'],
];

/** Formulations vérifiées à la main : adjectifs épicènes, citations, pluriels collectifs, tournures impersonnelles. */
const VERIFIED = [
  "« C'est ce qu'elle a dit »", "Demande « pourquoi ? » avec un clin d'œil", "Des clins d'œil lourds", 'Devient timide', 'Drôle',
  "« Il n'y a plus de métro »", '« Il pleut trop »', 'Je suis malade', '« Mon chat est malade »', "Que fait {cible} quand c'est nul au lit ?",
  "Que fait {cible} quand il n'y a plus de préservatif ?", 'Que fait {cible} si le rencard est nul ?', 'Romantique',
  'Tous ceux qui ont déjà matché avec quelqu’un qu’ils connaissaient dans la vraie vie boivent 2 gorgées.',
  'Tous ceux qui ont déjà menti à leurs parents sur l’endroit où ils dormaient boivent 2 gorgées.',
  'Tous ceux qui se sont déjà réveillés sans savoir où ils étaient boivent 3 gorgées.', 'Tous, ils attendent',
  'Tout le monde boit 3 gorgées en levant son verre aux ex. Qu’ils restent loin.',
  'Tout le monde s’assoit à côté de la personne qu’il connaît le moins.', 'Tout le monde s’assoit à côté de la personne qu’il trouve la plus stylée ce soir.',
];

const all = process.argv.includes('--all');
const roots = new Set(['qui-me-connait', 'qui-me-connait-18', 'roue', 'roue-18']);
let total = 0;
for (const spec of CONTENT.filter((s) => roots.has(s.id))) {
  const lines = [];
  for (const entry of loadContent(spec)) {
    const texts = Object.values(entry).flat().filter((v) => typeof v === 'string');
    for (const text of texts) {
      if ((hasAgreement(text) || VERIFIED.includes(text)) && !all) continue;
      const hits = PATTERNS.filter(([test]) => test(text)).map(([, label]) => label);
      if (hits.length) lines.push(`  [${hits.join(', ')}] ${text}`);
    }
  }
  console.log(`${spec.file} : ${lines.length} à vérifier`);
  for (const l of lines) console.log(l);
  total += lines.length;
}
console.log(`\n${total} formulation(s) à vérifier.`);
