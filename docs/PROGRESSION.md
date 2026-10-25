# Progression de la mise à jour « tirage équitable, genre, Roue, Savant, Noir Boire Mangue »

Un commit par chantier ; `npm test` et `npm run build` après chacun.

- [x] 1. Tirage équitable à l'échelle de la soirée (`server/spotlight.js`)
- [x] 2. Genre des joueurs : choix à l’entrée, moteur d’accords (`shared/formulation.js`), questions réservées (`cible`), audit du contenu ; le contenu à ajouter (+60 / +100…) viendra avec « Contenu »
- [x] 4. Le Savant : interface sans réglages, avancement dès que tout le monde a agi, révélation lisible, verdicts. Faits : test du devinage à froid fait (voir plus bas), 160 faits.
- [x] 3. La Roue : défis par genre (30 normaux + 30 en 18+ déjà écrits)
- [x] 5. Noir Boire Mangue : moteur, écrans, tests (règles, moteur, fuite sur sockets réels, 300 parties de bots). Contenu écrit : 155 phrases / 402 cartes (normal), 87 phrases / 159 cartes (18+).
- [x] Contenu (questions par genre, faits du Savant, phrases et cartes de Noir Boire Mangue)
- [ ] 7. README et simulation de soirée
- [ ] 8. Captures d'écran (`scripts/capture-demo.js`, `docs/captures/`)

## Faits du Savant : test du devinage à froid

Test appliqué aux 158 faits d’origine : « quelqu’un qui ne sait pas, mais qui réfléchit une dizaine de secondes, trouve-t-il la réponse ? ».
Retirés (61) parce que la réponse se devine ou se déduit : réponses de culture générale (girafe et ses sept vertèbres, narval et sa dent, ours polaire à la peau noire, tour Eiffel « vingt ans », Napoléon 1,69 m, « Nike = victoire », « judo = souplesse », « Samsung = trois étoiles »…), formulations qui donnent la réponse (« hippopotame : sueur de sang », cuisine : « la fraise et ses fruits », « la pomme et son air ») et chiffres secs sans surprise (durées d’orbite, températures, millions de degrés, âges d’arbres, dates de chantiers).
Gardés (97) : réponses qu’on ne trouve pas sans les connaître (crottes de wombat, loutres main dans la patte, chats et goût sucré, « disque dur d’une tonne », premier SMS, Pickles et la Coupe du monde, etc.).
Ajoutés (63), chacun confirmé sur le web avant l’écriture, avec une source fiable ; les affirmations contestées ou non retrouvées ont été écartées : lien parenté humains/bananes (60 %), langue enroulée du pic-vert, escargot qui dort trois ans, ketchup « médicament » (source faible), doigts fripés (étude contredite), acariens « chez presque tous » (non confirmé), « la tour Eiffel grandit de 15 cm » (remplacé par les 18 cm de déplacement du sommet, source Wikipédia).
