import { applyEstimationPick, computeEstimation, isValidEstimate, sipsEstimation } from '../rules/estimation.js';
import { loadJson } from './load.js';

const PICK_MS = 20000;

export default {
  id: 'estimation',
  questions: loadJson('../content/questions-estimation.json'),
  isValidVote: (_game, choice) => isValidEstimate(choice),
  computeResults: (playerIds, votes, game) => computeEstimation(playerIds, votes, game.question.reponse),
  // Le plus proche (s'il est seul et connecté) désigne quelqu'un qui boit avec le plus loin.
  afterReveal(game) {
    const chooser = game.players.get(game.results.chooserId);
    if (!chooser || chooser.sockets.size === 0 || game.players.size < 2) return false;
    game.schedule('pending', PICK_MS, () => game.finalize());
    return true;
  },
  handleAction(game, playerId, action) {
    if (game.phase !== 'results' || !game.pending) return 'Rien à choisir pour l’instant.';
    if (action.type !== 'pick') return 'Action inconnue.';
    const { results, error } = applyEstimationPick(game.results, playerId, action.targetId, [...game.players.keys()]);
    if (error) return error;
    game.results = results;
    game.finalize();
    return null;
  },
  sipsOf: sipsEstimation,
  updateStats(stats, results) {
    for (const id of results.closestIds) stats[id].closest = (stats[id].closest ?? 0) + 1;
  },
  // « Attention… », les estimations tombent sur la règle, puis la bonne réponse.
  revealMs: 5000,
};
