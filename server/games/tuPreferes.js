import { computePreferesResults, sipsPreferes } from '../rules.js';
import { loadJson } from './load.js';

export default {
  id: 'tu-preferes',
  questions: loadJson('../questionsPreferes.json'),
  isValidVote: (_game, choice) => choice === 'a' || choice === 'b',
  // onTie : 'nobody' (égalité = tout le monde sauvé) ou 'everyone' (égalité = tout le monde boit).
  computeResults: (playerIds, votes) => computePreferesResults(playerIds, votes, { onTie: 'nobody' }),
  sipsOf: sipsPreferes,
  // « Attention… » (1,5 s) puis la jauge qui oscille (voir client/src/games/tuPreferes.jsx).
  revealMs: 7000,
};
