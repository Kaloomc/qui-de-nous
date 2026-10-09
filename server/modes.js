import { readFileSync } from 'node:fs';
import { computePreferesResults, computeResults, sipsPreferes, sipsQuiDeNous } from './rules.js';

const load = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));

// Chaque mode fournit ses questions, la validation d'un vote et le calcul des résultats.
// Le reste (lobby, joueurs, reconnexion, déroulement des tours) est commun.
export const MODES = {
  'qui-de-nous': {
    // Accepte aussi l'ancien format (simple chaîne de caractères).
    questions: load('./questions.json').map((q) => (typeof q === 'string' ? { text: q } : q)),
    isValidVote: (game, choice) => game.players.has(choice),
    computeResults: (playerIds, votes) => computeResults(playerIds, votes),
    sipsOf: sipsQuiDeNous,
    // « Attention… » puis 3, 2, 1 (doit correspondre à l'animation de client/src/modes/quiDeNous.jsx).
    revealMs: 3600,
  },
  'tu-preferes': {
    questions: load('./questionsPreferes.json'),
    isValidVote: (_game, choice) => choice === 'a' || choice === 'b',
    computeResults: (playerIds, votes) => computePreferesResults(playerIds, votes, { onTie: 'nobody' }),
    sipsOf: sipsPreferes,
    // « Attention… » (1,5 s) puis la jauge qui oscille (voir client/src/modes/tuPreferes.jsx).
    revealMs: 7000,
  },
};

export const DEFAULT_MODE = 'qui-de-nous';

export const isMode = (mode) => typeof mode === 'string' && Object.hasOwn(MODES, mode);
