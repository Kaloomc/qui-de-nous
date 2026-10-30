# Progression de la mise à jour « tirage équitable, genre, Roue, Savant, Noir Boire Mangue »

Un commit par chantier ; `npm test` et `npm run build` après chacun.

- [x] 1. Tirage équitable à l'échelle de la soirée (`server/spotlight.js`)
- [x] 2. Genre des joueurs : choix à l’entrée, moteur d’accords (`shared/formulation.js`), questions réservées (`cible`), audit du contenu ; le contenu à ajouter (+60 / +100…) viendra avec « Contenu »
- [x] 4. Le Savant : interface sans réglages, avancement dès que tout le monde a agi, révélation lisible, verdicts. Faits : test du devinage à froid fait (voir plus bas), 160 faits.
- [x] 3. La Roue : défis par genre (30 normaux + 30 en 18+ déjà écrits)
- [x] 5. Noir Boire Mangue : moteur, écrans, tests (règles, moteur, fuite sur sockets réels, 300 parties de bots). Contenu écrit : 155 phrases / 402 cartes (normal), 87 phrases / 159 cartes (18+).
- [x] Contenu (questions par genre, faits du Savant, phrases et cartes de Noir Boire Mangue)
- [x] 7. README (genre, vie privée, accords, tirage équitable, Noir Boire Mangue, ajout de contenu) et simulation de soirée (`npm run fairness`, tests du registre)
- [x] 8. Captures d'écran (`npm run captures` → `docs/captures/` + `INDEX.md`, 96 images, 0 problème d'affichage repéré)

## Faits du Savant : test du devinage à froid

Test appliqué aux 158 faits d’origine : « quelqu’un qui ne sait pas, mais qui réfléchit une dizaine de secondes, trouve-t-il la réponse ? ».
Retirés (61) parce que la réponse se devine ou se déduit : réponses de culture générale (girafe et ses sept vertèbres, narval et sa dent, ours polaire à la peau noire, tour Eiffel « vingt ans », Napoléon 1,69 m, « Nike = victoire », « judo = souplesse », « Samsung = trois étoiles »…), formulations qui donnent la réponse (« hippopotame : sueur de sang », cuisine : « la fraise et ses fruits », « la pomme et son air ») et chiffres secs sans surprise (durées d’orbite, températures, millions de degrés, âges d’arbres, dates de chantiers).
Gardés (97) : réponses qu’on ne trouve pas sans les connaître (crottes de wombat, loutres main dans la patte, chats et goût sucré, « disque dur d’une tonne », premier SMS, Pickles et la Coupe du monde, etc.).
Ajoutés (63), chacun confirmé sur le web avant l’écriture, avec une source fiable ; les affirmations contestées ou non retrouvées ont été écartées : lien parenté humains/bananes (60 %), langue enroulée du pic-vert, escargot qui dort trois ans, ketchup « médicament » (source faible), doigts fripés (étude contredite), acariens « chez presque tous » (non confirmé), « la tour Eiffel grandit de 15 cm » (remplacé par les 18 cm de déplacement du sommet, source Wikipédia).

# Corrections après tests (icônes de genre, questions par genre, Savant, Noir Boire Mangue, contenu)

