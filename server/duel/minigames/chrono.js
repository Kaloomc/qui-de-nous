// Ordre chronologique : 5 événements (sans leur date) apparaissent mélangés, les mêmes pour les deux duellistes ; il faut les toucher du plus ancien
// au plus récent. Le premier à finir sans erreur gagne ; une erreur coûte 3 s de blocage. Au bout de 30 s : le plus de cartes bien placées,
// puis le plus rapide au dernier placement correct, sinon égalité. Moins de 20 ms d'écart à l'arrivée : une reprise (autre série), puis égalité.
// Confidentialité : les dates ne sont envoyées qu'à la fin ; l'ordre exact des cartes placées par l'adversaire n'est pas montré (seulement leur nombre).
import { loadJson } from '../../games/load.js';

const SERIES = loadJson('../content/ordre-chrono-duel.json');
export const SIZE = 5;
export const BLOCK_MS = 3000;
export const MAX_MS = 30000;
export const SETTLE_MS = 250;
export const TIE_MS = 20;
export const MIN_SERIES = 10;
export const series = () => SERIES;

const CAMPS = ['rouge', 'bleu'];
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const fresh = () => ({ placed: [], blockedUntil: 0, lastAt: null, finishedAt: null });

function newSeries(s, ctx) {
  s.serie = ctx.draw('duel-chrono', s.list);
  // Ordre d'affichage mélangé (même pour les deux) ; `rank` = place chronologique de chaque carte.
  const order = s.serie.evenements.map((_, i) => i).sort(() => ctx.rng() - 0.5);
  s.cards = order.map((i) => ({ id: i, texte: s.serie.evenements[i].texte, annee: s.serie.evenements[i].annee }));
  const years = [...s.cards.map((c) => c.annee)].sort((a, b) => a - b);
  s.cards.forEach((c) => (c.rank = years.indexOf(c.annee)));
  s.p = { rouge: fresh(), bleu: fresh() };
  s.startedAt = ctx.now();
  s.settling = false;
  s.token += 1;
}

function settle(s, ctx, token) {
  if (s.token !== token || s.done) return;
  const finished = CAMPS.filter((c) => s.p[c].finishedAt != null);
  if (finished.length === 2 && Math.abs(s.p.rouge.finishedAt - s.p.bleu.finishedAt) < TIE_MS) {
    if (!s.replayed) {
      s.replayed = true;
      newSeries(s, ctx);
      return;
    }
    s.done = { winner: 'égalité', reason: 'tie' };
    return;
  }
  const winner = finished.length === 1 ? finished[0] : s.p.rouge.finishedAt < s.p.bleu.finishedAt ? 'rouge' : 'bleu';
  s.done = { winner, reason: 'finished' };
}

function byProgress(s) {
  const a = s.p.rouge;
  const b = s.p.bleu;
  if (a.placed.length !== b.placed.length) return a.placed.length > b.placed.length ? 'rouge' : 'bleu';
  if (a.lastAt != null && b.lastAt != null && Math.abs(a.lastAt - b.lastAt) >= TIE_MS) return a.lastAt < b.lastAt ? 'rouge' : 'bleu';
  return 'égalité';
}

const details = (s) => ({ placed: { rouge: s.p.rouge.placed.length, bleu: s.p.bleu.placed.length }, order: s.cards.slice().sort((a, b) => a.rank - b.rank).map((c) => ({ texte: c.texte, annee: c.annee })) });

export default {
  id: 'chrono',
  name: 'Ordre chronologique',
  icon: 'chrono',
  penaltyMs: BLOCK_MS,
  category: 'connaissances',
  maxMs: MAX_MS + 4000,
  minContent: MIN_SERIES,
  available: (game) => (game.duelContent?.chrono ?? SERIES).length >= MIN_SERIES,
  prepare(ctx) {
    const s = { wrongs: { rouge: 0, bleu: 0 }, list: ctx.content.chrono ?? SERIES, token: 0, replayed: false, done: null };
    newSeries(s, ctx);
    return s;
  },
  begin(s, ctx) {
    ctx.later(MAX_MS, () => {
      if (!s.done) s.done = { winner: byProgress(s), reason: 'timeout' };
    });
  },
  action(s, camp, data, ctx) {
    if (s.done) return 'Trop tard.';
    const p = s.p[camp];
    if (!Number.isInteger(data.card) || data.card < 0 || data.card >= SIZE) return 'Carte invalide.';
    const now = ctx.now();
    if (now < p.blockedUntil) return 'Bloqué.';
    const card = s.cards[data.card];
    if (p.placed.includes(data.card) || p.finishedAt != null) return null;
    if (card.rank !== p.placed.length) {
      p.blockedUntil = now + BLOCK_MS; // erreur : 3 s de blocage, la carte n'est pas placée
      s.wrongs[camp] += 1;
      return null;
    }
    p.placed.push(data.card);
    p.lastAt = Math.max(0, now - s.startedAt - ctx.latency(idOf(ctx, camp)));
    if (p.placed.length === SIZE) {
      p.finishedAt = p.lastAt;
      if (!s.settling) {
        s.settling = true;
        const token = s.token;
        ctx.later(SETTLE_MS, () => settle(s, ctx, token));
      }
    }
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: s.done?.winner ?? byProgress(s), details: details(s) }),
  view(s, who) {
    const view = {
      cards: s.cards.map((c, i) => ({ i, texte: c.texte })),
      startedAt: s.startedAt,
      limitMs: MAX_MS,
      wrongs: { ...s.wrongs },
      count: { rouge: s.p.rouge.placed.length, bleu: s.p.bleu.placed.length },
      // Les dates n'apparaissent qu'à la fin de la manche.
      years: s.done ? s.cards.map((c) => c.annee) : null,
    };
    if (who.kind === 'duelist') {
      const me = s.p[who.side];
      view.mine = [...me.placed];
      view.blockedUntil = me.blockedUntil;
    }
    return view;
  },
};
