// Captures d'écran reproductibles de tout ce que la mise à jour a modifié, jouées en action dans un vrai navigateur (Playwright).
//   npm run captures                    toutes les sections        npm run captures -- nbm savant     seulement celles-là
// TV 1920×1080 et téléphone 390×844, 12 joueurs mixtes (hommes, femmes, « ne préfère pas dire ») aux avatars générés, contenus réels.
// Les images vont dans docs/captures/, avec INDEX.md (ce que montre chaque image + les problèmes d'affichage repérés : texte coupé ou
// qui déborde, champ {...} visible, contraste, boutons de moins de 44 px, erreurs de console).
// Playwright est une dépendance de développement seulement. Si le navigateur ne s'installe pas : `npx playwright install chromium`.
import fs from 'node:fs';
import path from 'node:path';
import { holePosition } from './check-nbm.js';
import { seeded } from '../server/rules/loupSim.js';
import { runEvening, spread, table, EVENING } from '../server/rules/spotlightSim.js';
import { SPOTLIGHT_ROLES } from '../server/spotlight.js';
import { CAST, EXTRA_NAMES, PHONE, ROOT, Session, TV, bot, launch, makeAvatars, sleep, startDemoServer } from './lib/demo.js';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright n’est pas installé : `npm install` puis `npx playwright install chromium`. Aucune capture n’a été faite.');
  process.exit(1);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
// `npm run captures -- duel` : les captures du mode Duel vont dans leur propre dossier, avec leur INDEX.md.
const DUEL_ONLY = wanted.length === 1 && ['duel', 'duel2'].includes(wanted[0]);
const DUEL_DIR = { duel: 'docs/captures/duel-partie1', duel2: 'docs/captures/duel-partie2' }[wanted[0]];
const OUT = path.join(ROOT, DUEL_ONLY ? DUEL_DIR : 'docs/captures');
const SECTIONS = {};
const section = (name, title, fn) => (SECTIONS[name] = { title, fn });

// ---------- Outils communs ----------

/** Ouvre la TV, crée la partie et choisit le jeu (par son nom dans la grille). */
async function openTv(env, gameName, { adult = false } = {}) {
  const ctx = await env.browser.newContext({ viewport: TV });
  const page = await ctx.newPage();
  env.session.watch(page, 'TV');
  await page.goto(env.srv.url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Créer une partie/ }).click();
  await page.waitForURL(/\/host\/[A-Z0-9]{4}/);
  const code = page.url().split('/').pop();
  const game = env.srv.store.get(code);
  if (adult) game.adult = { active: true, pending: false, confirmed: new Set(), refused: new Set(), changedAt: 0 };
  if (gameName) await page.getByRole('button', { name: new RegExp(`^${gameName}`) }).first().click();
  return { ctx, page, code, game };
}

