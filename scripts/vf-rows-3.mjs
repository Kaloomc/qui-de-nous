// Lot 3 d'affirmations de Vrai ou Faux : [texte, vrai, explication, source].
const PI = 'https://fr.wikipedia.org/wiki/Tour_de_Pise';
const TA = 'https://fr.wikipedia.org/wiki/Taj_Mahal';
const CH = 'https://fr.wikipedia.org/wiki/Chat_domestique';
const OU = 'https://fr.wikipedia.org/wiki/Ours_polaire';
const CS = 'https://fr.wikipedia.org/wiki/Chauve-souris';
const PT = 'https://fr.wikipedia.org/wiki/Pomme_de_terre';
const IN = 'https://fr.wikipedia.org/wiki/Internet';
const IS = 'https://fr.wikipedia.org/wiki/Islande';
export default [
  ['La construction de la tour de Pise a commencé en 1173 et s’est étalée sur près de deux siècles.', true, 'Le dernier étage n’a été achevé qu’en 1372.', PI],
  ['La tour de Pise a été construite en moins de dix ans.', false, 'Elle s’est étalée sur deux siècles, de 1173 à 1372.', PI],
  ['Un escalier de 293 marches s’enroule à l’intérieur de la tour de Pise.', true, 'Il tourne entre deux cylindres de pierre concentriques.', PI],
  ['Les travaux de consolidation de la tour de Pise l’ont redressée d’environ 40 cm.', true, 'Ils ont duré de 1990 à 2001.', PI],
  ['Les quatre minarets du Taj Mahal sont inclinés vers l’extérieur.', true, 'Ainsi, en cas de séisme, ils tomberaient à l’opposé du tombeau.', TA],
  ['Le dôme central du Taj Mahal atteint 74 mètres de hauteur.', true, 'Les minarets en font 42.', TA],
  ['Le Taj Mahal est entouré d’une zone de protection de 10 400 km².', true, 'Elle limite la circulation et les émissions industrielles autour du monument.', TA],
  ['Le chat peut sauter à une hauteur cinq fois supérieure à sa taille.', true, 'Sa vitesse moyenne à la course est d’environ 40 km/h.', CH],
  ['Un chat peut sauter à une hauteur de dix fois sa taille.', false, 'Il saute à environ cinq fois sa taille.', CH],
  ['Le squelette d’un chat compte environ 250 os.', true, 'Soit plus que les 206 os d’un humain adulte.', CH],
  ['L’ouïe du chat perçoit des ultrasons jusqu’à 50 000 Hz.', true, 'L’oreille humaine s’arrête vers 20 000 Hz.', CH],
  ['Le chat possède environ 200 millions de terminaisons olfactives.', true, 'L’homme en a environ 5 millions.', CH],
  ['Un chat mange entre 10 et 16 fois par jour, en petites quantités.', true, 'Son estomac ne contient qu’environ 300 ml.', CH],
  ['La peau de l’ours polaire est noire.', true, 'Ce qui favorise l’absorption de la chaleur du soleil ; sa fourrure paraît blanche, mais ses poils ne sont pas pigmentés.', OU],
  ['La peau de l’ours polaire est blanche, comme sa fourrure.', false, 'Sa peau est noire ; ses poils ne sont pas pigmentés.', OU],
  ['L’ours polaire peut rester plus de trois minutes en apnée.', true, 'Il est aussi capable de nager plusieurs jours d’affilée.', OU],
  ['Le plus grand ours polaire répertorié pesait 1 002 kg.', true, 'C’était un mâle abattu en Alaska en 1960.', OU],
  ['Les chauves-souris représentent environ un cinquième des espèces de mammifères.', true, 'Près de 1 400 espèces.', CS],
  ['Les chauves-souris sont les seuls mammifères capables de vol battu.', true, 'Les écureuils volants, eux, planent.', CS],
  ['Les écureuils volants volent en battant des ailes, comme les chauves-souris.', false, 'Ils planent : seules les chauves-souris pratiquent le vol battu chez les mammifères.', CS],
  ['Une pipistrelle peut manger plus de 2 000 moustiques en une nuit.', true, 'Certaines chauves-souris avalent jusqu’à 120 % de leur poids en insectes.', CS],
  ['En 1794, Spallanzani a montré qu’une chauve-souris aveuglée vole normalement.', true, 'Alors qu’en lui bouchant les oreilles, elle ne sait plus se déplacer.', CS],
  ['La pomme de terre est cultivée dans plus de 150 pays.', true, 'Sous presque toutes les latitudes habitées.', PT],
  ['Son utilisation remonte à environ 8 000 ans, dans le sud du Pérou et le nord-ouest de la Bolivie.', true, 'Les premières cultures y sont nées.', PT],
  ['La pomme de terre est originaire d’Irlande.', false, 'Elle vient du sud du Pérou et du nord-ouest de la Bolivie.', PT],
  ['Le génome de la pomme de terre compte 48 chromosomes.', true, 'Il est tétraploïde et a été séquencé entre 2006 et 2011.', PT],
  ['Environ 85 % de la matière sèche de la pomme de terre est comestible, contre environ 50 % pour les céréales.', true, 'C’est l’un de ses atouts agricoles.', PT],
  ['Le premier équipement du réseau ARPANET a été installé à l’UCLA en 1969.', true, 'Le 20 septembre 1969.', IN],
  ['Le premier équipement du réseau ARPANET a été installé en 1989.', false, 'C’était le 20 septembre 1969, à l’UCLA.', IN],
  ['Le courrier électronique a été mis au point en 1972 par Ray Tomlinson.', true, 'C’est la première application importante du réseau.', IN],
  ['Le World Wide Web est tombé dans le domaine public le 30 avril 1993.', true, 'Il n’est donc la propriété de personne.', IN],
  ['L’Islande a la plus faible densité de population d’Europe.', true, 'Environ 3,7 habitants par km².', IS],
  ['Plus de 10 % du territoire de l’Islande est recouvert de glaciers.', true, 'Son point culminant, le Hvannadalshnjúkur, atteint 2 109,6 m.', IS],
  ['L’Islande ne compte aucun reptile ni amphibien indigène.', true, 'Les chevaux islandais, eux, descendent de chevaux importés avant la fin du Xe siècle.', IS],
  ['Il y a des crocodiles indigènes en Islande.', false, 'L’île ne compte aucun reptile ni amphibien indigène.', IS],
  ['L’éruption du Bárðarbunga, en 2014, a duré huit mois.', true, 'Elle a produit plus de 1 km³ de lave.', IS],
];
