// Lot 4 d'affirmations de Vrai ou Faux : [texte, vrai, explication, source].
const DA = 'https://fr.wikipedia.org/wiki/Dauphin';
const CV = 'https://fr.wikipedia.org/wiki/Cheval';
const SO = 'https://fr.wikipedia.org/wiki/Soleil';
const FU = 'https://fr.wikipedia.org/wiki/Mont_Fuji';
const NI = 'https://fr.wikipedia.org/wiki/Chutes_du_Niagara';
const MP = 'https://fr.wikipedia.org/wiki/Machu_Picchu';
const OE = 'https://fr.wikipedia.org/wiki/%C5%92il';
const EA = 'https://fr.wikipedia.org/wiki/Eau';
export default [
  ['Les ancêtres des dauphins ont perdu leurs pattes arrière il y a environ 35 millions d’années.', true, 'Ils descendent d’animaux terrestres.', DA],
  ['La gestation d’un dauphin dure environ 12 mois.', true, 'Les femelles sont matures entre 5 et 7 ans.', DA],
  ['La gestation d’un dauphin dure à peine un mois.', false, 'Elle dure environ 12 mois.', DA],
  ['Le plus vieux cheval connu, Old Billy, est mort à 62 ans.', true, 'Un âge très supérieur à la moyenne des chevaux.', CV],
  ['Le cheval domestique possède 32 paires de chromosomes.', true, 'Le cheval de Przewalski en a 33.', CV],
  ['Le cheval compte 469 muscles.', true, 'Ils représentent environ la moitié de son poids.', CV],
  ['Le galop d’un pur-sang peut atteindre 60 km/h.', true, 'C’est la vitesse du cheval au galop.', CV],
  ['Le génome du cheval a été séquencé en 2007.', true, 'Quatre ans après celui de l’être humain.', CV],
  ['Le génome du cheval a été séquencé avant celui de l’être humain.', false, 'Il l’a été en 2007, quatre ans après celui de l’humain.', CV],
  ['La lumière du Soleil met environ 8 minutes et 19 secondes à atteindre la Terre.', true, 'Soit environ 150 millions de kilomètres.', SO],
  ['La lumière du Soleil met environ 8 secondes à atteindre la Terre.', false, 'Elle met 8 minutes et 19 secondes.', SO],
  ['Le Soleil représente environ 99,85 % de la masse du Système solaire.', true, 'Tout le reste tient dans 0,15 %.', SO],
  ['Chaque seconde, environ 620 millions de tonnes d’hydrogène fusionnent dans le Soleil.', true, 'Elles donnent un peu plus de 615 millions de tonnes d’hélium.', SO],
  ['La couronne du Soleil est bien plus chaude que sa surface.', true, 'Environ 1 million de kelvins contre 5 800.', SO],
  ['La surface du Soleil est plus chaude que sa couronne.', false, 'La couronne atteint environ 1 million de kelvins, la surface environ 5 800.', SO],
  ['Voyager 1 a franchi l’héliopause le 25 août 2012.', true, 'Elle est devenue la première sonde à le faire.', SO],
  ['Le mont Fuji culmine à 3 776 mètres.', true, 'C’est le point culminant du Japon.', FU],
  ['Le mont Fuji est le plus haut sommet de l’Asie.', false, 'Il culmine à 3 776 m : c’est le point culminant du Japon seulement.', FU],
  ['La première ascension connue du mont Fuji remonte à l’an 663.', true, 'Par le moine bouddhiste En no Gyōja.', FU],
  ['Le premier non-Japonais à gravir le mont Fuji, en 1860, était un diplomate britannique.', true, 'Il s’appelait Rutherford Alcock.', FU],
  ['Environ 300 000 personnes gravissent le mont Fuji chaque année.', true, '70 % d’entre elles sont japonaises.', FU],
  ['Les chutes du Niagara mesurent 57 mètres de haut.', true, 'Pour 945 m de large.', NI],
  ['En 1901, Annie Edson Taylor a été la première à descendre les chutes du Niagara dans un tonneau.', true, 'Elle a survécu.', NI],
  ['Le 29 mars 1848, le grondement des chutes du Niagara s’est arrêté.', true, 'Il ne restait qu’un mince filet d’eau.', NI],
  ['En 1969, on a asséché temporairement les chutes américaines du Niagara.', true, 'Un barrage détournait le cours d’eau pendant plusieurs mois.', NI],
  ['En 2012, Nik Wallenda a traversé la chute du Fer-à-Cheval sur un câble.', true, 'Environ 550 m en 40 minutes.', NI],
  ['Le Machu Picchu est situé à 2 438 mètres d’altitude.', true, 'Sur la crête entre le Machu Picchu et le Huayna Picchu.', MP],
  ['Les ruines du Machu Picchu comptent 172 constructions.', true, 'Sur environ 530 m de long et 200 m de large.', MP],
  ['Le Machu Picchu se trouve à plus de 5 000 mètres d’altitude.', false, 'Il se trouve à 2 438 m.', MP],
  ['Hiram Bingham a emporté 35 000 pièces du Machu Picchu à Yale.', true, 'L’université ne les a rendues qu’en 2010.', MP],
  ['En 2007, plus de 100 millions de personnes ont voté sur Internet pour les « sept nouvelles merveilles du monde ».', true, 'Le Machu Picchu en fait partie ; le concours a été jugé controversé.', MP],
  ['Le calmar colossal a les plus grands yeux du monde.', true, '27 cm de diamètre.', OE],
  ['Les plus grands yeux du monde sont ceux de l’éléphant.', false, 'Ce sont ceux du calmar colossal : 27 cm de diamètre.', OE],
  ['Les crevettes-mantes sont réputées avoir les yeux les plus complexes du règne animal.', true, 'C’est un record parmi les animaux.', OE],
  ['Les plus anciens vertébrés connus, vieux de 518 millions d’années, avaient quatre yeux.', true, 'Capables de former des images.', OE],
  ['Environ 71 % de la surface de la Terre est recouverte d’eau.', true, '97 % de cette eau est salée.', EA],
  ['Au sommet de l’Everest, l’eau bout à environ 68 °C.', true, 'Contre 100 °C au niveau de la mer : la pression est plus faible.', EA],
  ['Au sommet de l’Everest, l’eau bout à 100 °C comme partout.', false, 'Elle bout à environ 68 °C, car la pression est bien plus faible.', EA],
  ['Le corps d’un adulte est composé à environ 65 % d’eau.', true, 'Une méduse en contient 98 %.', EA],
  ['La Terre a perdu environ un quart de son eau dans l’espace.', true, 'Au cours de son histoire.', EA],
];
