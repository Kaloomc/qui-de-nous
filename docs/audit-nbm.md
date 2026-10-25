# Noir Boire Mangue : refonte des phrases et des cartes

## Constat de départ

- 155 phrases normales + 87 en 18+ : **100 % avaient le trou à la fin**, 85 % sous la forme « Mon truc : ___ » (132 sur 155 et 86 sur 87).
- 402 + 159 cartes, toutes des groupes nominaux (« un pigeon en costume ») : aucune ne pouvait compléter une phrase qui demande un verbe.

## Ce qui a changé

- Sur les 242 anciennes phrases, 6 ont été gardées telles quelles (« Dans mon sac, on trouve toujours ___. », deux titres entre guillemets, etc.) ; les 236 autres ont été réécrites en petites scènes (« Au mariage de ma cousine, j’ai surpris ___ derrière le buffet »). Fichiers : **204 phrases normales, 106 en 18+**.
- Place du trou mesurée par `npm run check-nbm` : début 24 % / milieu 42 % / fin 34 % (normal) et 24 / 44 / 32 (18+), pour une cible de 25 / 40 / 35 (± 9 points). « texte : ___ » : 2,5 % et 0,9 % (au plus 5 %).
- Champ `forme` sur chaque phrase et chaque carte : `groupe_nominal` (« j’ai croisé ___ »), `infinitif` (« je sais ___ ») ou `libre` (citation entre guillemets : accepte toutes les cartes).
- Cartes : 546 normales (402 groupes nominaux repris en minuscules, 101 infinitifs, 43 répliques) et 219 en 18+ (159 gardées, 44 infinitifs, 16 répliques). Elles sont en minuscules ; la majuscule apparaît seulement quand le trou ouvre la phrase ou une citation.
- Mains : chaque main de 5 cartes contient au moins 3 cartes qui vont dans la phrase de la manche (`dealHands(…, forme)`), mélangées aux autres ; testé de 3 à 30 joueurs avec le vrai contenu.
- Règle d’écriture : jamais « de », « du », « des », « à », « au », « en » juste avant un trou de groupe nominal, jamais « de » avant un infinitif (« de un pigeon », « de aller »). Vérifié par le script.
- Les 159 cartes 18+ et les 402 cartes normales d’origine ont été gardées (passées en minuscules, forme `groupe_nominal`) ; la structure « Mon truc : ___ » ne représente plus que 2,5 % des phrases normales.

## Dix exemples avant / après

| Avant | Après |
|---|---|
| Ce que j’ai répondu quand on m’a demandé mon plus grand défaut : ___. | Quand on m’a demandé mon plus grand défaut devant toute la famille, j’ai répondu « ___ ». (libre) |
| La vraie raison de mon retard : ___. | ___, voilà la vraie raison de mon retard ce matin. |
| Mon rituel du dimanche soir : ___. | Rien ne me détend plus que ___ le dimanche soir. (infinitif) |
| Le titre de mon autobiographie : « ___ ». | Sur mon réveil, au lieu de la sonnerie, j’ai programmé « ___ » à voix haute. (libre) |
| Ce que j’ai envoyé à la mauvaise personne : ___. | J’ai envoyé ___ à ma grand-mère par erreur, et elle a répondu avec trois cœurs. |
| Le secret d’une soirée réussie : ___. | Au dernier barbecue, quelqu’un a apporté ___ et personne n’a osé y toucher. |
| Ma technique de drague infaillible, qui ne marche jamais : ___. | Ma technique de drague est simple : je commence par ___. (infinitif, 18+) |
| Le pire message que j’aie envoyé après minuit : ___. | ___, c’est ce que j’ai envoyé à minuit avant de regretter à 8 heures. (18+) |
| Ce que j’ai retrouvé dans mon lit après la fête : ___. | Au réveil, j’ai découvert ___ à côté de moi et je suis parti sans bruit. (18+) |
| Carte : « Un pigeon en costume » (seulement des noms) | Cartes : « un pigeon en costume », « chanter du Céline Dion à tue-tête », « Ça sent le brûlé ! » |
