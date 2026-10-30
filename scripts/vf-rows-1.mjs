// Lot 1 d'affirmations de Vrai ou Faux : [texte, vrai, explication, source]. Chaque fait a été lu sur la page citée ;
// les affirmations fausses sont des faits de la page dont on a changé un détail (l'explication donne la vraie valeur).
const P = 'https://fr.wikipedia.org/wiki/Pieuvre';
const H = 'https://fr.wikipedia.org/wiki/C%C5%93ur_humain';
const R = 'https://fr.wikipedia.org/wiki/Requin';
const M = 'https://fr.wikipedia.org/wiki/Mars_(plan%C3%A8te)';
const A = 'https://fr.wikipedia.org/wiki/Antarctique';
const F = 'https://fr.wikipedia.org/wiki/Foudre';
const MI = 'https://fr.wikipedia.org/wiki/Miel';
const CO = 'https://fr.wikipedia.org/wiki/Colibri';
export default [
  ['Un poulpe possède trois cœurs.', true, 'Deux servent à la respiration, le troisième irrigue le reste du corps.', P],
  ['Un poulpe n’a qu’un seul cœur, comme nous.', false, 'Le poulpe a trois cœurs, dont deux pour la respiration.', P],
  ['Le sang du poulpe est bleuté.', true, 'Son pigment, l’hémocyanine, est à base de cuivre.', P],
  ['Le sang du poulpe est vert à cause du cuivre.', false, 'Il est bleuté : l’hémocyanine à base de cuivre le colore ainsi.', P],
  ['Le poulpe possède neuf centres nerveux : un cerveau et un par bras.', true, 'Avec ses huit bras, cela fait neuf centres nerveux.', P],
  ['Le mot « pieuvre » a été popularisé par Victor Hugo en 1866.', true, 'Dans Les Travailleurs de la mer, il a supplanté « poulpe » dans l’usage courant.', P],
  ['C’est Jules Verne qui a popularisé le mot « pieuvre » en français.', false, 'C’est Victor Hugo, en 1866, avec Les Travailleurs de la mer.', P],
  ['Le cœur humain peut battre plus de 2 milliards de fois au cours d’une vie.', true, 'Environ 70 battements par minute pendant des décennies suffisent à y arriver.', H],
  ['Le cœur d’un adulte pèse environ 3 kilos.', false, 'Il pèse environ 300 g chez l’homme et 250 g chez la femme.', H],
  ['La première transplantation cardiaque a eu lieu au Cap, en 1967.', true, 'Le 3 décembre 1967 : le patient, Louis Washkansky, a survécu 18 jours.', H],
  ['La première transplantation cardiaque a eu lieu à New York.', false, 'Elle a eu lieu au Cap, en Afrique du Sud, le 3 décembre 1967.', H],
  ['Le cœur d’un embryon humain commence à battre vers le 22e jour après la conception.', true, 'Il atteint ensuite 165 à 185 battements par minute au début de la 7e semaine.', H],
  ['Les premiers requins sont apparus il y a environ 420 millions d’années.', true, 'Au Dévonien, bien avant les dinosaures.', R],
  ['Les premiers requins sont apparus après les dinosaures.', false, 'Ils sont apparus il y a environ 420 millions d’années, au Dévonien.', R],
  ['Le requin-baleine se nourrit surtout de plancton.', true, 'Il le filtre dans l’eau de mer malgré sa taille.', R],
  ['Le requin-baleine se nourrit surtout de gros poissons et de phoques.', false, 'Il se nourrit surtout de plancton qu’il filtre.', R],
  ['Certains requins perdent plus de 30 000 dents au cours de leur vie.', true, 'Leurs dents repoussent en permanence.', R],
  ['Chez beaucoup de requins, le centre de l’odorat occupe près de la moitié du cerveau.', true, 'Ils peuvent sentir des proies à 75 m de distance.', R],
  ['Olympus Mons, sur Mars, est le plus haut volcan du Système solaire.', true, 'Il s’élève à 21 229 m au-dessus du niveau de référence martien.', M],
  ['Le plus haut volcan du Système solaire se trouve sur Vénus.', false, 'C’est Olympus Mons, sur Mars (21 229 m).', M],
  ['La gravité à la surface de Mars représente environ 0,38 fois celle de la Terre.', true, 'Soit environ 3,7 m/s² contre 9,8 sur Terre.', M],
  ['L’atmosphère de Mars est plus dense que celle de la Terre.', false, 'Elle est plus de 150 fois moins dense.', M],
  ['Le record de froid mesuré en Antarctique est de −89,2 °C.', true, 'Relevé à Vostok, le 21 juillet 1983.', A],
  ['Le record de froid mesuré en Antarctique est d’environ −40 °C.', false, 'Il est de −89,2 °C, relevé à Vostok en 1983.', A],
  ['Le point culminant de l’Antarctique est le massif Vinson.', true, 'Il s’élève à 4 892 m.', A],
  ['L’Antarctique renferme environ 90 % de la glace terrestre.', true, 'Sa fonte élèverait le niveau des mers d’environ 60 m.', A],
  ['L’Antarctique renferme environ 10 % de la glace terrestre.', false, 'Il en renferme environ 90 %.', A],
  ['Le mont Erebus, en Antarctique, est le volcan actif le plus austral du monde.', true, 'Il se trouve sur l’île de Ross.', A],
  ['La température dans le canal d’un éclair dépasse 30 000 °C.', true, 'C’est plusieurs fois la température de la surface du Soleil.', F],
  ['La température dans un éclair ne dépasse pas 1 000 °C.', false, 'Elle dépasse 30 000 °C à l’intérieur du canal.', F],
  ['En 1752, Dalibard a attiré la foudre avec une tige de fer isolée, à Marly-la-Ville.', true, 'C’était une vérification de l’idée de Benjamin Franklin.', F],
  ['Pour produire une livre de miel, les abeilles visitent plusieurs millions de fleurs.', true, 'Environ 8,7 millions de fleurs, avec plus de 17 300 voyages.', MI],
  ['Le premier producteur mondial de miel est la Chine.', true, '446 900 tonnes en 2018, sur 1 851 540 tonnes au total.', MI],
  ['Le premier producteur mondial de miel est la Nouvelle-Zélande.', false, 'C’est la Chine, avec 446 900 tonnes en 2018.', MI],
  ['Le miel d’acacia a un indice glycémique bas, autour de 32.', true, 'Un mélange d’origines différentes peut atteindre 62.', MI],
  ['On a retrouvé en Afrique du Sud de la cire d’abeille vieille d’environ 40 000 ans.', true, 'Elle était dans une grotte.', MI],
  ['Les oiseaux ont quatre types de cônes pour voir les couleurs.', true, 'C’est un de plus que l’être humain.', CO],
  ['Les oiseaux n’ont que deux types de cônes pour voir les couleurs.', false, 'Ils en ont quatre, un de plus que l’être humain.', CO],
  ['Le médecin Ibn Al-Nafis a émis l’hypothèse de la circulation sanguine environ trois siècles avant William Harvey.', true, 'Il est né en 1210.', H],
];
