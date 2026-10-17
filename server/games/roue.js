import { applyRoueAction, drawRoue, isInteractive, isRoueComplete, isValidDefi, sipsRoue } from '../rules/roue.js';
import { loadJson } from './load.js';

const DEFIS = loadJson('../content/defis-roue.json').filter(isValidDefi);
// Mode 18+ seulement : jamais de défi qui oblige à se dénuder, toucher, embrasser ou envoyer une photo.
const ADULT_DEFIS = loadJson('../content/roue-18plus.json').filter(isValidDefi);
const AUTO_SPIN_MS = 2500;
const ACTION_MS = 30000;

const connectedIds = (game) => game.connectedPlayers().map((p) => p.id);

/** Défi résolu (tout le monde a répondu, ou le joueur a choisi) : verdict définitif. */
function finishIfComplete(game) {
  if (game.phase === 'results' && game.pending && isRoueComplete(game.results, connectedIds(game))) game.finalize();
}

export default {
  id: 'roue',
  defis: DEFIS,
  adultDefis: ADULT_DEFIS,
  drawQuestion: () => null,
  startRound(game) {
    if (game.settings.auto) game.schedulePausable('g:auto', AUTO_SPIN_MS, () => game.reveal(game.roundId));
  },
  acceptsVotes: () => false,
  isValidVote: () => false,
  hostAction(game, action) {
    if (action.type !== 'spin') return 'Action inconnue.';
    if (game.phase !== 'question') return 'La roue tourne déjà.';
    return game.reveal(game.roundId);
  },
  // Le tirage se fait au moment de lancer la roue : pendant le suspense, la TV anime vers le résultat.
  computeResults(playerIds, _votes, game) {
    const ids = connectedIds(game);
    const { key, list } = game.contentPool(DEFIS, ADULT_DEFIS);
    const defi = game.history.draw(key, list);
    const results = drawRoue(ids.length ? ids : playerIds, list, Math.random, game.lastRoueTarget, defi);
    game.lastRoueTarget = results.targetId;
    return results;
  },
  afterReveal(game) {
    if (!isInteractive(game.results)) return false;
    const { type } = game.results.defi;
    const needsTarget = !['tous', 'vote'].includes(type);
    if (needsTarget && !game.players.get(game.results.targetId)?.sockets.size) return false;
    game.schedule('pending', ACTION_MS, () => game.finalize());
    return true;
  },
  handleAction(game, playerId, action) {
    if (game.phase !== 'results' || !game.pending) return 'Rien à faire pour l’instant.';
    const { results, error } = applyRoueAction(game.results, playerId, action, [...game.players.keys()]);
    if (error) return error;
    game.results = results;
    finishIfComplete(game);
    return null;
  },
  onPresenceChange: finishIfComplete,
  sipsOf: (results) => sipsRoue(results),
  updateStats(stats, results) {
    if (stats[results.targetId]) stats[results.targetId].picked = (stats[results.targetId].picked ?? 0) + 1;
  },
  publicRound: (game) => ({ autoTimer: game.timerState('g:auto') }),
  // Première roue (qui ?), courte pause, deuxième roue (quoi ?) : doit correspondre à client/src/games/roue.jsx.
  revealMs: 11000,
};
