// Lot 1 de questions de Culture G éclair : [question, bonne réponse, 3 mauvaises, catégorie, source vérifiée].
const E = 'https://fr.wikipedia.org/wiki/Tour_Eiffel';
const S = 'https://fr.wikipedia.org/wiki/Syst%C3%A8me_solaire';
const O = 'https://fr.wikipedia.org/wiki/Squelette_humain';
const B = 'https://fr.wikipedia.org/wiki/Baleine_bleue';
const A = 'https://fr.wikipedia.org/wiki/Amazone_(fleuve)';
const V = 'https://fr.wikipedia.org/wiki/Mont_Everest';
const C = 'https://fr.wikipedia.org/wiki/Marie_Curie';
const L = 'https://fr.wikipedia.org/wiki/L%C3%A9onard_de_Vinci';
export default [
  ['En quelle année la tour Eiffel a-t-elle été inaugurée ?', '1889', '1869', '1900', '1912', 'monuments', E],
  ['Qui a dirigé la construction de la tour Eiffel ?', 'Gustave Eiffel', 'Georges Haussmann', 'Auguste Bartholdi', 'Victor Baltard', 'monuments', E],
  ['Combien de rivets compte environ la tour Eiffel ?', '2,5 millions', '25 000', '250 000', '25 millions', 'monuments', E],
  ['Depuis quelle année la tour Eiffel est-elle inscrite à l’UNESCO (rives de la Seine) ?', '1991', '1964', '1979', '2001', 'monuments', E],
  ['Combien de planètes compte le Système solaire ?', '8', '7', '9', '10', 'espace', S],
  ['Quelle planète du Système solaire est la plus grande ?', 'Jupiter', 'Saturne', 'Neptune', 'La Terre', 'espace', S],
  ['Quelle est la planète la plus éloignée du Soleil ?', 'Neptune', 'Uranus', 'Saturne', 'Pluton', 'espace', S],
  ['Quel type d’étoile est le Soleil ?', 'Une naine jaune', 'Une géante rouge', 'Une naine blanche', 'Une supernova', 'espace', S],
  ['Quelle part de la masse du Système solaire le Soleil représente-t-il ?', 'Environ 99,85 %', 'Environ 50 %', 'Environ 75 %', 'Environ 90 %', 'espace', S],
  ['Lequel de ces astres est une planète naine ?', 'Cérès', 'Titan', 'Ganymède', 'Io', 'espace', S],
  ['Combien d’os constants possède un adulte environ ?', '206', '106', '306', '412', 'corps humain', O],
  ['Quel est le plus long os du corps humain ?', 'Le fémur', 'Le tibia', 'L’humérus', 'Le radius', 'corps humain', O],
  ['Quel est le plus petit os du corps humain ?', 'L’étrier', 'Le coccyx', 'La rotule', 'Le pisiforme', 'corps humain', O],
  ['Combien de vertèbres cervicales compte la colonne vertébrale ?', '7', '5', '12', '9', 'corps humain', O],
  ['Combien de paires de côtes compte le thorax humain ?', '12', '10', '14', '8', 'corps humain', O],
  ['De quoi se nourrit presque exclusivement la baleine bleue ?', 'De krill', 'De thon', 'De phoques', 'D’algues', 'animaux', B],
  ['Quelle est la longueur moyenne d’une baleine bleue ?', '25 à 27 mètres', '8 à 10 mètres', '12 à 15 mètres', '40 à 45 mètres', 'animaux', B],
  ['Combien de temps dure la gestation d’une baleine bleue ?', '10 à 12 mois', '3 mois', '6 mois', '18 mois', 'animaux', B],
  ['Dans quel océan l’Amazone se jette-t-elle ?', 'L’océan Atlantique', 'L’océan Pacifique', 'L’océan Indien', 'La mer des Caraïbes', 'géographie', A],
  ['Quelle part du débit des fleuves du monde l’Amazone représente-t-elle environ ?', 'Un cinquième', 'Un dixième', 'Un tiers', 'Un centième', 'géographie', A],
  ['Quel pays l’Amazone ne traverse-t-elle pas ?', 'L’Argentine', 'Le Pérou', 'La Colombie', 'Le Brésil', 'géographie', A],
  ['Quelle altitude officielle mesure l’Everest (2020) ?', '8 848,86 m', '8 611 m', '8 091 m', '9 100 m', 'géographie', V],
  ['Qui a atteint le sommet de l’Everest en premier, le 29 mai 1953 ?', 'Edmund Hillary et Tensing Norgay', 'Reinhold Messner et Peter Habeler', 'George Mallory et Andrew Irvine', 'Maurice Herzog et Louis Lachenal', 'géographie', V],
  ['Dans quelle chaîne de montagnes se trouve l’Everest ?', 'L’Himalaya', 'Les Andes', 'Les Alpes', 'Le Karakoram', 'géographie', V],
  ['À quelle frontière se trouve l’Everest ?', 'Népal et Chine', 'Inde et Pakistan', 'Inde et Bhoutan', 'Chine et Mongolie', 'géographie', V],
  ['Dans quelle ville est née Marie Curie ?', 'Varsovie', 'Paris', 'Prague', 'Vienne', 'sciences', C],
  ['Quel élément chimique Marie Curie a-t-elle nommé d’après son pays natal ?', 'Le polonium', 'Le radium', 'Le francium', 'Le germanium', 'sciences', C],
  ['Combien de prix Nobel Marie Curie a-t-elle reçus ?', 'Deux', 'Un', 'Trois', 'Quatre', 'sciences', C],
  ['En quelle année Marie Curie a-t-elle partagé le Nobel de physique avec Pierre Curie et Henri Becquerel ?', '1903', '1895', '1911', '1921', 'sciences', C],
  ['Dans quel domaine Marie Curie a-t-elle reçu son Nobel de 1911 ?', 'La chimie', 'La physique', 'La médecine', 'La littérature', 'sciences', C],
  ['Où est né Léonard de Vinci ?', 'À Vinci, en Toscane', 'À Florence', 'À Rome', 'À Milan', 'arts', L],
  ['Dans quel pays est mort Léonard de Vinci ?', 'La France', 'L’Italie', 'L’Espagne', 'L’Angleterre', 'arts', L],
  ['Quel roi a invité Léonard de Vinci en France ?', 'François Iᵉʳ', 'Louis XIV', 'Henri IV', 'Charles VII', 'arts', L],
  ['Laquelle de ces œuvres est de Léonard de Vinci ?', 'La Cène', 'La Naissance de Vénus', 'Le Cri', 'La Nuit étoilée', 'arts', L],
  ['Dans quelle ville se trouve le château du Clos-Lucé, où Léonard est mort ?', 'Amboise', 'Blois', 'Chambord', 'Tours', 'arts', L],
];
