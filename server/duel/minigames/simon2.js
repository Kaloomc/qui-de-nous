// Simon croisé : à tour de rôle, le joueur dont c'est le tour rejoue de mémoire toute la séquence puis ajoute un pas pour piéger l'autre.
// Une erreur, ou 6 s sans toucher, fait perdre. 15 pas au total, puis égalité. Le premier à jouer est tiré au hasard.
// Confidentialité : la séquence n'est envoyée qu'à la TV, et seulement pendant qu'elle est rejouée après un tour réussi ;
// jamais pendant la saisie (ni aux téléphones).
export const PADS = 4;
export const MAX_STEPS = 15;
export const STEP_MS = 6000;
export const replayMs = (n) => 500 + n * 520;

const other = (camp) => (camp === 'rouge' ? 'bleu' : 'rouge');

function startReplay(s, ctx) {
  s.phase = 'replay';
  s.replayAt = ctx.now();
  const token = ++s.token;
  ctx.later(replayMs(s.seq.length), () => s.token === token && startInput(s, ctx));
}

function startInput(s, ctx) {
  s.phase = 'input';
  s.pos = 0;
  arm(s, ctx);
}

function arm(s, ctx) {
  const token = ++s.token;
  s.deadline = ctx.now() + STEP_MS;
  ctx.later(STEP_MS, () => s.token === token && s.phase === 'input' && lose(s, s.turn, 'timeout'));
}

function lose(s, camp, reason) {
  s.done = { winner: other(camp), reason, steps: s.seq.length };
  s.token += 1;
}

export default {
  id: 'simon2',
  name: 'Simon croisé',
  icon: 'simon2',
  category: 'mémoire',
  maxMs: 150000,
  minContent: 0,
  prepare: (ctx) => ({ seq: [], turn: ctx.rng() < 0.5 ? 'rouge' : 'bleu', phase: 'input', pos: 0, token: 0, deadline: null, replayAt: null, done: null }),
  begin: (s, ctx) => arm(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done) return 'Trop tard.';
    if (s.phase !== 'input') return null; // pendant le rejeu sur la TV : pavés bloqués
    if (camp !== s.turn) return 'Pas ton tour.';
    if (!Number.isInteger(data.pad) || data.pad < 0 || data.pad >= PADS) return 'Pavé invalide.';
    if (s.pos < s.seq.length) {
      if (s.seq[s.pos] !== data.pad) {
        lose(s, camp, 'error');
        return null;
      }
      s.pos += 1;
      arm(s, ctx);
      return null;
    }
    // Le pas ajouté : il termine le tour. Il devient la nouvelle fin de la séquence que l'autre devra rejouer.
    s.seq.push(data.pad);
    if (s.seq.length >= MAX_STEPS) {
      s.done = { winner: 'égalité', reason: 'max', steps: s.seq.length };
      s.token += 1;
      return null;
    }
    s.turn = other(camp);
    startReplay(s, ctx);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: { reason: s.done.reason, steps: s.done.steps } } : null),
  resolve: (s) => ({ winner: 'égalité', details: { reason: 'timeout', steps: s.seq.length } }),
  view(s, who) {
    const view = {
      turn: s.turn,
      phase: s.phase,
      steps: s.seq.length,
      max: MAX_STEPS,
      pos: s.pos,
      deadline: s.phase === 'input' ? s.deadline : null,
      replayAt: s.replayAt,
      replayMs: s.phase === 'replay' ? replayMs(s.seq.length) : 0,
    };
    // La TV seule voit la séquence, pendant son rejeu.
    if (who.kind === 'tv' && s.phase === 'replay') view.seq = [...s.seq];
    if (who.kind === 'duelist') view.me = who.side;
    return view;
  },
};
