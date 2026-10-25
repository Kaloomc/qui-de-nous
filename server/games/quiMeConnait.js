import { CHOICES, computeConnait, sipsConnait, updateConnaitStats } from '../rules/connait.js';
import { SPOTLIGHT_ROLES } from '../spotlight.js';
import { loadJson } from './load.js';

export default {
  id: 'qui-me-connait',
  questions: loadJson('../content/questions-connait.json'),
  // Mode 18+ seulement (voir Game.contentPool).
  adultQuestions: loadJson('../content/connait-18plus.json'),
  // Chaque joueur connecté devient la cible à tour de rôle : tirage équitable sur toute la soirée (server/spotlight.js).
  startRound(game) {
    const connected = game.connectedPlayers().map((p) => p.id);
    game.roundData.targetId = game.spotlight.pick(SPOTLIGHT_ROLES.connaitCible, connected.length ? connected : [...game.players.keys()]);
  },
  isValidVote: (_game, choice) => CHOICES.includes(choice),
  computeResults: (playerIds, votes, game) => computeConnait(playerIds, votes, game.roundData.targetId),
  sipsOf: sipsConnait,
  updateStats: (stats, results) => updateConnaitStats(stats, results),
  publicRound: (game) => ({ ...game.question, targetId: game.roundData.targetId }),
  // « Qu'a répondu X ? » : les choix des autres apparaissent, puis la vraie réponse.
  revealMs: 4500,
};
