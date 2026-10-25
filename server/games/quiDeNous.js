import { computeResults, sipsQuiDeNous } from '../rules.js';
import { candidatesFor, cibleOf, isReserved } from '../rules/gendered.js';
import { drawGendered } from './gendered.js';
import { loadJson } from './load.js';

const QUESTIONS = loadJson('../questions.json').map((q) => (typeof q === 'string' ? { text: q } : q));
const ADULT_QUESTIONS = loadJson('../content/questions-18plus.json');

export default {
  id: 'qui-de-nous',
  // Accepte aussi l'ancien format (simple chaîne de caractères).
  questions: QUESTIONS,
  // Mode 18+ seulement (voir Game.contentPool).
  adultQuestions: ADULT_QUESTIONS,
  drawQuestion: (game) => drawGendered(game, QUESTIONS, ADULT_QUESTIONS),
  // Question réservée à un genre : seuls les joueurs de ce genre sont candidats (les autres votent quand même).
  startRound(game) {
    game.roundData.candidateIds = isReserved(game.question) ? candidatesFor(game.connectedPlayers(), cibleOf(game.question)) : null;
  },
  isValidVote: (game, choice) => game.players.has(choice) && (!game.roundData.candidateIds || game.roundData.candidateIds.includes(choice)),
  publicRound: (game) => ({ ...game.question, cible: cibleOf(game.question), candidateIds: game.roundData.candidateIds ?? null }),
  computeResults: (playerIds, votes) => computeResults(playerIds, votes),
  sipsOf: sipsQuiDeNous,
  // « Attention… » puis 3, 2, 1 (doit correspondre à l'animation de client/src/games/quiDeNous.jsx).
  revealMs: 3600,
};
