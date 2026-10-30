// Duel du Feu : la TV dit des mots qui ressemblent à « feu » (mots pièges de Réflexes), on tape seulement au vrai « FEU ».
// Faux départ = défaite. Les deux fautent : on rejoue (2 reprises au plus, puis égalité). Personne ne tape en 3 s : on rejoue aussi.
// Le plus rapide gagne (temps compensés de la latence de chacun) ; moins de 20 ms d'écart : on rejoue, puis égalité.
// Confidentialité : la position du « FEU » n'est connue qu'au moment où le mot est dit ; un duelliste ne reçoit jamais la liste des mots.
import { buildSequence, isFalseStart, REACT_WINDOW_MS } from '../../rules/feu.js';
import { loadJson } from '../../games/load.js';

const WORDS = loadJson('../content/words-feu.json');
export const START_MS = 900;
export const FAULT_SETTLE_MS = 400; // le temps de voir si l'autre a aussi tiré trop tôt
export const TAP_SETTLE_MS = 250; // le temps de comparer les deux réflexes compensés
export const TIE_MS = 20;
export const MAX_REPLAYS = 2;
const idOf = (ctx, camp) => (camp === 'rouge' ? ctx.red : ctx.blue);
const CAMPS = ['rouge', 'bleu'];

function attempt(s, ctx) {
  s.seq = buildSequence(WORDS, ctx.rng, s.lastTraps, s.recent);
  s.lastTraps = s.seq.feuIndex;
  s.recent = [...s.recent, ...s.seq.words.slice(0, -1)].slice(-20);
  Object.assign(s, { phase: 'wait', index: -1, feuAt: null, feuSpoken: false, emittedAt: null, taps: {}, faults: {}, settling: false });
  const token = ++s.token;
  ctx.later(START_MS, () => s.token === token && emit(s, ctx, 0, token));
}

function emit(s, ctx, i, token) {
  if (s.token !== token || s.done) return;
  s.index = i;
  s.emittedAt = ctx.now();
  if (i === s.seq.feuIndex) {
    s.phase = 'feu';
    s.feuAt = s.emittedAt; // la TV précise le vrai départ avec `spoken` (voix lancée)
    ctx.later(REACT_WINDOW_MS, () => s.token === token && !s.settling && noReflex(s, ctx));
  } else {
    s.phase = 'words';
    ctx.later(s.seq.gaps[i + 1], () => emit(s, ctx, i + 1, token));
  }
}

/** Reprise : une seule à la fois, pas plus de MAX_REPLAYS, puis égalité. */
function replayOrTie(s, ctx, reason) {
  s.token += 1;
  s.history.push({ attempt: s.attempts, reason });
  if (s.replays >= MAX_REPLAYS) {
    s.done = { winner: 'égalité', reason };
    return;
  }
  s.replays += 1;
  s.attempts += 1;
  s.phase = 'replay';
  const token = s.token;
  ctx.later(1800, () => s.token === token && attempt(s, ctx));
}

const noReflex = (s, ctx) => replayOrTie(s, ctx, 'nobody');

/** Un toucher d'un duelliste : faux départ ou réflexe valide, temps compensé de la latence réseau (RTT/2 d'aller). */
function onTap(s, ctx, camp) {
  if (s.done || !['wait', 'words', 'feu'].includes(s.phase) || s.taps[camp]) return;
  const at = ctx.now() - ctx.latency(idOf(ctx, camp)) / 2;
  s.taps[camp] = { at, index: s.index };
  const token = s.token;
  if (isFalseStart(s.taps[camp], s.seq.feuIndex, s.feuAt)) {
    s.faults[camp] = true;
    if (!s.settling) {
      s.settling = true;
      ctx.later(FAULT_SETTLE_MS, () => s.token === token && settleFaults(s, ctx));
    }
    return;
  }
  if (!s.settling) {
    s.settling = true;
    ctx.later(TAP_SETTLE_MS, () => s.token === token && settleTaps(s, ctx));
  }
}

function settleFaults(s, ctx) {
  const faulty = CAMPS.filter((c) => s.faults[c]);
  if (faulty.length === 2) return replayOrTie(s, ctx, 'bothFault');
  s.done = { winner: faulty[0] === 'rouge' ? 'bleu' : 'rouge', reason: 'falseStart', fault: faulty[0] };
}

function settleTaps(s, ctx) {
  if (s.done) return;
  if (CAMPS.some((c) => s.faults[c])) return settleFaults(s, ctx);
  const times = Object.fromEntries(CAMPS.filter((c) => s.taps[c]).map((c) => [c, Math.max(0, Math.round(s.taps[c].at - s.feuAt))]));
  const tapped = Object.keys(times);
  if (tapped.length === 1) s.done = { winner: tapped[0], reason: 'reflex', times };
  else if (Math.abs(times.rouge - times.bleu) < TIE_MS) return replayOrTie(s, ctx, 'tie');
  else s.done = { winner: times.rouge < times.bleu ? 'rouge' : 'bleu', reason: 'reflex', times };
}

export default {
  id: 'feu',
  name: 'Duel du Feu',
  icon: 'flame',
  category: 'réflexe',
  maxMs: 45000,
  minContent: 10,
  available: () => WORDS.pieges.length >= 10,
  prepare: () => ({ phase: 'wait', token: 0, attempts: 1, replays: 0, history: [], recent: [], lastTraps: null, done: null, taps: {}, faults: {} }),
  begin: (s, ctx) => attempt(s, ctx),
  /** Signal de la TV : le mot « FEU » commence à être prononcé (c'est le vrai départ). */
  host(s, action, ctx) {
    if (s.phase !== 'feu' || action.index !== s.seq.feuIndex || s.feuSpoken || s.index !== action.index) return;
    if (ctx.now() - s.emittedAt > 2000) return;
    s.feuSpoken = true;
    s.feuAt = ctx.now();
  },
  action(s, camp, data, ctx) {
    if (data.type !== 'tap') return 'Action inconnue.';
    onTap(s, ctx, camp);
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: { reason: s.done.reason, times: s.done.times ?? null, attempts: s.attempts, fault: s.done.fault ?? null } } : null),
  resolve: (s) => ({ winner: 'égalité', details: { reason: 'timeout', times: null, attempts: s.attempts, fault: null } }),
  view(s, who, ctx) {
    const view = {
      phase: s.phase,
      attempt: s.attempts,
      faults: { rouge: !!s.faults.rouge, bleu: !!s.faults.bleu },
      voice: !!ctx?.voice,
      feuSpoken: s.feuSpoken,
      index: s.index,
      replay: s.phase === 'replay' ? s.history.at(-1)?.reason ?? null : null,
    };
    // Les mots ne sortent que de la TV et des parieurs (à l'instant où ils sont dits) ; les duellistes les entendent.
    if (who.kind !== 'duelist') view.word = s.index >= 0 && ['words', 'feu'].includes(s.phase) ? s.seq.words[s.index] : null;
    if (who.kind === 'duelist') view.mine = { tapped: !!s.taps[who.side], fault: !!s.faults[who.side] };
    if (s.done?.times) view.times = s.done.times;
    return view;
  },
};
