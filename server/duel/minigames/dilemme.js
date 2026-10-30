// Dilemme en or : 20 s de discussion à voix haute devant tout le monde, puis chacun choisit en secret PARTAGER ou TRAHIR (8 s, sinon
// choix au hasard) et les deux choix sont révélés ensemble. Pas de reprise : les règles ci-dessous sont définitives.
//   deux PARTAGER → égalité, personne ne boit ; un seul TRAHIT → il gagne, le trahi perd (cote habituelle) ;
//   deux TRAHIR   → égalité, les deux duellistes boivent 2 gorgées (parieurs épargnés).
// Confidentialité : le choix d'un duelliste n'est envoyé à personne d'autre (ni TV, ni parieurs) avant que les deux aient choisi.
export const TALK_MS = 20000;
export const CHOOSE_MS = 8000;
export const CHOICES = ['partager', 'trahir'];

/** Issue pure : { winner, sips? } selon les deux choix. */
export function outcomeOf(rouge, bleu) {
  if (rouge === 'partager' && bleu === 'partager') return { winner: 'égalité', sips: {} };
  if (rouge === 'trahir' && bleu === 'trahir') return { winner: 'égalité', sips: { rouge: 2, bleu: 2 } };
  return { winner: rouge === 'trahir' ? 'rouge' : 'bleu' };
}

function startChoose(s, ctx) {
  s.phase = 'choose';
  s.deadline = ctx.now() + CHOOSE_MS;
  const token = ++s.token;
  ctx.later(CHOOSE_MS, () => s.token === token && s.phase === 'choose' && reveal(s, ctx));
}

/** Choix manquants tirés au hasard, puis révélation simultanée. */
function reveal(s, ctx) {
  for (const camp of ['rouge', 'bleu']) s.choices[camp] ??= CHOICES[Math.floor(ctx.rng() * 2)];
  s.token += 1;
  s.phase = 'reveal';
  s.done = outcomeOf(s.choices.rouge, s.choices.bleu);
}

const details = (s) => ({ choices: { ...s.choices } });

export default {
  id: 'dilemme',
  name: 'Dilemme en or',
  icon: 'dilemme',
  category: 'psychologie',
  rule: 'Le Dilemme en or : un seul peut trahir et gagner.',
  maxMs: TALK_MS + CHOOSE_MS + 3000,
  minContent: 0,
  prepare: () => ({ phase: 'talk', choices: {}, deadline: null, token: 0, talkEndsAt: null, done: null }),
  begin(s, ctx) {
    s.talkEndsAt = ctx.now() + TALK_MS;
    const token = ++s.token;
    ctx.later(TALK_MS, () => s.token === token && startChoose(s, ctx));
  },
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'choose') return 'Pas encore : parlez-vous !';
    if (!CHOICES.includes(data.choice)) return 'Choix invalide.';
    if (s.choices[camp]) return null; // le premier choix est définitif
    s.choices[camp] = data.choice;
    if (s.choices.rouge && s.choices.bleu) reveal(s, ctx);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, sips: s.done.sips ?? null, details: details(s) } : null),
  resolve(s, ctx) {
    if (!s.done) reveal(s, ctx);
    return { winner: s.done.winner, sips: s.done.sips ?? null, details: details(s) };
  },
  view(s, who) {
    const view = {
      phase: s.phase,
      talkEndsAt: s.phase === 'talk' ? s.talkEndsAt : null,
      deadline: s.phase === 'choose' ? s.deadline : null,
      chosen: { rouge: !!s.choices.rouge, bleu: !!s.choices.bleu },
    };
    if (who.kind === 'duelist') view.mine = s.choices[who.side] ?? null; // jamais le choix de l'autre
    if (s.done) view.shown = { ...s.choices };
    return view;
  },
};
