// Simon : la même séquence (même graine) pour les deux duellistes, 4 pavés (formes ET couleurs), un pas de plus à chaque tour,
// 5 s par pas, une erreur élimine. Le plus avancé gagne si les deux se trompent ; au bout de 12 tours, le plus rapide (cumulé).
// Seul le début de séquence du tour en cours est envoyé (jamais la suite).
export const PADS = 4;
export const MAX_TURNS = 12;
export const STEP_MS = 5000;
export const PAUSE_MS = 1100;
export const TIE_MS = 20;
export const displayMs = (turn) => 400 + turn * 420;

const fresh = () => ({ alive: true, done: false, pos: 0, reached: 0, total: 0, token: 0 });
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

function startTurn(s, ctx, turn) {
  s.turn = turn;
  s.turnAt = ctx.now();
  s.advancing = false;
  for (const camp of ['rouge', 'bleu']) {
    const p = s.players[camp];
    p.pos = 0;
    p.done = false;
    if (p.alive) arm(s, ctx, camp, displayMs(turn) + STEP_MS);
  }
}

/** 5 s pour le pas suivant : sinon c'est une erreur. */
function arm(s, ctx, camp, ms) {
  const p = s.players[camp];
  const token = ++p.token;
  ctx.later(ms, () => p.token === token && p.alive && !p.done && fail(s, ctx, camp));
}

function fail(s, ctx, camp) {
  const p = s.players[camp];
  p.alive = false;
  p.token += 1;
  evaluate(s, ctx);
}

/** Plus avancé : tours terminés, puis pas justes dans le tour raté. */
const progress = (p) => p.reached * 100 + p.pos;

function evaluate(s, ctx) {
  if (s.done || s.advancing) return;
  const { rouge, bleu } = s.players;
  const resolved = (p) => !p.alive || p.done;
  if (!resolved(rouge) || !resolved(bleu)) return; // l'un joue encore son tour
  if (!rouge.alive && !bleu.alive) {
    const a = progress(rouge);
    const b = progress(bleu);
    s.done = { winner: a === b ? 'égalité' : a > b ? 'rouge' : 'bleu', reason: 'errors' };
  } else if (rouge.alive !== bleu.alive) s.done = { winner: rouge.alive ? 'rouge' : 'bleu', reason: 'survivor' };
  else if (s.turn >= MAX_TURNS) {
    const gap = rouge.total - bleu.total;
    s.done = { winner: Math.abs(gap) < TIE_MS ? 'égalité' : gap < 0 ? 'rouge' : 'bleu', reason: 'speed' };
  } else {
    s.advancing = true;
    ctx.later(PAUSE_MS, () => startTurn(s, ctx, s.turn + 1));
  }
}

function outcome(s) {
  const base = { reached: { rouge: s.players.rouge.reached, bleu: s.players.bleu.reached }, reason: s.done?.reason ?? 'timeout', turns: s.turn };
  return { winner: s.done?.winner ?? 'égalité', details: base };
}

export default {
  id: 'simon',
  name: 'Simon',
  icon: 'simon',
  category: 'mémoire',
  maxMs: 90000,
  minContent: 0,
  prepare: (ctx) => ({ seq: Array.from({ length: MAX_TURNS }, () => Math.floor(ctx.rng() * PADS)), turn: 0, turnAt: null, advancing: false, players: { rouge: fresh(), bleu: fresh() }, done: null }),
  begin: (s, ctx) => startTurn(s, ctx, 1),
  action(s, camp, data, ctx) {
    const p = s.players[camp];
    if (s.done || !p.alive || p.done || !s.turn) return null;
    const now = ctx.now();
    if (now < s.turnAt + displayMs(s.turn)) return null; // pavés bloqués pendant la séquence
    if (!Number.isInteger(data.pad) || data.pad < 0 || data.pad >= PADS) return 'Pavé invalide.';
    if (s.seq[p.pos] !== data.pad) {
      fail(s, ctx, camp);
      return null;
    }
    p.pos += 1;
    if (p.pos === s.turn) {
      p.done = true;
      p.reached = s.turn;
      p.token += 1;
      // Temps de réaction : de la fin de la séquence (vue sur le téléphone RTT/2 plus tard) au dernier pavé (RTT/2 de retour).
      p.total += Math.max(0, now - (s.turnAt + displayMs(s.turn)) - ctx.latency(idOf(ctx, camp)));
      evaluate(s, ctx);
    } else arm(s, ctx, camp, STEP_MS);
    return null;
  },
  result: (s) => (s.done ? outcome(s) : null),
  resolve(s) {
    if (!s.done) {
      const a = progress(s.players.rouge);
      const b = progress(s.players.bleu);
      s.done = { winner: a === b ? 'égalité' : a > b ? 'rouge' : 'bleu', reason: 'timeout' };
    }
    return outcome(s);
  },
  view(s, who) {
    const view = {
      turn: s.turn,
      turnAt: s.turnAt,
      displayMs: s.turn ? displayMs(s.turn) : 0,
      seq: s.seq.slice(0, s.turn), // le début de la séquence seulement
      max: MAX_TURNS,
      players: Object.fromEntries(['rouge', 'bleu'].map((c) => [c, { alive: s.players[c].alive, done: s.players[c].done, pos: s.players[c].pos, reached: s.players[c].reached }])),
    };
    if (who.kind === 'duelist') view.me = who.side;
    return view;
  },
};
