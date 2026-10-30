// Culture G éclair : 5 questions au plus, 4 choix, le premier à répondre juste marque (temps compensés de la latence de chacun) ;
// une mauvaise réponse bloque 2 s ; 10 s par question ; 2 points gagnent ; à égalité, mort subite (quelques questions de plus).
// Confidentialité : la bonne réponse n'est envoyée à personne avant la fin de la question (jamais dans les vues, ni vers la TV).
import { loadJson } from '../../games/load.js';

const QUESTIONS = loadJson('../content/culture-g-duel.json');
export const WIN_AT = 2;
export const MAX_QUESTIONS = 5;
export const SUDDEN_EXTRA = 3;
export const QUESTION_MS = 10000;
export const BLOCK_MS = 2000;
export const SETTLE_MS = 250; // le temps de comparer deux bonnes réponses compensées
export const REVEAL_MS = 2300;
export const TIE_MS = 20;
export const MIN_QUESTIONS = 10;
const CAMPS = ['rouge', 'bleu'];
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

export const questions = () => QUESTIONS;

function ask(s, ctx) {
  const q = s.pick(ctx);
  const order = shuffled(q.choix.map((_, i) => i), ctx.rng);
  s.n += 1;
  s.q = { id: q.id, question: q.question, choices: order.map((i) => q.choix[i]), right: order.indexOf(q.bonne), categorie: q.categorie ?? null, at: ctx.now(), correct: {}, blocked: {}, settled: false };
  s.phase = 'ask';
  const token = ++s.token;
  ctx.later(QUESTION_MS, () => s.token === token && s.phase === 'ask' && settle(s, ctx, token));
}

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fin d'une question : qui marque (le plus rapide compensé), puis la bonne réponse est montrée un instant. */
function settle(s, ctx, token) {
  if (s.token !== token || s.phase !== 'ask') return;
  const q = s.q;
  const winners = CAMPS.filter((c) => q.correct[c] != null);
  let scorer = null;
  let tie = false;
  if (winners.length === 1) scorer = winners[0];
  else if (winners.length === 2) {
    const gap = q.correct.rouge - q.correct.bleu;
    if (Math.abs(gap) < TIE_MS) tie = true;
    else scorer = gap < 0 ? 'rouge' : 'bleu';
  }
  if (scorer) s.score[scorer] += 1;
  s.shown = { n: s.n, right: q.right, scorer, tie };
  s.history.push({ n: s.n, scorer });
  s.phase = 'reveal';
  s.token += 1;
  const lead = s.score.rouge === s.score.bleu ? null : s.score.rouge > s.score.bleu ? 'rouge' : 'bleu';
  const total = MAX_QUESTIONS + SUDDEN_EXTRA;
  if (s.score.rouge >= WIN_AT || s.score.bleu >= WIN_AT) s.done = { winner: lead };
  else if (s.n >= MAX_QUESTIONS && lead) s.done = { winner: lead }; // plus de questions : le meilleur score gagne
  else if (s.n >= total) s.done = { winner: 'égalité' };
  else {
    // Égalité parfaite de vitesse : la question est rejouée une fois (même question, une seule fois par duel).
    const again = tie && !s.replayed;
    if (again) s.replayed = true;
    const next = s.token;
    ctx.later(REVEAL_MS, () => s.token === next && (again ? replay(s, ctx) : ask(s, ctx)));
  }
}

function replay(s, ctx) {
  const keep = s.q;
  s.n -= 1;
  const original = s.pick;
  s.pick = () => ({ id: keep.id, question: keep.question, choix: keep.choices, bonne: keep.right, categorie: keep.categorie });
  ask(s, ctx);
  s.pick = original;
}

const winnerOf = (s) => (s.score.rouge === s.score.bleu ? 'égalité' : s.score.rouge > s.score.bleu ? 'rouge' : 'bleu');
const details = (s) => ({ score: { ...s.score }, questions: s.n, history: s.history });

export default {
  id: 'culture',
  name: 'Culture G éclair',
  icon: 'culture',
  category: 'connaissances',
  maxMs: 80000,
  minContent: MIN_QUESTIONS,
  available: (game) => (game.duelContent?.culture ?? QUESTIONS).length >= MIN_QUESTIONS,
  prepare(ctx) {
    const list = ctx.content.culture ?? QUESTIONS;
    return { n: 0, score: { rouge: 0, bleu: 0 }, q: null, shown: null, phase: 'ask', token: 0, history: [], done: null, replayed: false, pick: (c) => c.draw('duel-culture', list) };
  },
  begin: (s, ctx) => ask(s, ctx),
  action(s, camp, data, ctx) {
    const q = s.q;
    if (s.done || s.phase !== 'ask') return 'Pas maintenant.';
    if (data.n !== undefined && data.n !== s.n) return 'Trop tard : question suivante.';
    if (!Number.isInteger(data.choice) || data.choice < 0 || data.choice >= 4) return 'Choix invalide.';
    const now = ctx.now();
    if (now < (q.blocked[camp] ?? 0)) return 'Bloqué.'; // mauvaise réponse : 2 s de pénalité
    if (q.correct[camp] != null) return null;
    if (data.choice !== q.right) {
      q.blocked[camp] = now + BLOCK_MS;
      return null;
    }
    // Question vue sur le téléphone RTT/2 après l'envoi, réponse reçue RTT/2 après le clic : on retire l'aller-retour.
    q.correct[camp] = Math.max(0, now - q.at - ctx.latency(idOf(ctx, camp)));
    if (!q.settled) {
      q.settled = true;
      const token = s.token;
      ctx.later(SETTLE_MS, () => settle(s, ctx, token));
    }
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: winnerOf(s), details: details(s) }),
  view(s, who, ctx) {
    const q = s.q;
    const view = {
      n: s.n,
      max: MAX_QUESTIONS,
      score: { ...s.score },
      phase: s.phase,
      question: q?.question ?? null,
      choices: q?.choices ?? [],
      categorie: q?.categorie ?? null,
      askedAt: q?.at ?? null,
      endsAt: q && s.phase === 'ask' ? q.at + QUESTION_MS : null,
      // La bonne réponse n'apparaît qu'une fois la question terminée.
      shown: s.phase === 'reveal' ? s.shown : null,
    };
    if (who.kind === 'duelist') view.blockedUntil = q?.blocked?.[who.side] ?? 0;
    return view;
  },
};