- [x] 1. Boutons de genre à icônes (♂ bleu, ♀ rose, rond gris à trois points), coche, `aria-label`, test de rendu
- [x] 2. Questions réservées à un genre : audit complet. Questions « Qui de nous ? » : 240 entrées examinées (normal + 18+) → 6 gardées + 16 nouvelles de qualité, 297 converties en « tous » (accords neutres), 17 supprimées. « Qui me connaît ? » : 120 examinées → 2 gardées + 4 nouvelles, 123 converties, 15 supprimées. Proportion ramenée à 8–10 % des tirages. Script `scripts/check-genre-stereotypes.js` + liste d'exceptions `server/content/genre-exceptions.json`.
- [x] 3. Le Savant : 153 faits refaits (anecdotes complètes, trou sur le plus surprenant, jamais un nombre, test du devinage à froid et du camouflage). Bilan : 59 réécrits, 101 retirés, 94 nouveaux ; voir `docs/audit-faits-savant.md`
- [x] 4. Noir Boire Mangue : 204 phrases + 106 en 18+ réécrites (trou début/milieu/fin 24/42/34), champ `forme`, 546 + 219 cartes, mains avec au moins 3 cartes compatibles, `npm run check-nbm` ; voir `docs/audit-nbm.md`
- [x] 6. Volume de contenu, par lots avec doublons contrôlés. Livré : Qui de nous +143 (normal) / +131 (18+) ; Tu préfères +147 / +120 ; Qui me connaît +76 / +66 ; Estimation +66 (chaque valeur lue sur Wikipédia/NASA, avec `source`) ; Imposteur +92 / +60 ; La Roue +58 / +69 (dont 8 défis par genre en normal et 6 en 18+) ; Réflexes +60 mots avec leurs voix ; NBM 204 phrases / 546 cartes (normal) et 106 / 219 (18+) ; Savant 153 faits. Non livré, par choix de qualité : les questions réservées à un genre supplémentaires (+30 / +60 par genre) et Estimation +100 (66 seulement : les autres chiffres variaient selon les sources ou dans le temps).
- [x] 5. Captures d'écran (3 états des icônes de genre, Savant avec 3 faits, 6 phrases NBM de structures différentes avec les cartes du téléphone, cas limites) + `docs/captures/contenu-echantillon.md` (`npm run sample`)
- [x] README (icônes, règles des questions par genre, ligne éditoriale du Savant, structure et `forme` NBM, ajout de contenu avec contrôles)

# Mode Duel, partie 1

