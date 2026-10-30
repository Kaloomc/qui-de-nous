// Corrections après tests réels, étape 1 : carte d'intro avant chaque mini-jeu, bannière « duel annulé » seule, pénalités de temps annoncées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGame } from './testClock.js';
import { DUEL_TIMING } from './games/duel.js';
import { MINIGAMES } from './duel/minigames/index.js';
import { INTROS } from './duel/intros.js';
import { duel } from './duelTestKit.js';

const content = {
  culture: Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, question: `Question ${i} ?`, choix: ['a', 'b', 'c', 'd'], bonne: i % 4 })),
  chrono: JSON.parse(readFileSync(new URL('./content/ordre-chrono-duel.json', import.meta.url), 'utf8')),
};

test('chaque mini-jeu a sa carte d’intro : pictogramme et règle en une phrase', () => {
  for (const id of Object.keys(MINIGAMES)) {
    const [picto, rule] = INTROS[id] ?? [];
    assert.ok(picto && rule, `intro manquante : ${id}`);
    assert.ok(rule.length <= 80, `règle trop longue : ${id}`);
  }
});

test('l’intro suit les « Prêt », dure 4,5 s et ne consomme pas de temps de jeu : le mini-jeu ne démarre qu’à la fin', async () => {
  const ctx = await makeGame('duel', ['A', 'B', 'C', 'D', 'E']);
  ctx.game.duelOptions = { king: false, cote: 'standard', games: ['simon2'] };
  ctx.game.start();
  const d = () => ctx.game.roundData;
  const T = DUEL_TIMING;
  ctx.tick(T.duelistsMs + T.gameMs + T.betsMs + T.betsRevealMs);
  for (const id of [d().red, d().blue]) ctx.game.action(id, { type: 'ready' });
  ctx.tick(T.readyBeatMs);
  assert.equal(d().step, 'intro');
  assert.equal(d().mg, null, 'mini-jeu pas encore préparé');
  const mg = ctx.game.publicState({ host: true }).round.mg;
  assert.deepEqual(mg.intro, INTROS.simon2);
  assert.match(ctx.game.action(d().red, { type: 'play', data: { pad: 1 } }), /Pas maintenant/, 'aucune action pendant l’intro');
  ctx.tick(T.introMs - 1);
  assert.equal(d().step, 'intro');
  ctx.tick(2);
  assert.equal(d().step, 'play');
  const elapsedInGame = ctx.clock.now() - d().startedAt;
  assert.ok(elapsedInGame < 100, 'le chrono du jeu repart de zéro après l’intro');
});

test('« Passer ce duel » : la bannière s’affiche seule 2,8 s puis la roulette du duel suivant ; pas de mini-jeu annoncé pendant la bannière', async () => {
  const { game, clock } = await makeGame('duel', ['A', 'B', 'C', 'D', 'E']);
  game.duelOptions = { king: false, cote: 'standard', games: ['pfc'] };
  game.start();
  game.gameHostAction({ type: 'skip' });
  const d = () => game.roundData;
  assert.equal(d().step, 'notice');
  const round = game.publicState({ host: true }).round;
  assert.equal(round.mg, null);
  assert.equal(round.notice.kind, 'skipped');
  clock.tick(DUEL_TIMING.noticeMs - 1);
  assert.equal(d().step, 'notice');
  clock.tick(2);
  assert.equal(d().step, 'duelists');
});

