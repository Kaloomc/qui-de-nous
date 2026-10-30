// Plateau fantôme : de petits personnages défilent sur la TV pendant 6 à 7 s (les téléphones restent vides), puis une question de
// comptage apparaît avec 4 choix : le premier à répondre juste marque, une mauvaise réponse bloque 2 s. 3 passages, 2 points gagnent ;
// 1-1 → 4e passage, puis égalité finale. Tout est généré par programme à partir d'une graine : le comptage est exact et sans ambiguïté.
// Confidentialité : la scène (les personnages) n'est envoyée qu'à la TV, pendant le défilé ; la bonne réponse jamais avant la fin de la question.
export const COLORS = [
  { id: 'rouge', name: 'rouge', shape: 'rond' },
  { id: 'bleu', name: 'bleu', shape: 'carré' },
  { id: 'vert', name: 'vert', shape: 'triangle' },
  { id: 'jaune', name: 'jaune', shape: 'étoile' },
  { id: 'violet', name: 'violet', shape: 'losange' },
];
export const ACCESSORIES = ['chapeau', 'cape', 'echarpe', 'aucun'];
export const WIN_AT = 2;
export const PASSES = 3;
export const SUDDEN_PASSES = 1;
export const QUESTION_MS = 7000;
export const BLOCK_MS = 2000;
export const SETTLE_MS = 250;
export const REVEAL_MS = 1800;
export const TIE_MS = 20;

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/** Une scène : 10 à 14 personnages qui traversent l'écran, chacun avec une couleur, un accessoire, un sens et un saut (oui / non). */
export function makeScene(rng) {
  const n = 10 + Math.floor(rng() * 5);
  const durationMs = 6000 + Math.floor(rng() * 2) * 1000;
  const chars = Array.from({ length: n }, (_, i) => ({
    id: i,
    color: pick(rng, COLORS).id,
    accessory: pick(rng, ACCESSORIES),
    dir: rng() < 0.5 ? 'gauche' : 'droite',
    jumps: rng() < 0.4,
    // Chacun entre en scène à un instant distinct et traverse en 2,6 s : tout est visible en entier (aucun personnage coupé).
    start: Math.round((i / n) * (durationMs - 2600)),
    lane: i % 3,
  }));
  return { chars, durationMs };
}

const QUESTIONS = {
  chapeau: { text: 'Combien de personnages portaient un chapeau ?', count: (c) => c.accessory === 'chapeau' },
  cape: { text: 'Combien de personnages portaient une cape ?', count: (c) => c.accessory === 'cape' },
  echarpe: { text: 'Combien de personnages portaient une écharpe ?', count: (c) => c.accessory === 'echarpe' },
  gauche: { text: 'Combien de personnages sont allés vers la gauche ?', count: (c) => c.dir === 'gauche' },
  droite: { text: 'Combien de personnages sont allés vers la droite ?', count: (c) => c.dir === 'droite' },
  saut: { text: 'Combien de personnages ont sauté ?', count: (c) => c.jumps },
  couleur: { text: 'Quelle couleur est passée le plus souvent ?' },
};

/** Réponse exacte d'un type de question, recalculée à partir de la scène : un nombre, ou l'id de la couleur gagnante (null si ex æquo). */
export function answerOf(kind, scene) {
  if (kind === 'couleur') {
    const counts = Object.fromEntries(COLORS.map((c) => [c.id, scene.chars.filter((x) => x.color === c.id).length]));
    const best = Math.max(...Object.values(counts));
    const top = Object.keys(counts).filter((c) => counts[c] === best);
    return top.length === 1 ? top[0] : null;
  }
  return scene.chars.filter(QUESTIONS[kind].count).length;
}

/**
 * Une question sur la scène : 4 choix distincts dont un seul juste. Les types sans réponse unique (ex æquo de couleurs, zéro personnage)
 * sont écartés. `avoid` : types déjà posés.
 */
export function makeQuestion(scene, rng, avoid = []) {
  const kinds = Object.keys(QUESTIONS).filter((k) => !avoid.includes(k));
  for (let tries = 0; tries < 60; tries++) {
    const kind = pick(rng, kinds.length ? kinds : Object.keys(QUESTIONS));
    const right = answerOf(kind, scene);
    if (right == null || right === 0) continue;
    let choices;
    if (kind === 'couleur') {
      const others = COLORS.map((c) => c.id).filter((c) => c !== right);
      choices = [right, ...others.sort(() => rng() - 0.5).slice(0, 3)];
      choices = choices.map((id) => COLORS.find((c) => c.id === id).name[0].toUpperCase() + COLORS.find((c) => c.id === id).name.slice(1) + ` (${COLORS.find((c) => c.id === id).shape})`);
    } else {
      const pool = [];
      for (let d = -3; d <= 3; d++) if (d !== 0 && right + d >= 0) pool.push(right + d);
      choices = [right, ...pool.sort(() => rng() - 0.5).slice(0, 3)].map(String);
    }
    const shuffled = choices.map((c, i) => ({ c, i, k: rng() })).sort((a, b) => a.k - b.k);
    return { kind, text: QUESTIONS[kind].text, choices: shuffled.map((x) => x.c), right: shuffled.findIndex((x) => x.i === 0) };
  }
  throw new Error('question introuvable');
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const CAMPS = ['rouge', 'bleu'];

function startPass(s, ctx) {
  s.n += 1;
  s.scene = makeScene(ctx.rng);
  s.q = makeQuestion(s.scene, ctx.rng, s.asked);
  s.asked.push(s.q.kind);
  s.phase = 'scene';
  s.sceneAt = ctx.now();
  s.correct = {};
  s.blocked = {};
  s.settled = false;
  s.shown = null;
  const token = ++s.token;
  ctx.later(s.scene.durationMs + 400, () => s.token === token && startQuestion(s, ctx, token));
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
  s.shown = { n: s.n, right: s.q.right, scorer, tie };
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
  maxMs: 75000,
  minContent: 0,
  prepare: () => ({ n: 0, score: { rouge: 0, bleu: 0 }, asked: [], phase: 'scene', token: 0, done: null }),
  begin: (s, ctx) => startPass(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'ask') return 'Pas maintenant.';
    if (data.n !== undefined && data.n !== s.n) return 'Trop tard : passage suivant.';
    if (!Number.isInteger(data.choice) || data.choice < 0 || data.choice > 3) return 'Choix invalide.';
    const now = ctx.now();
    if (now < (s.blocked[camp] ?? 0)) return 'Bloqué.';
    if (s.correct[camp] != null) return null;
    if (data.choice !== s.q.right) {
      s.blocked[camp] = now + BLOCK_MS;
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
    const view = {
      n: s.n,
      passes: PASSES,
      score: { ...s.score },
      phase: s.phase,
      question: s.phase === 'ask' || s.phase === 'reveal' ? s.q.text : null,
      choices: s.phase === 'ask' || s.phase === 'reveal' ? s.q.choices : [],
      askedAt: s.askedAt,
      endsAt: s.phase === 'ask' ? s.askedAt + QUESTION_MS : null,
      sceneAt: s.phase === 'scene' ? s.sceneAt : null,
      sceneMs: s.phase === 'scene' ? s.scene.durationMs : 0,
      shown: s.phase === 'reveal' ? s.shown : null,
    };
    // La scène : la TV seulement, et seulement pendant le défilé (les téléphones restent vides).
    if (who.kind === 'tv' && s.phase === 'scene') view.scene = s.scene;
    if (who.kind === 'duelist') view.blockedUntil = s.blocked[who.side] ?? 0;
    return view;
  },
};
