# Projet : « Qui de nous ? », jeu de soirée en temps réel (style Kahoot)

## Concept
Jeu de soirée / jeu à boire jouable sur le même site web, avec deux rôles :
- **Écran (hôte)** : affiché sur une TV ou un PC. L'hôte crée la partie et pilote le déroulement.
- **Joueur** : chacun rejoint depuis son téléphone en scannant un QR code affiché sur l'écran.

À chaque tour, une question du type « Qui est le plus susceptible de... ? » apparaît. Tous les joueurs votent pour un des autres joueurs. Le plus voté boit, et tous ceux qui n'ont pas voté comme la majorité boivent aussi.

## Parcours utilisateur

### Hôte (écran TV / PC)
1. Arrive sur le site, clique sur « Créer une partie ».
2. Voit un **lobby** : QR code + code de partie court (ex. 4 à 6 caractères, pour rejoindre à la main), et la liste des joueurs avec photo et prénom qui apparaissent en direct.
3. Lance la partie quand tout le monde est là.
4. Pour chaque question : affiche la question, un compteur « X / N ont voté », puis un bouton pour révéler les résultats.
5. Écran de résultats (voir plus bas), puis bouton « Question suivante ».
6. L'hôte décide quand arrêter la partie (bouton « Terminer »).

### Joueur (téléphone)
1. Scanne le QR code, arrive sur une page de join.
2. Saisit son **prénom** et ajoute sa **photo** (selfie via la caméra ou upload depuis la galerie).
3. Attend dans le lobby jusqu'au lancement.
4. À chaque question : voit la question et la grille des autres joueurs (photo + prénom), tape sur un joueur pour voter, puis voit « Vote enregistré, en attente des autres ».
5. Après la révélation, voit s'il doit boire ou non (message clair et lisible).

## Règles de jeu
- Une liste de **questions prédéfinies** intégrée au jeu (fichier JSON, ~50 à 100 questions « Qui est le plus susceptible de... », ton fun et soirée, entre amis). Ordre aléatoire, sans répétition dans une même partie.
- **Pas de limite stricte de joueurs**, mais viser confortablement jusqu'à ~20.
- Le joueur **le plus voté boit**.
- Tous les joueurs qui **n'ont pas voté pour le joueur le plus voté** boivent aussi.
- Cas à gérer par défaut (faciles à changer) :
  - **Égalité** : tous les joueurs ex æquo en tête sont considérés comme « les plus votés ». Ceux qui ont voté pour l'un d'eux ne boivent pas à cause de leur vote, les autres boivent.
  - **Vote pour soi-même** : autorisé.
  - **Joueur qui n'a pas voté à temps** : l'hôte peut révéler les résultats sans attendre, et le non-votant compte comme n'ayant pas voté pour le plus voté (il boit).

## Écran de résultats (TV)
- Mise en avant du **joueur le plus voté** (grande photo, prénom, nombre de votes).
- **Diagramme circulaire** (camembert) de la répartition des votes, avec photo/prénom des joueurs dans la légende.
- Sur la même zone, en dessous : la ligne des **joueurs qui n'ont pas voté pour le plus voté**, donc ceux qui boivent en plus, avec leur photo et prénom.
- Animations simples pour rendre la révélation fun.

## Exigences techniques
- **Application web unique** (un seul site) : la route/le mode change selon le rôle (hôte ou joueur).
- **Temps réel** entre l'écran et les téléphones (WebSocket, par exemple Socket.IO, ou un service temps réel type Supabase Realtime / Firebase, au choix de ce qui est le plus simple et robuste).
- **Mobile-first** côté joueur (gros boutons, lisible en soirée, tout tient sans zoom).
- **Écran TV / grand écran** côté hôte : textes grands, contrastes forts, lisible de loin.
- Génération du **QR code** qui pointe vers l'URL de join de la partie.
- **Photos** : capture ou upload, redimensionnées et compressées côté client avant envoi (ex. carré ~256 px) pour rester léger.
- **Reconnexion** : si un joueur recharge la page ou perd la connexion, il retrouve sa place dans la partie (identifiant stocké localement).
- Les parties sont **éphémères** : pas de compte, pas de base de données durable nécessaire. Un état en mémoire côté serveur suffit pour une première version.
- Stack libre, mais privilégier la simplicité : par exemple Node.js + Socket.IO + front en React/Vite (ou Next.js), facile à lancer en local et à déployer.

## Hors périmètre pour l'instant
- Pas d'autres mini-jeux (peut-être plus tard, penser l'architecture pour que ce soit possible).
- Pas de génération de questions par IA (liste fixe pour le moment).
- Pas de comptes utilisateurs ni de historique de parties.

## Ce que j'attends de toi
1. Propose rapidement une architecture simple et la stack choisie, en quelques lignes.
2. Mets en place le projet et le MVP bout en bout : créer une partie, rejoindre par QR code, voter en temps réel, afficher les résultats avec le camembert et la liste de ceux qui boivent.
3. Fournis les instructions pour le lancer en local et le tester avec plusieurs téléphones sur le même réseau.
4. Une fois le MVP fonctionnel, liste les améliorations possibles.
