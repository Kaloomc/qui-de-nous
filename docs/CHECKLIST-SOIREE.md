# Checklist soirée Gorgée

À imprimer ou garder ouvert sur le téléphone de l'organisateur.

## La veille

- [ ] Mettre à jour : `git pull`, `npm install`, `npm run build`, `npm test` (tout doit être vert).
- [ ] Test complet avec **3 téléphones** (au moins un iPhone et un Android) : rejoindre par QR code, photo (selfie **et** galerie), une manche de chaque jeu, couper le Wi-Fi d'un téléphone 10 s puis le rallumer (il doit reprendre sa place).
- [ ] Sur le PC de la TV : lancer **Réflexes** et vérifier que la voix sort (cliquer une fois sur la page avant), et que le son passe bien par la **TV en HDMI** (et pas par le PC).
- [ ] Désactiver la mise en veille du PC de la TV (et l'économiseur d'écran).
- [ ] Fermer les autres serveurs de développement du PC. Sous Windows, si un autre programme écoute déjà sur le port 3000, Gorgée peut démarrer sans erreur alors que les téléphones tombent sur l'autre programme : vérifier que `http://localhost:3000` affiche bien Gorgée, sinon lancer sur un autre port (`$env:PORT=3001; npm start`).
- [ ] Faire le test **sur le réseau de la soirée** si possible (box, Wi-Fi de la salle, partage de connexion).
- [ ] Charger les téléphones, prévoir une multiprise près de la TV.

## Choisir le mode de connexion

| Mode | Quand | Limites pour 20-30 personnes |
|---|---|---|
| **Wi-Fi local** (`npm start`, QR code sur la TV) | Box à la maison, Wi-Fi sans « isolation des appareils » | Le plus fiable et le plus rapide. Une box grand public gère 30 téléphones, mais pas toujours le Wi-Fi d'une salle ou d'un hôtel (isolation fréquente : les téléphones ne voient pas le PC). |
| **Partage de connexion** du PC ou d'un téléphone | Pas de Wi-Fi utilisable | Un téléphone en partage accepte souvent 5 à 10 appareils seulement : insuffisant pour 30. |
| **Tunnel public** (`npm run share`) | Wi-Fi isolé, joueurs en 4G/5G | Gratuit, sans garantie de disponibilité ; dépend de la 4G de chaque joueur (qui sature souvent en soirée dans une salle pleine). Chaque coupure du tunnel déconnecte tout le monde. |
| **Hébergement** (Render, voir README) | Adresse fixe, sans PC allumé | L'offre gratuite s'endort après 15 min sans visite (premier chargement lent) et redémarre parfois : la partie en cours est alors perdue. |

**Recommandé** : Wi-Fi local sur une box que tu contrôles. **Secours** si le Wi-Fi tombe : `npm run share` et nouveau QR code (les joueurs doivent rescanner et rejoindre la nouvelle partie).

## Pendant la soirée

- **Avec plus de 12 joueurs** : au lancement du mode soirée, **décocher L'Imposteur** (une manche fait 2 tours d'indices par joueur, soit 60 tours à 30 : plus de 10 minutes) et éviter *Qui de nous ?* au-delà de 15-20 joueurs (la grille de votes devient longue à parcourir sur le téléphone).
- **Le serveur plante** : relancer `npm start`. Les parties sont **en mémoire : elles sont perdues**, il faut en recréer une et rescanner le QR code. Pour une relance automatique : `pm2 start server/index.js --name gorgee` (voir README, Dépannage).
- **Un joueur n'arrive plus à se reconnecter** : recharger la page sur son téléphone (il retrouve sa place tant qu'il utilise le même navigateur). Sinon, rescanner le QR code et rejoindre avec le même prénom (ses gorgées repartent de zéro). L'hôte peut retirer l'ancien joueur grisé depuis le lobby ou pendant un vote (croix sur son avatar).
- **La voix de Réflexes ne marche pas** : cliquer une fois sur la page de la TV, vérifier le bouton Son et le volume. Sans voix, le mot s'affiche quand même en grand : on peut jouer à l'écran.
- **Le Wi-Fi tombe** : les téléphones affichent « Connexion perdue, reconnexion… » et reprennent seuls au retour du réseau. S'il ne revient pas : plan de secours ci-dessus.
- **Le QR code envoie vers une mauvaise adresse** : relancer avec la bonne adresse, `PUBLIC_URL=http://192.168.1.42:3000 npm start` (macOS / Linux) ou `$env:PUBLIC_URL="http://192.168.1.42:3000"; npm start` (Windows PowerShell). L'adresse locale du PC s'affiche dans le terminal au démarrage.
- **Trop de codes essayés** : un téléphone qui se trompe 10 fois de code en une minute doit attendre une minute.

## Limites connues

- Capacité testée sans navigateur : **30 joueurs + 1 TV** sur tous les jeux et le mode soirée (`node scripts/loadtest.js 30`). Une partie accepte **50 joueurs au maximum**.
- Pas testé ici : vrais téléphones (Safari iOS, Chrome Android), caméra, vibration, maintien de l'écran allumé, voix sur le PC de la TV, réseau réel de la soirée. C'est le rôle du test de la veille.
