// Lot 5 d'affirmations de Vrai ou Faux : [texte, vrai, explication, source]. Faits lus sur les pages citées.
const w = (page) => `https://fr.wikipedia.org/wiki/${page}`;
const EI = w('Tour_Eiffel');
const KH = w('Pyramide_de_Kh%C3%A9ops');
const PA = w('Oc%C3%A9an_Pacifique');
const SA = w('Sahara');
const CM = w('Coupe_du_monde_de_football');
const LV = w('Mus%C3%A9e_du_Louvre');
const LU = w('Lune');
const GI = w('Girafe');
const TF = w('Tour_de_France_cycliste');
const EC = w('%C3%89checs');
const CA = w('Festival_de_Cannes');
const CE = w('Cerveau_humain');
const VE = w('Vesuve');
const CC = w('Chocolat');
const DI = w('Dinosaure');
const TE = w('Terre');
const LO = w('Louis_XIV');
const MC = w('Marie_Curie');
const MZ = w('Wolfgang_Amadeus_Mozart');
const PC = w('Pablo_Picasso');
const NI = w('Nil');
export default [
  ['La tour Eiffel a été inaugurée le 31 mars 1889.', true, 'Elle a été construite de 1887 à 1889.', EI],
  ['Le chantier de la tour Eiffel n’a jamais compté plus de 250 ouvriers.', true, 'Sur ses 2 500 000 rivets, 42 % ont été posés sur le chantier.', EI],
  ['La tour Eiffel compte environ 25 000 rivets.', false, 'Elle en compte 2 500 000.', EI],
  ['La pyramide de Khéops mesure aujourd’hui 137 m, contre environ 146,58 m à l’origine.', true, 'Elle a perdu de la hauteur avec le temps.', KH],
  ['La Grande Pyramide a été construite vers 2560 avant notre ère.', true, 'Pour le pharaon Khéops, de la IVe dynastie.', KH],
  ['Le Pacifique couvre environ 165 millions de km².', true, 'C’est le plus grand océan du monde.', PA],
  ['La profondeur maximale du Pacifique atteint environ 10 984 m.', true, 'Dans la fosse des Mariannes.', PA],
  ['C’est Magellan qui a appelé le Pacifique « pacifique », en 1520.', true, 'À cause de ses eaux calmes.', PA],
  ['C’est James Cook qui a donné son nom au Pacifique, au XVIIIe siècle.', false, 'C’est Magellan, en 1520, à cause de ses eaux calmes.', PA],
  ['Le point culminant du Sahara, l’Emi Koussi, est au Tchad.', true, 'Il s’élève à 3 415 m, dans le massif du Tibesti.', SA],
  ['Le Sahara couvre près de 30 % de l’Afrique.', true, 'Il s’étend sur dix États.', SA],
  ['La première Coupe du monde de football s’est jouée en 1930, en Uruguay.', true, 'Le pays hôte a battu l’Argentine 4-2 en finale.', CM],
  ['La première Coupe du monde de football a été remportée par le Brésil.', false, 'C’est l’Uruguay, qui a battu l’Argentine 4-2 en 1930.', CM],
  ['Le Brésil détient le record de titres mondiaux au football, avec cinq.', true, 'Huit nations différentes ont gagné au moins une fois.', CM],
  ['La Coupe du monde de football n’a pas eu lieu en 1942 ni en 1946.', true, 'À cause de la Seconde Guerre mondiale.', CM],
  ['Le musée du Louvre a ouvert le 10 août 1793.', true, 'Pour l’anniversaire de la chute de la monarchie.', LV],
  ['La pyramide de verre du Louvre a été inaugurée en 1989.', true, 'Elle a été conçue par Ieoh Ming Pei.', LV],
  ['La distance moyenne Terre-Lune est d’environ 384 000 km.', true, 'Soit près de trente fois le diamètre de la Terre.', LU],
  ['La Lune met environ 27,3 jours pour faire le tour de la Terre.', true, 'Mais le cycle des phases dure 29,5 jours.', LU],
  ['Le cycle des phases de la Lune dure 27,3 jours, comme sa révolution.', false, 'La révolution dure 27,3 jours, mais le cycle des phases 29,5 jours.', LU],
  ['La sonde soviétique Luna 2 a atteint la Lune en 1959.', true, 'Dix ans avant Apollo 11.', LU],
  ['Le cou d’une girafe compte sept vertèbres cervicales, comme la plupart des mammifères.', true, 'Chacune mesure environ 40 cm.', GI],
  ['Une girafe a deux fois plus de vertèbres cervicales qu’un humain.', false, 'Elle en a sept, comme la plupart des mammifères.', GI],
  ['La gestation d’une girafe dure environ 15 mois.', true, 'Le girafon mesure environ 2 m à la naissance.', GI],
  ['Le premier Tour de France a eu lieu en 1903.', true, 'Il a été créé pour relancer les ventes du journal L’Auto.', TF],
  ['Le premier maillot jaune a été porté en 1919 par Eugène Christophe.', true, 'Il a été créé seize ans après le premier Tour.', TF],
  ['Le Tour de France se termine traditionnellement sur les Champs-Élysées.', true, 'À Paris.', TF],
  ['Un échiquier compte 64 cases et 32 pièces au départ.', true, '16 pièces par joueur.', EC],
  ['Le mot « échecs » vient d’un mot persan qui signifie « le roi ».', true, 'Le persan « šāh ».', EC],
  ['Le jeu d’échecs dérive du chatrang indien, via la Perse.', true, 'Il est arrivé en Europe du Sud par les Arabes à partir du Xe siècle.', EC],
  ['La Palme d’or a été créée en 1955.', true, 'Pour remplacer le grand prix du Festival de Cannes.', CA],
  ['Le Festival de Cannes se déroule en mai.', true, 'Au Palais des festivals, sur la Croisette.', CA],
  ['La première Palme d’or a été décernée à Delbert Mann pour Marty.', true, 'En 1955.', CA],
  ['Le cerveau humain compte environ 86 milliards de neurones.', true, 'Parmi près de 170 milliards de cellules.', CE],
  ['Le cerveau représente environ 2 % de la masse du corps.', true, 'Mais il consomme 20 à 25 % de son énergie.', CE],
  ['Le cerveau consomme environ 2 % de l’énergie du corps.', false, 'Il pèse 2 % de la masse du corps mais consomme 20 à 25 % de son énergie.', CE],
  ['Le Vésuve culmine à 1 281 mètres.', true, 'Il domine la baie de Naples.', VE],
  ['À Pompéi, la couche de cendres et de ponces atteint jusqu’à 2,8 mètres d’épaisseur.', true, 'Après l’éruption de l’an 79.', VE],
  ['Le cacaoyer est originaire du bassin amazonien.', true, 'Il y est cultivé depuis plus de 3 500 ans.', CC],
  ['Le mot « chocolat » vient du nahuatl.', true, 'La boisson est d’abord consommée au Mexique et en Amérique centrale.', CC],
  ['Le chocolat au lait date du XIIe siècle.', false, 'Il apparaît vers 1875, quand Daniel Peter y ajoute du lait en poudre.', CC],
  ['Hernán Cortés a rapporté le chocolat en Espagne en 1527.', true, 'La boisson y devient très prisée à la cour.', CC],
  ['Les oiseaux sont les seuls dinosaures encore vivants.', true, 'Ils descendent de petits théropodes.', DI],
  ['La plupart des dinosaures ont disparu il y a 66 millions d’années.', true, 'Lors de l’extinction Crétacé-Paléogène.', DI],
  ['Le nom « dinosaure » a été inventé par Richard Owen en 1842.', true, 'Dinosauria.', DI],
  ['La Terre s’est formée il y a environ 4,54 milliards d’années.', true, 'D’après la datation radiométrique.', TE],
  ['L’axe de rotation de la Terre est incliné d’environ 23°.', true, 'C’est ce qui provoque les saisons.', TE],
  ['La Terre met 365,256 jours pour faire le tour du Soleil.', true, 'D’où les années bissextiles.', TE],
  ['Le règne de Louis XIV a duré 72 ans.', true, 'De 1643 à 1715 : le plus long de l’histoire de France.', LO],
  ['Louis XIV est devenu roi à presque cinq ans.', true, 'À la mort de son père Louis XIII.', LO],
  ['Louis XIV est monté sur le trône à 25 ans.', false, 'Il avait presque cinq ans.', LO],
  ['Marie Curie est la seule femme à avoir reçu deux prix Nobel.', true, 'En physique (1903) et en chimie (1911).', MC],
  ['Le polonium a été nommé d’après la Pologne, pays natal de Marie Curie.', true, 'Elle a annoncé sa découverte en 1898.', MC],
  ['Le catalogue Köchel répertorie 893 œuvres de Mozart.', true, 'Mozart est mort à 35 ans.', MZ],
  ['Picasso a réalisé près de 50 000 œuvres.', true, 'Il est mort en 1973, à 91 ans.', PC],
  ['Le tableau Guernica de Picasso date de 1937.', true, 'Il dénonce le bombardement d’une ville basque.', PC],
  ['Le Nil se jette dans la mer Méditerranée.', true, 'Il forme un delta au nord du Caire.', NI],
  ['Le Nil traverse huit pays.', true, 'De la forêt de Nyungwe au Rwanda jusqu’à l’Égypte.', NI],
  ['Le Nil se jette dans la mer Rouge.', false, 'Il se jette dans la Méditerranée.', NI],
];