test('pénalités de temps : chaque mini-jeu concerné retire bien le temps annoncé, la TV voit le compteur d’erreurs', async () => {
  const cases = [
    ['defuse', 3000, (s) => s.play('rouge', { wire: (s.mgState().puzzle.solution + 1) % s.mgState().puzzle.wires.length }), (s) => s.view(s.camp.rouge).blockedUntil, (s) => s.view('tv').wrong.rouge],
    ['culture', 2000, (s) => s.play('rouge', { choice: (s.mgState().q.right + 1) % 4, n: s.mgState().n }), (s) => s.view(s.camp.rouge).blockedUntil, (s) => s.view('tv').wrongs.rouge],
    ['plateau', 2000, (s) => (s.tick(s.mgState().round.scene.durationMs + 400), s.play('rouge', { choice: (s.mgState().round.right + 1) % 4, n: s.mgState().n })), (s) => s.view(s.camp.rouge).blockedUntil, (s) => s.view('tv').wrongs.rouge],
    ['chrono', 3000, (s) => {
      const order = s.mgState().cards.map((c, i) => [c.rank, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      return s.play('rouge', { card: order[2] });
    }, (s) => s.view(s.camp.rouge).blockedUntil, (s) => s.view('tv').wrongs.rouge],
  ];
  for (const [id, ms, wrong, until, count] of cases) {
    const s = await duel(id, { content });
    const info = s.game.publicState({ host: true }).round.mg;
    assert.equal(info.penaltyMs, ms, `${id} : pénalité annoncée`);
    wrong(s);
    assert.equal(until(s) - s.clock.now(), ms, `${id} : blocage de ${ms} ms exactement`);
    assert.equal(count(s), 1, `${id} : compteur d’erreurs vu par la TV`);
    s.tick(ms - 1);
    assert.ok(until(s) > s.clock.now(), `${id} : encore bloqué juste avant la fin`);
    s.tick(2);
    assert.ok(until(s) <= s.clock.now(), `${id} : débloqué après ${ms} ms`);
  }
});

test('Course d’obstacles : les boutons SAUTER et SE BAISSER produisent un saut et une baisse dans la simulation rejouée par le serveur', async () => {
  const R = await import('../shared/runner.js');
  const track = [{ x: 300, kind: 'low' }];
  const jump = (f) => R.simulate(track, [{ f, k: 'j' }], 400);
  assert.ok(R.simulate(track, [], 400).deadAt, 'sans bouton : percuté');
  assert.ok([...Array(80).keys()].some((f) => jump(f).deadAt === null), 'SAUTER à temps : le saut passe l’obstacle');
  const high = [{ x: 300, kind: 'high' }];
  assert.ok(R.simulate(high, [], 400).deadAt, 'debout : percuté par l’obstacle aérien');
  const ducked = R.simulate(high, [{ f: 0, k: 'd1' }], 400);
  assert.equal(ducked.deadAt, null, 'SE BAISSER : passe sous l’obstacle aérien');
  assert.equal(ducked.duck, true);
  assert.equal(R.simulate(high, [{ f: 0, k: 'd1' }, { f: 5, k: 'd0' }], 20).duck, false, 'relâcher le bouton redresse le dino');
  // Côté serveur : les mêmes boutons arrivent comme actions du duelliste et entrent dans les entrées rejouées.
  const s = await duel('course');
  s.tick(300);
  const f = Math.floor(300 / R.DT_MS);
  assert.equal(s.play('rouge', { k: 'j', f }), null);
  assert.equal(s.play('rouge', { k: 'd1', f: f + 20 }), null);
  assert.equal(s.play('rouge', { k: 'd0', f: f + 25 }), null);
  assert.deepEqual(s.mgState().events.rouge.map((e) => e.k), ['j', 'd1', 'd0']);
  const sim = R.simulate(s.mgState().track, s.mgState().events.rouge, f + 10);
  assert.ok(sim.y > 0, 'le saut du bouton SAUTER est bien dans la simulation du serveur');
});

test('Vrai ou Faux : chaque affirmation a une réponse (vrai / faux) et une courte explication ; les affirmations douteuses ont été retirées', () => {
  const vf = JSON.parse(readFileSync(new URL('./content/vrai-faux-duel.json', import.meta.url), 'utf8'));
  assert.ok(vf.length >= 200);
  for (const x of vf) {
    assert.equal(typeof x.vrai, 'boolean', x.id);
    assert.ok(x.explication.length >= 5 && x.explication.length <= 150, `${x.id} : explication de ${x.explication.length} caractères`);
    assert.match(x.texte, /[.?]$/, `${x.id} : phrase complète`);
  }
  const text = vf.map((x) => x.texte).join('\n');
  for (const retired of ['500 espèces de fourmis', 'troisième plus gros consommateur', 'sept nouvelles merveilles', 'un quart de son eau', 'quatre yeux']) assert.equal(text.includes(retired), false, `affirmation douteuse restée : ${retired}`);
  assert.ok(vf.some((x) => /moins de 1 000 espèces de fourmis/.test(x.texte) && !x.vrai && /16 000/.test(x.explication)), 'la version claire sur les fourmis');
});
