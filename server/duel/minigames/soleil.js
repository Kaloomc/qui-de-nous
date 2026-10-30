// 1-2-3 Soleil : chaque duelliste maintient un bouton pour avancer vers l'arrivée ; la voix de la TV dit « Un… Deux… Trois… Soleil ! »
// à un rythme imprévisible. À « Soleil », il faut avoir lâché (tolérance de 250 ms, compensée de la latence), sinon on recule d'un quart
// du parcours. Le premier à l'arrivée gagne ; au bout de 40 s, le plus avancé. Moins de 20 ms d'écart : on rejoue une fois, puis égalité.
// Équité : les états appuyé / relâché arrivent horodatés par le serveur et sont ramenés à l'instant réel du geste (réception − RTT/2).
export const RATE = 1 / 22000; // part du parcours par ms d'appui : 22 s d'appui continu
export const MAX_MS = 40000;
export const TOLERANCE_MS = 250;
export const PENALTY = 0.25;
export const SETTLE_MS = 250;
export const TIE_MS = 20;
export const TICK_MS = 100;
export const WORDS = ['un', 'deux', 'trois', 'soleil'];
/** Au moins 700 ms entre deux mots : la voix n'est jamais coupée ni chevauchée. */
export const MIN_GAP_MS = 700;

/**
 * Pause avant chaque mot du cycle (4 valeurs). Rythme imprévisible : le plus souvent 0,7 à 1,2 s, parfois très rapide (minimum),
 * parfois un long silence, surtout avant « Soleil ».
 */
