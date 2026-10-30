// Lot 2 d'affirmations de Vrai ou Faux : [texte, vrai, explication, source].
const V = 'https://fr.wikipedia.org/wiki/V%C3%A9nus_(plan%C3%A8te)';
const J = 'https://fr.wikipedia.org/wiki/Jupiter_(plan%C3%A8te)';
const MA = 'https://fr.wikipedia.org/wiki/Manchot_empereur';
const FO = 'https://fr.wikipedia.org/wiki/Fourmi';
const K = 'https://fr.wikipedia.org/wiki/Kangourou';
const PE = 'https://fr.wikipedia.org/wiki/Peau_humaine';
const D = 'https://fr.wikipedia.org/wiki/Diamant';
const S = 'https://fr.wikipedia.org/wiki/Statue_de_la_Libert%C3%A9';
export default [
  ['Sur Vénus, un jour (une rotation sur elle-même) dure plus longtemps que sur toute autre planète du Système solaire.', true, 'Environ 243 jours terrestres.', V],
  ['Sur Vénus, le Soleil se lève à l’ouest.', true, 'Sa rotation est rétrograde : il se couche à l’est.', V],
  ['Sur Vénus, le Soleil se lève à l’est, comme sur Terre.', false, 'Sa rotation est rétrograde : il s’y lève à l’ouest.', V],
  ['Vénus est la planète la plus chaude du Système solaire, plus que Mercure.', true, 'Environ 462 °C en surface, malgré Mercure, plus proche du Soleil.', V],
  ['Mercure, la plus proche du Soleil, est la planète la plus chaude.', false, 'C’est Vénus, avec environ 462 °C en surface.', V],
  ['La première sonde posée avec succès sur une autre planète est Venera 7, sur Vénus.', true, 'C’était en 1970.', V],
  ['La pression à la surface de Vénus est environ 92 fois celle de la Terre.', true, 'Comme à près de 900 m sous l’eau.', V],
  ['La masse de Jupiter est environ 318 fois celle de la Terre.', true, 'Elle vaut aussi 2,5 fois celle de toutes les autres planètes réunies.', J],
  ['Jupiter pèse moins que toutes les autres planètes du Système solaire réunies.', false, 'Elle pèse 2,5 fois plus qu’elles toutes réunies.', J],
  ['Le centre de gravité du couple Soleil-Jupiter se trouve à l’extérieur du Soleil.', true, 'À environ 1,068 rayon solaire de son centre.', J],
  ['Ganymède, satellite de Jupiter, est plus grand que la planète Mercure.', true, 'C’est le plus grand satellite naturel du Système solaire.', J],
  ['Ganymède, satellite de Jupiter, est plus petit que la Lune.', false, 'Il est le plus grand satellite du Système solaire, plus grand même que Mercure.', J],
  ['Le manchot empereur est le plus grand et le plus lourd de tous les manchots.', true, 'Il mesure jusqu’à 122 cm et pèse de 20 à 40 kg.', MA],
  ['Le manchot empereur est la seule espèce de manchot qui se reproduit pendant l’hiver antarctique.', true, 'Le mâle couve seul l’œuf pendant 64 jours.', MA],
  ['Chez le manchot empereur, c’est la femelle qui couve l’œuf tout l’hiver.', false, 'C’est le mâle qui le couve seul, pendant 64 jours consécutifs.', MA],
  ['Une femelle manchot empereur a été observée plongeant à 535 m de profondeur.', true, 'C’était près du détroit de McMurdo.', MA],
  ['Le film La Marche de l’empereur a remporté l’Oscar du meilleur documentaire en 2006.', true, 'Il suit les manchots empereurs en Antarctique.', MA],
  ['On comptait plus de 16 000 espèces de fourmis reconnues en 2023.', true, 'Il en reste probablement des milliers à découvrir.', FO],
  ['Il existe moins de 1 000 espèces de fourmis dans le monde.', false, 'Plus de 16 000 espèces étaient reconnues en 2023, et il en reste à découvrir.', FO],
  ['Les fourmis représentent 10 à 15 % de la biomasse animale dans beaucoup d’habitats.', true, 'Leur population est estimée à un milliard de milliards d’individus.', FO],
  ['Une reine fourmi a vécu plus de 28 ans en laboratoire.', true, 'Il s’agit d’une reine de Lasius niger : 28 ans et 8 mois.', FO],
  ['À Hokkaidō, une supercolonie de fourmis a compté 45 000 nids.', true, 'Elle abritait 306 millions d’ouvrières sur 1 250 hectares.', FO],
  ['Un kangourou peut faire des bonds de 13 mètres de long.', true, 'Et jusqu’à 3,5 mètres de haut.', K],
  ['Les kangourous ne savent pas reculer.', true, 'Leurs grandes pattes et leur puissante queue les en empêchent.', K],
  ['Les kangourous reculent très bien grâce à leur queue.', false, 'Ils ne peuvent pas reculer.', K],
  ['À sa naissance, un bébé kangourou mesure environ 2 cm.', true, 'Il pèse environ 1 gramme.', K],
  ['À sa naissance, un bébé kangourou mesure environ 30 cm.', false, 'Il ne mesure qu’environ 2 cm pour 1 gramme.', K],
  ['La gestation d’un kangourou dure à peu près un mois.', true, 'Entre 30 et 38 jours.', K],
  ['La peau d’un adulte a une surface d’environ 1,8 m².', true, 'Elle pèse 5 à 10 % de la masse corporelle.', PE],
  ['La peau de l’adulte couvre environ 18 m².', false, 'Sa surface est d’environ 1,8 m².', PE],
  ['L’épaisseur de la peau varie d’environ 0,5 mm aux paupières à 4-5 mm sur le haut du dos.', true, 'Elle est la plus fine au niveau des paupières.', PE],
  ['Le bout des doigts compte environ 2 000 récepteurs tactiles par cm².', true, 'Ils détectent des reliefs de 75 nanomètres.', PE],
  ['La peau est composée à environ 70 % d’eau.', true, 'Comme beaucoup de tissus du corps.', PE],
  ['Les doigts se rident après plus de cinq minutes dans l’eau, sous la commande du système nerveux.', true, 'Il s’agit du système nerveux sympathique.', PE],
  ['Le diamant est le matériau naturel le plus dur, 10 sur l’échelle de Mohs.', true, 'Au-dessus de 1 700 °C, sans air, il se transforme en graphite.', D],
  ['Le diamant est fait de carbone.', true, 'Lavoisier l’a montré en 1772 en le brûlant : il a obtenu du dioxyde de carbone.', D],
  ['Le diamant est un cristal de silice, comme le quartz.', false, 'Il est fait de carbone, comme l’a montré Lavoisier en 1772.', D],
  ['En 1270, Louis IX a réservé le port des diamants au seul souverain.', true, 'C’étaient des lois somptuaires.', D],
  ['La statue de la Liberté a été inaugurée le 28 octobre 1886.', true, 'Dix ans après la date prévue pour le centenaire de l’Indépendance.', S],
  ['La statue de la Liberté a été inaugurée en 1776.', false, 'Elle l’a été le 28 octobre 1886.', S],
  ['La statue de la Liberté mesure 93 m socle compris.', true, '46,05 m sans le socle.', S],
  ['Pour la traversée, la statue de la Liberté a été démontée en 350 pièces.', true, 'Elles étaient réparties dans 214 caisses.', S],
  ['Depuis 1916, le public n’a plus accès au balcon qui entoure la torche de la statue de la Liberté.', true, 'Pour des raisons de sécurité.', S],
];
