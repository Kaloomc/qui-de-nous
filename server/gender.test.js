// Genre des joueurs : choix à l'entrée, vie privée, questions réservées à un genre (candidats, garde-fous, proportion).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RUN, MIN_CANDIDATES, SHARE_MAX, SHARE_MIN, candidatesFor, chooseKind, genderCounts, newMix, recordKind } from './rules/gendered.js';
import { seeded } from './rules/loupSim.js';
import { Game } from './gameStore.js';
import { makeGame } from './testClock.js';

const mk = (gender, i) => ({ id: `${gender}${i}`, gender });
const group = (m, f, n) => [
  ...Array.from({ length: m }, (_, i) => mk('m', i)),
  ...Array.from({ length: f }, (_, i) => mk('f', i)),
  ...Array.from({ length: n }, (_, i) => mk('n', i)),
];

// ---------- Entrée dans la partie ----------

test('genre obligatoire à l’écran « Rejoindre », valeurs contrôlées, conservé à la reconnexion, jamais ailleurs qu’en mémoire', () => {
  const game = new Game('GENR');
  assert.match(game.upsertPlayer({ name: 'Léa', strictGender: true }).error, /Choisis/);
  assert.match(game.upsertPlayer({ name: 'Léa', gender: 'x', strictGender: true }).error, /invalide/);
  const { player } = game.upsertPlayer({ name: 'Léa', gender: 'f', strictGender: true });
  assert.equal(player.gender, 'f');
  // Reconnexion par « Rejoindre » avec son identité : le genre est conservé même si le client ne le renvoie pas.
  const again = game.upsertPlayer({ playerId: player.id, secret: player.secret, name: 'Léa B', strictGender: true });
  assert.equal(again.player.gender, 'f');
  // Les appelants internes (tests, anciens clients) restent possibles : forme neutre par défaut.
  assert.equal(game.upsertPlayer({ name: 'Sam' }).player.gender, 'n');
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(game.recap().players[0]))).sort(), ['id', 'name', 'photoUrl'], 'le récap partageable ne contient jamais le genre');
});

test('le genre se modifie dans le lobby (pas en pleine manche) et suit les accords de l’état envoyé', async () => {
  const { game, players } = await makeGame('qui-de-nous', ['A', 'B', 'C']);
  assert.equal(game.setGender(players[0].id, 'f'), null);
  assert.equal(game.publicState({ host: true }).players[0].gender, 'f');
  assert.match(game.setGender(players[0].id, 'z'), /invalide/);
  assert.match(game.setGender('inconnu', 'f'), /plus dans la partie/);
  game.start();
  assert.match(game.setGender(players[0].id, 'm'), /entre deux jeux/);
  assert.equal(players[0].gender, 'f');
});

// ---------- Candidats ----------

test('candidats d’une question réservée : seulement les joueurs du genre, jamais « ne préfère pas dire » ; « tous » = tout le monde', () => {
  const g = group(3, 4, 2);
  assert.equal(candidatesFor(g, 'femme').length, 4);
  assert.ok(candidatesFor(g, 'femme').every((id) => id.startsWith('f')));
  assert.equal(candidatesFor(g, 'homme').length, 3);
  assert.equal(candidatesFor(g, 'tous').length, 9, 'les « ne préfère pas dire » votent et sont candidats des questions pour tous');
  assert.deepEqual(genderCounts(g), { homme: 3, femme: 4 });
});

// ---------- Tirage ----------

test('garde-fous : moins de 3 candidats ou genre absent → jamais de question réservée à ce genre', () => {
  const rng = seeded(1);
  const mix = newMix();
  for (let i = 0; i < 400; i++) {
    const kind = chooseKind(mix, { homme: MIN_CANDIDATES - 1, femme: 0 }, rng);
    assert.equal(kind, 'tous');
    recordKind(mix, kind);
  }
  const mix2 = newMix();
  const kinds = new Set();
  for (let i = 0; i < 400; i++) {
    const kind = chooseKind(mix2, { homme: 0, femme: 5 }, rng);
    kinds.add(kind);
    recordKind(mix2, kind);
  }
  assert.deepEqual([...kinds].sort(), ['femme', 'tous'], 'seul le genre présent est tiré');
});

