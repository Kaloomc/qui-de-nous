// Lot 4 de questions de Culture G éclair : [question, bonne réponse, 3 mauvaises, catégorie, source vérifiée].
const RF = 'https://fr.wikipedia.org/wiki/R%C3%A9volution_fran%C3%A7aise';
const NA = 'https://fr.wikipedia.org/wiki/Napol%C3%A9on_Ier';
const JO = 'https://fr.wikipedia.org/wiki/Jeux_olympiques';
const EI = 'https://fr.wikipedia.org/wiki/Albert_Einstein';
const VG = 'https://fr.wikipedia.org/wiki/Vincent_van_Gogh';
const PI = 'https://fr.wikipedia.org/wiki/Pablo_Picasso';
const NI = 'https://fr.wikipedia.org/wiki/Nil';
const NE = 'https://fr.wikipedia.org/wiki/Isaac_Newton';
export default [
  ['Quel jour de 1789 les émeutiers parisiens prennent-ils la Bastille ?', 'Le 14 juillet', 'Le 5 mai', 'Le 26 août', 'Le 9 novembre', 'histoire', RF],
  ['Où s’ouvrent les États généraux le 5 mai 1789 ?', 'À Versailles', 'À Paris', 'À Fontainebleau', 'À Reims', 'histoire', RF],
  ['Quel texte est adopté le 26 août 1789 ?', 'La Déclaration des droits de l’homme et du citoyen', 'Le Code civil', 'La Constitution de la Ve République', 'Le serment du Jeu de paume', 'histoire', RF],
  ['Quel coup d’État de Bonaparte met fin à la Révolution en 1799 ?', 'Le 18 Brumaire', 'Le 10 Thermidor', 'Le 2 Décembre', 'Le 9 Thermidor', 'histoire', RF],
  ['Dans quelle ville est né Napoléon Bonaparte ?', 'À Ajaccio', 'À Paris', 'À Bastia', 'À Marseille', 'histoire', NA],
  ['Dans quelle cathédrale Napoléon est-il sacré empereur en 1804 ?', 'Notre-Dame de Paris', 'Reims', 'Saint-Denis', 'Chartres', 'histoire', NA],
  ['Sur quelle île Napoléon est-il mort en exil ?', 'Sainte-Hélène', 'L’île d’Elbe', 'La Corse', 'Malte', 'histoire', NA],
  ['Quelle défaite met fin à l’Empire napoléonien en 1815 ?', 'Waterloo', 'Austerlitz', 'Trafalgar', 'Iéna', 'histoire', NA],
  ['Dans quelle ville ont eu lieu les premiers Jeux olympiques modernes (1896) ?', 'Athènes', 'Paris', 'Londres', 'Rome', 'sport', JO],
  ['Quel Français a rénové les Jeux olympiques en 1894 ?', 'Pierre de Coubertin', 'Jules Rimet', 'Henri Desgrange', 'Georges Carpentier', 'sport', JO],
  ['Où se tenaient les Jeux olympiques de l’Antiquité ?', 'À Olympie', 'À Delphes', 'À Athènes', 'À Sparte', 'sport', JO],
  ['Dans quelle ville ont eu lieu les premiers Jeux olympiques d’hiver, en 1924 ?', 'Chamonix', 'Oslo', 'Grenoble', 'Saint-Moritz', 'sport', JO],
  ['Dans quelle ville est né Albert Einstein ?', 'Ulm', 'Berlin', 'Zurich', 'Vienne', 'sciences', EI],
  ['En quelle année Einstein publie-t-il la relativité restreinte ?', '1905', '1879', '1915', '1921', 'sciences', EI],
  ['Pour quoi Einstein a-t-il reçu son prix Nobel de physique ?', 'L’effet photoélectrique', 'La relativité générale', 'La bombe atomique', 'Le Big Bang', 'sciences', EI],
  ['Dans quelle ville américaine Einstein est-il mort ?', 'Princeton', 'New York', 'Boston', 'Washington', 'sciences', EI],
  ['Dans quel pays est né Vincent van Gogh ?', 'Aux Pays-Bas', 'En France', 'En Belgique', 'En Allemagne', 'arts', VG],
  ['Laquelle de ces toiles est de Van Gogh ?', 'La Nuit étoilée', 'La Jeune Fille à la perle', 'Impression, soleil levant', 'Les Demoiselles d’Avignon', 'arts', VG],
  ['Dans quelle commune française Van Gogh est-il mort ?', 'Auvers-sur-Oise', 'Arles', 'Giverny', 'Saint-Rémy-de-Provence', 'arts', VG],
  ['Dans quelle ville espagnole est né Pablo Picasso ?', 'Malaga', 'Barcelone', 'Madrid', 'Séville', 'arts', PI],
  ['Quelle ville basque son tableau Guernica évoque-t-il ?', 'Guernica', 'Bilbao', 'Saint-Sébastien', 'Pampelune', 'arts', PI],
  ['Avec quel peintre Picasso a-t-il fondé le cubisme ?', 'Georges Braque', 'Henri Matisse', 'Salvador Dalí', 'Claude Monet', 'arts', PI],
  ['Dans quelle mer le Nil se jette-t-il ?', 'La Méditerranée', 'La mer Rouge', 'L’océan Indien', 'La mer Noire', 'géographie', NI],
  ['Quelle longueur dépasse le Nil ?', '6 700 km', '3 000 km', '1 500 km', '12 000 km', 'géographie', NI],
  ['Combien de pays le Nil traverse-t-il ?', 'Huit', 'Trois', 'Cinq', 'Douze', 'géographie', NI],
  ['Quel pays n’est pas traversé par le Nil ?', 'Le Maroc', 'L’Égypte', 'L’Éthiopie', 'L’Ouganda', 'géographie', NI],
  ['Dans quel pays est né Isaac Newton ?', 'En Angleterre', 'En France', 'En Allemagne', 'En Italie', 'sciences', NE],
  ['Quelle loi Newton a-t-il formulée ?', 'La gravitation universelle', 'La relativité', 'Le principe d’incertitude', 'La sélection naturelle', 'sciences', NE],
  ['En quelle année paraît le Principia de Newton ?', '1687', '1543', '1789', '1905', 'sciences', NE],
  ['Que montre Newton dans son livre Opticks ?', 'Que la lumière blanche est composée de plusieurs couleurs', 'Que la Terre tourne autour du Soleil', 'Que la lumière va à vitesse infinie', 'Que les atomes existent', 'sciences', NE],
];
