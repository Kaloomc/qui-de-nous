import { CHOICES, computeConnait, pickTarget, sipsConnait, updateConnaitStats } from '../rules/connait.js';
import { loadJson } from './load.js';

export default {
  id: 'qui-me-connait',
  questions: loadJson('../content/questions-connait.json'),
  // Chaque joueur connecté devient la cible à tour de rôle.
  startRound(game) {
    const connected = game.connectedPlayers().map((p) => p.id);
    game.roundData.targetId = pickTarget(connected.length ? connected : [...game.players.keys()], game.round);
  },
  isValidVote: (_game, choice) => CHOICES.includes(choice),
  computeResults: (playerIds, votes, game) => computeConnait(playerIds, votes, game.roundData.targetId),
  sipsOf: sipsConnait,
  updateStats: (stats, results) => updateConnaitStats(stats, results),
  publicRound: (game) => ({ ...game.question, targetId: game.roundData.targetId }),
  // « Qu'a répondu X ? » : les choix des autres apparaissent, puis la vraie réponse.
  revealMs: 4500,
};
