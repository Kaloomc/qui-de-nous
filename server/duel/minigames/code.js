// Le Code : un code secret de 4 symboles distincts parmi 6 (jamais deux fois le même, forme ET couleur), le même pour les deux duellistes.
// Chacun propose des codes (sans répéter un symbole) à son rythme (8 essais, 60 s) et reçoit un retour façon Wordle sur chaque case. Le premier à trouver gagne ;
// sinon le meilleur dernier indice (bien placés, puis bonnes couleurs mal placées).
// Confidentialité : la TV et l'adversaire ne voient que les cases de retour (vert, orange, gris), jamais les symboles joués ; le code n'est envoyé qu'à la fin.
export const LENGTH = 4;
export const SYMBOLS = 6;
export const MAX_TRIES = 8;
export const MAX_MS = 60000;
export const SETTLE_MS = 250;
export const TIE_MS = 20;

/**
 * Retour d'un essai, case par case : 'G' (vert) bon symbole bien placé, 'O' (orange) bon symbole mal placé, 'X' (gris) absent.
 * Le code n'a jamais deux symboles identiques et un essai non plus : aucun cas de doublon à gérer.
 */
export function score(secret, guess) {
  const marks = guess.map((g, i) => (g === secret[i] ? 'G' : secret.includes(g) ? 'O' : 'X'));
  return { marks, exact: marks.filter((m) => m === 'G').length, misplaced: marks.filter((m) => m === 'O').length };
}

/** Code secret : 4 symboles tous différents, tirés avec la graine commune. */
export function drawSecret(rng) {
  const bag = Array.from({ length: SYMBOLS }, (_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag.slice(0, LENGTH);
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const fresh = () => ({ tries: [], foundAt: null });
const quality = (p) => (p.tries.length ? p.tries.at(-1).fb.exact * 10 + p.tries.at(-1).fb.misplaced : -1);

function newCode(s, ctx) {
  s.secret = drawSecret(ctx.rng);
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
    if (new Set(guess).size !== LENGTH) return 'Pas deux fois le même symbole.';
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
    // Cases de retour seulement (vert, orange, gris) : jamais les symboles joués.
    const grid = (c) => s.p[c].tries.map((t) => t.fb.marks);
    const view = { max: MAX_TRIES, length: LENGTH, startedAt: s.startedAt, limitMs: MAX_MS, grids: { rouge: grid('rouge'), bleu: grid('bleu') }, found: { rouge: s.p.rouge.foundAt != null, bleu: s.p.bleu.foundAt != null } };
    if (who.kind === 'duelist') view.mine = s.p[who.side].tries;
    if (s.done) view.secret = s.secret;
    return view;
  },
};
