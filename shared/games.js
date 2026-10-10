// Catalogue des jeux de Gorgée, partagé par le serveur et le client.
// Pour ajouter un jeu : une entrée ici, ses règles dans server/games/, ses écrans dans client/src/games/.
// `id` est la valeur du champ `mode` d'une partie.

export const GAME_CATALOG = [
  {
    id: 'qui-de-nous',
    name: 'Qui de nous ?',
    icon: 'vote',
    tagline: 'Qui est le plus susceptible de… ? Tout le monde vote pour quelqu’un.',
    rule: 'Le plus voté boit, et ceux qui n’ont pas voté comme lui aussi.',
    players: { min: 3, max: 12 },
    available: true,
  },
  {
    id: 'tu-preferes',
    name: 'Tu préfères ?',
    icon: 'versus',
    tagline: 'Deux options impossibles, un seul choix. La salle se divise.',
    rule: 'La minorité boit. Égalité parfaite : tout le monde est sauvé.',
    players: { min: 4, max: 20 },
    available: true,
  },
  {
    id: 'devine-qui',
    name: 'Devine qui a écrit ça',
    icon: 'quill',
    tagline: 'Chacun répond en secret, à vous de démasquer l’auteur.',
    rule: 'Ceux qui se trompent d’auteur boivent.',
    players: { min: 4, max: 10 },
    available: false,
  },
  {
    id: 'je-nai-jamais',
    name: 'Je n’ai jamais',
    icon: 'shot',
    tagline: 'Les secrets sortent, les verres se vident.',
    rule: 'Ceux qui l’ont déjà fait boivent.',
    players: { min: 3, max: 15 },
    available: false,
  },
];

export const DEFAULT_GAME = 'qui-de-nous';

export const findGame = (id) => GAME_CATALOG.find((game) => game.id === id);
