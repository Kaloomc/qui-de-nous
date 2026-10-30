// Le Crash : distribution du point d'explosion, bornes, valeur banquée côté serveur avec compensation de latence, égalités, confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as CR from './duel/minigames/crash.js';
import { duel } from './duelTestKit.js';

/** Un duel dont le point d'explosion est au moins `min` (tirage répété, la graine change à chaque partie). */
async function duelWith(min, opts) {
  for (let i = 0; i < 200; i++) {
    const s = await duel('crash', opts);
    if (s.mgState().crash >= min) return s;
  }
  throw new Error('pas de tirage assez haut');
}

test('point d’explosion : 10 000 tirages entre 1,10x et 20x, probabilité décroissante', () => {
  const rng = seededRng(42);
  const draws = Array.from({ length: 10000 }, () => CR.drawCrash(rng));
  assert.ok(draws.every((x) => x >= CR.MIN_CRASH && x <= CR.MAX_CRASH));
  const share = (lo, hi) => draws.filter((x) => x >= lo && x < hi).length / draws.length;
  const bands = [share(1.1, 2), share(2, 4), share(4, 8), share(8, 20)];
  assert.ok(bands[0] > 0.4 && bands[0] < 0.6, `bas ${bands[0]}`);
  for (let i = 1; i < bands.length; i++) assert.ok(bands[i] < bands[i - 1], `la part ne décroît pas : ${bands}`);
  assert.ok(draws.some((x) => x === CR.MAX_CRASH) && draws.some((x) => x === CR.MIN_CRASH), 'bornes atteintes');
  assert.ok(draws.filter((x) => x > 10).length < 1300, 'au-dessus de 10x : environ 10 %');
});

test('bornes : au départ 1,00x, 20x atteint en 18 s, fonction croissante et inverse exacte', () => {
  assert.equal(CR.multiplierAt(0), 1);
  assert.ok(Math.abs(CR.multiplierAt(CR.MAX_RUN_MS) - 20) < 1e-9);
  assert.ok(CR.multiplierAt(1000) < CR.multiplierAt(2000));
  assert.ok(CR.multiplierAt(18000) - CR.multiplierAt(17000) > CR.multiplierAt(1000) - CR.multiplierAt(0), 'de plus en plus vite');
  for (const m of [1.1, 2, 7.5, 20]) assert.ok(Math.abs(CR.multiplierAt(CR.timeOf(m)) - m) < 1e-9);
});

test('jeu : banquer avant l’explosion garde la valeur (calculée côté serveur), la plus grande gagne', async () => {
  const s = await duelWith(4);
  const tc = CR.timeOf(s.mgState().crash);
  s.tick(tc * 0.5);
  assert.equal(s.play('rouge', { type: 'bank' }), null);
  s.tick(tc * 0.25);
  s.play('bleu', { type: 'bank' });
  const a = s.mgState().banked.rouge;
  const b = s.mgState().banked.bleu;
  assert.ok(a >= 1 && b > a, 'BLEU a attendu plus longtemps');
  assert.equal(s.game.phase, 'revealing', 'les deux ont banqué : on conclut tout de suite');
  assert.equal(s.winner(), 'bleu');
});

test('jeu : explosé avant de banquer = 0 ; seul le joueur qui a banqué gagne', async () => {
  const s = await duelWith(3);
  s.tick(CR.timeOf(s.mgState().crash) * 0.4);
  s.play('rouge', { type: 'bank' });
  s.tick(CR.GRACE_CAP_MS + CR.timeOf(s.mgState().crash));
  assert.equal(s.winner(), 'rouge');
  assert.equal(s.game.results.details.banked.bleu, 0);
  const t = await duelWith(3);
  t.tick(CR.timeOf(t.mgState().crash) + 1);
  assert.equal(t.play('bleu', { type: 'bank' }), null, 'après l’explosion : plus rien à banquer');
  assert.equal(t.mgState().banked.bleu, undefined);
});

test('latence : un clic arrivé après l’explosion compte s’il a été fait avant (temps compensé) ; une grosse latence ne donne pas d’avantage', async () => {
  const s = await duelWith(3, { latency: true });
  s.game.duelLatency.set(s.camp.rouge, 400);
  s.game.duelLatency.set(s.camp.bleu, 0);
  const tc = CR.timeOf(s.mgState().crash);
  s.tick(tc + 200); // l'explosion est passée de 200 ms
  s.play('rouge', { type: 'bank' }); // vu à tc − 200 : valable
  assert.ok(s.mgState().banked.rouge > 1, 'banque compensée acceptée');
  assert.equal(s.mgState().banked.rouge, Math.floor(CR.multiplierAt(tc + 200 - 400) * 100) / 100);
  s.play('bleu', { type: 'bank' }); // latence nulle : trop tard
  assert.equal(s.mgState().banked.bleu, undefined);
  s.tick(CR.GRACE_CAP_MS);
  assert.equal(s.winner(), 'rouge');
});

test('égalités : 0 contre 0 → on rejoue une fois avec un nouveau point, puis égalité ; même valeur → même règle', async () => {
  const s = await duel('crash');
  const first = s.mgState().crash;
  s.tick(CR.timeOf(first) + CR.GRACE_CAP_MS + 10);
  assert.equal(s.game.phase, 'question');
  assert.equal(s.view('tv').replayed, true);
  s.tick(CR.PAUSE_MS + 10);
  assert.equal(s.mgState().phase, 'run');
  s.tick(CR.timeOf(s.mgState().crash) + CR.GRACE_CAP_MS + 10);
  assert.equal(s.winner(), 'égalité');
  const t = await duelWith(2);
  t.tick(CR.timeOf(t.mgState().crash) * 0.5);
  t.play('rouge', { type: 'bank' });
  t.play('bleu', { type: 'bank' }); // même instant : même valeur
  assert.equal(t.game.phase, 'question', 'même valeur : reprise');
  assert.equal(t.mgState().replayed, true);
});

test('confidentialité : le point d’explosion n’est envoyé à personne avant l’explosion', async () => {
  const s = await duelWith(5);
  const crash = s.mgState().crash;
  s.tick(CR.timeOf(crash) * 0.6);
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.crashed, null);
    assert.equal(JSON.stringify(v).includes(`"crashed":${crash}`), false);
    assert.equal(JSON.stringify(v).includes('"crash"'), false);
  }
  s.tick(CR.timeOf(crash) * 0.5);
  assert.equal(s.view('tv').crashed, crash, 'montré une fois l’explosion passée');
});