- [x] 1. Moteur : mode, options, sélection équitable des duellistes (rôle `duel:duelliste`), étapes à `phaseId` unique, annulations, `teardownGame()`, interface des mini-jeux (`server/duel/minigames/index.js`)
- [x] 2. Paris secrets, cote, gorgées (Standard / Hardcore, roi, égalité), emojis et confettis (limites serveur, TV seulement)
- [x] 3. Roulettes, révélation des paris, écrans TV et téléphones, verdicts
- [x] 4. Pierre-feuille-ciseaux, Simon, Couleur piège, Duel du Feu, Culture G éclair (155 questions sourcées, `npm run check-culture`), latence compensée (médiane de 5 allers-retours)
- [x] 5. Simulateur de 300 sessions, test de fuite sur sockets, README, captures (`npm run captures -- duel` → `docs/captures/duel-partie1/`, 45 images, 0 problème d'affichage)

# Mode Duel, partie 2 (12 mini-jeux) : arrêt volontaire à 5 sur 12

Un commit par jeu, `npm test` et `npm run build` après chacun (484 tests verts).

- [x] Désamorçage (générateur à solution unique, 1 000 puzzles testés)
- [x] Le Code (indices Mastermind testés avec doublons, code jamais envoyé avant la fin)
- [x] Simon croisé (séquence visible seulement sur la TV pendant son rejeu)
- [x] Le Crash (distribution sur 10 000 tirages, bornes, latence compensée)
- [x] Dilemme en or (gorgées propres au jeu : petit ajout au moteur, `sips` et `rule` dans le contrat des mini-jeux)
- [ ] 1-2-3 Soleil : les clips se génèrent avec `npm run voices -- --words Un,Deux,Trois,Soleil` (pipeline existant, clé ElevenLabs dans `.env`) ; la logique serveur (barre qui avance tant qu'on appuie, recul d'un quart si on est appuyé à « Soleil » + 250 ms, temps compensés) reste à écrire
- [ ] Plateau fantôme, Course d'obstacles (simulation déterministe client / serveur)
- [ ] Qui suis-je ?, Ordre chronologique, Vrai ou Faux en survie, Géo-duel (+ 4 fichiers de contenu vérifiés avec source, carte Natural Earth)
- [ ] Captures `docs/captures/duel-partie2/`, simulateur de bots à 17 jeux (le simulateur existant couvre déjà les 11 jeux actuels : les nouveaux sont dans le registre)

# Mode Duel, partie 2 : terminée (12 mini-jeux sur 12), contenus réduits

Un commit par jeu ou groupe de jeux ; `npm test` (533 tests) et `npm run build` verts à chaque étape.

- [x] Désamorçage, Le Code, Simon croisé, Le Crash, 1-2-3 Soleil (clips Un/Deux/Trois/Soleil + file audio unique), Dilemme en or (gorgées propres au jeu, règle annoncée aux parieurs), Plateau fantôme, Course d'obstacles (simulation partagée `shared/runner.js`), Géo-duel (carte Natural Earth), Qui suis-je ?, Ordre chronologique, Vrai ou Faux
- [x] Intégration des 17 jeux (options, roulette, désactivation), simulateur de 300 sessions avec les 17 jeux, tests de fuite sur sockets
- [x] README (12 jeux, contenus, licence de la carte, clips audio) et captures `docs/captures/duel-partie2/` (48 images, 0 problème d'affichage)
- Volumes de contenu livrés (réduits, signalés) : Qui suis-je 54 (demandé 100), Ordre chronologique 60 séries sur 92 événements (demandé 100), Vrai ou Faux 218 (demandé 300, dont 169 vraies : le tirage en duel reste 50 / 50), Géo-duel 128 villes (demandé 120, villes seulement, pas de monuments), clips audio 4.

# Mode Duel : corrections après tests réels

- [x] Étape 1 : carte d'intro de 4,5 s (règle, pictogramme, 3-2-1) avant chaque mini-jeu, scène TV à 70 % de la hauteur avec avatars en grand dans les coins, menu hôte discret (coin bas gauche, replié), en-têtes courts en casse normale, bannière « duel annulé » seule 2,8 s, pénalités de temps (Désamorçage −3 s, Culture G −2 s, Plateau fantôme −2 s, Ordre chronologique −3 s : mauvaise réponse en rouge, « −X s » flottant, décompte en direct ; Qui suis-je ? : bloqué jusqu'à l'indice suivant, −1 point)
- [x] Étape 2 : roulette à deux colonnes de photos (rouge de haut en bas, bleu de bas en haut), bande dupliquée en boucle (≥ 16 vignettes, jamais deux voisins identiques, `shared/roulette.js`), arrêt net avec zoom et halo, voisines floues, tic qui ralentit ; résultat décidé par le serveur ; `prefers-reduced-motion` : affichage direct des deux élus
- [x] Étape 3 : téléphone du parieur = liseré de pari + grille 2 colonnes de gros emojis et gros bouton confettis (vibration, appuis regroupés par lots de 100 ms) ; plafond serveur de 15 appuis par seconde et par joueur, surplus ignoré sans erreur (plus de limite à 1 par seconde) ; envoi par l'événement léger `player:cheer` → `duel:cheers` vers la TV seule (jamais dans l'état, donc jamais vers les duellistes) ; TV : canvas plein écran, marges uniquement, confettis en rafales à formes multiples, combo. Le « bug » des captures sans emojis : les actions y étaient injectées côté serveur sans diffusion d'état (artefact du script de capture) ; le nouveau canal par lots toutes les 100 ms n'en dépend plus.
- [x] Étape 4a : Le Code (code sans doublon, essais sans symbole répété, retour façon Wordle G/O/X avec icônes ✓ ↔ ✕, grandes grilles de retour sur la TV : la TV n'affiche que les cases de retour, jamais les symboles proposés, pour ne pas souffler l'adversaire) ; Le Crash (explosion à 1,50x au minimum, courbe derrière le chiffre, tremblement et couleur qui chauffe)
- [x] Étape 4b : Course d'obstacles : deux gros boutons « SAUTER » / « SE BAISSER » (maintenu) en bas de l'écran du téléphone, espace / flèche haut / flèche bas au clavier (PC), couloir bien plus grand sur téléphone (fenêtre de 440 unités au lieu de 640), dino pixel-art original, cactus de trois formes, ptérodactyle, sol et nuages qui défilent ; vitesse plafonnée à 12 (au lieu de 15) pour rester jouable sur la fenêtre plus étroite ; simulation inchangée (pas fixe, rejouée par le serveur). Les boîtes de collision restent les mêmes pour tous les cactus (variété seulement visuelle) afin de ne pas toucher à la simulation.
- [x] Étape 4c : Désamorçage (fils nettement plus grands sur la TV, « Fils ratés : 0 / 1 » par équipe) ; Vrai ou Faux (revue des affirmations : retrait de 4 douteuses, reformulation de celle sur les fourmis, 214 restantes, test réponse + explication courte)
- [x] Étape 4d : Plateau fantôme refait : 12 illustrations Twemoji (crédit CC-BY 4.0 dans le README), une seule règle par passage (« Quel animal a disparu ? », « Quel animal est arrivé ? », « Combien d'animaux sont passés derrière le rideau ? »), 3 à 5 animaux, rideau et animations lentes, réponses en grosses images, « Première équipe à 2 points », 9 s pour répondre ; 1 000 passages testés à réponse unique
