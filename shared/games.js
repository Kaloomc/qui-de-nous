// Catalogue des jeux de Gorgée, partagé par le serveur et le client.
// Pour ajouter un jeu : une entrée ici, ses règles dans server/games/, ses écrans dans client/src/games/.
// `id` est la valeur du champ `mode` d'une partie. `players` = nombre conseillé (affiché),
// `minToStart` = minimum pour lancer (vérifié par le serveur et le lobby).
// Mode soirée : `rhythm` (vote, rapide ou ambiance) sert à alterner les rythmes, `partyRounds` = [min, max] manches
// d'affilée (3 à 5 par défaut).

export const GAME_CATALOG = [
  {
    id: 'qui-de-nous',
    name: 'Qui de nous ?',
    icon: 'vote',
    tagline: 'Qui est le plus susceptible de… ? Tout le monde vote pour quelqu’un.',
    rule: 'Le plus voté boit, et ceux qui n’ont pas voté comme lui aussi.',
    players: { min: 3, max: 12 },
    minToStart: 2,
    rhythm: 'vote',
    available: true,
  },
  {
    id: 'tu-preferes',
    name: 'Tu préfères ?',
    icon: 'versus',
    tagline: 'Deux options impossibles, un seul choix. La salle se divise.',
    rule: 'La minorité boit. Égalité parfaite : tout le monde est sauvé.',
    players: { min: 4, max: 20 },
    minToStart: 2,
    rhythm: 'vote',
    available: true,
  },
  {
    id: 'estimation',
    name: 'Estimation',
    icon: 'ruler',
    tagline: 'Une question, un nombre. Qui tape le plus près ?',
    rule: 'Le plus éloigné boit, et le plus proche désigne quelqu’un qui trinque avec lui.',
    players: { min: 2, max: 20 },
    minToStart: 2,
    rhythm: 'vote',
    available: true,
  },
  {
    id: 'qui-me-connait',
    name: 'Qui me connaît le mieux ?',
    icon: 'mirror',
    tagline: 'Un joueur répond en secret sur lui-même, les autres devinent sa réponse.',
    rule: 'Ceux qui se trompent boivent. Personne n’a trouvé, ou tout le monde : la cible boit.',
    players: { min: 3, max: 20 },
    minToStart: 3,
    rhythm: 'ambiance',
    available: true,
  },
  {
    id: 'imposteur',
    name: 'L’Imposteur',
    icon: 'mask',
    tagline: 'Tout le monde a le même mot… sauf un. Un indice chacun, puis on démasque.',
    rule: 'Imposteur démasqué : il boit. Sinon, tout le groupe boit à sa place.',
    players: { min: 4, max: 20 },
    minToStart: 3,
    rhythm: 'ambiance',
    partyRounds: [2, 3],
    available: true,
  },
  {
    id: 'patate',
    name: 'Patate chaude',
    icon: 'bomb',
    tagline: 'Une bombe passe de téléphone en téléphone. Personne ne sait quand elle explose.',
    rule: 'Celui qui l’a en main quand elle explose boit 2 gorgées.',
    players: { min: 3, max: 20 },
    minToStart: 3,
    rhythm: 'rapide',
    available: true,
  },
  {
    id: 'roue',
    name: 'La Roue',
    icon: 'wheel',
    tagline: 'Une roue choisit la victime, une autre son défi. Gorgées, duos, votes, gages…',
    rule: 'La roue décide de tout : celui qu’elle désigne fait le défi (ou boit).',
    players: { min: 2, max: 20 },
    minToStart: 2,
    rhythm: 'rapide',
    available: true,
  },
  {
    id: 'feu',
    name: 'Réflexes',
    icon: 'flame',
    tagline: 'La TV enchaîne les mots qui se ressemblent. Tape uniquement quand elle dit « FEU » !',
    rule: 'Le plus lent boit, comme ceux qui tapent trop tôt ou pas du tout.',
    players: { min: 2, max: 20 },
    minToStart: 2,
    rhythm: 'rapide',
    available: true,
  },
];

export const DEFAULT_GAME = 'qui-de-nous';

export const findGame = (id) => GAME_CATALOG.find((game) => game.id === id);