test('proportion : environ 8 à 10 % de questions réservées, équitablement réparties, jamais plus de 2 de suite', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = seeded(seed);
    const mix = newMix();
    let run = 0;
    let longest = 0;
    for (let i = 0; i < 600; i++) {
      const kind = chooseKind(mix, { homme: 5, femme: 5 }, rng);
      recordKind(mix, kind);
      run = kind === 'tous' ? 0 : run + 1;
      longest = Math.max(longest, run);
    }
    const share = mix.reserved / mix.drawn;
    assert.ok(share >= SHARE_MIN - 0.02 && share <= SHARE_MAX + 0.02, `graine ${seed} : ${(share * 100).toFixed(1)} %`);
    assert.ok(longest <= MAX_RUN, `graine ${seed} : ${longest} de suite`);
    assert.ok(Math.abs(mix.byCible.homme - mix.byCible.femme) <= 1, `graine ${seed} : ${mix.byCible.homme} / ${mix.byCible.femme}`);
  }
});

// ---------- Dans une vraie partie ----------

const Q = (cible, i) => ({ niveau: 'chill', text: `Qui est ${cible === 'femme' ? 'la' : 'le'} plus susceptible de faire ${cible} ${i} ?`, ...(cible === 'tous' ? {} : { cible }) });

test('« Qui de nous ? » : la grille ne propose que les candidats du genre, les autres votent quand même, aucun candidat « ne préfère pas dire »', async () => {
  const names = ['H1', 'H2', 'H3', 'F1', 'F2', 'F3', 'F4', 'N1'];
  const { game, players } = await makeGame('qui-de-nous', names);
  const genders = ['m', 'm', 'm', 'f', 'f', 'f', 'f', 'n'];
  players.forEach((p, i) => (p.gender = genders[i]));
  // Que des questions réservées aux femmes dans la liste : le premier tirage « réservé » est donc forcément pour elles.
  const only = [1, 2, 3, 4, 5, 6].map((i) => Q('femme', i));
  game.contentPool = () => ({ key: 'test', list: only });
  game.questionMix = new Map([['test', { drawn: 10, reserved: 0, run: 0, byCible: { homme: 0, femme: 0 } }]]);
  assert.equal(game.start(), null);
  const round = game.publicState({ host: true }).round;
  assert.equal(round.cible, 'femme');
  const women = players.filter((p) => p.gender === 'f').map((p) => p.id);
  assert.deepEqual([...round.candidateIds].sort(), [...women].sort());
  // Vote pour un homme ou pour un « ne préfère pas dire » : refusé ; pour une candidate : accepté. Tous peuvent voter.
  assert.equal(game.vote(players[3].id, players[0].id, game.roundId), 'Choix invalide.');
  assert.equal(game.vote(players[3].id, players[7].id, game.roundId), 'Choix invalide.');
  assert.equal(game.vote(players[0].id, players[4].id, game.roundId), null, 'un homme vote pour une candidate');
  assert.equal(game.vote(players[7].id, players[4].id, game.roundId), null, 'un « ne préfère pas dire » vote aussi');
  assert.equal(game.vote(players[3].id, players[3].id, game.roundId), null, 'une candidate peut se désigner (comme avant)');
});

test('« Qui de nous ? » : question réservée sautée quand le genre compte moins de 3 joueurs ; aucune question réservée si le genre est absent', async () => {
  const { game, players } = await makeGame('qui-de-nous', ['A', 'B', 'C', 'D', 'E']);
  players.forEach((p, i) => (p.gender = i < 2 ? 'f' : 'm')); // 2 femmes, 3 hommes
  const list = [...[1, 2, 3].map((i) => Q('tous', i)), ...[1, 2, 3].map((i) => Q('femme', i)), ...[1, 2, 3].map((i) => Q('homme', i))];
  game.contentPool = () => ({ key: 'test', list });
  const cibles = new Set();
  for (let i = 0; i < 80; i++) {
    const q = game.rules.drawQuestion(game);
    cibles.add(q.cible ?? 'tous');
  }
  assert.ok(!cibles.has('femme'), 'deux femmes seulement : aucune question réservée aux femmes');
  assert.ok(cibles.has('homme') && cibles.has('tous'));
  players.forEach((p) => (p.gender = 'f'));
  const onlyWomen = new Set();
  game.questionMix = new Map();
  for (let i = 0; i < 80; i++) onlyWomen.add(game.rules.drawQuestion(game).cible ?? 'tous');
  assert.ok(!onlyWomen.has('homme'), 'aucun homme : aucune question pour les hommes');
});

