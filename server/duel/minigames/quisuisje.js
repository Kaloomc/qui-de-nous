// Qui suis-je ? : 3 énigmes. Pour chacune, 4 indices s'affichent un par un toutes les 5 s (du plus difficile au plus facile) ; chacun peut
// répondre à tout moment parmi 4 choix. Bonne réponse = nombre d'indices non encore affichés + 1 (4 points au premier indice, 1 au dernier) ;
// mauvaise réponse = aucun point perdu, simple blocage jusqu'à l'indice suivant. Le plus de points gagne ; égalité : 4e énigme, puis égalité.
// Chaque duelliste voit tout de suite le résultat de SON geste (juste + points, ou raté), sans attendre l'autre ; l'adversaire n'en voit rien.
// Confidentialité : la bonne réponse n'est envoyée à personne avant la fin de l'énigme ; les indices à venir non plus.
import { loadJson } from '../../games/load.js';

const RIDDLES = loadJson('../content/qui-suis-je-duel.json');
export const COUNT = 3;
export const SUDDEN = 1;
export const CLUES = 4;
export const CLUE_MS = 5000;
export const TAIL_MS = 5000; // après le 4e indice
export const REVEAL_MS = 2200;
export const MIN_RIDDLES = 10;
export const riddles = () => RIDDLES;

/** Points d'une bonne réponse quand `shown` indices (1 à 4) sont affichés. */
export const pointsFor = (shown) => CLUES - shown + 1;
const CAMPS = ['rouge', 'bleu'];
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

function nextRiddle(s, ctx) {
  s.n += 1;
  s.r = ctx.draw('duel-qui', s.list);
  // Les 4 choix sont mélangés (le même ordre pour les deux).
  const order = [0, 1, 2, 3].sort(() => ctx.rng() - 0.5);
  s.choices = order.map((i) => s.r.choix[i]);
  s.right = order.indexOf(s.r.bonne);
  s.phase = 'ask';
  s.startedAt = ctx.now();
  s.answered = {};
  s.mine = { rouge: { choice: null, points: 0, wrong: [] }, bleu: { choice: null, points: 0, wrong: [] } };
  s.blockedUntilClue = {};
  s.shown = null;
  const token = ++s.token;
  for (let k = 1; k < CLUES; k++) ctx.later(k * CLUE_MS, () => s.token === token && s.phase === 'ask' && showClue(s, k + 1));
  ctx.later(CLUES * CLUE_MS - CLUE_MS + TAIL_MS, () => s.token === token && s.phase === 'ask' && endRiddle(s, ctx, token));
}

/** Nombre d'indices visibles à `t` ms du début (1 au départ, jusqu'à 4). */
export const cluesAt = (t) => Math.min(CLUES, 1 + Math.floor(Math.max(0, t) / CLUE_MS));
function showClue(s, k) {
  s.clueCount = k;
}

function endRiddle(s, ctx, token) {
  if (s.token !== token || s.phase !== 'ask') return;
  s.shown = { n: s.n, right: s.right, answer: s.r.choix[s.r.bonne], gained: { ...s.gain } };
  s.history.push({ n: s.n, gain: { ...s.gain } });
  s.gain = { rouge: 0, bleu: 0 };
  s.phase = 'reveal';
  s.token += 1;
  const lead = s.score.rouge === s.score.bleu ? null : s.score.rouge > s.score.bleu ? 'rouge' : 'bleu';
  if (s.n >= COUNT + SUDDEN) s.done = { winner: lead ?? 'égalité' };
  else if (s.n >= COUNT && lead) s.done = { winner: lead };
  else {
    const next = s.token;
    ctx.later(REVEAL_MS, () => s.token === next && nextRiddle(s, ctx));
  }
}

const winnerOf = (s) => (s.score.rouge === s.score.bleu ? 'égalité' : s.score.rouge > s.score.bleu ? 'rouge' : 'bleu');
const details = (s) => ({ score: { ...s.score }, riddles: s.n });

export default {
  id: 'quisuisje',
  name: 'Qui suis-je ?',
  icon: 'quisuisje',
  category: 'connaissances',
  maxMs: (COUNT + SUDDEN) * (CLUES * CLUE_MS + TAIL_MS + REVEAL_MS) + 4000,
  minContent: MIN_RIDDLES,
  available: (game) => (game.duelContent?.qui ?? RIDDLES).length >= MIN_RIDDLES,
  prepare: (ctx) => ({ list: ctx.content.qui ?? RIDDLES, n: 0, r: null, choices: [], right: -1, phase: 'ask', startedAt: null, clueCount: 1, score: { rouge: 0, bleu: 0 }, gain: { rouge: 0, bleu: 0 }, answered: {}, mine: {}, blockedUntilClue: {}, history: [], shown: null, token: 0, done: null }),
  begin: (s, ctx) => nextRiddle(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'ask') return 'Pas maintenant.';
    if (data.n !== undefined && data.n !== s.n) return 'Trop tard : énigme suivante.';
    if (!Number.isInteger(data.choice) || data.choice < 0 || data.choice > 3) return 'Choix invalide.';
    if (s.answered[camp]) return null;
    // Indices visibles au moment du geste : l'heure compensée de la latence du joueur (ce qu'il voyait quand il a touché).
    const t = ctx.now() - s.startedAt - ctx.latency(idOf(ctx, camp));
    const seen = cluesAt(t);
    if (s.blockedUntilClue[camp] != null && seen <= s.blockedUntilClue[camp]) return 'Bloqué jusqu’au prochain indice.';
    if (data.choice === s.right) {
      s.answered[camp] = true;
      const pts = pointsFor(seen);
      s.score[camp] += pts;
      s.gain[camp] += pts;
      s.mine[camp].choice = data.choice;
      s.mine[camp].points = pts;
    } else {
      if (!s.mine[camp].wrong.includes(data.choice)) s.mine[camp].wrong.push(data.choice);
      s.blockedUntilClue[camp] = seen;
    }
    // L'énigme se termine quand les deux ont trouvé.
    if (CAMPS.every((c) => s.answered[c])) endRiddle(s, ctx, s.token);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: winnerOf(s), details: details(s) }),
  view(s, who, ctx) {
    const t = s.startedAt != null && ctx ? ctx.now() - s.startedAt : 0;
    const shown = s.phase === 'ask' ? cluesAt(t) : CLUES;
    const view = {
      n: s.n,
      count: COUNT,
      phase: s.phase,
      startedAt: s.startedAt,
      clueMs: CLUE_MS,
      // Seuls les indices déjà affichés sont envoyés (jamais les suivants).
      clues: s.r ? s.r.indices.slice(0, shown) : [],
      choices: s.choices,
      score: { ...s.score },
      done: { rouge: !!s.answered.rouge, bleu: !!s.answered.bleu },
      reveal: s.phase === 'reveal' ? s.shown : null,
    };
    if (who.kind === 'duelist') {
      view.blockedUntilClue = s.blockedUntilClue[who.side] ?? null;
      view.mine = s.mine[who.side] ?? null; // son propre résultat, tout de suite
    }
    return view;
  },
};
