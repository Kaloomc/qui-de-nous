// Désamorçage : 5 ou 6 fils (couleur ET motif ET numéro) et 3 indices ; le premier à couper le bon fil gagne, un mauvais fil bloque 3 s.
// Le puzzle est généré par programme avec une solution unique (vérifiée par `solve`) et une difficulté constante (toujours 3 indices).
// Confidentialité : le fil à couper n'est jamais envoyé ; les indices, eux, sont publics et identiques pour les deux duellistes.
export const COLORS = [
  { id: 'rouge', name: 'rouge' },
  { id: 'bleu', name: 'bleu' },
  { id: 'vert', name: 'vert' },
  { id: 'jaune', name: 'jaune' },
  { id: 'violet', name: 'violet' },
];
export const PATTERNS = [
  { id: 'uni', name: 'uni' },
  { id: 'raye', name: 'rayé' },
  { id: 'point', name: 'pointillé' },
];
export const MAX_MS = 40000;
export const BLOCK_MS = 3000;
export const SETTLE_MS = 250;
export const TIE_MS = 20;

const colorName = (id) => COLORS.find((c) => c.id === id).name;
const patternName = (id) => PATTERNS.find((p) => p.id === id).name;

/** Un indice : { kind, a, b, text }. Évalué sur le fil `i` d'un jeu de fils : vrai ou faux. */
export function satisfies(wires, i, clue) {
  const w = wires[i];
  const near = [wires[i - 1], wires[i + 1]].filter(Boolean);
  const first = (key, val) => wires.findIndex((x) => x[key] === val);
  switch (clue.kind) {
    case 'is':
      return w[clue.key] === clue.val;
    case 'not':
      return w[clue.key] !== clue.val;
    case 'beside':
      return near.some((x) => x[clue.key] === clue.val);
    case 'notBeside':
      return !near.some((x) => x[clue.key] === clue.val);
    case 'edge':
      return clue.val === 'first' ? i === 0 : i === wires.length - 1;
    case 'notEdge':
      return i !== 0 && i !== wires.length - 1;
    case 'leftOf': {
      const j = first(clue.key, clue.val);
      return j >= 0 && i < j;
    }
    case 'rightOf': {
      const j = first(clue.key, clue.val);
      return j >= 0 && i > j;
    }
    default:
      return false;
  }
}

/** Fils qui satisfont tous les indices (le solveur de vérification : un puzzle valide en a exactement un). */
export const solve = (wires, clues) => wires.map((_, i) => i).filter((i) => clues.every((c) => satisfies(wires, i, c)));

const label = (key, val) => (key === 'color' ? colorName(val) : patternName(val));
function describe(c) {
  const what = c.key ? `fil ${label(c.key, c.val)}` : '';
  switch (c.kind) {
    case 'is':
      return c.key === 'color' ? `Le fil à couper est ${label('color', c.val)}.` : `Le fil à couper est ${label('pattern', c.val)}.`;
    case 'not':
      return c.key === 'color' ? `Le fil à couper n’est pas ${label('color', c.val)}.` : `Le fil à couper n’est pas ${label('pattern', c.val)}.`;
    case 'beside':
      return `Le fil à couper est à côté d’un ${what}.`;
    case 'notBeside':
      return `Le fil à couper n’est pas à côté d’un ${what}.`;
    case 'edge':
      return c.val === 'first' ? 'Le fil à couper est tout à gauche.' : 'Le fil à couper est tout à droite.';
    case 'notEdge':
      return 'Le fil à couper n’est ni tout à gauche ni tout à droite.';
    case 'leftOf':
      return `Le fil à couper est à gauche du premier ${what}.`;
    default:
      return `Le fil à couper est à droite du premier ${what}.`;
  }
}

/** Tous les indices vrais pour le fil `target`. */
function trueClues(wires, target) {
  const out = [];
  for (const key of ['color', 'pattern']) {
    const values = key === 'color' ? COLORS : PATTERNS;
    for (const { id: val } of values) {
      for (const kind of ['is', 'not', 'beside', 'notBeside', 'leftOf', 'rightOf']) {
        const clue = { kind, key, val };
        if (satisfies(wires, target, clue)) out.push(clue);
      }
    }
  }
  for (const kind of ['notEdge']) if (satisfies(wires, target, { kind })) out.push({ kind });
  for (const val of ['first', 'last']) if (satisfies(wires, target, { kind: 'edge', val })) out.push({ kind: 'edge', val });
  return out;
}

