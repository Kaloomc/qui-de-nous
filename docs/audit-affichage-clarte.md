## Audit de clarté (lecture du code et des textes)

Réponses aux 7 questions, jeu par jeu. « oui » = rien à corriger ; « corrigé » = changé pendant cet audit ; « à surveiller » = dit honnêtement ce que la mesure ne prouve pas.

| Jeu | Compris en 3 s | Règle d'intro en 1 phrase | Qui agit, temps, qui a répondu | Résultat évident | ≤ 5 blocs TV | Écrans parieur / duelliste simples, sans secret | Transitions |
|---|---|---|---|---|---|---|---|
| Pierre-feuille-ciseaux | oui | oui | oui (🔒 « A choisi », chrono) | oui | oui | oui | oui |
| Culture G éclair | oui | oui | oui (pénalité −2 s visible, décompte) | oui | oui | oui | oui |
| Duel du Feu | oui | oui | oui | oui | oui | oui | oui |
| Simon | oui | oui | oui | oui | oui | oui | oui |
| Couleur piège | oui | oui | oui | oui | oui | oui | oui |
| Désamorçage | oui | oui | oui (« Fils ratés : 0 / 1 ») | oui | oui | oui | oui |
| Le Code | corrigé (symbole au-dessus, ✓ / ✕ dessous, contraste) | oui | oui | oui | oui (la TV ne montre que les retours) | oui | oui |
| Simon croisé | oui | oui | oui | oui | oui | oui | oui |
| Le Crash | oui | oui | oui | oui | corrigé (courbe en décor, plus de chevauchement) | oui | oui |
| Dilemme en or | oui | oui | oui | oui | oui | oui | oui |
| 1-2-3 Soleil | oui | oui | oui | oui | oui | oui | oui |
| Plateau fantôme | oui | oui | oui | oui | oui | oui | oui |
| Course d'obstacles | oui | oui | oui | oui | oui | corrigé (paysage : SAUTER à gauche, SE BAISSER à droite) | oui |
| Géo-duel | oui | oui | oui (« épingle posée ») | oui (traits + km) | corrigé (carte à 46 % de la hauteur, textes réduits) | corrigé (carte adaptée à la hauteur du téléphone) | oui |
| Qui suis-je ? | corrigé (retour immédiat « ✓ +N » / « ✕ raté ») | oui | oui | oui | oui | corrigé (indices à venir masqués sur petit téléphone) | oui |
| Ordre chronologique | oui | oui | oui | oui | oui | corrigé (cartes plus compactes sur petit téléphone) | oui |
| Vrai ou Faux | oui | oui | oui | oui | oui | oui | oui |
| Dés menteurs | oui | oui | oui (Prêt, chrono, 🔒) | oui | oui | corrigé (dés et boutons tiennent sur 320×568) | oui |
| Roulette russe | oui | oui | oui (À X de jouer, Passe restante) | oui (SPLASH) | oui | corrigé (barillet de 44 px minimum par case) | oui |

Communs :
- **Écran de résultat** : plus de 5 blocs (titre, combattants, ligne du jeu, bandeau du roi, cote, buveurs, décomptes, boutons). Les tailles ont été réduites et l'ensemble est ajusté à l'écran automatiquement, mais le nombre de blocs n'a pas été réduit : c'est à surveiller sur la vraie TV (à supprimer en premier : la ligne de cote).
- **Transitions** : fondu de 250 ms entre phases, sans flash ; le seul « saut » mesuré était le redimensionnement des scènes trop hautes, désormais lissé par l'ajustement à l'écran.
- **Écrans « pauvres »** (signalés « espace » dans le rapport) : roulette des mini-jeux, « Prêt », Feu, Simon : le contenu est petit sur une grande TV. Ce sont des avertissements, pas des défauts bloquants : les agrandir demanderait de redessiner ces scènes.
