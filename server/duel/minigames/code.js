// Le Code : un code secret de 4 symboles (6 possibles, répétitions permises, forme ET couleur), le même pour les deux duellistes.
// Chacun propose des codes à son rythme (8 essais, 60 s) et reçoit des indices à la Mastermind. Le premier à trouver gagne ;
// sinon le meilleur dernier indice (bien placés, puis bonnes couleurs mal placées).
// Confidentialité : la TV et l'adversaire ne voient que des pastilles (jamais les symboles joués) ; le code n'est envoyé qu'à la fin.
export const LENGTH = 4;
export const SYMBOLS = 6;
export const MAX_TRIES = 8;
export const MAX_MS = 60000;
export const SETTLE_MS = 250;
export const TIE_MS = 20;

/** Indices d'un essai : `exact` bien placés, `misplaced` bons symboles mal placés (doublons comptés une seule fois). */
export function score(secret, guess) {
  let exact = 0;
  const left = [];
  const rest = [];
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact += 1;
    else {
      left.push(secret[i]);
      rest.push(guess[i]);
    }
  }
  let misplaced = 0;
  for (const g of rest) {
    const j = left.indexOf(g);
    if (j >= 0) {
      misplaced += 1;
      left.splice(j, 1);
    }
  }
  return { exact, misplaced };
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const fresh = () => ({ tries: [], foundAt: null });
const quality = (p) => (p.tries.length ? p.tries.at(-1).fb.exact * 10 + p.tries.at(-1).fb.misplaced : -1);

function newCode(s, ctx) {
  s.secret = Array.from({ length: LENGTH }, () => Math.floor(ctx.rng() * SYMBOLS));
  s.p = { rouge: fresh(), bleu: fresh() };
  s.startedAt = ctx.now();
  s.settling = false;
  s.token += 1;
}

function settle(s, ctx, token) {
  if (s.token !== token || s.done) return;
  const found = ['rouge', 'bleu'].filter((c) => s.p[c].foundAt != null);
  if (found.length === 2 && Math.abs(s.p.rouge.foundAt - s.p.bleu.foundAt) < TIE_MS) {
    if (!s.replayed) {
      s.replayed = true;
      newCode(s, ctx);
      return;
    }
    s.done = { winner: 'égalité', reason: 'tie' };
    return;
  }
  const winner = found.length === 1 ? found[0] : s.p.rouge.foundAt < s.p.bleu.foundAt ? 'rouge' : 'bleu';
  s.done = { winner, reason: 'found' };
}

const bestLast = (s) => (quality(s.p.rouge) === quality(s.p.bleu) ? 'égalité' : quality(s.p.rouge) > quality(s.p.bleu) ? 'rouge' : 'bleu');
const details = (s) => ({ tries: { rouge: s.p.rouge.tries.length, bleu: s.p.bleu.tries.length }, reason: s.done?.reason ?? 'timeout', secret: s.secret });

export default {
  id: 'code',
  name: 'Le Code',
  icon: 'code',
  category: 'cerveau',
  maxMs: MAX_MS + 2000,
  minContent: 0,
  prepare(ctx) {
    const s = { token: 0, replayed: false, done: null };
    newCode(s, ctx);
    return s;
  },
  begin(s, ctx) {
    ctx.later(MAX_MS, () => {
      if (!s.done) s.done = { winner: bestLast(s), reason: 'timeout' };
    });
  },
  action(s, camp, data, ctx) {
    if (s.done) return 'Trop tard.';
    const p = s.p[camp];
    const guess = data.guess;
    if (!Array.isArray(guess) || guess.length !== LENGTH || guess.some((g) => !Number.isInteger(g) || g < 0 || g >= SYMBOLS)) return 'Code invalide.';
    if (p.foundAt != null || p.tries.length >= MAX_TRIES) return 'Plus d’essai.';
    const fb = score(s.secret, guess);
    p.tries.push({ guess: [...guess], fb });
    if (fb.exact === LENGTH) {
      p.foundAt = Math.max(0, ctx.now() - s.startedAt - ctx.latency(idOf(ctx, camp)));
      if (!s.settling) {
        s.settling = true;
        const token = s.token;
        ctx.later(SETTLE_MS, () => settle(s, ctx, token));
      }
    } else if (s.p.rouge.tries.length >= MAX_TRIES && s.p.bleu.tries.length >= MAX_TRIES) {
      s.done = { winner: bestLast(s), reason: 'tries' };
    }
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: s.done?.winner ?? bestLast(s), details: details(s) }),
  view(s, who) {
    // Pastilles seulement : le nombre d'essais et les indices, jamais les symboles joués.
    const pips = (c) => s.p[c].tries.map((t) => t.fb);
    const view = { max: MAX_TRIES, length: LENGTH, startedAt: s.startedAt, limitMs: MAX_MS, pips: { rouge: pips('rouge'), bleu: pips('bleu') }, found: { rouge: s.p.rouge.foundAt != null, bleu: s.p.bleu.foundAt != null } };
    if (who.kind === 'duelist') view.mine = s.p[who.side].tries;
    if (s.done) view.secret = s.secret;
    return view;
  },
};
