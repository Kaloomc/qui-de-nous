import { DEFAULT_GAME, GAME_CATALOG } from '../../shared/games.js';
import estimation from './estimation.js';
import feu from './feu.js';
import imposteur from './imposteur.js';
import loup from './loup.js';
import patate from './patate.js';
import quiDeNous from './quiDeNous.js';
import quiMeConnait from './quiMeConnait.js';
import roue from './roue.js';
import tuPreferes from './tuPreferes.js';

// Règles côté serveur de chaque jeu jouable : questions, validation d'un vote, résultats, gorgées, durée du suspense.
// Le reste (lobby, joueurs, reconnexion, tours, mode auto) est commun à tous les jeux.
export const GAME_RULES = {
  [quiDeNous.id]: quiDeNous,
  [tuPreferes.id]: tuPreferes,
  [estimation.id]: estimation,
  [quiMeConnait.id]: quiMeConnait,
  [imposteur.id]: imposteur,
  [patate.id]: patate,
  [roue.id]: roue,
  [feu.id]: feu,
  [loup.id]: loup,
};

/** Registre complet : métadonnées du catalogue + règles. */
export const GAMES = Object.fromEntries(GAME_CATALOG.map((game) => [game.id, { ...game, ...GAME_RULES[game.id] }]));

export { DEFAULT_GAME };

export const isGame = (id) => typeof id === 'string' && Object.hasOwn(GAMES, id);

/** Un jeu se lance s'il est marqué disponible ET que ses règles existent. */
export const isPlayable = (id) => isGame(id) && GAMES[id].available && Object.hasOwn(GAME_RULES, id);

/** Jeux vus par le mode soirée (server/party.js) : métadonnées + `playable`. */
export const partyGames = () => Object.values(GAMES).map((g) => ({ id: g.id, rhythm: g.rhythm, minToStart: g.minToStart, partyRounds: g.partyRounds, partyDefault: g.partyDefault, playable: isPlayable(g.id) }));