/** Génère un puzzle : 5 ou 6 fils, 3 indices, un seul fil possible. `rng` : générateur à graine. */
export function makePuzzle(rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  for (let attempt = 0; attempt < 2000; attempt++) {
    const n = 5 + Math.floor(rng() * 2);
    const wires = Array.from({ length: n }, (_, i) => ({ n: i + 1, color: pick(COLORS).id, pattern: pick(PATTERNS).id }));
    // Deux fils identiques (même couleur ET même motif) rendraient la solution ambiguë.
    if (new Set(wires.map((w) => `${w.color}/${w.pattern}`)).size < n) continue;
    const target = Math.floor(rng() * n);
    const pool = trueClues(wires, target);
    for (let k = 0; k < 40; k++) {
      const chosen = [];
      const bag = [...pool];
      while (chosen.length < 3 && bag.length) chosen.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
      if (chosen.length < 3) break;
      // Aucun indice ne doit désigner à lui seul le fil (difficulté constante) ; ensemble, ils le désignent sans ambiguïté.
      if (chosen.some((c) => solve(wires, [c]).length === 1)) continue;
      if (solve(wires, chosen).length !== 1) continue;
      return { wires, clues: chosen.map((c) => ({ ...c, text: describe(c) })), solution: target };
    }
  }
  throw new Error('puzzle introuvable');
}

function newPuzzle(s, ctx) {
  s.puzzle = makePuzzle(ctx.rng);
  s.startedAt = ctx.now();
  s.cut = {};
  s.settling = false;
  s.token += 1;
  s.wrong = { rouge: 0, bleu: 0 };
  s.blocked = {};
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

function settle(s, ctx, token) {
  if (s.token !== token || s.done) return;
  const times = s.cut;
  const camps = Object.keys(times);
  if (camps.length === 2 && Math.abs(times.rouge - times.bleu) < TIE_MS) {
    // Égalité de vitesse : un seul nouveau puzzle, puis égalité finale.
    if (!s.replayed) {
      s.replayed = true;
      newPuzzle(s, ctx);
      return;
    }
    s.done = { winner: 'égalité', reason: 'tie' };
    return;
  }
  const winner = camps.length === 1 ? camps[0] : times.rouge < times.bleu ? 'rouge' : 'bleu';
  s.done = { winner, reason: 'cut', times };
}

const fewerMistakes = (s) => (s.wrong.rouge === s.wrong.bleu ? 'égalité' : s.wrong.rouge < s.wrong.bleu ? 'rouge' : 'bleu');
const details = (s) => ({ wrong: { ...s.wrong }, reason: s.done?.reason ?? 'timeout', times: s.done?.times ?? null });

export default {
  id: 'defuse',
  name: 'Désamorçage',
  icon: 'defuse',
  penaltyMs: BLOCK_MS,
  category: 'cerveau',
  maxMs: MAX_MS + 2000,
  minContent: 0,
  prepare: (ctx) => {
    const s = { token: 0, replayed: false, done: null };
    newPuzzle(s, ctx);
    return s;
  },
  begin(s, ctx) {
    ctx.later(MAX_MS, () => {
      if (!s.done) s.done = { winner: fewerMistakes(s), reason: 'timeout' };
    });
  },
  action(s, camp, data, ctx) {
    if (s.done) return 'Trop tard.';
    if (!Number.isInteger(data.wire) || data.wire < 0 || data.wire >= s.puzzle.wires.length) return 'Fil invalide.';
    const now = ctx.now();
    if (now < (s.blocked[camp] ?? 0)) return 'Bloqué.';
    if (s.cut[camp] != null) return null;
    if (data.wire !== s.puzzle.solution) {
      s.wrong[camp] += 1;
      s.blocked[camp] = now + BLOCK_MS;
      return null;
    }
    // Temps de coupe compensé de la latence (le puzzle est vu RTT/2 après l'envoi, la coupe arrive RTT/2 après le clic).
    s.cut[camp] = Math.max(0, now - s.startedAt - ctx.latency(idOf(ctx, camp)));
    if (!s.settling) {
      s.settling = true;
      const token = s.token;
      ctx.later(SETTLE_MS, () => settle(s, ctx, token));
    }
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: s.done?.winner ?? fewerMistakes(s), details: details(s) }),
  view(s, who) {
    const view = {
      wires: s.puzzle.wires,
      clues: s.puzzle.clues.map((c) => c.text),
      wrong: { ...s.wrong },
      startedAt: s.startedAt,
      limitMs: MAX_MS,
      // Le fil à couper n'apparaît qu'à la fin de la manche.
      cut: s.done && s.done.winner !== 'égalité' ? s.puzzle.solution : null,
    };
    if (who.kind === 'duelist') view.blockedUntil = s.blocked[who.side] ?? 0;
    return view;
  },
};
