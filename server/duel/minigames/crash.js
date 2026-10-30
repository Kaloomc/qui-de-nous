// Le Crash : un multiplicateur grimpe de 1,00x de plus en plus vite ; chaque duelist peut « BANQUER » pour verrouiller sa valeur.
// Il explose à un moment tiré par le serveur avant le duel et jamais communiqué : qui n'a pas banqué avant l'explosion a 0.
// La plus grande valeur gagne. Les deux à 0 (ou la même valeur) : on rejoue une fois avec un nouveau point d'explosion, puis égalité.
// Équité : le multiplicateur est une fonction du temps serveur ; la valeur banquée est calculée côté serveur, au temps du joueur
// (heure de réception moins son aller-retour réseau : ce qu'il voyait quand il a appuyé).
export const MIN_CRASH = 1.5;
export const MAX_CRASH = 20;
export const MAX_RUN_MS = 18000; // durée de la montée jusqu'à 20x
export const RATE = Math.log(MAX_CRASH) / MAX_RUN_MS; // par ms : m(t) = e^(RATE · t)
export const GRACE_CAP_MS = 1500;
export const PAUSE_MS = 1800;

/** Valeur du multiplicateur à `t` ms du départ. */
export const multiplierAt = (t) => Math.exp(RATE * Math.max(0, t));
/** Temps (ms) auquel le multiplicateur atteint `m`. */
export const timeOf = (m) => Math.log(m) / RATE;
const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

/**
 * Point d'explosion : jamais en dessous de 1,50x, probabilité décroissante (P(explosion au-delà de x) = 1,5 / x), 20x au plus.
 * Beaucoup d'explosions basses, rarement très haut.
 */
export function drawCrash(rng) {
  const u = rng();
  return Math.min(MAX_CRASH, Math.max(MIN_CRASH, floor2(MIN_CRASH / (1 - u))));
}

const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

function newRun(s, ctx) {
  s.crash = drawCrash(ctx.rng);
  s.startedAt = ctx.now();
  s.banked = {};
  s.crashedAt = null;
  s.token += 1;
  const token = s.token;
  ctx.later(Math.ceil(timeOf(s.crash)), () => s.token === token && explode(s, ctx, token));
}

/** Explosion : on laisse un court délai pour les banques déjà parties dont l'arrivée est en retard (compensées). */
function explode(s, ctx, token) {
  s.crashedAt = ctx.now();
  const grace = Math.min(GRACE_CAP_MS, Math.max(ctx.latency(ctx.red), ctx.latency(ctx.blue)) + 100);
  ctx.later(grace, () => s.token === token && conclude(s, ctx));
}

function value(s, camp) {
  return s.banked[camp] ?? 0;
}

function conclude(s, ctx) {
  if (s.done) return;
  const a = value(s, 'rouge');
  const b = value(s, 'bleu');
  if (a === b) {
    // Même valeur (dont 0 / 0) : une seule reprise, puis égalité finale.
    if (!s.replayed) {
      s.replayed = true;
      s.token += 1;
      const token = s.token;
      s.phase = 'pause';
      ctx.later(PAUSE_MS, () => s.token === token && ((s.phase = 'run'), newRun(s, ctx)));
      return;
    }
    s.done = { winner: 'égalité', reason: 'tie' };
    return;
  }
  s.done = { winner: a > b ? 'rouge' : 'bleu', reason: 'higher' };
}

const details = (s) => ({ banked: { rouge: value(s, 'rouge'), bleu: value(s, 'bleu') }, crash: s.crash, replayed: s.replayed });

export default {
  id: 'crash',
  name: 'Le Crash',
  icon: 'crash',
  category: 'nerfs',
  maxMs: 2 * (MAX_RUN_MS + GRACE_CAP_MS + PAUSE_MS) + 2000,
  minContent: 0,
  prepare(ctx) {
    return { token: 0, replayed: false, done: null, phase: 'run', crash: null, startedAt: null, banked: {}, crashedAt: null };
  },
  begin: (s, ctx) => newRun(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done) return 'Trop tard.';
    if (s.phase !== 'run' || data.type !== 'bank') return null;
    if (s.banked[camp] != null) return null;
    // Ce que le joueur voyait quand il a appuyé : l'arrivée moins l'aller-retour. Accepté si c'était avant l'explosion.
    const t = ctx.now() - s.startedAt - ctx.latency(idOf(ctx, camp));
    if (multiplierAt(t) >= s.crash) return null;
    s.banked[camp] = floor2(Math.max(1, multiplierAt(t)));
    if (s.banked.rouge != null && s.banked.bleu != null && s.crashedAt == null) {
      // Les deux ont banqué : plus rien à attendre.
      s.token += 1;
      conclude(s, ctx);
    }
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: s.done?.winner ?? 'égalité', details: details(s) }),
  view(s, who) {
    return {
      phase: s.phase,
      startedAt: s.startedAt,
      rate: RATE,
      banked: { ...s.banked },
      // Le point d'explosion n'est connu qu'une fois l'explosion arrivée (valeur à laquelle le multiplicateur s'est arrêté).
      crashed: s.crashedAt != null ? s.crash : null,
      replayed: s.replayed,
      me: who.kind === 'duelist' ? who.side : undefined,
    };
  },
};
