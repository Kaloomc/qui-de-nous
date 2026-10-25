# Le Savant : audit des faits (refonte éditoriale)

## Bilan

- Fichier d’origine : 160 faits. Aucun n’est resté tel quel : presque tous étaient des fragments (« Les crottes du wombat ont la forme de ___ »).
- **Réécrits (même sujet, anecdote complète)** : 59. **Retirés** : 101 (réponse chiffrée, devinable à froid ou sourcée trop faiblement). **Nouveaux** : 94, chacun vérifié sur le web, avec une URL de source.
- Fichier final : 153 faits, au moins 5 par catégorie, contrôlés par `node scripts/check-facts.js` et `server/facts-savant.test.js`.

## Règles appliquées (et vérifiées par le script)

1. Une phrase complète de 12 à 35 mots, jamais un fragment.
2. Un seul trou, sur l’élément le plus surprenant, pas sur la fin de phrase par défaut.
3. La réponse n’est jamais un nombre ni une unité (« 3 % », « 55 langues », « 11 heures » sont refusés, ainsi que « ___ minutes »…).
4. Réponse en 1 à 5 mots, mot courant, qui se confond avec des bluffs.
5. Aucun indice de catégorie dans la phrase ; une source fiable par fait.

## Tests faits à la main sur les 153 faits

- **« Quoi ?! »** : si la réponse n’étonne pas, le fait est retiré.
- **Devinage à froid** (3 réponses courantes pour chaque trou) : la bonne réponse ne doit pas figurer parmi elles. Retirés ou remplacés à ce stade : l’Antarctique (plus grand désert, trop connu), l’air de la cornée (réponse évidente), les médailles d’or « en argent » (déjà une autre question avec la même réponse). Remplacés par : le parfum Obsession et les jaguars, Venetia Burney et Pluton, le traité de Breda et la muscade, le nerf du coude.
- **Camouflage** : les réponses (« Sir », « caillou », « Cadabra », « muscadiers »…) ressemblent à des bluffs plausibles.
- Écartés après recherche : mythes ou affirmations contestées (passeport de Ramsès II, ketchup médicament, aluminium de Napoléon III, genoux du manchot, selfie spatial « premier » contesté, vitesse de pousse des ongles par doigt…).

## Dix exemples avant / après

| Avant | Après |
|---|---|
| Les koalas ont des empreintes digitales presque identiques à celles des ___. | Les empreintes digitales des koalas sont si proches de celles des ___ qu’on peut les confondre au microscope. |
| En 1932, l’armée australienne a envoyé des soldats équipés de mitrailleuses contre des milliers d’___, sans parvenir à les vaincre. | En 1932, l’armée australienne a déclaré la guerre à des milliers d’___ qui ravageaient les champs de blé, avant de battre en retraite face à leur agilité. |
| En 1325, … Modène et de Bologne se sont fait la guerre, dit-on, à cause d’un ___ volé. | En 1325, deux villes italiennes se sont livré une bataille de plusieurs milliers de victimes, dit-on, parce que l’une avait volé à l’autre un ___ en bois. |
| Le « miel fou » de la mer Noire est toxique parce que les abeilles butinent des ___. | (conservé, même trou ; phrase déjà complète) |
| Avant de s’appeler Amazon, l’entreprise de Jeff Bezos s’appelait « ___ ». | Avant de s’appeler comme un fleuve, l’entreprise de Jeff Bezos portait le nom « ___ », un clin d’œil à « abracadabra », qu’on entendait comme « cadavre ». |
| Sur Vénus, le Soleil se lèverait à l’___. (retiré) | — (déductible) |
| En apesanteur, la colonne vertébrale s’allonge : un astronaute peut gagner jusqu’à ___ % de sa taille. (retiré) | — (réponse chiffrée) |
| Un arc-en-ciel est en réalité un ___ complet… (retiré) | — (trop connu) |
| L’ornithorynque n’a pas de tétines : le lait de la femelle suinte directement par la ___. | Les femelles ornithorynques n’ont pas de tétines : le lait suinte à travers la ___ de leur ventre et les petits le lèchent sur le pelage. |
| La salade César n’a pas été inventée à Rome mais à ___, au Mexique. | La salade César ne doit rien à l’empereur romain : elle aurait été inventée en 1924 par un restaurateur italien installé à ___. |
