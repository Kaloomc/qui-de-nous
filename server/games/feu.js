import { buildSequence, computeFeu, REACT_WINDOW_MS, RECENT_ROUNDS, sipsFeu } from '../rules/feu.js';
import { loadJson } from './load.js';

const WORDS = loadJson('../content/words-feu.json');
const AUTO_START_MS = 4000;
/** Tout le monde a tapé (ou tout le monde a tiré trop tôt) : on n'attend pas la fin de la fenêtre. */
const ALL_TAPPED_MS = 900;
/** La TV signale le vrai début du « FEU » (voix lancée) ; au-delà de ce délai, on garde l'heure d'envoi du mot. */
const SPOKEN_MAX_DELAY_MS = 2000;

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
  if (i === d.seq.feuIndex) {
    // « FEU » termine la séquence : il reste juste la fenêtre de réaction. En attendant le signal de la TV,
    // on part de l'heure d'envoi.
    d.feuAt = d.emittedAt[i];
    game.schedulePausable('g:end', REACT_WINDOW_MS, () => game.reveal(game.roundId));
  } else {
    game.schedulePausable('g:word', d.seq.gaps[i + 1], () => emit(game, i + 1));
  }
  checkAllTapped(game);
}

/** La TV a commencé à dire « FEU » : c'est le vrai départ, les temps sont mesurés à partir d'ici. */
function feuSpoken(game, index) {
  const d = data(game);
  if (d.step !== 'running' || index !== d.seq.feuIndex || d.index !== index || d.feuSpoken) return null;
  const now = game.clock.now();
  if (now - d.emittedAt[index] > SPOKEN_MAX_DELAY_MS) return null;
  d.feuSpoken = true;
  d.feuAt = now;
  if (!d.allTapped) game.schedulePausable('g:end', REACT_WINDOW_MS, () => game.reveal(game.roundId));
  return null;
}

/** Touché pendant un mot piège (ou avant le premier mot) : faux départ, visible tout de suite. */
const tappedEarly = (d, id) => d.taps[id] && d.taps[id].index < d.seq.feuIndex;

function checkAllTapped(game) {
  const d = data(game);
  if (d.allTapped || d.step !== 'running') return;
  const present = stillHere(game, d.participants);
  if (present.length === 0 || present.some((id) => !d.taps[id])) return;
  // Avant « FEU », tout le monde a déjà tiré : la manche est annulée, inutile d'aller au bout.
  if (d.feuAt == null && !present.every((id) => tappedEarly(d, id))) return;
  d.allTapped = true;
  game.cancel('g:word');
  game.schedulePausable('g:end', ALL_TAPPED_MS, () => game.reveal(game.roundId));
}

export default {
  id: 'feu',
  drawQuestion: () => null,
  startRound(game) {
    const participants = game.connectedPlayers().map((p) => p.id);
    // Jamais deux manches de suite avec le même nombre de mots avant « FEU ».
    // Ni les mots des dernières manches (gardés d'une partie à l'autre, comme l'historique des questions).
    game.recentFeuWords ??= [];
    const seq = buildSequence(WORDS, Math.random, game.lastFeuTraps, game.recentFeuWords.flat());
    game.lastFeuTraps = seq.feuIndex;
    game.recentFeuWords = [...game.recentFeuWords, seq.words.slice(0, -1)].slice(-RECENT_ROUNDS);
    Object.assign(game.roundData, {
      step: 'ready',
      seq,
      index: -1,
      emittedAt: [],
      feuAt: null,
      feuSpoken: false,
      allTapped: false,
      taps: {},
      participants: participants.length ? participants : [...game.players.keys()],
    });
    if (game.settings.auto) game.schedulePausable('g:start', AUTO_START_MS, () => begin(game));
  },
  acceptsVotes: () => false,
  isValidVote: () => false,
  hostAction(game, action) {
    if (game.phase !== 'question') return 'Aucune manche en cours.';
    if (action.type === 'start') return begin(game);
    if (action.type === 'spoken') return feuSpoken(game, action.index);
    return 'Action inconnue.';
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
      // Faux départs en direct (« X a tiré trop tôt ! ») : ça ne dit rien de la position du « FEU ».
      falseStartIds: running ? Object.keys(d.taps ?? {}).filter((id) => tappedEarly(d, id)) : [],
      feuSpoken: running && !!d.feuSpoken,
      startTimer: game.timerState('g:start'),
    };
    const tap = viewer.playerId && d.taps?.[viewer.playerId];
    if (viewer.playerId) {
      round.playing = d.participants?.includes(viewer.playerId) ?? false;
      // Le faux départ se voit tout de suite ; le temps exact, seulement aux résultats.
      round.myTap = tap ? { early: tappedEarly(d, viewer.playerId) } : null;
    }
    return round;
  },
  revealMs: 2500,
};
