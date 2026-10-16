import { computeResults, sipsQuiDeNous } from '../rules.js';
import { loadJson } from './load.js';

export default {
  id: 'qui-de-nous',
  // Accepte aussi l'ancien format (simple chaîne de caractères).
  questions: loadJson('../questions.json').map((q) => (typeof q === 'string' ? { text: q } : q)),
  // Mode 18+ seulement (voir Game.contentPool).
  adultQuestions: loadJson('../content/questions-18plus.json'),
  isValidVote: (game, choice) => game.players.has(choice),
  computeResults: (playerIds, votes) => computeResults(playerIds, votes),
  sipsOf: sipsQuiDeNous,
  // « Attention… » puis 3, 2, 1 (doit correspondre à l'animation de client/src/games/quiDeNous.jsx).
  revealMs: 3600,
};
