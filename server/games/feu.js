import { buildSequence, computeFeu, isFalseStart, REACT_WINDOW_MS, sipsFeu } from '../rules/feu.js';
import { loadJson } from './load.js';

const WORDS = loadJson('../content/words-feu.json');
const AUTO_START_MS = 4000;
/** Tout le monde a tapé après « FEU » : on coupe la fin de la séquence. */
const ALL_TAPPED_MS = 900;

const data = (game) => game.roundData;
const stillHere = (game, ids) => ids.filter((id) => game.players.get(id)?.sockets.size);

function begin(game) {
  const d = data(game);
  if (d.step !== 'ready') return 'C’est déjà parti.';
  game.cancel('g:start');
  d.step = 'running';
  game.schedulePausable('g:word', d.seq.gaps[0] + 700, () => emit(game, 0));
  return null;
}

function emit(game, i) {
  const d = data(game);
  d.index = i;
  d.emittedAt[i] = game.clock.now();
  if (i === d.seq.feuIndex) d.feuAt = d.emittedAt[i];
  if (i + 1 < d.seq.words.length) game.schedulePausable('g:word', d.seq.gaps[i + 1], () => emit(game, i + 1));
  if (d.feuAt != null && !game.timers['g:end'] && !game.pausedTimers['g:end']) {
    // Fin de manche : la fenêtre de réaction après « FEU », ou le dernier mot si la séquence continue plus longtemps.
    game.schedulePausable('g:end', REACT_WINDOW_MS, () => endWhenDone(game));
  }
  checkAllTapped(game);
}

function endWhenDone(game) {
  const d = data(game);
  if (d.index + 1 < d.seq.words.length) {
    // Encore des mots à dire : on finira juste après le dernier.
    const remaining = d.seq.gaps.slice(d.index + 1).reduce((a, b) => a + b, 0);
    game.schedulePausable('g:end', remaining + 600, () => game.reveal(game.round));
    return;
  }
  game.reveal(game.round);
}

function checkAllTapped(game) {
  const d = data(game);
  if (d.feuAt == null || d.allTapped) return;
  const waiting = stillHere(game, d.participants).filter((id) => !d.taps[id]);
  if (waiting.length > 0) return;
  d.allTapped = true;
  game.schedulePausable('g:end', ALL_TAPPED_MS, () => game.reveal(game.round));
}

export default {
  id: 'feu',
  drawQuestion: () => null,
  startRound(game) {
    const participants = game.connectedPlayers().map((p) => p.id);
    Object.assign(game.roundData, {
      step: 'ready',
      seq: buildSequence(WORDS),
      index: -1,
      emittedAt: [],
      feuAt: null,
      taps: {},
      participants: participants.length ? participants : [...game.players.keys()],
    });
    if (game.settings.auto) game.schedulePausable('g:start', AUTO_START_MS, () => begin(game));
  },
  acceptsVotes: () => false,
  isValidVote: () => false,
  hostAction(game, action) {
    if (action.type !== 'start') return 'Action inconnue.';
    if (game.phase !== 'question') return 'Aucune manche en cours.';
    return begin(game);
  },
  handleAction(game, playerId, action) {
    if (action.type !== 'tap') return 'Action inconnue.';
    const d = data(game);
    if (game.phase !== 'question' || d.step !== 'running') return 'Pas maintenant !';
    if (!d.participants.includes(playerId)) return 'Tu joues à la prochaine manche.';
    if (d.taps[playerId]) return null; // seul le premier toucher compte
    d.taps[playerId] = { at: game.clock.now(), index: d.index };
    checkAllTapped(game);
    return null;
  },
  onPresenceChange: (game) => game.phase === 'question' && checkAllTapped(game),
  // Un joueur parti sans taper n'est pas puni : on ne garde que ceux encore là ou qui ont tapé.
  computeResults: (_ids, _votes, game) => {
    const d = data(game);
    const ids = d.participants.filter((id) => game.players.has(id) && (d.taps[id] || game.players.get(id).sockets.size));
    return computeFeu(ids, d.taps, d.seq, d.feuAt);
  },
  sipsOf: sipsFeu,
  updateStats(stats, results) {
    const first = results.ranking[0];
    if (first && results.ranking.length >= 2 && stats[first.id]) stats[first.id].fastest = (stats[first.id].fastest ?? 0) + 1;
  },
  publicRound(game, viewer) {
    const d = data(game);
    const running = game.phase === 'question';
    const round = {
      step: d.step,
      index: running ? d.index : null,
      word: running && d.index >= 0 ? d.seq.words[d.index] : null,
      tappedIds: Object.keys(d.taps ?? {}),
      startTimer: game.timerState('g:start'),
    };
    const tap = viewer.playerId && d.taps?.[viewer.playerId];
    if (viewer.playerId) {
      round.playing = d.participants?.includes(viewer.playerId) ?? false;
      // Le faux départ se voit tout de suite ; le temps exact, seulement aux résultats.
      round.myTap = tap ? { early: isFalseStart(tap, d.seq.feuIndex, d.feuAt) } : null;
    }
    return round;
  },
  revealMs: 2500,
};
