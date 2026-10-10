import { DEFAULT_GAME, GAME_CATALOG } from '../../../shared/games.js';
import * as estimation from './estimation.jsx';
import * as imposteur from './imposteur.jsx';
import * as patate from './patate.jsx';
import * as quiDeNous from './quiDeNous.jsx';
import * as quiMeConnait from './quiMeConnait.jsx';
import * as roue from './roue.jsx';
import * as tuPreferes from './tuPreferes.jsx';

// Écrans de chaque jeu jouable : id, waitingText, HostQuestion, HostReveal (suspense), HostResults,
// PlayerVote, VoteSummary et verdict(state, me). Optionnels : hostLayout / playerLayout = 'custom'
// (le jeu gère tout l'écran : HostQuestion reçoit gameAct, PlayerRound reçoit act), PlayerReveal, PlayerResults,
// EndStats, nextLabel (« Manche suivante »). Les métadonnées (nom, icône, règle…) viennent de shared/games.js.
const VIEWS = {
  [quiDeNous.id]: quiDeNous,
  [tuPreferes.id]: tuPreferes,
  [estimation.id]: estimation,
  [quiMeConnait.id]: quiMeConnait,
  [imposteur.id]: imposteur,
  [patate.id]: patate,
  [roue.id]: roue,
};

export const GAMES = GAME_CATALOG.map((game) => ({
  ...game,
  ...VIEWS[game.id],
  playable: game.available && Object.hasOwn(VIEWS, game.id),
}));

export const gameById = (id) => GAMES.find((game) => game.id === id);

/** Jeu de la partie en cours (celui par défaut tant qu'aucun n'est choisi, pour les écrans communs). */
export const gameOf = (state) => gameById(state?.mode) ?? gameById(DEFAULT_GAME);

export const playersLabel = ({ players }) => `${players.min} à ${players.max} joueurs`;
