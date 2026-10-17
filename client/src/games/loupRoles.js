// Rôles du Loup-Garou côté écrans : nom, icône (emoji : aucune image protégée) et description courte du pouvoir.
export const ROLE_INFO = {
  villageois: { name: 'Villageois', icon: '🧑‍🌾', camp: 'village', text: 'Aucun pouvoir : tu débats, tu observes, tu votes. Trouve les loups avant qu’il ne soit trop tard.' },
  loup: { name: 'Loup-garou', icon: '🐺', camp: 'loups', text: 'Chaque nuit, avec les autres loups, tu choisis une victime. Le jour, fais l’innocent.' },
  voyante: { name: 'Voyante', icon: '🔮', camp: 'village', text: 'Chaque nuit, tu découvres le rôle d’un joueur. Utilise-le sans te faire repérer.' },
  sorciere: { name: 'Sorcière', icon: '🧪', camp: 'village', text: 'Une potion de vie, une potion de mort (une fois chacune), et chaque nuit une potion de gorgée.' },
  chasseur: { name: 'Chasseur', icon: '🏹', camp: 'village', text: 'Quand tu meurs, quelle que soit la cause, tu tires sur quelqu’un et il meurt avec toi.' },
  cupidon: { name: 'Cupidon', icon: '💘', camp: 'village', text: 'La première nuit, tu désignes deux amoureux (toi compris). Si l’un meurt, l’autre aussi.' },
  salvateur: { name: 'Salvateur', icon: '🛡️', camp: 'village', text: 'Chaque nuit, tu protèges quelqu’un des loups. Jamais deux nuits de suite la même personne.' },
  ours: { name: 'Ours', icon: '🐻', camp: 'village', text: 'Trois fois dans la partie, tu flaires un joueur : tu sais si lui ou un voisin est un loup.' },
  idiot: { name: 'Idiot du village', icon: '🤡', camp: 'village', text: 'Éliminé par le vote, tu survis mais tu perds ton droit de vote.' },
  ancien: { name: 'Ancien', icon: '👴', camp: 'village', text: 'Tu survis à la première attaque des loups. Le reste te tue normalement.' },
  ivrogne: { name: 'Ivrogne', icon: '🍺', camp: 'village', text: 'Chaque nuit, tu bois une gorgée. En secret. Tu as de l’entraînement.' },
  distributeur: { name: 'Distributeur', icon: '🎁', camp: 'village', text: 'Une seule fois, de nuit, tu fais boire jusqu’à trois joueurs, sans qu’on sache d’où ça vient.' },
};

export const CAMP_NAME = { village: 'Le village', loups: 'Les loups-garous', amoureux: 'Les amoureux', nul: 'Personne' };

/** « Le village s'endort », puis chaque rôle qui se réveille (public : même si le joueur est mort). */
export const PHASE_LABEL = {
  cupidon: 'Cupidon se réveille et désigne deux amoureux.',
  salvateur: 'Le Salvateur se réveille et protège quelqu’un.',
  voyante: 'La Voyante se réveille et cherche un loup.',
  ours: 'L’Ours se réveille et renifle l’air.',
  loups: 'Les loups-garous se réveillent et choisissent leur proie.',
  sorciere: 'La Sorcière se réveille et prépare ses potions.',
  distributeur: 'Quelqu’un se réveille et sort des verres.',
  ivrogne: 'Quelqu’un se réveille et titube.',
};

export const roleIcon = (role) => ROLE_INFO[role]?.icon ?? '❓';