export function cycleGaps(rng) {
  const pick = (lo, hi) => Math.round(lo + rng() * (hi - lo));
  const gap = (long) => {
    const r = rng();
    if (long && r < 0.45) return pick(1800, 3000);
    if (r < 0.25) return MIN_GAP_MS;
    if (r < 0.35) return pick(1800, 2600);
    return pick(MIN_GAP_MS, 1300);
  };
  return [gap(true), gap(false), gap(false), gap(true)];
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const fresh = () => ({ pos: 0, holding: false, since: null, events: [], penalties: 0 });

/** Position à l'instant réel `t` (ms depuis le départ). */
const posAt = (p, t) => Math.min(1, p.pos + (p.holding ? RATE * Math.max(0, t - p.since) : 0));
/** Fige la position à `t` (avant un recul ou un relâchement). */
function settlePos(p, t) {
  p.pos = posAt(p, t);
  if (p.holding) p.since = t;
}
/** Le joueur appuyait-il à l'instant réel `t` ? (d'après les événements déjà reçus, ramenés à leur instant réel). */
const holdingAt = (p, t) => p.events.filter((e) => e.t <= t).at(-1)?.down ?? false;
/** Instant d'arrivée à 100 % si le joueur garde le doigt appuyé (ms réels), ou null. */
const finishTime = (p) => (p.holding ? p.since + (1 - p.pos) / RATE : null);

function startCycle(s, ctx, token) {
  if (s.token !== token || s.done) return;
  const gaps = cycleGaps(ctx.rng);
  let i = 0;
  const next = () => {
    if (s.token !== token || s.done) return;
    ctx.later(gaps[i], () => {
      if (s.token !== token) return;
      s.cue = { word: WORDS[i], index: i, at: ctx.now(), n: (s.cue?.n ?? 0) + 1 };
      s.sun = i === 3;
      if (i === 3) onSun(s, ctx, token);
      i += 1;
      if (i < 4) next();
      else ctx.later(1400, () => s.token === token && ((s.sun = false), startCycle(s, ctx, token)));
    });
  };
  next();
}

/** « Soleil » : après la tolérance (et le temps d'arrivée des derniers événements), on recule ceux qui étaient encore appuyés. */
function onSun(s, ctx, token) {
  const sunAt = ctx.now();
  s.sunAt = sunAt;
  for (const camp of ['rouge', 'bleu']) {
    const grace = Math.min(1000, ctx.latency(idOf(ctx, camp))) + 60;
    ctx.later(TOLERANCE_MS + grace, () => {
      if (s.token !== token || s.done || s.sunAt !== sunAt) return;
      const p = s.p[camp];
      const t = s.sunAt + (s.spokenAt != null && s.spokenAt >= s.sunAt ? s.spokenAt - s.sunAt : 0) + TOLERANCE_MS - s.startedAt;
      if (holdingAt(p, t)) {
        settlePos(p, ctx.now() - s.startedAt - ctx.latency(idOf(ctx, camp)) / 2);
        p.pos = Math.max(0, p.pos - PENALTY);
        p.penalties += 1;
        s.lastPenalty = { camp, n: p.penalties };
      }
    });
  }
}

function tick(s, ctx, token) {
  if (s.token !== token || s.done) return;
  ctx.later(TICK_MS, () => tick(s, ctx, token));
  if (s.settling) return;
  const now = ctx.now() - s.startedAt;
  const reached = ['rouge', 'bleu'].filter((c) => posAt(s.p[c], now - ctx.latency(idOf(ctx, c)) / 2) >= 1);
  if (reached.length) {
    s.settling = true;
    ctx.later(SETTLE_MS, () => settle(s, ctx, token));
  }
}

function settle(s, ctx, token) {
  if (s.token !== token || s.done) return;
  const t = {};
  for (const c of ['rouge', 'bleu']) {
    const f = finishTime(s.p[c]);
    // Arrivée : si déjà à 100 %, l'instant où le parcours a été complété.
    if (s.p[c].pos >= 1) t[c] = s.p[c].doneAt ?? 0;
    else if (f != null && posAt(s.p[c], ctx.now() - s.startedAt - ctx.latency(idOf(ctx, c)) / 2) >= 1) t[c] = f;
  }
  const done = Object.keys(t);
  if (done.length === 2 && Math.abs(t.rouge - t.bleu) < TIE_MS) {
    if (!s.replayed) {
      s.replayed = true;
      reset(s, ctx);
      return;
    }
    s.done = { winner: 'égalité', reason: 'tie' };
    return;
  }
  const winner = done.length === 1 ? done[0] : t.rouge < t.bleu ? 'rouge' : 'bleu';
  s.done = { winner, reason: 'finish' };
}

function reset(s, ctx) {
  s.token += 1;
  s.p = { rouge: fresh(), bleu: fresh() };
  s.startedAt = ctx.now();
  s.settling = false;
  s.sun = false;
  s.cue = null;
  const token = s.token;
  startCycle(s, ctx, token);
  tick(s, ctx, token);
}

const leader = (s, ctx) => {
  const now = ctx.now() - s.startedAt;
  const a = posAt(s.p.rouge, now);
  const b = posAt(s.p.bleu, now);
  return Math.abs(a - b) < 1e-6 ? 'égalité' : a > b ? 'rouge' : 'bleu';
};
const details = (s) => ({ pos: { rouge: s.p.rouge.pos, bleu: s.p.bleu.pos }, penalties: { rouge: s.p.rouge.penalties, bleu: s.p.bleu.penalties } });

export default {
  id: 'soleil',
  name: '1-2-3 Soleil',
  icon: 'soleil',
  category: 'nerfs',
  maxMs: MAX_MS + 2500,
  minContent: 0,
  prepare: () => ({ token: 0, replayed: false, done: null, p: { rouge: fresh(), bleu: fresh() }, startedAt: null, cue: null, sun: false, sunAt: null, spokenAt: null, settling: false, lastPenalty: null }),
  begin(s, ctx) {
    s.startedAt = ctx.now();
    const token = s.token;
    startCycle(s, ctx, token);
    tick(s, ctx, token);
    ctx.later(MAX_MS, () => {
      if (!s.done) s.done = { winner: leader(s, ctx), reason: 'timeout' };
    });
  },
  /** La TV signale que « Soleil » commence vraiment à être dit : le vrai départ de la tolérance. */
  host(s, action, ctx) {
    if (action.word === 'soleil' && s.sun && s.spokenAt == null && ctx.now() - s.sunAt < 3000) s.spokenAt = ctx.now();
  },
  action(s, camp, data, ctx) {
    if (s.done || data.type !== 'hold') return null;
    const p = s.p[camp];
    const down = !!data.down;
    if (down === p.holding) return null;
    // Instant réel du geste : réception moins un aller simple.
    const t = Math.max(0, ctx.now() - s.startedAt - ctx.latency(idOf(ctx, camp)) / 2);
    if (down) {
      p.holding = true;
      p.since = t;
    } else {
      settlePos(p, t);
      p.holding = false;
      p.since = null;
    }
    p.events.push({ t, down });
    if (p.pos >= 1) p.doneAt = t;
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s, ctx) => ({ winner: s.done?.winner ?? leader(s, ctx), details: details(s) }),
  view(s, who, ctx) {
    const now = s.startedAt != null && ctx ? ctx.now() - s.startedAt : 0;
    const view = {
      pos: { rouge: posAt(s.p.rouge, now), bleu: posAt(s.p.bleu, now) },
      holding: { rouge: s.p.rouge.holding, bleu: s.p.bleu.holding },
      cue: s.cue,
      sun: s.sun,
      penalties: { rouge: s.p.rouge.penalties, bleu: s.p.bleu.penalties },
      voice: !!ctx?.voice,
      startedAt: s.startedAt,
      limitMs: MAX_MS,
      rate: RATE,
      at: ctx ? ctx.now() : 0, // heure serveur de cette vue : le client prolonge les barres qui avancent depuis ce point
    };
    if (who.kind === 'duelist') view.me = who.side;
    return view;
  },
};