/** Un vrai téléphone dans le navigateur : écran « Rejoindre » rempli comme un joueur (prénom, genre, photo). */
async function joinPhone(env, code, person, avatar, { shotJoin = null } = {}) {
  const ctx = await env.browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  env.session.watch(page, `Téléphone ${person.name}`);
  await page.goto(`${env.srv.url}/join/${code}`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Ton prénom').fill(person.name);
  const png = Buffer.from(avatar.split(',')[1], 'base64');
  await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await sleep(300);
  if (shotJoin) await shotJoin(page);
  const label = { m: 'Homme', f: 'Femme', n: 'Je préfère ne pas dire' }[person.gender];
  await page.getByRole('radio', { name: label }).click();
  await page.locator('button.btn-primary.btn-block').click();
  await page.waitForSelector('.waiting, .vote, .center', { timeout: 10000 });
  return { ctx, page, person, name: person.name };
}

const idOf = (game, name) => [...game.players.values()].find((p) => p.name === name)?.id;
const waitFor = async (check, ms = 20000, what = 'condition') => {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${what}`);
    await sleep(40);
  }
};

/** Remplit la partie : quelques vrais téléphones, le reste en bots avec photo, jusqu'à `n` joueurs. */
async function fill(env, game, code, n, { real = [], people: custom = null } = {}) {
  const phones = [];
  for (const name of real) {
    const i = CAST.findIndex((p) => p.name === name);
    phones.push(await joinPhone(env, code, CAST[i], env.avatars[i]));
  }
  const bots = [];
  const people = custom ?? [...CAST, ...EXTRA_NAMES.map((name, i) => ({ name, gender: ['f', 'm', 'f', 'n'][i % 4], hue: (i * 29) % 360 }))];
  for (let i = 0; i < n; i++) {
    const person = people[i];
    if (real.includes(person.name)) continue;
    const b = bot(env.srv.url, code, person, env.avatars[i % env.avatars.length]);
    await b.ready;
    bots.push(b);
  }
  await waitFor(() => game.connectedCount() >= n, 20000, 'joueurs connectés');
  return { phones, bots, phoneOf: (name) => phones.find((p) => p.name === name), botOf: (name) => bots.find((b) => b.name === name) };
}

const gridOf = (env, ...args) => args;

// ---------- Sections ----------

section('nbm', 'Noir Boire Mangue', async (env) => {
  const S = env.session;
  const sec = 'Noir Boire Mangue';
  const tv = await openTv(env, null);
  await tv.page.waitForSelector('.game-grid');
  await S.shot(tv.page, 'nbm-01-grille', 'Grille des jeux avec la nouvelle carte « Noir Boire Mangue » (icône maison, accroche, 3 joueurs minimum).', { tv: true, lobby: true, section: sec });
  await tv.page.getByRole('button', { name: /^Noir Boire Mangue/ }).first().click();
  const { game, code } = tv;
  game.nbmTiming = { announceMs: 4000, writeMs: 26000, showMinMs: 4000, showMaxMs: 20000, miniMs: 2600 };
  const cast = await fill(env, game, code, 12, { real: ['Camille', 'Mehdi', 'Sacha'] });
  await tv.page.waitForSelector('.lobby-players');
  game.settings.auto = true;
  await tv.page.getByRole('button', { name: /Lancer la partie/ }).click();
  const d = () => game.roundData;
  const tvPage = tv.page;
  const [camille, mehdi, sacha] = ['Camille', 'Mehdi', 'Sacha'].map((n) => cast.phoneOf(n));
  await waitFor(() => d().step === 'announce', 10000, 'phrase');
  await S.shot(tvPage, 'nbm-02-phrase', 'La phrase à trou en très gros (3 s) au début de la manche.', { tv: true, section: sec });
  await S.shot(camille.page, 'nbm-03-tel-phrase', 'Téléphone : la phrase, avant l’écriture.', { section: sec });
  await waitFor(() => d().step === 'write', 10000, 'écriture');
  await sleep(500);
  await S.shot(camille.page, 'nbm-04-tel-ecriture', 'Téléphone en écriture : champ de 60 caractères et 5 cartes de réponse toutes prêtes.', { section: sec });
  await camille.page.locator('.nbm-card').nth(1).click();
  await S.shot(camille.page, 'nbm-05-tel-carte-choisie', 'Une carte touchée remplit le champ : on peut l’envoyer telle quelle ou la modifier.', { section: sec });
  await camille.page.getByRole('button', { name: 'Envoyer' }).click();
  // Les autres bots répondent avec des cartes de leur main ; Mehdi et Sacha écrivent à la main.
  const ANSWERS = ['Un hamster hypnotiseur', 'Beaucoup trop de patience', 'Le chien de la voisine', 'Une tartiflette à 3 h du matin', 'Mes cousins de Perpignan', 'Un tutoriel de quarante minutes', 'Un faux accent italien', 'Ma tante Josette en maillot', 'Du scotch partout'];
  await mehdi.page.locator('.nbm-input').fill('Une pétition contre les lundis');
  await mehdi.page.getByRole('button', { name: 'Envoyer' }).click();
  await sacha.page.locator('.nbm-input').fill('Le mot de passe de ma grand-mère qui contient quatre-vingts caractères');
  await sacha.page.getByRole('button', { name: 'Envoyer' }).click();
  let k = 0;
  for (const b of cast.bots) await b.act({ type: 'answer', text: ANSWERS[k++ % ANSWERS.length], phaseId: d().phaseId });
  await S.shot(tvPage, 'nbm-06-tv-ecriture', 'TV pendant l’écriture : la phrase et le compteur « X / N ont répondu » (sans noms).', { tv: true, section: sec });
  await waitFor(() => d().step === 'rate', 15000, 'première réponse');
  await sleep(600);
  await S.shot(tvPage, 'nbm-07-tv-reponse', 'TV pendant le passage d’une réponse : insérée dans la phrase, en très gros, sans nom d’auteur, avec le compteur de votes.', { tv: true, section: sec });
  const author = d().order[d().index];
  const authorPhone = [camille, mehdi, sacha].find((p) => idOf(game, p.name) === author);
  const voter = [camille, mehdi, sacha].find((p) => idOf(game, p.name) !== author);
  await S.shot(voter.page, 'nbm-08-tel-notes', 'Téléphone d’un votant : les 4 boutons Nul / Meh / Drôle / Golden.', { section: sec });
  if (authorPhone) await S.shot(authorPhone.page, 'nbm-09-tel-ton-auteur', 'Téléphone de l’auteur de la réponse affichée : « C’est ta réponse ! » et aucun bouton.', { section: sec });
  await voter.page.getByRole('button', { name: /Golden/ }).click();
  await sleep(500);
  await S.shot(voter.page, 'nbm-10-tel-golden', 'Après un vote Golden : les boutons sont figés, « Golden utilisé 1 / 1 » est affiché.', { section: sec });
  // La réponse de Camille est la plus drôle : les bots lui donnent leur Golden, et sont durs avec les autres.
  const winnerName = 'Camille';
  const reals = [camille, mehdi, sacha];
  const rateOf = (voterIdx, authorId) => (authorId === idOf(game, winnerName) ? 'golden' : ['meh', 'nul', 'drole', 'meh', 'nul'][voterIdx % 5]);
  const rateStep = async () => {
    const a = d().order[d().index];
    let v = 0;
    for (const b of cast.bots) if (b.id !== a) await b.act({ type: 'rate', rating: rateOf(v++, a), phaseId: d().phaseId });
    for (const p of reals) if (idOf(game, p.name) !== a) game.action(idOf(game, p.name), { type: 'rate', rating: rateOf(v++, a), phaseId: d().phaseId });
  };
  await rateStep();
  await waitFor(() => d().step === 'mini', 15000, 'mini-résultat');
  await sleep(900);
  await S.shot(tvPage, 'nbm-11-tv-mini-resultat', 'Mini-résultat animé (1,5 s) après le dernier vote : jauge Nul / Meh / Drôle / Golden.', { tv: true, section: sec });
  game.nbmTiming = { ...game.nbmTiming, showMinMs: 1500, showMaxMs: 3000, miniMs: 500 };
  let own = false;
  const seenIdx = new Set();
  while (d().step !== 'done' && game.phase === 'question') {
    if (d().step === 'rate' && !seenIdx.has(d().index)) {
      seenIdx.add(d().index);
      const a = d().order[d().index];
      const mine = reals.find((p) => idOf(game, p.name) === a);
      if (mine && !own) {
        own = true;
        await sleep(500);
        await S.shot(mine.page, 'nbm-09-tel-ton-auteur', `Téléphone de l’auteur de la réponse affichée (${mine.name}) : « C’est ta réponse ! » et aucun bouton de note.`, { section: sec });
      }
      await rateStep();
    }
    await sleep(200);
  }
  await waitFor(() => game.phase === 'revealing' || game.phase === 'results', 30000, 'fin de manche');
  await sleep(4000);
  await S.shot(tvPage, 'nbm-12-tv-top3', 'Résultats de la manche : le top 3 avec noms, photos, points et Golden reçus (ex æquo au même rang).', { tv: true, section: sec });
  await waitFor(() => game.phase === 'results', 15000, 'résultats');
  await sleep(600);
  await S.shot(tvPage, 'nbm-13-tv-gorgees', 'Fenêtre de distribution des gorgées (8 s) : le gagnant distribue 2, le dernier boit 2.', { tv: true, section: sec });
  const winner = game.results.winners[0];
  const winnerPhone = reals.find((p) => idOf(game, p.name) === winner);
  if (winnerPhone) await S.shot(winnerPhone.page, 'nbm-14-tel-distribue', `Téléphone du gagnant (${winnerPhone.name}) : il distribue ses 2 gorgées (sinon, au hasard).`, { section: sec });
  await waitFor(() => !game.pending, 15000, 'fin de la distribution');
  await sleep(500);
  await S.shot(tvPage, 'nbm-15-tv-resultats-gorgees', 'Résultats de la manche avec les gorgées (plafond de 4 par joueur).', { tv: true, section: sec });
  await S.shot(camille.page, 'nbm-16-tel-verdict', 'Téléphone : verdict de la manche (« Tu bois ! / Bien joué ! »).', { section: sec });
  await tvPage.getByRole('button', { name: /Terminer/ }).first().click();
  await tvPage.getByRole('button', { name: /Terminer la partie|Terminer/ }).last().click().catch(() => {});
  await waitFor(() => game.phase === 'ended', 10000, 'fin de partie');
  await sleep(2500);
  await S.shot(tvPage, 'nbm-17-tv-podium', 'TV : podium final avec le classement des gorgées de la soirée.', { tv: true, section: sec });
  await S.shot(camille.page, 'nbm-18-tel-fin', 'Téléphone : classement final et place du joueur.', { section: sec });
  for (const b of cast.bots) b.close();
  for (const p of cast.phones) await p.ctx.close();
  await tv.ctx.close();
});

// ---------- Aides de scénario ----------

/** Ouvre la TV sur un jeu et la remplit (vrais téléphones pour `real`, bots pour les autres) : prête à lancer. */
async function lobby(env, gameName, { n = 12, real = ['Camille', 'Mehdi', 'Sacha'], adult = false } = {}) {
  const tv = await openTv(env, gameName, { adult });
  const cast = await fill(env, tv.game, tv.code, n, { real });
  await tv.page.waitForSelector('.lobby-players');
  tv.game.settings.resultsMs = 30000;
  return { tv, cast, game: tv.game, page: tv.page };
}
const launchGame = async (ctx) => {
  ctx.game.settings.auto = true;
  await ctx.page.getByRole('button', { name: /Lancer la partie/ }).click();
};
const closeAll = async (ctx) => {
  for (const b of ctx.cast.bots) b.close();
  for (const p of ctx.cast.phones) await p.ctx.close();
  await ctx.tv.ctx.close();
};
/** Impose les questions tirées (contenu réel choisi dans le fichier) pour montrer un cas précis. */
const force = (game, list) => (game.contentPool = () => ({ key: `demo-${Math.random()}`, list }));
const questionsOf = (game, pred) => game.rules.questions.filter(pred);
/** Tous les joueurs votent pour `targetName` (sauf lui, qui vote pour `otherName`). Les vrais téléphones touchent leur écran. */
async function voteFor(ctx, targetName, otherName, { skip = [] } = {}) {
  const { game, cast } = ctx;
  const idT = idOf(game, targetName);
  const idO = idOf(game, otherName);
  for (const b of cast.bots) if (!skip.includes(b.name)) await b.vote(b.id === idT ? idO : idT);
  for (const p of cast.phones) {
    if (skip.includes(p.name)) continue;
    const pick = p.name === targetName ? otherName : targetName;
    await p.page.locator('.vote-option', { hasText: pick }).first().click();
  }
}
const phase = (game, name) => waitFor(() => game.phase === name, 30000, `phase ${name}`);
const nextRound = async (ctx) => {
  await ctx.page.getByRole('button', { name: /(Question|Tour|Manche|Jeu) suivant/ }).first().click();
  await phase(ctx.game, 'question');
  await sleep(500);
};

// ---------- Rejoindre, Qui de nous ?, Qui me connaît ? ----------

section('rejoindre', 'Rejoindre avec le choix du genre', async (env) => {
  const S = env.session;
  const sec = 'Rejoindre';
  const tv = await openTv(env, 'Qui de nous');
  let n = 0;
  const first = CAST[0];
  const joinShot = async (page) => {
    await S.shot(page, 'rejoindre-01-tel-formulaire', 'Téléphone : « Rejoindre la partie » — prénom, photo et choix obligatoire du genre en trois grosses icônes (♂ bleu, ♀ rose, rond gris à trois points), aucune option présélectionnée.', { section: sec });
    n += 1;
    // Les trois états de sélection : coche, bordure épaisse et libellé accessible.
    for (const [k, label, what] of [['a', 'Homme', '♂ bleu sélectionné'], ['b', 'Femme', '♀ rose sélectionné'], ['c', 'Je préfère ne pas dire', 'rond gris sélectionné (« je préfère ne pas dire »)']]) {
      await page.getByRole('radio', { name: label }).click();
      await S.shot(page, `rejoindre-01${k}-tel-genre-${k === 'a' ? 'homme' : k === 'b' ? 'femme' : 'neutre'}`, `Téléphone : choix du genre, ${what} — coche ✓ et bordure épaisse ; les deux autres icônes restent visibles.`, { section: sec });
    }
  };
  const phone = await joinPhone(env, tv.code, first, env.avatars[0], { shotJoin: joinShot });
  await S.shot(phone.page, 'rejoindre-02-tel-attente', 'Téléphone après avoir rejoint : l’attente du lancement ; le genre peut être modifié ici (jamais en pleine manche).', { section: sec });
  const bots = [];
  for (let i = 1; i < CAST.length; i++) {
    const b = bot(env.srv.url, tv.code, CAST[i], env.avatars[i]);
    await b.ready;
    bots.push(b);
  }
  await waitFor(() => tv.game.connectedCount() >= 12, 20000, 'joueurs');
  await tv.page.waitForSelector('.lobby-players');
  await S.shot(tv.page, 'rejoindre-03-tv-lobby', 'TV : lobby avec les 12 joueurs mixtes et leurs photos — aucune indication de genre nulle part.', { tv: true, lobby: true, section: sec });
  for (const b of bots) b.close();
  await phone.ctx.close();
  await tv.ctx.close();
});

section('qdn', 'Qui de nous ? — questions réservées et accords', async (env) => {
  const S = env.session;
  const sec = 'Qui de nous ?';
  const ctx = await lobby(env, 'Qui de nous');
  const { game, page, cast } = ctx;
  const [camille, mehdi, sacha] = ['Camille', 'Mehdi', 'Sacha'].map((n) => cast.phoneOf(n));
  const femme = questionsOf(game, (q) => q.cible === 'femme' && /pleurer|story|maquill|sac|cuisin|fard|robe|talon|chaussure/i.test(q.text));
  const homme = questionsOf(game, (q) => q.cible === 'homme' && q.niveau === 'chill');
  const tous = questionsOf(game, (q) => (q.cible ?? 'tous') === 'tous' && q.niveau === 'chill');
  force(game, [femme[0] ?? questionsOf(game, (q) => q.cible === 'femme')[0]]);
  await launchGame(ctx);
  await phase(game, 'question');
  await sleep(600);
  await S.shot(page, 'qdn-01-tv-reservee-femmes', 'TV : question réservée aux femmes — seules les candidates sont proposées dans la grille (les autres votent pour l’une d’elles).', { tv: true, section: sec });
  await S.shot(mehdi.page, 'qdn-02-tel-homme-grille-filtree', 'Téléphone d’un homme (Mehdi) : même question, grille filtrée sur les femmes, avec la mention « vote pour l’une d’elles ».', { section: sec });
  await S.shot(camille.page, 'qdn-03-tel-femme-candidate', 'Téléphone d’une femme (Camille) : elle fait partie des candidates et peut voter pour elle-même.', { section: sec });
  await voteFor(ctx, 'Camille', 'Inès');
  await phase(game, 'revealing');
  await sleep(5600);
  await S.shot(page, 'qdn-04-tv-resultat-feminin', 'TV : résultat accordé au féminin (« La plus votée ») avec le camembert des votes.', { tv: true, section: sec });
  await S.shot(camille.page, 'qdn-05-tel-verdict-feminin', 'Téléphone de Camille : « Tu es la plus votée. » (accord féminin).', { section: sec });
  await S.shot(sacha.page, 'qdn-06-tel-verdict-neutre-extra', 'Téléphone de Sacha (« ne préfère pas dire ») : la mention de la plus votée est accordée au féminin pour Camille, rien d’accordé sur Sacha.', { section: sec });

  await phase(game, 'results');
  force(game, [homme[0]]);
  await nextRound(ctx);
  await S.shot(page, 'qdn-07-tv-reservee-hommes', 'TV : question réservée aux hommes — candidats filtrés sur les hommes.', { tv: true, section: sec });
  await S.shot(camille.page, 'qdn-08-tel-femme-grille-hommes', 'Téléphone d’une femme : la grille ne montre que les hommes (« vote pour l’un d’eux »).', { section: sec });
  await voteFor(ctx, 'Mehdi', 'Thomas');
  await phase(game, 'revealing');
  await sleep(5600);
  await S.shot(page, 'qdn-09-tv-resultat-masculin', 'TV : résultat accordé au masculin (« Le plus voté »).', { tv: true, section: sec });
  await S.shot(mehdi.page, 'qdn-10-tel-verdict-masculin', 'Téléphone de Mehdi : « Tu es le plus voté. » (accord masculin).', { section: sec });

  await phase(game, 'results');
  force(game, [tous[0]]);
  await nextRound(ctx);
  await voteFor(ctx, 'Sacha', 'Noa');
  await phase(game, 'revealing');
  await sleep(5600);
  await S.shot(page, 'qdn-11-tv-resultat-neutre', 'TV : question pour tous ; la tête du vote est Sacha (« ne préfère pas dire ») — forme neutre « En tête des votes ».', { tv: true, section: sec });
  await S.shot(sacha.page, 'qdn-12-tel-verdict-neutre', 'Téléphone de Sacha : « Tu es en tête des votes. » (forme neutre, aucun accord).', { section: sec });
  await closeAll(ctx);
});

section('connait', 'Qui me connaît le mieux ? — questions réservées', async (env) => {
  const S = env.session;
  const sec = 'Qui me connaît le mieux ?';
  const ctx = await lobby(env, 'Qui me connaît');
  const { game, page, cast } = ctx;
  const [camille, mehdi, sacha] = ['Camille', 'Mehdi', 'Sacha'].map((n) => cast.phoneOf(n));
  const femme = game.rules.questions.filter((q) => q.cible === 'femme' && /\{(f=|m=)|elle|lui/.test(q.question) && q.niveau !== 'hardcore');
  force(game, [femme[0]]);
  await launchGame(ctx);
  await phase(game, 'question');
  await sleep(700);
  const target = game.roundData.targetId;
  const targetName = game.players.get(target).name;
  const tp = [camille, mehdi, sacha].find((p) => p.name === targetName);
  await S.shot(page, 'connait-01-tv-question', `TV : question réservée aux femmes — la cible est ${targetName}, la question et les choix sont accordés à son genre.`, { tv: true, section: sec });
  const guesser = [camille, mehdi, sacha].find((p) => p.name !== targetName && p.name !== 'Sacha') ?? mehdi;
  await S.shot(guesser.page, 'connait-02-tel-devineur', 'Téléphone d’un joueur qui devine la réponse de la cible (4 choix accordés).', { section: sec });
  if (tp) await S.shot(tp.page, 'connait-03-tel-cible', 'Téléphone de la cible : elle répond en secret sur elle-même.', { section: sec });
  // Tout le monde répond : la cible choisit B, la plupart des autres se trompent.
  const letters = ['a', 'c', 'b', 'd', 'a', 'b', 'c'];
  let k = 0;
  for (const b of cast.bots) await b.vote(b.id === target ? 'b' : letters[k++ % letters.length]);
  for (const p of cast.phones) {
    const letter = p.name === targetName ? 'B' : 'A';
    await p.page.locator('.answer-choice', { has: p.page.locator('.option-letter', { hasText: letter }) }).first().click();
  }
  await phase(game, 'revealing');
  await sleep(5200);
  await S.shot(page, 'connait-04-tv-revelation', 'TV : « Qu’a répondu la cible ? » — les choix des autres apparaissent, puis la vraie réponse.', { tv: true, section: sec });
  await phase(game, 'results');
  await sleep(5000);
  await S.shot(page, 'connait-05-tv-resultats', 'TV : résultats — qui a trouvé, qui boit, accordés au genre de la cible.', { tv: true, section: sec });
  await S.shot(guesser.page, 'connait-06-tel-verdict', 'Téléphone d’un devineur : le verdict de la manche.', { section: sec });
  await closeAll(ctx);
});

section('roue', 'La Roue — défis par genre', async (env) => {
  const S = env.session;
  const sec = 'La Roue';
  const ctx = await lobby(env, 'La Roue');
  const { game, page, cast } = ctx;
  const [camille, mehdi, sacha] = ['Camille', 'Mehdi', 'Sacha'].map((n) => cast.phoneOf(n));
  const defis = game.rules.defis;
  const boit = defis.find((d) => d.type === 'genre-boit' && d.genre === 'femme' && !d.adulte);
  const distribue = defis.find((d) => d.type === 'genre-distribue' && d.genre === 'homme' && d.vers === 'femme' && !d.adulte);
  force(game, [boit]);
  await launchGame(ctx);
  await phase(game, 'question');
  await sleep(800);
  await S.shot(page, 'roue-01-tv-lancement', 'TV : la roue est prête (en mode auto, elle se lance toute seule).', { tv: true, section: sec });
  await phase(game, 'results');
  await sleep(2500);
  await S.shot(page, 'roue-02-tv-femmes-boivent', 'TV : défi « toutes les femmes boivent » — les concernées (les femmes du groupe) sont mises en avant, les autres ne sont pas visés.', { tv: true, section: sec });
  await S.shot(camille.page, 'roue-03-tel-femme-concernee', 'Téléphone d’une femme (Camille) : elle est concernée et boit.', { section: sec });
  await S.shot(sacha.page, 'roue-04-tel-epargnee', 'Téléphone d’une personne « ne préfère pas dire » (Sacha) : elle n’est jamais visée — message d’épargne « Ce défi ne te concerne pas, tu respires. ».', { section: sec });
  await S.shot(mehdi.page, 'roue-05-tel-homme-non-concerne', 'Téléphone d’un homme (Mehdi) : le défi vise les femmes, il ne boit pas.', { section: sec });

  force(game, [distribue]);
  await nextRound(ctx);
  await phase(game, 'results');
  await sleep(3000);
  await S.shot(page, 'roue-06-tv-hommes-distribuent', 'TV : défi « tous les hommes distribuent à des femmes » — les distributeurs répondent sur leur téléphone.', { tv: true, section: sec });
  await S.shot(mehdi.page, 'roue-07-tel-homme-distribue', 'Téléphone d’un homme (Mehdi) : il distribue sa gorgée à l’une des femmes (seules les receveuses sont proposées).', { section: sec });
  await S.shot(sacha.page, 'roue-08-tel-epargnee-distribue', 'Téléphone de Sacha : toujours épargnée, elle regarde.', { section: sec });
  // Les hommes distribuent : bots d’abord, puis Mehdi touche une femme.
  const femmes = CAST.filter((c) => c.gender === 'f').map((c) => c.name);
  let k = 0;
  for (const b of cast.bots.filter((x) => x.person.gender === 'm')) await b.act({ targetId: idOf(game, femmes[k++ % femmes.length]) });
  await mehdi.page.locator('.vote-option, .answer-choice', { hasText: 'Léa' }).first().click().catch(() => {});
  await sleep(1500);
  await S.shot(page, 'roue-09-tv-distribution', 'TV : les gorgées distribuées par les hommes apparaissent.', { tv: true, section: sec });
  await closeAll(ctx);
});

section('soiree', 'Mode soirée — tirage équitable et enchaînement', async (env) => {
  const S = env.session;
  const sec = 'Mode soirée';
  // 1. Tableau de répartition du tirage équitable (soirée simulée de 20 joueurs, 10 jeux de 3 manches), écrit en Markdown.
  const lines = ['# Répartition du tirage équitable', '', 'Soirée simulée par `npm run fairness` (graine 2024) : 20 joueurs, 10 jeux de 3 manches. Chaque case = nombre de fois que le joueur a été désigné pour ce rôle.', ''];
  for (const churn of [false, true]) {
    const r = runEvening(seeded(2024), { players: 20, churn });
    lines.push(`## ${churn ? 'Avec 2 arrivées, 2 départs puis retour, 1 retrait' : 'Sans arrivée ni départ'}`, '', table(r), '', 'Écart maximal entre joueurs, par rôle :', '');
    for (const role of Object.values(SPOTLIGHT_ROLES)) if (r.designated[role]) lines.push(`- ${role} : ${spread(r.designated, role, churn ? r.steady : r.ever)}${churn ? ' (joueurs présents tout du long)' : ''}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT, 'repartition-tirage.md'), `${lines.join('\n')}\n`);
  S.index.push({ file: 'repartition-tirage.md', caption: 'Tableau de répartition du tirage équitable sur une soirée simulée (texte) : l’écart entre deux joueurs ne dépasse pas un tirage par rôle, avec ou sans arrivées et départs.', section: sec, problems: [] });

  // 2. Enchaînement réel : grille, carte « Mode soirée », transition, manche, transition suivante.
  const tv = await openTv(env, null);
  const { game, code } = tv;
  const cast = await fill(env, game, code, 12, { real: ['Camille', 'Mehdi', 'Sacha'] });
  await tv.page.waitForSelector('.game-grid');
  await S.shot(tv.page, 'soiree-01-tv-grille', 'TV : grille des jeux, avec la grosse carte « Mode soirée » en tête.', { tv: true, lobby: true, section: sec });
  await tv.page.getByRole('button', { name: /Mode soirée/ }).first().click();
  await sleep(600);
  await S.shot(tv.page, 'soiree-02-tv-reglages', 'TV : réglages de la soirée — durée et jeux inclus.', { tv: true, lobby: true, section: sec });
  const start = tv.page.getByRole('button', { name: /Lancer la soirée|Lancer/ }).last();
  await start.click().catch(() => game.startParty({ durationMs: 0, games: ['qui-de-nous', 'roue', 'tu-preferes', 'estimation'] }));
  await waitFor(() => game.partyActive, 8000, 'soirée lancée');
  await sleep(900);
  await S.shot(tv.page, 'soiree-03-tv-transition', 'TV : transition de 5 secondes avant le premier jeu — nom, icône, accroche, classement des gorgées et petit QR code pour les retardataires.', { tv: true, section: sec });
  await waitFor(() => game.party.step === 'playing', 12000, 'premier jeu');
  await sleep(1200);
  await S.shot(tv.page, 'soiree-04-tv-manche', `TV : première manche du programme (${game.rules.id}) avec la barre de la soirée en haut à gauche (jeu, manche, temps, pause / jeu suivant / terminer).`, { tv: true, section: sec });
  game.partyNextGame();
  await sleep(1200);
  await S.shot(tv.page, 'soiree-05-tv-transition-2', 'TV : transition vers le jeu suivant, choisi selon les joueurs connectés et les jeux déjà joués (jamais deux fois le même d’affilée).', { tv: true, section: sec });
  game.endParty();
  for (const b of cast.bots) b.close();
  for (const p of cast.phones) await p.ctx.close();
  await tv.ctx.close();
});

section('nbm-phrases', 'Noir Boire Mangue — phrases de structures variées et mains compatibles', async (env) => {
  const S = env.session;
  const sec = 'Noir Boire Mangue — phrases';
  const tv = await openTv(env, 'Noir Boire Mangue');
  const { game, code } = tv;
  const all = game.rules.questions;
  const pick = (forme, position) => all.find((q) => q.forme === forme && holePosition(q.texte) === position && !/[:]\s*(«\s*)?___/.test(q.texte));
  const chosen = [pick('groupe_nominal', 'debut'), pick('groupe_nominal', 'milieu'), pick('groupe_nominal', 'fin'), pick('infinitif', 'debut'), pick('infinitif', 'milieu'), pick('libre', 'milieu')];
  force(game, chosen);
  game.nbmTiming = { announceMs: 3200, writeMs: 4500, writeBeatMs: 300, showMinMs: 700, showMaxMs: 1400, miniMs: 250, allocMs: 700 };
  const cast = await fill(env, game, code, 6, { real: ['Camille'] });
  await tv.page.waitForSelector('.lobby-players');
  game.settings.auto = true;
  game.settings.resultsMs = 1500;
  await tv.page.getByRole('button', { name: /Lancer la partie/ }).click();
  const d = () => game.roundData;
  const camille = cast.phoneOf('Camille');
  let last = null;
  for (let r = 1; r <= 6; r++) {
    await waitFor(() => d()?.step === 'announce' && d().phaseId !== last, 90000, `annonce ${r}`);
    last = d().phaseId;
    const q = game.question;
    await sleep(400);
    await S.shot(tv.page, `nbm-phrases-${r}-tv`, `TV, manche ${r} : « ${q.texte} » — ${q.forme.replace('_', ' ')}, trou ${{ debut: 'au début', milieu: 'au milieu', fin: 'à la fin' }[holePosition(q.texte)]}.`, { tv: true, section: sec });
    await waitFor(() => d().step === 'write', 10000, 'écriture');
    await sleep(500);
    const cards = d().hands[idOf(game, 'Camille')] ?? [];
    await S.shot(camille.page, `nbm-phrases-${r}-tel`, `Téléphone de Camille, manche ${r} : au moins 3 de ses 5 cartes vont dans la phrase (${q.forme.replace('_', ' ')}) : ${cards.join(' · ')}.`, { section: sec });
    for (const b of cast.bots) await b.act({ type: 'answer', text: ['un pigeon en costume', 'chanter faux', 'Ça sent le brûlé !', 'ma tante Josette', 'dormir debout'][b.id.length % 5], phaseId: d().phaseId });
    await waitFor(() => game.phase !== 'question' || d().step !== 'write', 15000, 'fin écriture');
    while (game.phase === 'question' && d().step !== 'done') {
      if (d().step === 'rate') for (const b of cast.bots) await b.act({ type: 'rate', rating: 'drole', phaseId: d().phaseId });
      await sleep(200);
    }
    if (r < 6) { await waitFor(() => game.phase === 'results' || game.phase === 'question', 40000, 'résultats'); }
    await waitFor(() => game.phase === 'question' || r === 6, 40000, 'manche suivante').catch(() => {});
  }
  for (const b of cast.bots) b.close();
  await camille.ctx.close();
  await tv.ctx.close();
});

section('savant', 'Le Savant — sans réglages, révélation en quatre temps', async (env) => {
  const S = env.session;
  const sec = 'Le Savant';
  const ctx = await lobby(env, 'Le Savant');
  const { game, page, cast } = ctx;
  const [camille, mehdi, sacha] = ['Camille', 'Mehdi', 'Sacha'].map((n) => cast.phoneOf(n));
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/content/facts-savant.json'), 'utf8'));
  game.savantFacts = ['his-01', 'ani-19', 'cor-12'].map((id) => facts.find((f) => f.id === id));
  await S.shot(page, 'savant-01-tv-lobby', 'TV : lobby du Savant — aucun écran de réglages, on lance directement (« Lancer la partie »).', { tv: true, lobby: true, section: sec });
  await launchGame(ctx);
  const d = () => game.roundData;
  const BLUFFS = ['un astérisque', 'un symbole', 'un smiley fâché', 'un dièse', 'le sigle', 'un pictogramme', 'un charabia', 'un code secret', 'un idéogramme'];
  const at = (...phones) => phones;

  const rounds = [
    { savant: 'Mehdi', seeker: 'Camille', picks: 'Mehdi', tag: 'a', label: 'DÉMASQUÉ (le Chercheur trouve le Savant, un homme)', fav: 'Léa' },
    { savant: 'Mehdi', seeker: 'Camille', picks: 'Léa', tag: 'b', label: 'PASSÉ INAPERÇU (le Chercheur se trompe)', fav: 'Léa' },
    { savant: 'Sacha', seeker: 'Camille', picks: 'Sacha', tag: 'c', label: 'forme neutre pour « ne préfère pas dire » (COUVERTURE GRILLÉE)', fav: 'Léa' },
  ];
  let lastPhase = null;
  for (const [i, R] of rounds.entries()) {
    const n = `${i + 1}${R.tag}`;
    await waitFor(() => d()?.step === 'announce' && d().phaseId !== lastPhase, 40000, `annonce ${n}`);
    lastPhase = d().phaseId;
    const id = (name) => idOf(game, name);
    d().seekerId = id(R.seeker);
    d().savantId = id(R.savant);
    d().writers = [...game.players.keys()].filter((x) => x !== d().seekerId);
    await sleep(500);
    if (i === 0) await S.shot(page, 'savant-02-tv-annonce', 'TV : annonce du Chercheur (3 s) — « Au tour de … de chercher ! ».', { tv: true, section: sec });
    await waitFor(() => d().step === 'write', 15000, 'écriture');
    await sleep(700);
    const phoneOf = (name) => [camille, mehdi, sacha].find((p) => p.name === name);
    const savantPhone = phoneOf(R.savant);
    const seekerPhone = camille;
    const spectator = [mehdi, sacha].find((p) => p.name !== R.savant);
    if (i === 0) {
      await S.shot(page, 'savant-03-tv-ecriture', 'TV : écriture — la question à trou et le compteur « X / N ont écrit » ; la manche avance dès que tout le monde a envoyé.', { tv: true, section: sec });
      await S.shot(savantPhone.page, 'savant-04-tel-savant-ecriture', 'Téléphone du Savant : il voit la vraie réponse (en secret) et la reformule avec ses mots.', { section: sec });
      await S.shot(seekerPhone.page, 'savant-05-tel-chercheur-attente', 'Téléphone du Chercheur : il attend, il ne sait rien.', { section: sec });
      await S.shot(spectator.page, 'savant-06-tel-bluffeur-ecriture', 'Téléphone d’un Bluffeur : il invente une réponse crédible.', { section: sec });
    }
    // Réponses : téléphones réels et bots.
    let k = 0;
    for (const b of cast.bots) if (b.id !== d().seekerId) await b.act({ type: 'answer', text: BLUFFS[k++ % BLUFFS.length], phaseId: d().phaseId });
    const answerOf = (name) => (name === R.savant ? facts.find((f) => f.id === d().factId)?.reponse : null);
    for (const ph of [mehdi, sacha]) {
      if (ph.name === R.seeker) continue;
      const text = ph.name === R.savant ? `Le fameux « ${game.question.reponse} », rien d’autre` : 'Une série de signes sans queue ni tête, genre #@!';
      await ph.page.locator('input.savant-input').fill(text.slice(0, 60));
      await ph.page.getByRole('button', { name: 'Envoyer' }).click();
    }
    await waitFor(() => d().step === 'read', 15000, 'lecture');
    await sleep(2500);
    if (i === 0) await S.shot(page, 'savant-07-tv-lecture', 'TV : lecture des réponses, avec photo et prénom, dans un ordre mélangé (au moins 6 s) ; la vraie réponse est mêlée aux fausses.', { tv: true, section: sec });
    await waitFor(() => d().step === 'choice', 40000, 'choix');
    await sleep(600);
    if (i === 0) {
      await S.shot(page, 'savant-08-tv-choix', 'TV : choix — le Chercheur désigne le Savant, tous les autres votent aussi, en secret (compteur de votes).', { tv: true, section: sec });
      await S.shot(seekerPhone.page, 'savant-09-tel-chercheur-choix', 'Téléphone du Chercheur : il désigne le Savant parmi les auteurs.', { section: sec });
      await S.shot(spectator.page, 'savant-10-tel-spectateur-vote', 'Téléphone d’un spectateur : il vote aussi pour le vrai Savant.', { section: sec });
    }
    // Votes : les bots soutiennent le « Bluffeur » Léa (pastilles de votes), les téléphones jouent leur rôle.
    for (const b of cast.bots) {
      if (b.id === d().seekerId) continue;
      const choices = d().writers.filter((x) => x !== b.id);
      const target = b.id % 3 === 0 && R.savant ? id(R.savant) : id(R.fav);
      await b.vote(choices.includes(target) ? target : choices[0]);
    }
    await seekerPhone.page.locator('.savant-option', { hasText: R.picks }).first().click();
    const otherVoter = [mehdi, sacha].find((p) => p.name !== R.savant && p.name !== R.seeker);
    if (otherVoter) await otherVoter.page.locator('.savant-option', { hasText: R.savant }).first().click().catch(() => otherVoter.page.locator('.savant-option').first().click());
    await phase(game, 'revealing');
    const t0 = Date.now();
    const at_ = async (ms) => sleep(Math.max(0, t0 + ms - Date.now()));
    await at_(2300);
    await S.shot(page, `savant-${n}-tv-bandeau`, `TV (${R.label}) : bandeau plein écran « LE SAVANT ÉTAIT… » avec sa photo et son prénom.`, { tv: true, section: sec });
    await at_(5800);
    await S.shot(page, `savant-${n}-tv-vraie-reponse`, `TV (${R.label}) : la vraie réponse dans un cadre doré, avec son explication ; sur les cartes : couronne du Savant, loupe du Chercheur et pastilles de votes de chaque spectateur.`, { tv: true, section: sec });
    await at_(9000);
    await S.shot(page, `savant-${n}-tv-verdict`, `TV (${R.label}) : verdict en plein écran, accordé au genre du Savant.`, { tv: true, section: sec });
    await phase(game, 'results');
    await sleep(900);
    await S.shot(page, `savant-${n}-tv-resultats`, 'TV : résultats de la manche — cartes marquées (vraie réponse, Savant, Chercheur, votes) et gorgées.', { tv: true, section: sec });
    if (game.pending) await S.shot(seekerPhone.page, `savant-${n}-tel-chercheur-distribue`, 'Téléphone du Chercheur : fenêtre de distribution des gorgées (8 s), sinon elles sont tirées au hasard.', { section: sec });
    await waitFor(() => !game.pending, 20000, 'distribution');
    await sleep(900);
    await S.shot(savantPhone.page, `savant-${n}-tel-savant-verdict`, `Téléphone du Savant (${R.savant}) : son verdict, accordé à son genre.`, { section: sec });
    await S.shot(seekerPhone.page, `savant-${n}-tel-chercheur-verdict`, 'Téléphone du Chercheur : son verdict (trouvé ou non).', { section: sec });
    await S.shot(spectator.page, `savant-${n}-tel-spectateur-verdict`, 'Téléphone d’un spectateur : son verdict et ses gorgées.', { section: sec });
    if (i < rounds.length - 1) {
      await nextRound(ctx);
    }
  }
  await closeAll(ctx);
});

section('grille', 'Grille des jeux — thème normal et thème 18+', async (env) => {
  const S = env.session;
  const sec = 'Grille des jeux';
  const tv = await openTv(env, null);
  const bots = [];
  for (let i = 0; i < 4; i++) {
    const b = bot(env.srv.url, tv.code, CAST[i], env.avatars[i]);
    await b.ready;
    bots.push(b);
  }
  await tv.page.waitForSelector('.game-grid');
  await S.shot(tv.page, 'grille-01-normale', 'TV : grille des jeux, thème normal.', { tv: true, lobby: true, section: sec });
  const card = tv.page.getByRole('button', { name: /^Noir Boire Mangue/ }).first();
  await card.scrollIntoViewIfNeeded();
  await sleep(300);
  await S.shot(tv.page, 'grille-02-normale-nouvelle-carte', 'TV : la nouvelle carte « Noir Boire Mangue » dans la grille (thème normal).', { tv: true, lobby: true, section: sec });
  tv.game.adult = { active: true, pending: false, confirmed: new Set(), refused: new Set(), changedAt: 0 };
  await bots[0].emit('player:gender', { gender: 'f' }); // un événement quelconque : la TV reçoit l’état à jour
  await sleep(2500);
  await tv.page.getByRole('button', { name: /^Noir Boire Mangue/ }).first().scrollIntoViewIfNeeded();
  await S.shot(tv.page, 'grille-03-18plus-nouvelle-carte', 'TV : la même grille en thème 18+ (noir, gris et rouge), avec la carte « Noir Boire Mangue ».', { tv: true, lobby: true, section: sec });
  await tv.page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  await S.shot(tv.page, 'grille-04-18plus', 'TV : grille des jeux, thème 18+ (en haut de page).', { tv: true, lobby: true, section: sec });
  for (const b of bots) b.close();
  await tv.ctx.close();
});

section('limites', 'Cas limites — prénom saisi à 25 caractères et ramené à 20 par la limite du jeu, réponses longues, 30 joueurs', async (env) => {
  const S = env.session;
  const sec = 'Cas limites';
  const LONG_NAME = 'Jean-Baptiste-Alexandre-Xi';
  const LONG_ANSWER = 'Un énorme plateau de fromages affinés servi à une heure indue';
  const people = [{ name: LONG_NAME, gender: 'm', hue: 12 }, ...CAST.slice(1), ...EXTRA_NAMES.map((name, i) => ({ name, gender: ['f', 'm', 'f', 'n'][i % 4], hue: (i * 29) % 360 }))];

  // --- Savant à 30 joueurs : lecture des 29 réponses sur la TV ---
  {
    const tv = await openTv(env, 'Le Savant');
    const { game, code } = tv;
    const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/content/facts-savant.json'), 'utf8'));
    game.savantFacts = [facts.find((f) => f.id === 'sci-09')];
    game.savantTiming = { announceMs: 2000, writeMs: 12000, readMinMs: 16000, readTailMs: 6000, chooseMs: 12000 };
    const cast = await fill(env, game, code, 30, { people });
    await tv.page.waitForSelector('.lobby-players');
    await S.shot(tv.page, 'limites-01-tv-lobby-30', 'TV : lobby avec 30 joueurs (dont un prénom saisi à 25 caractères, ramené à 20 par la limite du jeu).', { tv: true, lobby: true, section: sec });
    game.settings.auto = true;
    await tv.page.getByRole('button', { name: /Lancer la partie/ }).click();
    await waitFor(() => game.roundData?.step === 'write', 20000, 'écriture');
    for (const b of cast.bots) if (b.id !== game.roundData.seekerId) await b.act({ type: 'answer', text: `${LONG_ANSWER} ${b.name}`.slice(0, 60), phaseId: game.roundData.phaseId });
    await waitFor(() => game.roundData.step === 'read', 15000, 'lecture');
    await sleep(9000);
    await S.shot(tv.page, 'limites-02-tv-savant-lecture-30', 'TV : lecture des 29 réponses du Savant à 30 joueurs — réponses de 60 caractères, prénom saisi à 25 caractères et ramené à 20 par la limite du jeu, tout tient à l’écran.', { tv: true, section: sec });
    for (const b of cast.bots) b.close();
    await tv.ctx.close();
  }

  // --- Noir Boire Mangue à 30 joueurs : une réponse longue, puis le podium ---
  {
    const tv = await openTv(env, 'Noir Boire Mangue');
    const { game, code } = tv;
    game.nbmTiming = { announceMs: 1500, writeMs: 12000, writeBeatMs: 300, showMinMs: 900, showMaxMs: 3000, miniMs: 250, allocMs: 1500 };
    const cast = await fill(env, game, code, 30, { people });
    await tv.page.waitForSelector('.lobby-players');
    game.settings.auto = true;
    game.settings.resultsMs = 30000;
    await tv.page.getByRole('button', { name: /Lancer la partie/ }).click();
    const d = () => game.roundData;
    await waitFor(() => d()?.step === 'write', 20000, 'écriture');
    let k = 0;
    for (const b of cast.bots) await b.act({ type: 'answer', text: b.name === LONG_NAME ? LONG_ANSWER : ['Un pigeon en costume', 'Ma tante Josette', 'Du papier bulle', 'Un faux accent italien'][k++ % 4], phaseId: d().phaseId });
    await waitFor(() => d().step === 'rate', 15000, 'notes');
    // On attend que la réponse du joueur au long prénom passe, et on la photographie.
    const longId = idOf(game, LONG_NAME);
    const rateNow = async () => {
      const a = d().order[d().index];
      let v = 0;
      for (const b of cast.bots) if (b.id !== a) await b.act({ type: 'rate', rating: a === longId ? (v++ % 3 ? 'golden' : 'drole') : ['meh', 'nul', 'drole'][v++ % 3], phaseId: d().phaseId });
    };
    let shot = false;
    while (d().step !== 'done' && game.phase === 'question') {
      if (d().step === 'rate') {
        if (d().order[d().index] === longId && !shot) {
          shot = true;
          await sleep(500);
          await S.shot(tv.page, 'limites-03-tv-nbm-reponse-longue', 'TV : réponse de 60 caractères insérée dans la phrase, sans nom d’auteur ni débordement (à 30 joueurs).', { tv: true, section: sec });
        }
        await rateNow();
        await sleep(1000);
      }
      await sleep(150);
    }
    await waitFor(() => game.phase === 'results', 30000, 'résultats');
    await sleep(1500);
    await S.shot(tv.page, 'limites-04-tv-nbm-resultats-30', 'TV : résultats de la manche à 30 joueurs — top 3 resserré et gorgées, avec le prénom saisi à 25 caractères et ramené à 20 par la limite du jeu.', { tv: true, section: sec });
    await waitFor(() => !game.pending, 15000, 'distribution');
    await tv.page.getByRole('button', { name: /Terminer/ }).first().click();
    await tv.page.getByRole('button', { name: /Terminer la partie|Terminer/ }).last().click().catch(() => {});
    await waitFor(() => game.phase === 'ended', 10000, 'fin');
    await sleep(2500);
    await S.shot(tv.page, 'limites-05-tv-nbm-podium-30', 'TV : podium final de Noir Boire Mangue à 30 joueurs (podium des gorgées, réponse la plus drôle, podium de la plume).', { tv: true, section: sec });
    for (const b of cast.bots) b.close();
    await tv.ctx.close();
  }

  // --- Téléphone : prénom saisi à 25 caractères et ramené à 20 par la limite du jeu et réponse de 60 caractères en écriture ---
  {
    const tv = await openTv(env, 'Noir Boire Mangue');
    const { game, code } = tv;
    const cast = await fill(env, game, code, 4, { real: [], people: [people[0], ...CAST.slice(1, 4)] });
    const phone = await joinPhone(env, code, { name: 'Bastien-Alexandre-Louis-Xx', gender: 'n' }, env.avatars[5]);
    await waitFor(() => game.connectedCount() >= 5, 8000, 'joueurs');
    game.settings.auto = true;
    game.nbmTiming = { announceMs: 1500, writeMs: 40000 };
    await tv.page.getByRole('button', { name: /Lancer la partie/ }).click();
    await waitFor(() => game.roundData?.step === 'write', 15000, 'écriture');
    await phone.page.locator('.nbm-input').fill(LONG_ANSWER);
    await sleep(300);
    await S.shot(phone.page, 'limites-06-tel-ecriture-60', 'Téléphone : réponse de 60 caractères dans le champ (limite de 60), cartes proposées en dessous, rien ne déborde.', { section: sec });
    await S.shot(tv.page, 'limites-07-tv-lobby-prenom-long', 'TV : pendant l’écriture, le prénom saisi à 25 caractères et ramené à 20 par la limite du jeu reste lisible dans la liste des joueurs.', { tv: true, section: sec });
    for (const b of cast.bots) b.close();
    await phone.ctx.close();
    await tv.ctx.close();
  }
});

// ---------- Mode Duel (partie 1) ----------

section('duel', 'Mode Duel — moteur, roulettes, paris, 5 mini-jeux, gorgées, roi, cas limites', async (env) => {
  const S = env.session;
  const sec = 'Mode Duel';
  const REAL = ['Camille', 'Mehdi', 'Sacha', 'Inès'];
  const tv = await openTv(env, null);
  const { game, code } = tv;
  const page = tv.page;
  await page.waitForSelector('.game-grid');
  await S.shot(page, 'duel-01-grille', 'Grille des jeux : la carte « Mode Duel » (icône ROUGE / BLEU) est en haut, comme « Mode soirée ».', { tv: true, lobby: true, section: sec });
  await page.getByRole('button', { name: /Mode Duel/ }).first().click();
  await page.waitForSelector('.duel-setup');
  const cast = await fill(env, game, code, 12, { real: REAL });
  const idByName = (n) => idOf(game, n);
  const phoneOfId = (pid) => cast.phones.find((p) => idByName(p.name) === pid);
  // Les 4 vrais téléphones passent d'abord : leurs compteurs sont au plus bas, les 8 autres joueurs sont des bots.
  const role = 'duel:duelliste';
  game.spotlight.pick(role, [...game.players.keys()]);
  const counts = game.spotlight.counts.get(role);
  for (const [pid] of counts) counts.set(pid, cast.phones.some((p) => idByName(p.name) === pid) ? 0 : 6);
  game.settings.auto = true;
  game.settings.resultsMs = 5000;
  await sleep(500);
  await S.shot(page, 'duel-02-options', 'Écran d’options du lobby : Roi de la colline (non par défaut), cote Standard avec sa règle en une ligne, les 5 mini-jeux cochés, gros bouton « Lancer ».', { tv: true, lobby: true, section: sec });
  await page.getByRole('radio', { name: 'Hardcore' }).click();
  await sleep(300);
  await S.shot(page, 'duel-03-options-hardcore', 'Cote Hardcore choisie : la règle affichée change.', { tv: true, lobby: true, section: sec });
  await page.getByRole('radio', { name: 'Standard' }).click();
  game.duelOptions = { ...game.duelOptions, games: ['pfc'] };
  const d = () => game.roundData;
  const toStep = (s, ms = 40000) => waitFor(() => game.phase === 'question' && d().step === s, ms, `étape ${s}`);
  const dPhone = (camp) => phoneOfId(camp === 'rouge' ? d().red : d().blue);
  const bettorPhone = () => cast.phones.find((p) => d().bettors?.includes(idByName(p.name)));
  const bet = (pick) => {
    let k = 0;
    for (const pid of d().bettors) game.vote(pid, pick(k++));
  };
  const readyBoth = () => {
    game.action(d().red, { type: 'ready' });
    game.action(d().blue, { type: 'ready' });
  };
  const playAs = (camp, data) => game.action(camp === 'rouge' ? d().red : d().blue, { type: 'play', data });
  const afterDuel = async () => {
    await waitFor(() => game.phase === 'results', 40000, 'résultats');
    await sleep(900);
  };
  const nextDuel = (games, extra = {}) => {
    game.duelOptions = { ...game.duelOptions, games, ...extra };
  };
  // Duel suivant jusqu'au début du jeu : paris des parieurs, puis les deux duellistes sont prêts.
  const startPlay = async (games, extra = {}) => {
    nextDuel(games, extra);
    await waitFor(() => game.phase === 'question' && d().step === 'bets', 60000, 'paris');
    bet((k) => (k % 3 === 0 ? 'bleu' : 'rouge'));
    await toStep('ready', 40000);
    readyBoth();
    await toStep('play', 40000);
  };

  await page.getByRole('button', { name: /^Lancer$/ }).click();

  // --- 1. Duel de Pierre-feuille-ciseaux : roulettes, paris, révélation, prêts, jeu, verdict ---
  await toStep('duelists');
  for (const [i, ms] of [[4, 1000], [5, 1900], [6, 1500]]) {
    await sleep(ms);
    await S.shot(page, `duel-0${i}-roulette-duellistes-${i - 3}`, `Roulette des duellistes (image ${i - 3}) : fond coupé en diagonale, ROUGE à gauche, BLEU à droite, photos et prénoms qui défilent puis ralentissent.`, { tv: true, section: sec });
  }
  await toStep('game');
  await sleep(1500);
  await S.shot(page, 'duel-07-roulette-minijeux', 'Roulette des mini-jeux (icônes maison) : ici verrouillée sur le mini-jeu tiré.', { tv: true, section: sec });
  await toStep('bets');
  await sleep(600);
  const duelPhone = dPhone('rouge') ?? dPhone('bleu');
  const bp = bettorPhone();
  await S.shot(page, 'duel-08-paris-tv', 'Paris : les deux duellistes face à face, compteur « X / N ont parié » sans aucun nom, minuteur de 15 s.', { tv: true, section: sec });
  if (bp) await S.shot(bp.page, 'duel-09-paris-parieur', 'Téléphone parieur : deux gros boutons avec photo et prénom, ROUGE et BLEU en toutes lettres ; le pari est secret et modifiable.', { section: sec });
  if (duelPhone) await S.shot(duelPhone.page, 'duel-10-duelliste-couleur', 'Téléphone d’un duelliste : « Tu es ROUGE / BLEU » en très gros, contre qui, rien d’autre.', { section: sec });
  bet((k) => (k % 3 === 0 ? 'bleu' : 'rouge'));
  await toStep('betsReveal');
  await sleep(2600);
  await S.shot(page, 'duel-11-revelation-paris', 'Révélation des paris : les photos arrivent du côté choisi, la cote en direct (%) bouge à chaque pari dévoilé.', { tv: true, section: sec });
  await sleep(1700);
  await S.shot(page, 'duel-12-revelation-cote-finale', 'Fin de la révélation : cote finale et foule de chaque côté.', { tv: true, section: sec });
  if (bp) await S.shot(bp.page, 'duel-13-spectateur-emojis', 'Téléphone parieur après les paris : écran Spectateur avec sa mise, la cote, 8 emojis et les confettis.', { section: sec });
  await toStep('ready');
  if (duelPhone) await S.shot(duelPhone.page, 'duel-14-duelliste-pret', 'Téléphone d’un duelliste : gros bouton « Prêt » (5 s).', { section: sec });
  await S.shot(page, 'duel-15-pret-tv', 'TV : les deux duellistes et leur état « Prêt ».', { tv: true, section: sec });
  readyBoth();
  await toStep('play');
  // Emojis et confettis des parieurs, pendant le duel.
  for (let k = 0; k < 3; k++) {
    for (const pid of d().bettors) game.action(pid, { type: 'cheer', kind: k % 5 === 4 ? 'confetti' : 'emoji', emoji: ['🔥', '😱', '😂', '👏', '💀', '🍿', '😈', '🙌'][(k + pid.length) % 8] });
    await sleep(1050);
    if (k === 0 || k === 2) await S.shot(page, `duel-16-emojis-${k === 0 ? 'debut' : 'beaucoup'}`, k === 0 ? 'Les parieurs encouragent : emojis et confettis dans les marges, côté du camp misé.' : 'Beaucoup d’éléments à l’écran (12 joueurs) : les marges restent lisibles, 40 éléments au plus.', { tv: true, section: sec });
  }
  await S.shot(page, 'duel-17-pfc-tv-choix', 'Pierre-feuille-ciseaux, TV : score, manche, et pour chacun « A choisi » (jamais le choix avant la révélation).', { tv: true, section: sec });
  if (duelPhone) await S.shot(duelPhone.page, 'duel-18-pfc-duelliste', 'Pierre-feuille-ciseaux, téléphone du duelliste : trois gros boutons, choix secret.', { section: sec });
  playAs('rouge', { choice: 'pierre' });
  playAs('bleu', { choice: 'ciseaux' });
  await sleep(700);
  await S.shot(page, 'duel-19-pfc-revelation-manche', 'Révélation simultanée de la manche : pierre contre ciseaux, la manche va à ROUGE.', { tv: true, section: sec });
  await waitFor(() => d().mg?.round === 2 && !d().mg.shown, 8000, 'manche 2');
  playAs('rouge', { choice: 'feuille' });
  playAs('bleu', { choice: 'pierre' });
  await waitFor(() => game.phase === 'revealing', 8000, 'révélation');
  await sleep(2500);
  await S.shot(page, 'duel-20-suspense-verdict', 'Suspense avant le verdict : « ROUGE gagne ! » sur les deux duellistes.', { tv: true, section: sec });
  await afterDuel();
  await S.shot(page, 'duel-21-resultat-standard', 'Résultat (cote Standard) : le vainqueur, la cote, qui boit et pourquoi (perdant, mauvais pari, sans pari), avec les photos.', { tv: true, section: sec });
  const loserPhone = phoneOfId(game.results.loserId);
  const rightPhone = cast.phones.find((p) => game.results.right.includes(idByName(p.name)));
  const wrongPhone = cast.phones.find((p) => [...game.results.wrong, ...game.results.silent].includes(idByName(p.name)));
  if (loserPhone) await S.shot(loserPhone.page, 'duel-22-tel-perdant', 'Téléphone du perdant : « Tu bois ! » et ses gorgées.', { section: sec });
  if (rightPhone) await S.shot(rightPhone.page, 'duel-23-tel-bon-pari', 'Téléphone d’un parieur gagnant : « Bien joué, tu as vu juste ».', { section: sec });
  if (wrongPhone) await S.shot(wrongPhone.page, 'duel-24-tel-mauvais-pari', 'Téléphone d’un parieur qui s’est trompé (ou n’a pas parié) : « Tu bois ! ».', { section: sec });

  // --- 2. Culture G éclair ---
  await startPlay(['culture']);
  const cDuelist = dPhone('rouge') ?? dPhone('bleu');
  await sleep(900);
  await S.shot(page, 'duel-25-culture-tv', 'Culture G éclair, TV : question, 4 choix, score, minuteur de 10 s ; la bonne réponse n’est pas affichée.', { tv: true, section: sec });
  if (cDuelist) await S.shot(cDuelist.page, 'duel-26-culture-duelliste', 'Culture G éclair, téléphone du duelliste : la question et quatre gros boutons.', { section: sec });
  const rightIndex = () => d().mg.q.right;
  playAs('bleu', { choice: (rightIndex() + 1) % 4, n: d().mg.n });
  await sleep(300);
  if (cDuelist && cDuelist === dPhone('bleu')) await S.shot(cDuelist.page, 'duel-27-culture-bloque', 'Mauvaise réponse : le bouton se bloque 2 secondes.', { section: sec });
  playAs('rouge', { choice: rightIndex(), n: d().mg.n });
  await sleep(700);
  await S.shot(page, 'duel-28-culture-point', 'Point marqué : la bonne réponse apparaît, « Point pour ROUGE ! ».', { tv: true, section: sec });
  await waitFor(() => d().mg?.n === 2 && d().mg.phase === 'ask', 8000, 'question 2');
  playAs('rouge', { choice: rightIndex(), n: d().mg.n });
  await afterDuel();

  // --- 3. Duel du Feu ---
  await startPlay(['feu']);
  await S.shot(page, 'duel-29-feu-attente', 'Duel du Feu, TV : « Prêts… » avant les mots pièges (affichage seul si aucune voix française).', { tv: true, section: sec });
  const fDuelist = dPhone('rouge') ?? dPhone('bleu');
  if (fDuelist) await S.shot(fDuelist.page, 'duel-30-feu-duelliste', 'Duel du Feu, téléphone du duelliste : un seul gros bouton « TIRE ! », aucun mot affiché.', { section: sec });
  await waitFor(() => d().mg?.phase === 'words', 10000, 'premier mot');
  await sleep(600);
  await S.shot(page, 'duel-31-feu-mot-piege', 'Duel du Feu, TV : un mot piège s’affiche (et se dit).', { tv: true, section: sec });
  await waitFor(() => d().mg?.phase === 'feu', 60000, 'FEU');
  await sleep(500);
  playAs('bleu', { type: 'tap' });
  await sleep(120);
  playAs('rouge', { type: 'tap' });
  await sleep(500);
  await S.shot(page, 'duel-32-feu-feu', 'Duel du Feu, TV : le vrai « FEU » ! Le plus rapide (temps compensé de la latence) gagne.', { tv: true, section: sec });
  await afterDuel();

  // --- 4. Simon ---
  await startPlay(['simon']);
  const sDuelist = dPhone('rouge') ?? dPhone('bleu');
  await sleep(900);
  await S.shot(page, 'duel-33-simon-tv', 'Simon, TV : les 4 pavés (formes ET couleurs) s’allument, avec la progression de chacun.', { tv: true, section: sec });
  if (sDuelist) await S.shot(sDuelist.page, 'duel-34-simon-duelliste', 'Simon, téléphone du duelliste : 4 gros pavés, séquence puis à toi.', { section: sec });
  const seq = d().mg.seq;
  const tapTurn = async (camp, turn, ok = true) => {
    for (let i = 0; i < turn; i++) playAs(camp, { pad: ok || i < turn - 1 ? seq[i] : (seq[i] + 1) % 4 });
  };
  for (let turn = 1; turn <= 3; turn++) {
    await waitFor(() => d().mg.turn === turn && Date.now() > d().mg.turnAt + 400 + turn * 420 + 60, 20000, `tour ${turn}`);
    await tapTurn('rouge', turn);
    await tapTurn('bleu', turn, turn < 3);
    if (turn === 3) break;
    await sleep(1300);
  }
  await sleep(500);
  await S.shot(page, 'duel-35-simon-erreur', 'Simon, TV : BLEU est éliminé au tour 3, ROUGE finit son tour et gagne.', { tv: true, section: sec });
  await afterDuel();

  // --- 5. Couleur piège ---
  await startPlay(['couleur']);
  const cpDuelist = dPhone('rouge') ?? dPhone('bleu');
  await sleep(700);
  await S.shot(page, 'duel-36-couleur-tv', 'Couleur piège, TV : deux jauges de score, sans révéler les mots.', { tv: true, section: sec });
  if (cpDuelist) await S.shot(cpDuelist.page, 'duel-37-couleur-duelliste', 'Couleur piège, téléphone du duelliste : un mot écrit dans une autre couleur ; quatre boutons au nom de la couleur en blanc.', { section: sec });
  const stroop = (await import('../server/duel/minigames/couleur.js')).stroopItem;
  const answerAs = (camp, good) => {
    const i = d().mg.p[camp].i;
    const item = stroop(d().mg.seed, i);
    playAs(camp, { i, color: good ? item.ink : item.ink === 'rouge' ? 'bleu' : 'rouge' });
  };
  for (let k = 0; k < 7; k++) {
    answerAs('rouge', true);
    answerAs('bleu', k % 3 === 0);
    await sleep(150);
  }
  await S.shot(page, 'duel-38-couleur-jauges', 'Couleur piège, TV : les jauges montent à mesure des bonnes réponses (−2 par erreur).', { tv: true, section: sec });
  await afterDuel();

  // --- 6. Hardcore, roi de la colline avec série, chute ---
  nextDuel(['pfc'], { cote: 'hardcore', king: true });
  const pfcWin = async (camp) => {
    await toStep('play', 90000);
    for (let r = 0; r < 2; r++) {
      await waitFor(() => d().mg?.phase === 'choose', 10000, 'choix');
      playAs(camp, { choice: 'pierre' });
      playAs(camp === 'rouge' ? 'bleu' : 'rouge', { choice: 'ciseaux' });
      if (r === 0) await waitFor(() => d().mg.phase === 'choose' && d().mg.round === 2, 8000, 'manche 2');
    }
  };
  const phaseDuel = async (settle) => {
    await toStep('bets', 40000);
    bet((k) => (k % 2 ? 'bleu' : 'rouge'));
    await toStep('ready', 40000);
    readyBoth();
    await settle();
    await afterDuel();
  };
  const kingCamp = () => (d().kingId === d().red ? 'rouge' : 'bleu');
  // Duel A : le vainqueur est couronné (cote Hardcore).
  await phaseDuel(() => pfcWin('rouge'));
  await S.shot(page, 'duel-39-hardcore', 'Résultat en cote Hardcore : le perdant boit autant de gorgées que de paris contre lui.', { tv: true, section: sec });
  // Duel B : le roi défend son titre et gagne (série de 2).
  await waitFor(() => game.phase === 'question' && d().step === 'duelists', 20000, 'duel du roi');
  await toStep('bets', 40000);
  await S.shot(page, 'duel-40-roi-en-place', 'Roi de la colline : couronne sur le roi, camp d’origine conservé, série affichée, challenger tiré équitablement.', { tv: true, section: sec });
  bet(() => 'rouge');
  await toStep('ready', 40000);
  readyBoth();
  await pfcWin(kingCamp());
  await afterDuel();
  await S.shot(page, 'duel-41-roi-serie', 'Le roi gagne encore : il reste roi, série de victoires consécutives.', { tv: true, section: sec });
  // Duel C : le challenger l'emporte, le roi chute.
  await waitFor(() => game.phase === 'question' && d().step === 'duelists', 20000, 'duel de la chute');
  await toStep('bets', 40000);
  bet(() => (kingCamp() === 'rouge' ? 'bleu' : 'rouge'));
  await toStep('ready', 40000);
  readyBoth();
  await pfcWin(kingCamp() === 'rouge' ? 'bleu' : 'rouge');
  await afterDuel();
  await S.shot(page, 'duel-42-roi-chute', 'Le roi tombe : ses victoires consécutives s’ajoutent à ses gorgées (plafond respecté).', { tv: true, section: sec });

  // --- 7. Cas limites ---
  nextDuel(['pfc'], { king: false, cote: 'standard' });
  await waitFor(() => game.phase === 'question' && d().step === 'bets', 40000, 'paris');
  const gone = [...cast.bots].find((b) => b.id === d().red || b.id === d().blue);
  const goneId = gone?.id ?? d().red;
  if (gone) gone.close();
  else for (const p of cast.phones) if (idByName(p.name) === goneId) await p.ctx.close();
  await waitFor(() => d().notice?.kind === 'gone', 20000, 'duel annulé');
  await sleep(600);
  await S.shot(page, 'duel-43-duel-annule', 'Duelliste déconnecté plus de 10 s : duel annulé (aucun pari perdant, aucune gorgée), un autre duel est tiré.', { tv: true, section: sec });
  await toStep('play', 90000).catch(() => {});
  if (game.phase === 'question' && d().step === 'play') {
    d().outcome = { winner: 'égalité', details: null };
    game.reveal(game.roundId);
    await afterDuel();
    await S.shot(page, 'duel-44-egalite', 'Égalité (résultat forcé pour la capture) : seuls les deux duellistes boivent 1 gorgée, les parieurs sont épargnés.', { tv: true, section: sec });
  }
  for (const b of cast.bots) b.close();
  for (const p of cast.phones) await p.ctx.close().catch(() => {});
  await tv.ctx.close();

  // 30 joueurs, dont un prénom saisi à 25 caractères (ramené à 20) : écran des paris et foule.
  {
    const big = await openTv(env, null);
    await big.page.getByRole('button', { name: /Mode Duel/ }).first().click();
    const people = [{ name: 'Bastien-Alexandre-Louis-Xx', gender: 'n', hue: 40 }, ...CAST.slice(0, 11), ...EXTRA_NAMES.map((name, i) => ({ name, gender: ['f', 'm', 'f', 'n'][i % 4], hue: (i * 29) % 360 }))];
    const crowd = await fill(env, big.game, big.code, 30, { people });
    big.game.settings.auto = true;
    big.game.duelOptions = { king: false, cote: 'standard', games: ['pfc'] };
    await big.page.waitForSelector('.duel-setup');
    await big.page.getByRole('button', { name: /^Lancer$/ }).click();
    const bd = () => big.game.roundData;
    await waitFor(() => bd().step === 'bets', 40000, 'paris à 30');
    await sleep(500);
    await S.shot(big.page, 'duel-45-30-joueurs-paris', 'À 30 joueurs : l’écran des paris reste lisible (compteur, points de progression, duellistes en grand).', { tv: true, section: sec });
    let k = 0;
    for (const pid of bd().bettors) big.game.vote(pid, k++ % 4 ? 'rouge' : 'bleu');
    await waitFor(() => bd().step === 'betsReveal', 20000, 'révélation à 30');
    await sleep(4300);
    await S.shot(big.page, 'duel-46-30-joueurs-foule', 'À 30 joueurs : la foule des parieurs de chaque côté, photos réduites, prénoms longs ramenés à 20 caractères.', { tv: true, section: sec });
    for (const b of crowd.bots) b.close();
    await big.ctx.close();
  }
});

// ---------- Mode Duel, partie 2 : les 12 nouveaux mini-jeux ----------

section('duel2', 'Mode Duel, partie 2 : les 12 mini-jeux', async (env) => {
  const S = env.session;
  const sec = 'Mode Duel (partie 2)';
  const REAL = ['Camille', 'Mehdi', 'Sacha', 'Inès'];
  const tv = await openTv(env, null);
  const { game, code } = tv;
  const page = tv.page;
  await page.waitForSelector('.game-grid');
  await page.getByRole('button', { name: /Mode Duel/ }).first().click();
  await page.waitForSelector('.duel-setup');
  const cast = await fill(env, game, code, 12, { real: REAL });
  const idByName = (n) => idOf(game, n);
  const phoneOfId = (pid) => cast.phones.find((p) => idByName(p.name) === pid);
  const role = 'duel:duelliste';
  game.spotlight.pick(role, [...game.players.keys()]);
  const counts = game.spotlight.counts.get(role);
  for (const [pid] of counts) counts.set(pid, cast.phones.some((p) => idByName(p.name) === pid) ? 0 : 6);
  game.settings.auto = true;
  game.settings.resultsMs = 3000;
  await sleep(600);
  await S.shot(page, 'duel2-01-options-17-jeux', 'Écran d’options : les 17 mini-jeux (5 de la partie 1 et 12 nouveaux) avec leur icône, tous cochés par défaut.', { tv: true, lobby: true, section: sec });
  const d = () => game.roundData;
  const toStep = (s, ms = 60000) => waitFor(() => game.phase === 'question' && d().step === s, ms, `étape ${s}`);
  const bet = () => {
    let k = 0;
    for (const pid of d().bettors) game.vote(pid, k++ % 3 === 0 ? 'bleu' : 'rouge');
  };
  const readyBoth = () => {
    game.action(d().red, { type: 'ready' });
    game.action(d().blue, { type: 'ready' });
  };
  const dPhone = (camp) => phoneOfId(camp === 'rouge' ? d().red : d().blue);
  // Les actions passent ici directement par le serveur : on diffuse l'état pour que les téléphones soient à jour avant la capture.
  const playAs = (camp, data) => {
    const r = game.action(camp === 'rouge' ? d().red : d().blue, { type: 'play', data });
    game.onChange?.(game);
    return r;
  };
  const startPlay = async (id) => {
    game.duelOptions = { ...game.duelOptions, games: [id], king: false };
    // On passe les duels déjà lancés avec un autre mini-jeu jusqu'à celui qu'on veut montrer.
    for (let tries = 0; tries < 12; tries++) {
      await waitFor(() => game.phase === 'question' && d().step === 'bets', 90000, 'paris');
      if (d().mgId === id) break;
      game.gameHostAction({ type: 'skip' });
      await sleep(200);
    }
    bet();
    await toStep('ready', 40000);
    readyBoth();
    await toStep('play', 40000);
  };
  const shotBoth = async (name, caption, camp = 'rouge', phoneFirst = false) => {
    game.onChange?.(game);
    await sleep(250);
    const p = dPhone(camp);
    const phone = async () => p && S.shot(p.page, `duel2-${name}-tel`, `Téléphone d’un duelliste : ${caption}`, { section: sec });
    if (phoneFirst) await phone();
    await S.shot(page, `duel2-${name}-tv`, `TV : ${caption}`, { tv: true, section: sec });
    if (!phoneFirst) await phone();
  };
  const forceEnd = async (winner) => {
    d().outcome = { winner, details: null, sips: null };
    game.reveal(game.roundId);
    await waitFor(() => game.phase === 'results', 30000, 'résultats');
    await sleep(700);
  };
  const waitResults = async (ms = 60000) => {
    await waitFor(() => game.phase === 'results', ms, 'résultats');
    await sleep(700);
  };

  // Premier duel : la roulette des mini-jeux avec les 17 jeux.
  game.duelOptions = { ...game.duelOptions, games: null };
  await page.getByRole('button', { name: /^Lancer$/ }).click();
  await toStep('game', 30000);
  await sleep(700);
  await S.shot(page, 'duel2-02-roulette-minijeux-1', 'Roulette des mini-jeux : elle défile sur les 17 jeux (ici en cours de défilement).', { tv: true, section: sec });
  await sleep(1500);
  await S.shot(page, 'duel2-03-roulette-minijeux-2', 'Roulette des mini-jeux : verrouillée sur le jeu tiré.', { tv: true, section: sec });
  await toStep('bets', 15000);
  game.gameHostAction({ type: 'skip' });

  // 1. Désamorçage
  await startPlay('defuse');
  await sleep(900);
  await shotBoth('defuse-1', 'la bombe avec ses fils (couleur, motif, numéro) et ses 3 indices.');
  const sol = d().mg.puzzle.solution;
  playAs('bleu', { wire: (sol + 1) % d().mg.puzzle.wires.length });
  await sleep(500);
  await shotBoth('defuse-2-bloque', 'un mauvais fil est coupé : le joueur est bloqué 3 secondes.', 'bleu');
  playAs('rouge', { wire: sol });
  await waitResults();

  // 2. Le Code
  await startPlay('code');
  await sleep(600);
  playAs('rouge', { guess: [0, 1, 2, 3] });
  playAs('rouge', { guess: [1, 1, 4, 5] });
  playAs('bleu', { guess: [2, 2, 3, 3] });
  await sleep(500);
  await shotBoth('code-1', 'la TV ne montre que des pastilles d’indices ; le téléphone montre ses essais.');
  playAs('rouge', { guess: d().mg.secret });
  await sleep(500);
  await S.shot(page, 'duel2-code-2-trouve-tv', 'TV : le code est trouvé, le code secret apparaît.', { tv: true, section: sec });
  await waitResults();

  // 3. Simon croisé
  await startPlay('simon2');
  const first = d().mg.turn;
  playAs(first, { pad: 2 });
  await sleep(1000);
  await S.shot(page, 'duel2-simon2-1-rejeu-tv', 'TV : après un tour réussi, la séquence est rejouée sur la TV seulement.', { tv: true, section: sec });
  await waitFor(() => d().mg.phase === 'input', 8000, 'saisie');
  const next = d().mg.turn;
  await shotBoth('simon2-2-saisie', 'c’est à l’autre de rejouer la séquence de mémoire, puis d’ajouter un pas.', next);
  playAs(next, { pad: 0 });
  await waitResults();

  // 4. Le Crash
  await startPlay('crash');
  await sleep(800);
  playAs('rouge', { type: 'bank' });
  await sleep(500);
  await shotBoth('crash-1', 'le multiplicateur grimpe ; ROUGE a déjà banqué.');
  await waitFor(() => d().mg.crashedAt != null || game.phase !== 'question', 25000, 'explosion');
  await sleep(500);
  await S.shot(page, 'duel2-crash-2-explosion-tv', 'TV : le multiplicateur explose, la valeur de chacun est comptée.', { tv: true, section: sec });
  await waitResults();

  // 5. 1-2-3 Soleil
  await startPlay('soleil');
  playAs('rouge', { type: 'hold', down: true });
  playAs('bleu', { type: 'hold', down: true });
  await sleep(1800);
  await shotBoth('soleil-1', 'les deux maintiennent leur bouton : les barres avancent.');
  await waitFor(() => d().mg.sun, 15000, 'Soleil');
  await sleep(500);
  await S.shot(page, 'duel2-soleil-2-soleil-tv', 'TV : « SOLEIL ! » : il faut avoir lâché, sinon on recule d’un quart.', { tv: true, section: sec });
  playAs('bleu', { type: 'hold', down: false });
  await sleep(1500);
  await forceEnd('bleu');

  // 6. Dilemme en or
  await startPlay('dilemme');
  await sleep(1200);
  await shotBoth('dilemme-1-discussion', 'la discussion de 20 secondes : « Parlez-vous ! ».');
  await waitFor(() => d().mg.phase === 'choose', 30000, 'choix');
  await sleep(500);
  await shotBoth('dilemme-2-choix', 'chacun choisit PARTAGER ou TRAHIR en secret.');
  playAs('rouge', { choice: 'trahir' });
  playAs('bleu', { choice: 'partager' });
  await waitFor(() => game.phase === 'revealing', 10000, 'révélation');
  await sleep(500);
  await S.shot(page, 'duel2-dilemme-3-suspense-tv', 'TV : suspense avant la révélation simultanée des choix.', { tv: true, section: sec });
  await waitResults();
  await S.shot(page, 'duel2-dilemme-4-resultat-tv', 'TV : les choix sont révélés (ROUGE a trahi, BLEU a partagé) et les gorgées tombent.', { tv: true, section: sec });

  // 7. Plateau fantôme
  await startPlay('plateau');
  await sleep(2500);
  await shotBoth('plateau-1-defile', 'les personnages défilent sur la TV ; les téléphones sont vides.');
  await waitFor(() => d().mg.phase === 'ask', 15000, 'question');
  await sleep(500);
  await shotBoth('plateau-2-question', 'la question de comptage avec ses 4 choix.');
  playAs('rouge', { choice: d().mg.q.right, n: d().mg.n });
  await waitFor(() => d().mg.score.rouge >= 1, 5000, 'point');
  await forceEnd('rouge');

  // 8. Course d'obstacles
  await startPlay('course');
  const run = await import('../shared/runner.js');
  const plan = run.perfectEvents(d().mg.track, 300);
  const t0 = Date.now();
  let sent = 0;
  while (Date.now() - t0 < 600) {
    const f = Math.floor((Date.now() - t0) / run.DT_MS);
    while (sent < plan.length && plan[sent].f <= f) {
      playAs('rouge', { k: plan[sent].k, f: plan[sent].f });
      sent += 1;
    }
    await sleep(8);
  }
  await shotBoth('course-1', 'les deux couloirs sur le même tracé ; ROUGE saute et se baisse, BLEU ne bouge pas.', 'rouge', true);
  await waitFor(() => d().mg.done || game.phase !== 'question', 15000, 'mort de BLEU');
  await sleep(300);
  await S.shot(page, 'duel2-course-2-tombe-tv', 'TV : BLEU est tombé sur un obstacle ; le dernier debout gagne.', { tv: true, section: sec });
  await waitResults();

  // 9. Qui suis-je ?
  await startPlay('quisuisje');
  await sleep(1200);
  await shotBoth('qui-1', 'premier indice (le plus difficile), 4 points en jeu.');
  await sleep(6000);
  await shotBoth('qui-2', 'deuxième indice : la réponse rapporte 3 points.');
  playAs('rouge', { choice: d().mg.right, n: d().mg.n });
  playAs('bleu', { choice: (d().mg.right + 1) % 4, n: d().mg.n });
  await sleep(300);
  playAs('bleu', { choice: d().mg.right, n: d().mg.n });
  await sleep(1000);
  await S.shot(page, 'duel2-qui-3-reponse-tv', 'TV : la réponse est révélée, les points sont comptés.', { tv: true, section: sec });
  await forceEnd('rouge');

  // 10. Ordre chronologique
  await startPlay('chrono');
  await sleep(700);
  const order = d().mg.cards.map((c, i) => [c.rank, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  playAs('rouge', { card: order[0] });
  playAs('rouge', { card: order[1] });
  playAs('bleu', { card: order[3] });
  await sleep(500);
  await shotBoth('chrono-1', 'les cartes à ordonner ; ROUGE en a placé deux, BLEU s’est trompé (bloqué 3 s).');
  for (const i of order.slice(2)) playAs('rouge', { card: i });
  await sleep(1200);
  await S.shot(page, 'duel2-chrono-2-dates-tv', 'TV : ROUGE a fini ; les dates apparaissent sur les cartes.', { tv: true, section: sec });
  await waitResults();

  // 11. Vrai ou Faux
  await startPlay('vf');
  await sleep(900);
  await shotBoth('vf-1', 'une affirmation, deux gros boutons VRAI et FAUX, un temps qui diminue.');
  playAs('rouge', { value: d().mg.st.vrai, n: d().mg.n });
  await sleep(400);
  await S.shot(page, 'duel2-vf-2-reponse-tv', 'TV : en attendant l’autre, ROUGE a répondu.', { tv: true, section: sec });
  playAs('bleu', { value: !d().mg.st.vrai, n: d().mg.n });
  await waitFor(() => d().mg.phase === 'reveal', 12000, 'révélation');
  await sleep(500);
  await S.shot(page, 'duel2-vf-3-verdict-tv', 'TV : la bonne réponse et son explication ; BLEU est éliminé.', { tv: true, section: sec });
  await waitResults();

  // 12. Géo-duel
  await startPlay('geo');
  await sleep(1200);
  const city = d().mg.city;
  playAs('rouge', { pin: { lat: city.lat + 3, lon: city.lon + 4 }, n: d().mg.n });
  playAs('bleu', { pin: { lat: city.lat - 25, lon: city.lon - 40 }, n: d().mg.n });
  await sleep(500);
  await shotBoth('geo-1', 'la ville annoncée et la carte du monde : chacun pose son épingle au doigt.');
  await waitFor(() => d().mg.phase === 'reveal', 25000, 'révélation de la ville');
  await sleep(700);
  await shotBoth('geo-2-revelation', 'la carte montre les deux épingles, la bonne position (étoile) et les distances en km.');
  await forceEnd('rouge');

  for (const b of cast.bots) b.close();
  for (const p of cast.phones) await p.ctx.close().catch(() => {});
  await tv.ctx.close();
});

// ---------- Exécution ----------

fs.mkdirSync(OUT, { recursive: true });
const names = wanted.length ? wanted : Object.keys(SECTIONS);
for (const n of names) if (!SECTIONS[n]) throw new Error(`section inconnue : ${n} (sections : ${Object.keys(SECTIONS).join(', ')})`);
const srv = await startDemoServer();
const browser = await launch(chromium);
const session = new Session(OUT);
const avatars = await makeAvatars(browser, [...CAST, ...EXTRA_NAMES.map((name, i) => ({ name, gender: 'n', hue: (i * 29) % 360 }))]);
const env = { srv, browser, session, avatars };
let failed = 0;
try {
  for (const n of names) {
    const t0 = Date.now();
    try {
      await SECTIONS[n].fn(env);
      console.log(`✔ ${n} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (err) {
      failed += 1;
      console.error(`✘ ${n} : ${err.stack ?? err}`);
    }
  }
} finally {
  await browser.close();
  await srv.close();
}
fs.writeFileSync(path.join(OUT, wanted.length && !DUEL_ONLY ? 'INDEX-partiel.md' : 'INDEX.md'), session.indexMarkdown(DUEL_ONLY ? (wanted[0] === 'duel2' ? 'Captures du mode Duel (partie 2 : 12 mini-jeux)' : 'Captures du mode Duel (partie 1)') : 'Captures d’écran de la mise à jour', 'Générées par `npm run captures` (scripts/capture-demo.js) : TV 1920×1080, téléphone 390×844, 12 joueurs mixtes aux avatars générés.'));
const consoleIssues = [...session.consoleIssues];
console.log(`${session.index.length} images, ${session.issues.length} problème(s) d’affichage repéré(s), ${consoleIssues.length} message(s) de console.`);
for (const i of session.issues) console.log(`  ⚠ ${i.file} : ${i.issue}`);
for (const c of consoleIssues) console.log(`  ⚠ ${c}`);
process.exit(failed ? 1 : 0);
