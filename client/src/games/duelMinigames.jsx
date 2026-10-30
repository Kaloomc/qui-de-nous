// Vues des mini-jeux du mode Duel. Chaque mini-jeu fournit trois vues, qui ne reçoivent que ce que le serveur leur a envoyé :
//   Tv({ state, round, play })                      : l'écran commente le duel
//   Duelist({ state, round, play, side, act })      : le téléphone d'un duelliste (act(data) envoie une action)
//   Bettor({ state, round, play })                  : l'écran « spectateur » d'un parieur (facultatif)
// et, facultativement, Summary({ state, details }) : une ligne de résultat. `play` est la vue serveur du mini-jeu (round.play).
export const MG_VIEWS = {};
