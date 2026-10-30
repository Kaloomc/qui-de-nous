// Dés menteurs : tirages, relance, égalités, meilleur des 3, absences, confidentialité des dés et des choix (messages vers chaque joueur et vers la TV).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as DES from './duel/minigames/des.js';
import { duel } from './duelTestKit.js';

const BOTH = ['rouge', 'bleu'];
const toDecide = (s) => {
  s.tick(DES.TALK_MS + 50);
  assert.equal(s.mgState().phase, 'decide');
};
/** Joue une manche jusqu'à la révélation avec ces choix. */
const playRound = (s, a = 'garder', b = 'garder') => {
  toDecide(s);
  s.play('rouge', { choice: a });
  s.play('bleu', { choice: b });
  assert.equal(s.mgState().phase, 'locked');
  s.tick(DES.LOCK_MS + 50);
  assert.equal(s.mgState().phase, 'reveal');
};
const next = (s) => s.tick(DES.REVEAL_MS + 50);
const stateOf = (s, who) => s.game.publicState(who === 'tv' ? { host: true } : { playerId: who }).round.play;

test('dés de 1 à 6 par duelliste ; garder conserve le dé ; relancer est un nouveau tirage serveur reproductible avec la graine', async () => {
  const s = await duel('des');
  const { dice } = s.mgState();
  assert.ok(BOTH.every((c) => dice[c] >= 1 && dice[c] <= 6));
  playRound(s, 'garder', 'relancer');
  const { shown } = s.mgState();
  assert.equal(shown.final.rouge, shown.dice.rouge, 'garder conserve le dé');
  assert.ok(shown.final.bleu >= 1 && shown.final.bleu <= 6);
  for (let seed = 1; seed <= 50; seed++) assert.equal(DES.finalDie(3, 'relancer', seededRng(seed)), DES.finalDie(3, 'relancer', seededRng(seed)));
  assert.equal(DES.finalDie(3, 'garder', seededRng(1)), 3);
  const finals = new Set(Array.from({ length: 60 }, (_, i) => DES.finalDie(3, 'relancer', seededRng(i + 1))));
  assert.ok(finals.size > 1 && [...finals].every((v) => v >= 1 && v <= 6), 'une relance peut donner autre chose que l’ancien dé');
});

test('le plus haut dé final gagne la manche ; le premier à 2 manches gagne le duel ; 5 manches au plus', async () => {
  for (let i = 0; i < 20; i++) {
    const s = await duel('des');
    let guard = 0;
    while (!s.winner() && guard++ < 8) {
      playRound(s, i % 2 ? 'relancer' : 'garder', 'garder');
      const { shown } = s.mgState();
      assert.equal(shown.winner, shown.final.rouge === shown.final.bleu ? null : shown.final.rouge > shown.final.bleu ? 'rouge' : 'bleu');
      if (!s.winner()) next(s);
    }
    const { wins, round } = s.mgState();
    assert.ok(round <= DES.MAX_ROUNDS);
    assert.ok(Math.max(wins.rouge, wins.bleu) === DES.WIN_AT || round === DES.MAX_ROUNDS);
    assert.equal(s.winner(), wins.rouge > wins.bleu ? 'rouge' : wins.bleu > wins.rouge ? 'bleu' : 'égalité');
  }
});

test('égalité : manche rejouée avec de nouveaux dés qui ne compte pas ; après 3 égalités de suite, manche sans relance et dés différents', async () => {
  const s = await duel('des');
  const st = s.mgState();
  st.ties = DES.TIES_BEFORE_NO_REROLL - 1;
  // On force une égalité : mêmes dés gardés.
  st.dice = { rouge: 4, bleu: 4 };
  playRound(s);
  assert.equal(st.shown.winner, null);
  assert.deepEqual(st.wins, { rouge: 0, bleu: 0 }, 'une égalité ne compte pas');
  assert.equal(st.ties, DES.TIES_BEFORE_NO_REROLL);
  next(s);
  assert.equal(st.round, 2, 'manche rejouée');
  assert.equal(st.noReroll, true, '3 égalités de suite : sans relance');
  assert.notEqual(st.dice.rouge, st.dice.bleu, 'dés différents');
  assert.equal(stateOf(s, s.camp.rouge).noReroll, true);
  s.tick(DES.TALK_MS + 50);
  assert.equal(st.phase, 'locked', 'pas de décision : on passe directement à l’enregistrement');
  assert.match(s.play('rouge', { choice: 'relancer' }) ?? '', /Pas maintenant/);
  s.tick(DES.LOCK_MS + 50);
  assert.notEqual(st.shown.winner, null, 'la manche sans relance tranche');
  assert.deepEqual(st.shown.choice, { rouge: 'garder', bleu: 'garder' });
});

test('une égalité nouvelle repart avec de nouveaux dés (jamais les mêmes valeurs forcées)', async () => {
  const s = await duel('des');
  const st = s.mgState();
  st.dice = { rouge: 2, bleu: 2 };
  playRound(s);
  next(s);
  assert.equal(st.noReroll, false);
  assert.equal(st.round, 2);
  assert.ok(BOTH.every((c) => st.dice[c] >= 1 && st.dice[c] <= 6));
});

