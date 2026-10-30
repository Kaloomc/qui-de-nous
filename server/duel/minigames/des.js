// Dés menteurs : chaque duelliste a un dé qu'il ne voit pas mais que l'adversaire voit. Ils se parlent 30 s (conseils ou bluff, à voix haute), puis
// chacun choisit en secret de garder ou de relancer son dé (10 s, pas de réponse = garder). Le plus haut dé final gagne la manche.
// Égalité : manche rejouée avec de nouveaux dés (elle ne compte pas) ; après 3 égalités de suite, la manche se joue sans relance, avec deux dés
// différents. Le premier à 2 manches gagne, 5 manches au plus.
// Confidentialité : le dé d'un duelliste n'est jamais envoyé à lui-même (ni à la TV, ni aux joueurs sans pari) avant la révélation ; son choix n'est
// jamais envoyé à l'adversaire ni à la TV avant la révélation. Les parieurs de ce duel (`who.bet`) reçoivent les deux dés dans `secret`, et les deux
// choix seulement une fois que les deux sont enregistrés (phase « locked » de 2,5 s, juste avant la révélation).
export const WIN_AT = 2;
export const MAX_ROUNDS = 5;
export const TIES_BEFORE_NO_REROLL = 3;
export const TALK_MS = 30000;
export const DECIDE_MS = 10000;
export const LOCK_MS = 2500; // choix enregistrés : seuls les parieurs les voient, avant la révélation
export const REVEAL_MS = 5500;
export const CHOICES = ['garder', 'relancer'];
const CAMPS = ['rouge', 'bleu'];
const other = (camp) => (camp === 'rouge' ? 'bleu' : 'rouge');
const roll = (rng) => 1 + Math.floor(rng() * 6);

/** Valeur finale d'un dé : relancé (nouveau tirage serveur, éventuellement pire) ou conservé. */
export const finalDie = (die, choice, rng) => (choice === 'relancer' ? roll(rng) : die);

function startRound(s, ctx) {
  s.round += 1;
  s.noReroll = s.ties >= TIES_BEFORE_NO_REROLL;
  s.dice = { rouge: roll(ctx.rng), bleu: roll(ctx.rng) };
  while (s.noReroll && s.dice.rouge === s.dice.bleu) s.dice.bleu = roll(ctx.rng); // sans relance, la manche doit trancher
  s.choice = {};
  s.ready = {};
  s.shown = null;
  s.phase = 'talk';
  s.deadline = ctx.now() + TALK_MS;
  const token = ++s.token;
  ctx.later(TALK_MS, () => s.token === token && s.phase === 'talk' && startDecide(s, ctx));
}

function startDecide(s, ctx) {
  if (s.noReroll) return lock(s, ctx); // pas de relance possible : on passe directement à la révélation
  s.phase = 'decide';
  s.deadline = ctx.now() + DECIDE_MS;
  const token = ++s.token;
  ctx.later(DECIDE_MS, () => s.token === token && s.phase === 'decide' && lock(s, ctx));
}

/** Les deux choix sont enregistrés (absent = garder) : courte pause, puis révélation. */
function lock(s, ctx) {
  for (const c of CAMPS) s.choice[c] ??= 'garder';
  s.phase = 'locked';
  s.deadline = null;
  const token = ++s.token;
  ctx.later(LOCK_MS, () => s.token === token && s.phase === 'locked' && settle(s, ctx));
}

/** Les deux dés finaux sont tirés et la manche est jouée. */
function settle(s, ctx) {
  const choice = Object.fromEntries(CAMPS.map((c) => [c, s.noReroll ? 'garder' : s.choice[c]]));
  const final = Object.fromEntries(CAMPS.map((c) => [c, finalDie(s.dice[c], choice[c], ctx.rng)]));
  const winner = final.rouge === final.bleu ? null : final.rouge > final.bleu ? 'rouge' : 'bleu';
  if (winner) {
    s.wins[winner] += 1;
    s.ties = 0;
  } else s.ties += 1;
  s.shown = { round: s.round, dice: { ...s.dice }, choice, final, winner, noReroll: s.noReroll };
  s.history.push(s.shown);
  s.phase = 'reveal';
  s.deadline = null;
  s.token += 1;
  if (s.wins.rouge >= WIN_AT || s.wins.bleu >= WIN_AT || s.round >= MAX_ROUNDS) {
    s.done = { winner: s.wins.rouge === s.wins.bleu ? 'égalité' : s.wins.rouge > s.wins.bleu ? 'rouge' : 'bleu' };
    return;
  }
  const token = s.token;
  ctx.later(REVEAL_MS, () => s.token === token && startRound(s, ctx));
}

const winnerOf = (s) => (s.wins.rouge === s.wins.bleu ? 'égalité' : s.wins.rouge > s.wins.bleu ? 'rouge' : 'bleu');
const details = (s) => ({ wins: { ...s.wins }, rounds: s.round, history: s.history });

export default {
  id: 'des',
  name: 'Dés menteurs',
  icon: 'des',
  category: 'psychologie',
  maxMs: MAX_ROUNDS * (TALK_MS + DECIDE_MS + LOCK_MS + REVEAL_MS) + 4000,
  minContent: 0,
  prepare: () => ({ round: 0, wins: { rouge: 0, bleu: 0 }, ties: 0, noReroll: false, dice: { rouge: 0, bleu: 0 }, choice: {}, ready: {}, phase: 'talk', deadline: null, shown: null, history: [], token: 0, done: null }),
  begin: (s, ctx) => startRound(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done) return 'Pas maintenant.';
    if (data.round !== undefined && data.round !== s.round) return 'Trop tard : manche suivante.';
    if (data.phase !== undefined && data.phase !== s.phase) return 'Trop tard.';
    if (data.type === 'ready') {
      if (s.phase !== 'talk') return 'Pas maintenant.';
      s.ready[camp] = true;
      if (CAMPS.every((c) => s.ready[c])) startDecide(s, ctx);
      return null;
    }
    if (s.phase !== 'decide') return 'Pas maintenant.';
    if (!CHOICES.includes(data.choice)) return 'Choix invalide.';
    if (s.choice[camp]) return null; // le premier choix est définitif
    s.choice[camp] = data.choice;
    if (CAMPS.every((c) => s.choice[c])) lock(s, ctx);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: winnerOf(s), details: details(s) }),
  view(s, who) {
    const live = s.phase === 'talk' || s.phase === 'decide';
    const view = {
      round: s.round,
      max: MAX_ROUNDS,
      wins: { ...s.wins },
      ties: s.ties,
      noReroll: s.noReroll,
      phase: s.phase,
      deadline: live ? s.deadline : null,
      chosen: s.phase === 'locked' ? { rouge: true, bleu: true } : { rouge: !!s.choice.rouge, bleu: !!s.choice.bleu },
      ready: { rouge: !!s.ready.rouge, bleu: !!s.ready.bleu },
      shown: s.phase === 'reveal' ? s.shown : null,
      history: s.history.map((h) => ({ round: h.round, winner: h.winner })),
    };
    if (who.kind === 'duelist') {
      view.opponentDie = s.phase === 'reveal' ? null : s.dice[other(who.side)]; // jamais son propre dé
      view.mine = s.choice[who.side] ?? null; // jamais le choix de l'adversaire
    } else if (who.kind === 'bettor' && who.bet && s.phase !== 'reveal') {
      view.secret = { dice: { ...s.dice }, choices: s.phase === 'locked' ? { ...s.choice } : null };
    }
    return view;
  },
};
