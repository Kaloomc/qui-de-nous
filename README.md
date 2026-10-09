# Qui de nous ?

Jeu de soirée en temps réel, façon Kahoot. Une question s'affiche sur la TV, chacun vote en secret depuis son téléphone… et les perdants boivent.

Deux modes de jeu :

- **Qui de nous ?** : « Qui est le plus susceptible d'envoyer un message à son ex à 3h du matin ? » Tout le monde vote pour un joueur, le plus voté boit.
- **Tu préfères ?** : « Ne plus jamais manger de pizza **ou** ne plus jamais regarder de film ? » Chacun choisit A ou B, une jauge à suspense départage les camps, **la minorité boit**.

### Qui de nous ?

| Écran (TV / PC) | | |
|---|---|---|
| ![Lobby](docs/screenshots/ecran-lobby.png) | ![Question](docs/screenshots/ecran-question.png) | ![Résultats](docs/screenshots/ecran-resultats.png) |

| Téléphone | | |
|---|---|---|
| ![Rejoindre](docs/screenshots/tel-rejoindre.png) | ![Vote](docs/screenshots/tel-vote.png) | ![Verdict](docs/screenshots/tel-verdict.png) |

### Tu préfères ?

| Écran (TV / PC) | | |
|---|---|---|
| ![Question](docs/screenshots/tp-ecran-question.png) | ![Suspense](docs/screenshots/tp-ecran-suspense.png) | ![Résultats](docs/screenshots/tp-ecran-resultats.png) |