test('« Qui me connaît le mieux ? » : la cible est tirée parmi les joueurs du genre voulu, avec le tirage équitable', async () => {
  const { game, players } = await makeGame('qui-me-connait', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  players.forEach((p, i) => (p.gender = i < 4 ? 'm' : i < 6 ? 'f' : 'n'));
  const q = (cible) => ({ niveau: 'chill', question: 'Que fait {cible} le matin ?', choix: ['a', 'b', 'c', 'd'], ...(cible === 'tous' ? {} : { cible }) });
  game.contentPool = () => ({ key: 'test', list: [q('homme')] });
  game.questionMix = new Map([['test', { drawn: 10, reserved: 0, run: 0, byCible: { homme: 0, femme: 0 } }]]);
  game.start();
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    game.question = q('homme');
    game.rules.startRound(game);
    const target = game.players.get(game.roundData.targetId);
    assert.equal(target.gender, 'm', 'une question pour les hommes : la cible est un homme');
    seen.add(target.id);
  }
  assert.equal(seen.size, 4, 'les 4 hommes passent chacun avant que l’un repasse');
});

test('« Qui me connaît le mieux ? » : texte et choix envoyés déjà accordés au genre de la cible, aucun champ visible', async () => {
  const { game, players } = await makeGame('qui-me-connait', ['Léa', 'Hugo', 'Sam', 'Zoé']);
  const entry = { niveau: 'chill', question: 'Que dit {cible} quand {m=il|f=elle|n=$cible} perd ?', choix: ['Rien', '{m=Il|f=Elle|n=Sam} boude', 'Il rit', 'Merde'] };
  entry.choix[2] = 'Rit';
  game.contentPool = () => ({ key: 'test', list: [entry] });
  game.start();
  for (const [gender, expected] of [['f', 'Que dit Léa quand elle perd ?'], ['m', 'Que dit Léa quand il perd ?'], ['n', 'Que dit Léa quand Léa perd ?']]) {
    players[0].gender = gender;
    game.roundData.targetId = players[0].id;
    const round = game.publicState({ host: true }).round;
    assert.equal(round.question, expected);
    assert.ok(!round.choix.join(' ').includes('{'));
  }
  players[0].gender = 'f';
  assert.equal(game.publicState({ host: true }).round.choix[1], 'Elle boude');
});

test('un arrivant tardif, un retrait ou une reconnexion ne changent pas le genre des autres', async () => {
  const { game, players } = await makeGame('qui-de-nous', ['A', 'B', 'C']);
  players.forEach((p, i) => (p.gender = ['m', 'f', 'n'][i]));
  const late = game.upsertPlayer({ name: 'D', gender: 'f', strictGender: true }).player;
  game.connectPlayer(late, 'sd');
  game.removePlayer(players[0].id);
  game.disconnectPlayer(players[1], 's1');
  game.connectPlayer(players[1], 's1b');
  assert.deepEqual(game.publicState({ host: true }).players.map((p) => p.gender), ['f', 'n', 'f']);
});

// ---------- Avec de vrais sockets ----------

test('sockets : « Rejoindre » refuse l’absence de genre, le conserve à la reconnexion et à la modification dans le lobby', async () => {
  const [{ default: http }, { Server }, { io }, { GameStore }, { registerSockets }] = await Promise.all([
    import('node:http'),
    import('socket.io'),
    import('socket.io-client'),
    import('./gameStore.js'),
    import('./sockets.js'),
  ]);
  const server = http.createServer();
  const ioServer = new Server(server);
  registerSockets(ioServer, new GameStore());
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const open = () => {
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    socket.ask = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
    return socket;
  };
  const tv = open();
  const phone = open();
  try {
    const { code } = await tv.ask('host:create', { mode: 'qui-de-nous' });
    const refused = await phone.ask('player:join', { code, name: 'Léa' });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /Choisis/);
    assert.equal((await phone.ask('player:join', { code, name: 'Léa', gender: 'robot' })).ok, false);
    const joined = await phone.ask('player:join', { code, name: 'Léa', gender: 'f' });
    assert.equal(joined.ok, true);
    assert.equal((await phone.ask('player:gender', { gender: 'n' })).ok, true, 'modifiable dans le lobby');
    // Reconnexion par un autre socket avec la même identité : le genre est conservé.
    const again = open();
    const resumed = await again.ask('player:resume', { code, playerId: joined.playerId, secret: joined.secret });
    assert.equal(resumed.ok, true);
    const state = await new Promise((resolve) => {
      tv.on('state', (st) => st.players[0]?.gender === 'm' && resolve(st));
      again.ask('player:gender', { gender: 'm' });
    });
    assert.equal(state.players[0].gender, 'm');
    again.close();
  } finally {
    tv.close();
    phone.close();
    ioServer.close();
    server.close();
  }
});
