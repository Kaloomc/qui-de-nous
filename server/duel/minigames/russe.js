// Roulette russe (version pistolet à eau) : 6 cases, une seule est piégée. Les duellistes choisissent une case chacun leur tour (10 s, sinon le
// serveur en prend une libre au hasard) ; celui qui tombe sur la case piégée prend le SPLASH et perd. Chacun a un jeton « Passe » à usage unique
// (il termine le tour). S'il ne reste que la case piégée et qu'il n'a plus de Passe, il la prend (courte annonce avec suspense).
// Confidentialité : la case piégée n'est envoyée qu'aux parieurs de ce duel (`who.bet`, dans `secret`), et à tout le monde au SPLASH seulement.
export const SLOTS = 6;
export const TURN_MS = 10000;
export const ANNOUNCE_MS = 2800; // « X commence ! »
export const BEAT_MS = 1200; // « CLIC » ou passe, avant le tour suivant
export const SUSPENSE_MS = 3200; // dernière case, plus de Passe : le suspense avant le SPLASH
export const SPLASH_MS = 3500;
const CAMPS = ['rouge', 'bleu'];
const other = (camp) => (camp === 'rouge' ? 'bleu' : 'rouge');
const free = (s) => s.taken.flatMap((c, i) => (c ? [] : [i]));

function startTurn(s, ctx, camp) {
  s.turn = camp;
  s.turnNo += 1;
  s.last = null;
  s.forced = free(s).length === 1 && !s.passes[camp]; // seule la case piégée reste, et pas de Passe
  s.phase = 'turn';
  s.deadline = ctx.now() + (s.forced ? SUSPENSE_MS : TURN_MS);
  const token = ++s.token;
  ctx.later(s.forced ? SUSPENSE_MS : TURN_MS, () => {
    if (s.token !== token || s.phase !== 'turn') return;
    const open = free(s);
    take(s, ctx, camp, open[Math.floor(ctx.rng() * open.length)]);
  });
}

/** `camp` prend la case `slot` : le SPLASH si elle est piégée, sinon « CLIC » puis au tour de l'autre. */
function take(s, ctx, camp, slot) {
  s.taken[slot] = camp;
  s.deadline = null;
  const token = ++s.token;
  if (slot === s.trap) {
    s.phase = 'splash';
    s.splash = { slot, loser: camp };
    s.done = { winner: other(camp) };
    return;
  }
  s.phase = 'beat';
  s.last = { kind: 'safe', camp, slot };
  ctx.later(BEAT_MS, () => s.token === token && s.phase === 'beat' && startTurn(s, ctx, other(camp)));
}

function pass(s, ctx, camp) {
  s.passes[camp] -= 1;
  s.deadline = null;
  s.phase = 'beat';
  s.last = { kind: 'pass', camp, slot: null };
  const token = ++s.token;
  ctx.later(BEAT_MS, () => s.token === token && s.phase === 'beat' && startTurn(s, ctx, other(camp)));
}

export default {
  id: 'russe',
  name: 'Roulette russe',
  icon: 'russe',
  category: 'chance',
  maxMs: ANNOUNCE_MS + (SLOTS + 2) * (TURN_MS + BEAT_MS) + SPLASH_MS + 4000,
  minContent: 0,
  prepare: (ctx) => ({
    trap: Math.floor(ctx.rng() * SLOTS),
    first: ctx.rng() < 0.5 ? 'rouge' : 'bleu',
    taken: Array(SLOTS).fill(null),
    passes: { rouge: 1, bleu: 1 },
    turn: null,
    turnNo: 0,
    forced: false,
    last: null,
    splash: null,
    phase: 'announce',
    deadline: null,
    token: 0,
    done: null,
  }),
  begin(s, ctx) {
    s.deadline = ctx.now() + ANNOUNCE_MS;
    const token = ++s.token;
    ctx.later(ANNOUNCE_MS, () => s.token === token && s.phase === 'announce' && startTurn(s, ctx, s.first));
  },
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'turn') return 'Pas maintenant.';
    if (data.t !== undefined && data.t !== s.turnNo) return 'Trop tard : tour suivant.';
    if (s.turn !== camp) return 'Pas ton tour.';
    if (data.pass) {
      if (!s.passes[camp]) return 'Plus de Passe.';
      pass(s, ctx, camp);
      return null;
    }
    if (!Number.isInteger(data.slot) || data.slot < 0 || data.slot >= SLOTS) return 'Case invalide.';
    if (s.taken[data.slot]) return 'Case déjà choisie.';
    take(s, ctx, camp, data.slot);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: { trap: s.trap, loser: s.splash.loser, picks: s.taken.filter(Boolean).length } } : null),
  resolve: (s) => ({ winner: 'égalité', details: { trap: null, loser: null, picks: s.taken.filter(Boolean).length } }),
  view(s, who) {
    const view = {
      phase: s.phase,
      first: s.first,
      turn: s.turn,
      turnNo: s.turnNo,
      taken: [...s.taken],
      passes: { ...s.passes },
      forced: s.phase === 'turn' && s.forced,
      last: s.last,
      deadline: s.phase === 'turn' || s.phase === 'announce' ? s.deadline : null,
      splash: s.phase === 'splash' ? s.splash : null,
      slots: SLOTS,
    };
    if (who.kind === 'bettor' && who.bet && s.phase !== 'splash') view.secret = { trap: s.trap };
    return view;
  },
};
