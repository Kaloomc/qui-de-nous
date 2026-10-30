// Couleur piège (Stroop) : un mot de couleur écrit dans une AUTRE couleur ; on tape le bouton de la couleur d'ENCRE (les boutons
// portent le nom de la couleur en blanc, jamais la couleur elle-même). 15 s, même série (même graine) pour les deux duellistes,
// score = bonnes − 2 × erreurs. Égalité : 5 s de plus, puis égalité finale.
// Confidentialité : la TV et les parieurs ne reçoivent que les scores (jamais les mots), chaque duelliste que son propre mot.
import { seededRng } from '../../rules/duel.js';

export const COLORS = [
  { id: 'rouge', name: 'ROUGE' },
  { id: 'bleu', name: 'BLEU' },
  { id: 'vert', name: 'VERT' },
  { id: 'jaune', name: 'JAUNE' },
];
export const MAIN_MS = 15000;
export const EXTRA_MS = 5000;
export const ERROR_COST = 2;
const CONGRUENT_RATE = 0.15;

/** Le i-ᵉ mot de la série : toujours le même pour une graine donnée. `word` : le mot écrit ; `ink` : la couleur d'encre à taper. */
export function stroopItem(seed, i) {
  const rng = seededRng((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
  const word = Math.floor(rng() * COLORS.length);
  const ink = rng() < CONGRUENT_RATE ? word : (word + 1 + Math.floor(rng() * (COLORS.length - 1))) % COLORS.length;
  return { word: COLORS[word].id, wordName: COLORS[word].name, ink: COLORS[ink].id };
}

const verdictOf = (s) => (s.p.rouge.score === s.p.bleu.score ? 'égalité' : s.p.rouge.score > s.p.bleu.score ? 'rouge' : 'bleu');
const details = (s) => ({ scores: { rouge: s.p.rouge.score, bleu: s.p.bleu.score }, ok: { rouge: s.p.rouge.ok, bleu: s.p.bleu.ok }, errors: { rouge: s.p.rouge.err, bleu: s.p.bleu.err }, extra: s.extra });

export default {
  id: 'couleur',
  name: 'Couleur piège',
  icon: 'couleur',
  category: 'réflexe',
  maxMs: MAIN_MS + EXTRA_MS + 2000,
  minContent: 0,
  prepare: (ctx) => ({ seed: ctx.seed, p: { rouge: { i: 0, score: 0, ok: 0, err: 0 }, bleu: { i: 0, score: 0, ok: 0, err: 0 } }, endsAt: null, extra: false, done: null }),
  begin(s, ctx) {
    s.endsAt = ctx.now() + MAIN_MS;
    ctx.later(MAIN_MS, () => {
      if (verdictOf(s) !== 'égalité') {
        s.done = { winner: verdictOf(s) };
        return;
      }
      s.extra = true;
      s.endsAt = ctx.now() + EXTRA_MS;
      ctx.later(EXTRA_MS, () => {
        s.done = { winner: verdictOf(s) };
      });
    });
  },
  action(s, camp, data) {
    if (s.done) return 'Trop tard.';
    const p = s.p[camp];
    if (data.i !== p.i) return 'Trop tard : mot suivant.'; // réponse à un mot déjà passé : ignorée, sans pénalité
    if (!COLORS.some((c) => c.id === data.color)) return 'Couleur invalide.';
    if (stroopItem(s.seed, p.i).ink === data.color) {
      p.score += 1;
      p.ok += 1;
    } else {
      p.score -= ERROR_COST;
      p.err += 1;
    }
    p.i += 1;
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: verdictOf(s), details: details(s) }),
  view(s, who) {
    const view = { endsAt: s.endsAt, extra: s.extra, gauge: { rouge: s.p.rouge.score, bleu: s.p.bleu.score }, answered: { rouge: s.p.rouge.i, bleu: s.p.bleu.i } };
    if (who.kind === 'duelist') {
      const p = s.p[who.side];
      const item = stroopItem(s.seed, p.i);
      Object.assign(view, { i: p.i, score: p.score, item: { word: item.wordName, ink: item.ink } });
    }
    return view;
  },
};
