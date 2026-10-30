// Plateau fantôme : une scène très courte sur la TV (les téléphones restent vides), puis une question évidente à 4 choix. Une seule règle par
// passage : « Quel animal a disparu ? », « Quel animal est arrivé ? » ou « Combien d'animaux sont passés derrière le rideau ? ».
// Le premier à répondre juste marque, une mauvaise réponse bloque 2 s. 3 passages, 2 points gagnent ; 1-1 → 4e passage, puis égalité finale.
// Les animaux sont des illustrations Twemoji (client/public/twemoji, CC-BY 4.0, crédit dans le README). Tout est généré à partir d'une graine :
// la réponse est unique et vérifiable.
// Confidentialité : la scène n'est envoyée qu'à la TV, pendant l'animation ; la bonne réponse jamais avant la fin de la question.
export const ANIMALS = ['dog', 'cat', 'frog', 'fox', 'panda', 'monkey', 'lion', 'pig', 'octopus', 'penguin', 'unicorn', 'tiger'];
export const KINDS = ['disparu', 'nouveau', 'compte'];
export const WIN_AT = 2;
export const PASSES = 3;
export const SUDDEN_PASSES = 1;
export const QUESTION_MS = 9000; // temps suffisant pour lire et répondre
export const BLOCK_MS = 2000;
export const SETTLE_MS = 250;
export const REVEAL_MS = 1800;
export const TIE_MS = 20;

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const shuffle = (rng, list) => list.map((x) => [rng(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
/** `count` éléments distincts de `list`, hors `exclude`. */
const some = (rng, list, count, exclude = []) => shuffle(rng, list.filter((x) => !exclude.includes(x))).slice(0, count);

/**
 * Un passage : { kind, scene, text, choices: [{ img } | { text }], right }.
 *  disparu : 3 à 5 animaux, un disparaît derrière le rideau ; nouveau : 3 ou 4 animaux, un de plus arrive ;
 *  compte : 2 à 6 animaux traversent la scène derrière le rideau, on les compte.
 * Les 4 choix sont toujours distincts, un seul est juste.
 */
export function makeRound(rng, kind = pick(rng, KINDS)) {
  if (kind === 'disparu') {
    const n = 3 + Math.floor(rng() * 3);
    const before = some(rng, ANIMALS, n);
    const gone = pick(rng, before);
    const after = before.filter((a) => a !== gone);
    const lures = [...some(rng, after, 3), ...some(rng, ANIMALS, 3, [gone, ...after])].slice(0, 3);
    const choices = shuffle(rng, [gone, ...lures]);
    return { kind, scene: { before, after, durationMs: 7500 }, text: 'Quel animal a disparu ?', choices: choices.map((img) => ({ img })), right: choices.indexOf(gone) };
  }
  if (kind === 'nouveau') {
    const n = 3 + Math.floor(rng() * 2);
    const before = some(rng, ANIMALS, n);
    const added = pick(rng, ANIMALS.filter((a) => !before.includes(a)));
    const after = [...before];
    after.splice(Math.floor(rng() * (n + 1)), 0, added);
    const lures = [...some(rng, before, 2), ...some(rng, ANIMALS, 2, [added, ...before])].slice(0, 3);
    const choices = shuffle(rng, [added, ...lures]);
    return { kind, scene: { before, after, durationMs: 7500 }, text: 'Quel animal est arrivé ?', choices: choices.map((img) => ({ img })), right: choices.indexOf(added) };
  }
  const total = 2 + Math.floor(rng() * 5);
  const walkers = Array.from({ length: total }, () => pick(rng, ANIMALS));
  const numbers = [total, ...some(rng, [1, 2, 3, 4, 5, 6, 7, 8], 3, [total])].sort((a, b) => a - b);
  return { kind: 'compte', scene: { walkers, durationMs: 2500 + total * 1100 }, text: 'Combien d’animaux sont passés derrière le rideau ?', choices: numbers.map((x) => ({ text: String(x) })), right: numbers.indexOf(total) };
}

/** Réponse attendue recalculée à partir de la scène seule (sert aux tests : elle doit toujours retrouver la bonne case). */
export function answerFromScene(round) {
  const { kind, scene } = round;
  if (kind === 'disparu') return scene.before.find((a) => !scene.after.includes(a));
  if (kind === 'nouveau') return scene.after.find((a) => !scene.before.includes(a));
  return String(scene.walkers.length);
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const CAMPS = ['rouge', 'bleu'];

function startPass(s, ctx) {
  s.n += 1;
  s.round = makeRound(ctx.rng, s.n === 1 ? undefined : pick(ctx.rng, KINDS.filter((k) => k !== s.round?.kind)));
  s.phase = 'scene';
  s.sceneAt = ctx.now();
  s.correct = {};
  s.blocked = {};
  s.settled = false;
  s.shown = null;
  const token = ++s.token;
  ctx.later(s.round.scene.durationMs + 400, () => s.token === token && startQuestion(s, ctx, token));
}

function startQuestion(s, ctx, token) {
  s.phase = 'ask';
  s.askedAt = ctx.now();
  ctx.later(QUESTION_MS, () => s.token === token && s.phase === 'ask' && settle(s, ctx, token));
}

function settle(s, ctx, token) {
  if (s.token !== token || s.phase !== 'ask') return;
  const ok = CAMPS.filter((c) => s.correct[c] != null);
  let scorer = null;
  let tie = false;
  if (ok.length === 1) scorer = ok[0];
  else if (ok.length === 2) {
    const gap = s.correct.rouge - s.correct.bleu;
    if (Math.abs(gap) < TIE_MS) tie = true;
    else scorer = gap < 0 ? 'rouge' : 'bleu';
  }
  if (scorer) s.score[scorer] += 1;
  s.shown = { n: s.n, right: s.round.right, scorer, tie };
  s.phase = 'reveal';
  s.token += 1;
  const lead = s.score.rouge === s.score.bleu ? null : s.score.rouge > s.score.bleu ? 'rouge' : 'bleu';
  if (s.score.rouge >= WIN_AT || s.score.bleu >= WIN_AT) s.done = { winner: lead };
  else if (s.n >= PASSES + SUDDEN_PASSES) s.done = { winner: lead ?? 'égalité' };
  else if (s.n >= PASSES && lead) s.done = { winner: lead };
  else {
    const next = s.token;
    ctx.later(REVEAL_MS, () => s.token === next && startPass(s, ctx));
  }
}

const winnerOf = (s) => (s.score.rouge === s.score.bleu ? 'égalité' : s.score.rouge > s.score.bleu ? 'rouge' : 'bleu');
const details = (s) => ({ score: { ...s.score }, passes: s.n });

export default {
  id: 'plateau',
  name: 'Plateau fantôme',
  icon: 'plateau',
  category: 'attention',
  penaltyMs: BLOCK_MS,
  maxMs: 80000,
  minContent: 0,
  prepare: () => ({ wrongs: { rouge: 0, bleu: 0 }, n: 0, score: { rouge: 0, bleu: 0 }, round: null, phase: 'scene', token: 0, done: null }),
  begin: (s, ctx) => startPass(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'ask') return 'Pas maintenant.';
    if (data.n !== undefined && data.n !== s.n) return 'Trop tard : passage suivant.';
    if (!Number.isInteger(data.choice) || data.choice < 0 || data.choice > 3) return 'Choix invalide.';
    const now = ctx.now();
    if (now < (s.blocked[camp] ?? 0)) return 'Bloqué.';
    if (s.correct[camp] != null) return null;
    if (data.choice !== s.round.right) {
      s.blocked[camp] = now + BLOCK_MS;
      s.wrongs[camp] += 1;
      return null;
    }
    s.correct[camp] = Math.max(0, now - s.askedAt - ctx.latency(idOf(ctx, camp)));
    if (!s.settled) {
      s.settled = true;
      const token = s.token;
      ctx.later(SETTLE_MS, () => settle(s, ctx, token));
    }
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: winnerOf(s), details: details(s) }),
  view(s, who) {
    const asking = s.phase === 'ask' || s.phase === 'reveal';
    const view = {
      n: s.n,
      passes: PASSES,
      wrongs: { ...s.wrongs },
      score: { ...s.score },
      phase: s.phase,
      question: asking ? s.round.text : null,
      choices: asking ? s.round.choices : [],
      askedAt: s.askedAt,
      endsAt: s.phase === 'ask' ? s.askedAt + QUESTION_MS : null,
      sceneAt: s.phase === 'scene' ? s.sceneAt : null,
      sceneMs: s.phase === 'scene' ? s.round.scene.durationMs : 0,
      shown: s.phase === 'reveal' ? s.shown : null,
    };
    // La scène : la TV seulement, et seulement pendant l'animation (les téléphones restent vides).
    if (who.kind === 'tv' && s.phase === 'scene') view.scene = { kind: s.round.kind, ...s.round.scene };
    if (who.kind === 'duelist') view.blockedUntil = s.blocked[who.side] ?? 0;
    return view;
  },
};
