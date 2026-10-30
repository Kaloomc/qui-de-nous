// Course d'obstacles : deux coureurs sur le même tracé (même graine), saut au toucher, se baisser en glissant vers le bas. Le dernier debout
// gagne ; au bout de 60 s, la plus grande distance. La simulation (shared/runner.js) est déterministe à pas fixe : les clients l'utilisent
// pour l'affichage, le serveur la REJOUE à partir des entrées horodatées par image pour juger la mort. Il ne croit jamais un résultat client.
import { DT_MS, MAX_FRAMES, makeTrack, simulate } from '../../../shared/runner.js';

export const SETTLE_TICK_MS = 100;
/** Marge sur l'image d'un geste : au plus l'aller simple de la latence plus quelques images (jamais dans le futur). */
const SLACK_FRAMES = 6;
const KEYS = ['j', 'd1', 'd0'];
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);

const frameNow = (s, ctx) => Math.floor((ctx.now() - s.startedAt) / DT_MS);
const graceFrames = (ctx, camp) => Math.ceil(Math.min(1500, ctx.latency(idOf(ctx, camp))) / DT_MS) + SLACK_FRAMES + 3;

/** Jugement : mort de chacun (rejouée), puis dernier debout. Appelée à chaque pas de 100 ms et à chaque entrée. */
function judge(s, ctx) {
  if (s.done) return;
  const now = Math.min(frameNow(s, ctx), MAX_FRAMES);
  const res = {};
  for (const camp of ['rouge', 'bleu']) res[camp] = simulate(s.track, s.events[camp], now);
  const deaths = ['rouge', 'bleu'].filter((c) => res[c].deadAt != null);
  if (deaths.length) {
    const first = Math.min(...deaths.map((c) => res[c].deadAt));
    // On attend les entrées en retard (latence) avant de déclarer la mort.
    const wait = Math.max(graceFrames(ctx, 'rouge'), graceFrames(ctx, 'bleu'));
    if (now >= first + wait) {
      const died = deaths.filter((c) => res[c].deadAt === first);
      if (died.length === 2) s.done = { winner: 'égalité', reason: 'same-frame', frame: first };
      else s.done = { winner: died[0] === 'rouge' ? 'bleu' : 'rouge', reason: 'dead', frame: first };
      s.deadAt = { rouge: res.rouge.deadAt, bleu: res.bleu.deadAt };
      return;
    }
  }
  if (now >= MAX_FRAMES) {
    const a = res.rouge.x;
    const b = res.bleu.x;
    s.done = { winner: a === b ? 'égalité' : a > b ? 'rouge' : 'bleu', reason: 'distance' };
  }
}

const distances = (s) => ({ rouge: Math.round(simulate(s.track, s.events.rouge, s.done?.frame ?? MAX_FRAMES).x), bleu: Math.round(simulate(s.track, s.events.bleu, s.done?.frame ?? MAX_FRAMES).x) });
const details = (s) => ({ reason: s.done?.reason ?? 'timeout', frame: s.done?.frame ?? null, distance: distances(s) });

export default {
  id: 'course',
  name: 'Course d’obstacles',
  icon: 'course',
  category: 'adresse',
  maxMs: (MAX_FRAMES * DT_MS) + 4000,
  minContent: 0,
  prepare: (ctx) => ({ track: makeTrack(ctx.seed), seed: ctx.seed, events: { rouge: [], bleu: [] }, startedAt: null, done: null, deadAt: null }),
  begin(s, ctx) {
    s.startedAt = ctx.now();
    const loop = () => {
      judge(s, ctx);
      if (!s.done) ctx.later(SETTLE_TICK_MS, loop);
    };
    ctx.later(SETTLE_TICK_MS, loop);
  },
  action(s, camp, data, ctx) {
    if (s.done) return 'Trop tard.';
    if (!KEYS.includes(data.k) || !Number.isInteger(data.f)) return 'Entrée invalide.';
    const list = s.events[camp];
    const now = frameNow(s, ctx);
    // L'image annoncée ne peut être ni dans le futur, ni plus ancienne que ce que la latence du joueur explique, ni avant son dernier geste.
    const oldest = now - graceFrames(ctx, camp);
    const f = Math.max(0, list.at(-1)?.f ?? 0, oldest, Math.min(data.f, now));
    list.push({ f, k: data.k });
    judge(s, ctx);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve(s, ctx) {
    if (!s.done) {
      const a = simulate(s.track, s.events.rouge, MAX_FRAMES);
      const b = simulate(s.track, s.events.bleu, MAX_FRAMES);
      const firstDead = [a.deadAt, b.deadAt].filter((d) => d != null);
      if (firstDead.length && a.deadAt !== b.deadAt) s.done = { winner: a.deadAt == null || (b.deadAt != null && a.deadAt > b.deadAt) ? 'rouge' : 'bleu', reason: 'dead', frame: Math.min(...firstDead) };
      else s.done = { winner: a.x === b.x ? 'égalité' : a.x > b.x ? 'rouge' : 'bleu', reason: 'distance' };
    }
    return { winner: s.done.winner, details: details(s) };
  },
  view(s, who, ctx) {
    // Le tracé et les entrées sont publics (ce n'est pas un secret : les deux courent sur le même tracé et la TV les affiche).
    const view = { seed: s.seed, startedAt: s.startedAt, events: { rouge: [...s.events.rouge], bleu: [...s.events.bleu] }, dead: s.deadAt, now: ctx ? ctx.now() : 0, maxFrames: MAX_FRAMES };
    if (who.kind === 'duelist') view.me = who.side;
    return view;
  },
};
