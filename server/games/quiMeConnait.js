import { render } from '../../shared/formulation.js';
import { CHOICES, computeConnait, sipsConnait, updateConnaitStats } from '../rules/connait.js';
import { candidatesFor, cibleOf } from '../rules/gendered.js';
import { SPOTLIGHT_ROLES } from '../spotlight.js';
import { drawGendered } from './gendered.js';
import { loadJson } from './load.js';

const QUESTIONS = loadJson('../content/questions-connait.json');
const ADULT_QUESTIONS = loadJson('../content/connait-18plus.json');

export default {
  id: 'qui-me-connait',
  questions: QUESTIONS,
  // Mode 18+ seulement (voir Game.contentPool).
  adultQuestions: ADULT_QUESTIONS,
  drawQuestion: (game) => drawGendered(game, QUESTIONS, ADULT_QUESTIONS),
  // Chaque joueur connecté devient la cible à tour de rôle : tirage équitable sur toute la soirée (server/spotlight.js),
  // parmi les joueurs du genre voulu quand la question est réservée à un genre.
  startRound(game) {
    const connected = game.connectedPlayers();
    const pool = candidatesFor(connected, cibleOf(game.question));
    const anyone = connected.length ? connected.map((p) => p.id) : [...game.players.keys()];
    game.roundData.targetId = game.spotlight.pick(SPOTLIGHT_ROLES.connaitCible, pool.length ? pool : anyone);
  },
  isValidVote: (_game, choice) => CHOICES.includes(choice),
  computeResults: (playerIds, votes, game) => computeConnait(playerIds, votes, game.roundData.targetId),
  sipsOf: sipsConnait,
  updateStats: (stats, results) => updateConnaitStats(stats, results),
  // La question et les choix sont accordés au genre de la cible (« d'après lui / elle »), puis envoyés tels quels : aucun champ {...}.
  publicRound(game) {
    const target = game.players.get(game.roundData.targetId);
    const subjects = { cible: { name: target?.name ?? '', gender: target?.gender } };
    return {
      ...game.question,
      question: render(game.question.question, subjects),
      choix: game.question.choix.map((c) => render(c, subjects)),
      targetId: game.roundData.targetId,
    };
  },
  // « Qu'a répondu X ? » : les choix des autres apparaissent, puis la vraie réponse.
  revealMs: 4500,
};
