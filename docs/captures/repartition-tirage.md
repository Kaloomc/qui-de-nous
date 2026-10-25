# Répartition du tirage équitable

Soirée simulée par `npm run fairness` (graine 2024) : 20 joueurs, 10 jeux de 3 manches. Chaque case = nombre de fois que le joueur a été désigné pour ce rôle.

## Sans arrivée ni départ

| Joueur | qui-me-connait · cible | savant · chercheur | savant · savant | imposteur · imposteur | patate · premier-porteur | roue · cible | Total |
|---|---|---|---|---|---|---|---|
| j0 | 1 | 0 | 0 | 0 | 1 | 0 | 2 |
| j1 | 0 | 0 | 0 | 0 | 1 | 1 | 2 |
| j2 | 0 | 1 | 1 | 0 | 0 | 0 | 2 |
| j3 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| j4 | 0 | 0 | 0 | 1 | 0 | 1 | 2 |
| j5 | 0 | 0 | 1 | 0 | 1 | 0 | 2 |
| j6 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| j7 | 0 | 0 | 1 | 0 | 0 | 1 | 2 |
| j8 | 1 | 0 | 0 | 1 | 0 | 0 | 2 |
| j9 | 0 | 0 | 1 | 0 | 0 | 1 | 2 |
| j10 | 0 | 1 | 1 | 0 | 0 | 0 | 2 |
| j11 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| j12 | 0 | 1 | 0 | 1 | 0 | 0 | 2 |
| j13 | 1 | 0 | 0 | 0 | 1 | 0 | 2 |
| j14 | 0 | 0 | 0 | 0 | 1 | 1 | 2 |
| j15 | 0 | 1 | 0 | 1 | 0 | 0 | 2 |
| j16 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| j17 | 0 | 0 | 1 | 0 | 1 | 0 | 2 |
| j18 | 1 | 0 | 0 | 1 | 0 | 0 | 2 |
| j19 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |

Écart maximal entre joueurs, par rôle :

- qui-me-connait:cible : 1
- savant:chercheur : 1
- savant:savant : 1
- imposteur:imposteur : 1
- patate:premier-porteur : 1
- roue:cible : 1

## Avec 2 arrivées, 2 départs puis retour, 1 retrait

| Joueur | qui-me-connait · cible | savant · chercheur | savant · savant | imposteur · imposteur | patate · premier-porteur | roue · cible | Total |
|---|---|---|---|---|---|---|---|
| j0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| j1 (parti) | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| j2 | 0 | 0 | 1 | 0 | 1 | 0 | 2 |
| j3 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| j4 | 0 | 1 | 0 | 0 | 1 | 0 | 2 |
| j5 | 0 | 1 | 1 | 0 | 0 | 0 | 2 |
| j6 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| j7 | 1 | 0 | 1 | 0 | 0 | 0 | 2 |
| j8 | 1 | 0 | 0 | 1 | 0 | 0 | 2 |
| j9 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| j10 | 0 | 1 | 0 | 0 | 1 | 0 | 2 |
| j11 | 0 | 1 | 0 | 0 | 0 | 1 | 2 |
| j12 | 0 | 1 | 0 | 0 | 0 | 1 | 2 |
| j13 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| j14 | 0 | 1 | 0 | 1 | 0 | 0 | 2 |
| j15 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| j16 | 1 | 0 | 0 | 0 | 0 | 1 | 2 |
| j17 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| j18 | 1 | 0 | 0 | 1 | 0 | 0 | 2 |
| j19 | 0 | 0 | 1 | 0 | 1 | 0 | 2 |
| j20 | 0 | 0 | 1 | 1 | 0 | 0 | 2 |
| j21 | 0 | 0 | 0 | 1 | 0 | 1 | 2 |

Écart maximal entre joueurs, par rôle :

- qui-me-connait:cible : 1 (joueurs présents tout du long)
- savant:chercheur : 1 (joueurs présents tout du long)
- savant:savant : 1 (joueurs présents tout du long)
- imposteur:imposteur : 1 (joueurs présents tout du long)
- patate:premier-porteur : 1 (joueurs présents tout du long)
- roue:cible : 1 (joueurs présents tout du long)