| Téléphone | | |
|---|---|---|
| ![Vote](docs/screenshots/tp-tel-vote.png) | ![Suspense](docs/screenshots/tp-tel-suspense.png) | ![Verdict](docs/screenshots/tp-tel-verdict.png) |

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Tutoriel pas à pas](#tutoriel-pas-à-pas)
  - [1. Installer Node.js](#1-installer-nodejs)
  - [2. Récupérer le projet](#2-récupérer-le-projet)
  - [3. Installer et construire](#3-installer-et-construire)
  - [4. Jouer sur le même Wi-Fi](#4-jouer-sur-le-même-wi-fi)
  - [5. Jouer à distance (sans même Wi-Fi)](#5-jouer-à-distance-sans-même-wi-fi)
  - [6. Déroulement d'une partie](#6-déroulement-dune-partie)
- [Règles du jeu](#règles-du-jeu)
- [Dépannage](#dépannage)
- [Personnaliser les questions](#personnaliser-les-questions)
- [Héberger en ligne (gratuit)](#héberger-en-ligne-gratuit)
- [Développement](#développement)
- [Licence](#licence)

## Fonctionnalités

- **Deux modes de jeu** au choix à la création de la partie, et possibilité de changer de jeu à la fin sans que personne n'ait à rescanner.
- Un seul site : l'écran crée la partie, les téléphones la rejoignent en scannant un **QR code** (ou en tapant un code de 4 lettres).
- Chaque joueur choisit son **prénom** et sa **photo** (selfie ou galerie, compressée automatiquement).
- **Vote secret en temps réel** avec compteur « X / N ont voté » sur l'écran.
- **Résultats animés** :
  - *Qui de nous ?* : le plus voté en grand, un camembert de la répartition et la liste de ceux qui boivent en plus.
  - *Tu préfères ?* : une jauge oscille entre A et B, ralentit, hésite, puis se pose sur le vrai résultat (avec tic-tac sonore). Les photos des joueurs atterrissent ensuite dans leur camp, la majorité a droit à des confettis.
- Chaque téléphone affiche clairement **« Tu bois ! »** ou **« Tu ne bois pas »**. En mode *Tu préfères ?*, il attend la fin de l'animation de la TV pour ne rien gâcher.
- **Reconnexion automatique** : un joueur qui recharge sa page ou perd le réseau retrouve sa place (et son vote).
- 85 questions et 90 dilemmes intégrés, tirés au hasard sans répétition.
- Aucun compte, aucune base de données : les parties vivent en mémoire et disparaissent toutes seules.

## Démarrage rapide

Si tu as déjà Node.js 18 ou plus :

```bash
git clone https://github.com/Kaloomc/qui-de-nous.git
cd qui-de-nous
npm install
npm run build
npm start
```

Ouvre ensuite **http://localhost:3000** sur le PC branché à la TV et clique sur **Créer une partie**.

## Tutoriel pas à pas

### 1. Installer Node.js

Il faut **Node.js 18 ou plus récent**. Vérifie ta version :

```bash
node -v
```

Si la commande n'existe pas ou affiche une version inférieure à 18 :

- **Windows / macOS** : télécharge l'installeur « LTS » sur [nodejs.org](https://nodejs.org).
- **Linux (avec droits admin)** : passe par [nvm](https://github.com/nvm-sh/nvm) :
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  # ferme et rouvre le terminal, puis :
  nvm install --lts
  ```
- **Linux sans droits admin** (ex. machine d'école) : installe Node dans ton dossier perso :
  ```bash
  mkdir -p ~/.local/node
  curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz | tar -xJ --strip-components=1 -C ~/.local/node
  echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zshrc   # ou ~/.bashrc
  source ~/.zshrc
  ```

### 2. Récupérer le projet

```bash
git clone https://github.com/Kaloomc/qui-de-nous.git
cd qui-de-nous
```

Pas de git ? Sur la page GitHub du projet, clique sur **Code → Download ZIP** et décompresse l'archive.

### 3. Installer et construire

```bash
npm install      # télécharge les dépendances (une seule fois)
npm run build    # construit le site (à refaire après chaque modification du code)
```

### 4. Jouer sur le même Wi-Fi

C'est le mode le plus simple quand tout le monde est dans la même pièce.

```bash
npm start
```

Le terminal affiche :

```
Qui de nous ? — serveur sur le port 3000
  Local : http://localhost:3000
  Réseau : http://192.168.1.42:3000
```

1. Sur le PC branché à la TV, ouvre **http://localhost:3000** et clique sur **Créer une partie**.
2. Les téléphones (connectés au **même Wi-Fi** que le PC) scannent le QR code. Le QR code utilise automatiquement l'adresse « Réseau » du PC.
3. Pour arrêter le jeu : `Ctrl + C` dans le terminal.

### 5. Jouer à distance (sans même Wi-Fi)

Les joueurs sont en 4G, sur un autre réseau, ou le Wi-Fi bloque les connexions entre appareils ? Utilise un **tunnel Cloudflare** : gratuit, sans compte, il donne au jeu une adresse publique en `https://`.

**Installer `cloudflared` (une seule fois)**

- **Linux (sans droits admin)** :
  ```bash
  mkdir -p ~/.local/bin
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared
  chmod +x ~/.local/bin/cloudflared
  # si ~/.local/bin n'est pas dans ton PATH :
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
  ```
- **macOS** : `brew install cloudflared`
- **Windows** : `winget install --id Cloudflare.cloudflared`

**Lancer le jeu en mode partagé**

```bash
npm run build   # si ce n'est pas déjà fait
npm run share
```

Après quelques secondes, le terminal affiche :

```
==========================================================
  Ouvre cette adresse sur la TV / le PC :
  https://exemple-de-mots-aleatoires.trycloudflare.com
==========================================================
```

1. Ouvre **cette adresse** (et pas `localhost`) sur la TV / le PC, puis crée la partie.
2. Le QR code pointe vers l'adresse publique : les joueurs peuvent la scanner depuis n'importe où.
3. `Ctrl + C` arrête le serveur et le tunnel.

> L'adresse change à chaque lancement, et le PC doit rester allumé pendant la partie. Pour une adresse fixe, voir [Héberger en ligne](#héberger-en-ligne-gratuit).

### 6. Déroulement d'une partie

**Sur l'écran (hôte)**

1. Sur l'accueil, **choisis le jeu** (*Qui de nous ?* ou *Tu préfères ?*), puis **Créer une partie** : un QR code et un code de 4 lettres s'affichent. Le dernier jeu choisi est retenu pour la prochaine fois.
2. Les joueurs apparaissent au fur et à mesure. Survole une photo et clique sur **×** pour retirer quelqu'un.
3. **Lancer la partie** (au moins 2 joueurs).
4. La question s'affiche avec le compteur de votes. Clique sur **Révéler** quand tout le monde a voté (le bouton pulse), ou avant si quelqu'un traîne.
5. **Question suivante**, ou **Terminer** quand vous en avez assez. Après la fin, **Rejouer avec les mêmes joueurs** relance le même jeu, et **Changer de jeu** passe à l'autre mode, sans que personne n'ait à rescanner.

En mode *Tu préfères ?*, active le son de la TV pour profiter du tic-tac de la jauge. Le bouton **Son** en haut à droite permet de le couper.

**Sur le téléphone (joueur)**

1. Scanne le QR code (ou va sur le site et tape le code).
2. Entre ton prénom, prends un selfie (ou choisis une photo), puis **Rejoindre la partie**.
3. À chaque question, touche la personne de ton choix (*Qui de nous ?*) ou le gros bouton **A** ou **B** (*Tu préfères ?*). Tu peux **changer ton vote** jusqu'à la révélation.
4. Après la révélation, ton écran devient **rouge (tu bois)** ou **vert (tu es épargné)**.

## Règles du jeu

### Qui de nous ?

- Le joueur **le plus voté boit**.
- Tous ceux qui **n'ont pas voté pour le plus voté** boivent aussi.
- **Égalité** : tous les ex æquo boivent ; avoir voté pour l'un d'eux suffit pour être épargné.
- **Vote pour soi-même** : autorisé.
- **Pas voté à temps** : l'hôte peut révéler sans attendre, et le retardataire boit.
- Le plus voté qui n'a pas non plus voté comme les autres… boit deux fois.

### Tu préfères ?

- Le camp qui a le plus de votes est **épargné**, **la minorité boit**.
- **Tous du même côté** : personne ne boit.
- **Égalité parfaite** : tout le monde est sauvé. Pour que tout le monde boive à la place, remplace `onTie: 'nobody'` par `onTie: 'everyone'` dans [`server/modes.js`](server/modes.js).
- **Pas voté à temps** : le retardataire compte comme minoritaire et boit, même en cas d'égalité.

Les règles sont des fonctions pures dans [`server/rules.js`](server/rules.js), couvertes par `npm test`.

À consommer avec modération : un verre d'eau compte aussi.

## Dépannage

| Problème | Solution |
|---|---|
| Le téléphone n'arrive pas à ouvrir la page (même Wi-Fi) | Le pare-feu du PC bloque peut-être le port : `sudo ufw allow 3000` (Linux) ou autorise Node.js dans le pare-feu Windows. Certains Wi-Fi (invités, écoles, hôtels) isolent les appareils : utilise alors `npm run share`. |
| Le QR code affiche une mauvaise adresse IP | Le PC a plusieurs cartes réseau. Force l'adresse : `PUBLIC_URL=http://192.168.1.42:3000 npm start`. |
| `Le port 3000 est déjà utilisé` | Le jeu tourne déjà dans un autre terminal. Arrête-le, ou change de port : `PORT=3001 npm start`. |
| `cloudflared est introuvable` | Installe-le (voir [étape 5](#5-jouer-à-distance-sans-même-wi-fi)), puis ouvre un nouveau terminal. |
| « Partie introuvable » | Le serveur a redémarré : les parties sont en mémoire, il faut en recréer une. |
| Le bouton Selfie ouvre la galerie | Certains navigateurs ignorent la demande de caméra ; prends la photo depuis l'appareil photo puis choisis-la dans la galerie. |
| `npm: command not found` | Node.js n'est pas installé ou pas dans le PATH (voir [étape 1](#1-installer-nodejs)). |

## Personnaliser les questions

**Qui de nous ?** : les questions sont dans [`server/questions.json`](server/questions.json), une par ligne :

```json
[
  "Qui est le plus susceptible de s'endormir en pleine soirée ?",
  "Qui est le plus susceptible de devenir célèbre ?"
]
```

**Tu préfères ?** : les dilemmes sont dans [`server/questionsPreferes.json`](server/questionsPreferes.json), avec l'option A dans `a` et l'option B dans `b`. Écris chaque option comme une fin de phrase après « Tu préfères… » :

```json
[
  { "a": "Ne plus jamais pouvoir manger de pizza", "b": "Ne plus jamais pouvoir regarder de film" },
  { "a": "Toujours dire ce que tu penses", "b": "Ne jamais pouvoir parler en public" }
]
```

Ajoute, modifie ou supprime des lignes (attention aux virgules et aux guillemets), lance `npm test` pour vérifier que le fichier est valide, puis relance `npm start`. Pas besoin de rebuild.

## Héberger en ligne (gratuit)

Pour avoir une adresse fixe sans laisser ton PC allumé, tu peux utiliser l'offre gratuite de [Render](https://render.com) :

1. Crée un compte Render et connecte ton GitHub.
2. **New → Web Service**, choisis ce dépôt.
3. Réglages :
   - **Build Command** : `npm install --include=dev && npm run build`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
4. Déploie : le jeu est disponible sur `https://<ton-projet>.onrender.com`.

Limites de l'offre gratuite : le serveur se met en veille après 15 minutes sans activité (premier chargement d'environ 30 secondes), et une mise en veille efface les parties en cours.

## Développement

```bash
npm run dev    # serveur (port 3000, redémarrage auto) + site Vite (port 5173, rechargement à chaud)
npm test       # tests des règles du jeu
```

En mode dev, ouvre http://localhost:5173 ; les téléphones utilisent `http://<IP du PC>:5173`.

**Stack** : Node.js, Express, Socket.IO, React, Vite. Aucune base de données.

```
├── client/                 Site React (une seule app pour l'écran et les téléphones)
│   └── src/
│       ├── pages/          Home (accueil + choix du jeu), Host (écran TV), Player (téléphone)
│       ├── modes/          Un fichier par jeu : vues TV, vue de vote, verdict
│       │   ├── quiDeNous.jsx
│       │   ├── tuPreferes.jsx   (dont la jauge de suspense en requestAnimationFrame)
│       │   └── index.js         Registre des modes
│       ├── components.jsx  Avatar, carte joueur, camembert SVG, confettis, progression des votes
│       ├── sound.js        Sons synthétisés (WebAudio, aucun fichier audio)
│       ├── lib.js          Socket.IO, navigation, stockage local
│       └── photo.js        Recadrage et compression des photos
├── server/
│   ├── index.js            Serveur HTTP + fichiers statiques + photos
│   ├── sockets.js          Événements temps réel (hôte, joueurs)
│   ├── gameStore.js        État des parties en mémoire (commun à tous les modes)
│   ├── modes.js            Registre des modes : questions, validation des votes, règles
│   ├── rules.js            Règles des deux jeux (fonctions pures, testées)
│   ├── questions.json            Questions « Qui de nous ? »
│   └── questionsPreferes.json    Dilemmes « Tu préfères ? »
└── scripts/share.js        `npm run share` : serveur + tunnel Cloudflare
```

**Fonctionnement** : le serveur garde l'état de chaque partie et le diffuse à tous les appareils à chaque changement. Les votes restent secrets jusqu'à la révélation. L'hôte et les joueurs reçoivent un identifiant secret, stocké dans le navigateur, qui leur permet de se reconnecter. Les parties inactives sont supprimées au bout de 6 heures.

**Ajouter un jeu** : crée ses règles dans `server/rules.js`, déclare-le dans `server/modes.js` (questions, `isValidVote`, `computeResults`), puis crée `client/src/modes/monJeu.jsx` avec les mêmes exports que les deux modes existants et ajoute-le à `client/src/modes/index.js`. Le lobby, le QR code, la reconnexion et le déroulement des tours sont fournis.

**Idées pour la suite** : minuteur de vote, paquets de questions thématiques, questions perso de l'hôte, score des gorgées sur la partie.

## Licence

[MIT](LICENSE)
