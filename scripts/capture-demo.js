// Captures d'écran reproductibles de tout ce que la mise à jour a modifié, jouées en action dans un vrai navigateur (Playwright).
//   npm run captures                    toutes les sections        npm run captures -- nbm savant     seulement celles-là
// TV 1920×1080 et téléphone 390×844, 12 joueurs mixtes (hommes, femmes, « ne préfère pas dire ») aux avatars générés, contenus réels.
// Les images vont dans docs/captures/, avec INDEX.md (ce que montre chaque image + les problèmes d'affichage repérés : texte coupé ou
// qui déborde, champ {...} visible, contraste, boutons de moins de 44 px, erreurs de console).
// Playwright est une dépendance de développement seulement. Si le navigateur ne s'installe pas : `npx playwright install chromium`.
import fs from 'node:fs';
import path from 'node:path';
import { CAST, EXTRA_NAMES, PHONE, ROOT, Session, TV, bot, launch, makeAvatars, sleep, startDemoServer } from './lib/demo.js';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright n’est pas installé : `npm install` puis `npx playwright install chromium`. Aucune capture n’a été faite.');
  process.exit(1);
}

const OUT = path.join(ROOT, 'docs/captures');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
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
async function fill(env, game, code, n, { real = [] } = {}) {
  const phones = [];
  for (const name of real) {
    const i = CAST.findIndex((p) => p.name === name);
    phones.push(await joinPhone(env, code, CAST[i], env.avatars[i]));
  }
  const bots = [];
  const people = [...CAST, ...EXTRA_NAMES.map((name, i) => ({ name, gender: ['f', 'm', 'f', 'n'][i % 4], hue: (i * 29) % 360 }))];
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
  // Tous les autres notent : la jauge de mini-résultat apparaît.
  const ratings = ['drole', 'meh', 'golden', 'nul', 'drole', 'drole', 'meh', 'drole'];
  let r = 0;
  for (const b of cast.bots) if (b.id !== author) await b.act({ type: 'rate', rating: ratings[r++ % ratings.length], phaseId: d().phaseId });
  for (const p of [camille, mehdi, sacha]) if (idOf(game, p.name) !== author && p !== voter) await p.page.getByRole('button', { name: /Drôle/ }).click().catch(() => {});
  await waitFor(() => d().step === 'mini', 15000, 'mini-résultat');
  await sleep(900);
  await S.shot(tvPage, 'nbm-11-tv-mini-resultat', 'Mini-résultat animé (1,5 s) après le dernier vote : jauge Nul / Meh / Drôle / Golden.', { tv: true, section: sec });
  game.nbmTiming = { ...game.nbmTiming, showMinMs: 1500, showMaxMs: 3000, miniMs: 400 };
  // On abrège les autres réponses : tout le monde note vite.
  const rateRest = async () => {
    while (d().step !== 'done' && game.phase === 'question') {
      if (d().step === 'rate') {
        const a = d().order[d().index];
        for (const b of cast.bots) if (b.id !== a) await b.act({ type: 'rate', rating: ratings[(r++) % ratings.length], phaseId: d().phaseId });
      }
      await sleep(250);
    }
  };
  await rateRest();
  await waitFor(() => game.phase === 'revealing' || game.phase === 'results', 30000, 'fin de manche');
  await sleep(2500);
  await S.shot(tvPage, 'nbm-12-tv-top3', 'Résultats de la manche : le top 3 avec noms, photos, points et Golden reçus (ex æquo au même rang).', { tv: true, section: sec });
  await waitFor(() => game.phase === 'results', 15000, 'résultats');
  await sleep(600);
  await S.shot(tvPage, 'nbm-13-tv-gorgees', 'Fenêtre de distribution des gorgées (8 s) : le gagnant distribue 2, le dernier boit 2.', { tv: true, section: sec });
  const winner = game.results.winners[0];
  const winnerPhone = [camille, mehdi, sacha].find((p) => idOf(game, p.name) === winner);
  if (winnerPhone) await S.shot(winnerPhone.page, 'nbm-14-tel-distribue', 'Téléphone du gagnant : il distribue ses 2 gorgées (sinon, au hasard).', { section: sec });
  await waitFor(() => !game.pending, 15000, 'fin de la distribution');
  await sleep(500);
  await S.shot(tvPage, 'nbm-15-tv-resultats-gorgees', 'Résultats de la manche avec les gorgées (plafond de 4 par joueur).', { tv: true, section: sec });
  await S.shot(camille.page, 'nbm-16-tel-verdict', 'Téléphone : verdict de la manche (« Tu bois ! / Bien joué ! »).', { section: sec });
  for (const b of cast.bots) b.close();
  for (const p of cast.phones) await p.ctx.close();
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
fs.writeFileSync(path.join(OUT, wanted.length ? 'INDEX-partiel.md' : 'INDEX.md'), session.indexMarkdown('Captures d’écran de la mise à jour', 'Générées par `npm run captures` (scripts/capture-demo.js) : TV 1920×1080, téléphone 390×844, 12 joueurs mixtes aux avatars générés.'));
const consoleIssues = [...session.consoleIssues];
console.log(`${session.index.length} images, ${session.issues.length} problème(s) d’affichage repéré(s), ${consoleIssues.length} message(s) de console.`);
for (const i of session.issues) console.log(`  ⚠ ${i.file} : ${i.issue}`);
for (const c of consoleIssues) console.log(`  ⚠ ${c}`);
process.exit(failed ? 1 : 0);
