// Pierre-feuille-ciseaux : meilleur des 3, choix secret (8 s, sinon au hasard), révélation simultanée, manche nulle rejouée (6 manches au plus).
// Confidentialité : le choix d'un duelliste n'est visible que de lui jusqu'à la révélation de la manche.
export const CHOICES = ['pierre', 'feuille', 'ciseaux'];
export const WIN_AT = 2;
export const MAX_ROUNDS = 6;
export const CHOOSE_MS = 8000;
export const PAUSE_MS = 2200;
const BEATS = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };

/** Vainqueur d'une manche : 'rouge', 'bleu' ou null (nulle). */
export const roundWinner = (rouge, bleu) => (rouge === bleu ? null : BEATS[rouge] === bleu ? 'rouge' : 'bleu');

function startRound(s, ctx) {
  s.round += 1;
  s.choices = {};
  s.shown = null;
  s.phase = 'choose';
  s.deadline = ctx.now() + CHOOSE_MS;
  const token = ++s.token;
  ctx.later(CHOOSE_MS, () => s.token === token && s.phase === 'choose' && reveal(s, ctx));
}

/** Choix manquants tirés au hasard, puis les deux choix sont révélés en même temps. */
function reveal(s, ctx) {
  for (const camp of ['rouge', 'bleu']) s.choices[camp] ??= CHOICES[Math.floor(ctx.rng() * CHOICES.length)];
  const winner = roundWinner(s.choices.rouge, s.choices.bleu);
  if (winner) s.wins[winner] += 1;
  s.shown = { round: s.round, rouge: s.choices.rouge, bleu: s.choices.bleu, winner };
  s.history.push(s.shown);
  s.phase = 'reveal';
  s.token += 1;
  if (s.wins.rouge >= WIN_AT || s.wins.bleu >= WIN_AT || s.round >= MAX_ROUNDS) {
    s.done = { winner: s.wins.rouge === s.wins.bleu ? 'égalité' : s.wins.rouge > s.wins.bleu ? 'rouge' : 'bleu' };
    return;
  }
  const token = s.token;
  ctx.later(PAUSE_MS, () => s.token === token && startRound(s, ctx));
}

export default {
  id: 'pfc',
  name: 'Pierre-feuille-ciseaux',
  icon: 'pfc',
  category: 'chance',
  maxMs: 45000,
  minContent: 0,
  prepare: () => ({ round: 0, wins: { rouge: 0, bleu: 0 }, choices: {}, shown: null, history: [], done: null, phase: 'choose', deadline: null, token: 0 }),
  begin: (s, ctx) => startRound(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'choose') return 'Pas maintenant.';
    if (!CHOICES.includes(data.choice)) return 'Choix invalide.';
    if (s.choices[camp]) return null; // le premier choix est définitif
    s.choices[camp] = data.choice;
    if (s.choices.rouge && s.choices.bleu) reveal(s, ctx);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: { wins: { ...s.wins }, history: s.history } } : null),
  resolve: (s) => ({ winner: s.wins.rouge === s.wins.bleu ? 'égalité' : s.wins.rouge > s.wins.bleu ? 'rouge' : 'bleu', details: { wins: { ...s.wins }, history: s.history } }),
  view(s, who) {
    const view = {
      round: s.round,
      wins: { ...s.wins },
      phase: s.phase,
      deadline: s.phase === 'choose' ? s.deadline : null,
      chosen: { rouge: !!s.choices.rouge, bleu: !!s.choices.bleu },
      shown: s.phase === 'reveal' ? s.shown : null,
      history: s.history,
      max: MAX_ROUNDS,
    };
    if (who.kind === 'duelist') view.mine = s.choices[who.side] ?? null; // jamais le choix de l'adversaire
    return view;
  },
};
