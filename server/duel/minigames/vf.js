// Vrai ou Faux en survie : des affirmations défilent une à une ; chaque duelliste répond VRAI ou FAUX dans un temps qui diminue (5 s au début,
// 2 s au plus court). La première erreur ou absence de réponse élimine, l'autre gagne. Les deux ratent la même affirmation : égalité sur celle-ci,
// on continue. 15 affirmations au plus ; si personne n'est éliminé, le plus rapide cumulé gagne (temps compensés de la latence).
// Confidentialité : la bonne réponse et l'explication ne sont envoyées qu'à la fin de l'affirmation.
import { loadJson } from '../../games/load.js';

const STATEMENTS = loadJson('../content/vrai-faux-duel.json');
export const MAX_STATEMENTS = 15;
export const START_MS = 5000;
export const MIN_TIME_MS = 2000;
export const STEP_MS = 250;
export const REVEAL_MS = 1500;
export const TIE_MS = 20;
export const MIN_STATEMENTS = 20;
export const statements = () => STATEMENTS;

/** Temps imparti à la i-ᵉ affirmation (0, 1, …) : 5 s qui diminuent jusqu'à 2 s. */
export const limitFor = (i) => Math.max(MIN_TIME_MS, START_MS - STEP_MS * i);
const CAMPS = ['rouge', 'bleu'];
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

function nextStatement(s, ctx) {
  s.n += 1;
  // Mélange aléatoire moitié vraies, moitié fausses : on tire d'abord le type, puis une affirmation de ce type (même si le fichier est déséquilibré).
  const wantTrue = ctx.rng() < 0.5;
  const pool = s.list.filter((x) => x.vrai === wantTrue);
  s.st = ctx.draw(wantTrue ? 'duel-vf-vrai' : 'duel-vf-faux', pool.length ? pool : s.list);
  s.limit = limitFor(s.n - 1);
  s.answers = {};
  s.phase = 'ask';
  s.startedAt = ctx.now();
  s.shown = null;
  const token = ++s.token;
  // La fin attend les réponses en retard (latence) : un clic parti à temps compte.
  const grace = Math.min(1000, Math.max(ctx.latency(ctx.red), ctx.latency(ctx.blue))) + 60;
  ctx.later(s.limit + grace, () => s.token === token && settle(s, ctx, token));
}

function settle(s, ctx, token) {
  if (s.token !== token || s.phase !== 'ask') return;
  const verdict = {};
  for (const camp of CAMPS) {
    const a = s.answers[camp];
    verdict[camp] = a && a.value === s.st.vrai && a.t <= s.limit; // à temps ET juste
    if (verdict[camp]) s.speed[camp] += a.t;
  }
  s.shown = { n: s.n, vrai: s.st.vrai, explication: s.st.explication, ok: { ...verdict } };
  s.phase = 'reveal';
  s.token += 1;
  const failed = CAMPS.filter((c) => !verdict[c]);
  if (failed.length === 1) s.done = { winner: failed[0] === 'rouge' ? 'bleu' : 'rouge', reason: 'survie', n: s.n };
  else if (s.n >= MAX_STATEMENTS) {
    const gap = s.speed.rouge - s.speed.bleu;
    s.done = { winner: Math.abs(gap) < TIE_MS ? 'égalité' : gap < 0 ? 'rouge' : 'bleu', reason: 'vitesse', n: s.n };
  } else {
    // Les deux justes, ou les deux ratent : on passe à la suivante.
    const next = s.token;
    ctx.later(REVEAL_MS, () => s.token === next && nextStatement(s, ctx));
  }
}

const details = (s) => ({ statements: s.n, reason: s.done?.reason ?? 'timeout', speed: { rouge: Math.round(s.speed.rouge), bleu: Math.round(s.speed.bleu) } });

export default {
  id: 'vf',
  name: 'Vrai ou Faux',
  icon: 'vf',
  category: 'connaissances',
  maxMs: MAX_STATEMENTS * (START_MS + REVEAL_MS + 1100) + 4000,
  minContent: MIN_STATEMENTS,
  available: (game) => (game.duelContent?.vf ?? STATEMENTS).length >= MIN_STATEMENTS,
  prepare: (ctx) => ({ list: ctx.content.vf ?? STATEMENTS, n: 0, st: null, limit: START_MS, answers: {}, phase: 'ask', startedAt: null, shown: null, speed: { rouge: 0, bleu: 0 }, token: 0, done: null }),
  begin: (s, ctx) => nextStatement(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'ask') return 'Pas maintenant.';
    if (data.n !== undefined && data.n !== s.n) return 'Trop tard : affirmation suivante.';
    if (typeof data.value !== 'boolean') return 'Réponse invalide.';
    if (s.answers[camp]) return null; // première réponse définitive
    // Temps de réponse ressenti : réception moins l'aller-retour réseau.
    s.answers[camp] = { value: data.value, t: Math.max(0, ctx.now() - s.startedAt - ctx.latency(idOf(ctx, camp))) };
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: 'égalité', details: details(s) }),
  view(s, who) {
    const view = {
      n: s.n,
      max: MAX_STATEMENTS,
      phase: s.phase,
      texte: s.st?.texte ?? null,
      startedAt: s.startedAt,
      limitMs: s.limit,
      answered: { rouge: !!s.answers.rouge, bleu: !!s.answers.bleu },
      reveal: s.phase === 'reveal' ? s.shown : null,
    };
    if (who.kind === 'duelist') view.mine = s.answers[who.side]?.value ?? null;
    return view;
  },
};