test('pas de choix = garder ; l’absence de « Prêt » n’empêche pas la décision ; « Prêt » des deux passe tout de suite à la décision', async () => {
  const s = await duel('des');
  s.tick(DES.TALK_MS + 50);
  assert.equal(s.mgState().phase, 'decide', 'personne n’a dit Prêt : on passe quand même');
  s.tick(DES.DECIDE_MS + 50);
  assert.equal(s.mgState().phase, 'locked');
  assert.deepEqual(s.mgState().choice, { rouge: 'garder', bleu: 'garder' });
  s.tick(DES.LOCK_MS + 50);
  assert.equal(s.mgState().shown.final.rouge, s.mgState().shown.dice.rouge);
  const t = await duel('des');
  t.play('rouge', { type: 'ready' });
  assert.equal(t.mgState().phase, 'talk');
  t.play('bleu', { type: 'ready' });
  assert.equal(t.mgState().phase, 'decide');
});

test('événements périmés, deuxième choix, mauvaise phase : ignorés', async () => {
  const s = await duel('des');
  assert.match(s.play('rouge', { choice: 'garder' }) ?? '', /Pas maintenant/, 'pas de choix pendant la négociation');
  toDecide(s);
  assert.match(s.play('rouge', { choice: 'garder', round: 9 }) ?? '', /Trop tard/);
  assert.match(s.play('rouge', { choice: 'garder', phase: 'talk' }) ?? '', /Trop tard/);
  assert.match(s.play('rouge', { choice: 'tricher' }) ?? '', /invalide/);
  s.play('rouge', { choice: 'garder' });
  s.play('rouge', { choice: 'relancer' });
  assert.equal(s.mgState().choice.rouge, 'garder', 'le premier choix est définitif');
});

test('confidentialité : chaque dé et chaque choix ne vont qu’aux écrans autorisés, à chaque instant ; reconnexion comprise', async () => {
  const s = await duel('des', { bets: 2 });
  const [b1, b2, b3] = s.d().bettors; // b1 et b2 ont parié, b3 est « sans pari »
  const viewers = { tv: 'tv', rouge: s.camp.rouge, bleu: s.camp.bleu, b1, b2, b3 };
  const log = {};
  const record = (tag) => {
    for (const [name, who] of Object.entries(viewers)) (log[name] ??= []).push({ tag, raw: JSON.stringify(s.game.publicState(who === 'tv' ? { host: true } : { playerId: who })), play: stateOf(s, who) });
  };
  const dice = { ...s.mgState().dice };
  record('talk');
  s.tick(5000);
  record('talk');
  toDecide(s);
  record('decide');
  s.play('rouge', { choice: 'relancer' });
  record('rouge a choisi');
  s.play('bleu', { choice: 'garder' });
  record('locked');
  s.tick(DES.LOCK_MS + 50);
  record('reveal');

  for (const e of log.rouge.filter((x) => x.tag !== 'reveal')) {
    assert.equal(e.play.opponentDie, dice.bleu, 'ROUGE voit le dé de BLEU');
    assert.equal(e.play.secret, undefined);
    assert.equal(e.play.dice, undefined);
  }
  for (const e of log.bleu.filter((x) => x.tag !== 'reveal')) assert.equal(e.play.opponentDie, dice.rouge, 'BLEU voit le dé de ROUGE');
  for (const name of ['tv', 'b3']) {
    for (const e of log[name].filter((x) => x.tag !== 'reveal')) {
      assert.equal(e.play.opponentDie, undefined);
      assert.equal(e.play.secret, undefined, `${name} ne reçoit aucun secret`);
      assert.equal(e.raw.includes('relancer'), false, `${name} ne voit aucun choix avant la révélation`);
    }
  }
  // Le choix de ROUGE : jamais chez BLEU ni les non-parieurs avant la révélation.
  for (const name of ['bleu', 'tv', 'b3']) for (const e of log[name].filter((x) => x.tag !== 'reveal')) assert.equal(JSON.stringify(e.play).includes('relancer'), false);
  assert.equal(log.rouge.find((x) => x.tag === 'rouge a choisi').play.mine, 'relancer', 'ROUGE retrouve son propre choix');
  // Les parieurs : les deux dés dès le début, les choix seulement quand les deux sont enregistrés.
  for (const name of ['b1', 'b2']) {
    for (const e of log[name].filter((x) => x.tag !== 'reveal')) {
      assert.deepEqual(e.play.secret.dice, dice);
      assert.equal(e.play.secret.choices, e.tag === 'locked' ? e.play.secret.choices : null, 'pas de choix avant les deux');
      if (e.tag === 'locked') assert.deepEqual(e.play.secret.choices, { rouge: 'relancer', bleu: 'garder' });
      else assert.equal(e.play.secret.choices, null);
    }
  }
  // Après la révélation, tout est public.
  assert.ok(log.tv.at(-1).play.shown.final);
  // Reconnexion : la vue reconstruite ne contient pas de secret interdit.
  const s2 = await duel('des', { bets: 2 });
  const d2 = { ...s2.mgState().dice };
  s2.game.connectPlayer(s2.game.players.get(s2.camp.rouge), 'nouveau-socket');
  const again = stateOf(s2, s2.camp.rouge);
  assert.equal(again.opponentDie, d2.bleu);
  assert.equal(again.secret, undefined);
  assert.equal(again.dice, undefined);
  assert.equal(stateOf(s2, 'tv').opponentDie, undefined);
});

test('révélation : dé de départ, choix et dé final pour chacun, visibles de tous seulement à ce moment', async () => {
  const s = await duel('des');
  playRound(s, 'garder', 'garder');
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.phase, 'reveal');
    assert.deepEqual(Object.keys(v.shown).sort(), ['choice', 'dice', 'final', 'noReroll', 'round', 'winner']);
  }
});
