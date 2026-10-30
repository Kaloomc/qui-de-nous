// Roulette russe : case piégée uniforme et secrète (parieurs seulement), Passe unique, dernière case, temps écoulé, événements périmés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as RU from './duel/minigames/russe.js';
import { duel } from './duelTestKit.js';

const stateOf = (s, who) => s.game.publicState(who === 'tv' ? { host: true } : { playerId: who }).round.play;
const start = async (opts) => {
  const s = await duel('russe', opts);
  s.tick(RU.ANNOUNCE_MS + 50);
  assert.equal(s.mgState().phase, 'turn');
  return s;
};
const other = (c) => (c === 'rouge' ? 'bleu' : 'rouge');
/** Une case sûre pour le joueur dont c'est le tour, jouée ; on attend le « CLIC ». */
const safePick = (s) => {
  const st = s.mgState();
  const slot = st.taken.findIndex((c, i) => !c && i !== st.trap);
  assert.equal(s.play(st.turn, { slot }), null);
  assert.equal(st.phase, 'beat');
  s.tick(RU.BEAT_MS + 50);
  return slot;
};

test('tirage de la case piégée : uniforme sur 6 cases (6000 tirages), premier joueur équitable', () => {
  const counts = Array(6).fill(0);
  const firsts = { rouge: 0, bleu: 0 };
  for (let seed = 1; seed <= 6000; seed++) {
    const s = RU.default.prepare({ rng: seededRng(seed * 977) });
    counts[s.trap] += 1;
    firsts[s.first] += 1;
  }
  for (const n of counts) assert.ok(n > 850 && n < 1150, `case tirée ${n} fois sur 6000 : ${counts}`);
  assert.ok(firsts.rouge > 2700 && firsts.bleu > 2700, `premier joueur : ${JSON.stringify(firsts)}`);
});

test('manche : annonce du premier joueur, puis tour par tour ; une case sûre se retourne (CLIC) et c’est à l’autre ; la case piégée fait perdre', async () => {
  const s = await duel('russe');
  const st = s.mgState();
  assert.equal(st.phase, 'announce');
  assert.match(s.play(st.first, { slot: 0 }) ?? '', /Pas maintenant/, 'pas de choix pendant l’annonce');
  s.tick(RU.ANNOUNCE_MS + 50);
  assert.equal(st.turn, st.first);
  const first = st.turn;
  safePick(s);
  assert.equal(st.turn, other(first));
  assert.equal(st.taken.filter(Boolean).length, 1);
  const victim = st.turn;
  assert.equal(s.play(victim, { slot: st.trap }), null);
  assert.equal(st.phase, 'splash');
  assert.equal(s.winner(), other(victim), 'le duelliste qui prend la case piégée perd');
});

test('confidentialité : la case piégée n’est dans aucun message vers la TV ni les duellistes avant le SPLASH ; les parieurs qui ont parié la reçoivent', async () => {
  const s = await start({ bets: 2 });
  const [b1, b2, b3] = s.d().bettors;
  const trap = s.mgState().trap;
  const viewers = { tv: 'tv', rouge: s.camp.rouge, bleu: s.camp.bleu, b1, b2, b3 };
  const log = { tv: [], rouge: [], bleu: [], b1: [], b2: [], b3: [] };
  const record = () => {
    for (const [name, who] of Object.entries(viewers)) log[name].push({ raw: JSON.stringify(s.game.publicState(who === 'tv' ? { host: true } : { playerId: who })), play: stateOf(s, who) });
  };
  record();
  for (let i = 0; i < 3; i++) {
    safePick(s);
    record();
  }
  // Pas de case piégée dans l'état : la seule information est « cases déjà prises » (les non piégées jusque-là).
  for (const name of ['tv', 'rouge', 'bleu', 'b3']) {
    for (const e of log[name]) {
      assert.equal(e.play.secret, undefined, `${name} : pas de secret`);
      assert.equal(e.play.trap, undefined);
      assert.equal(e.play.taken[trap], null, `${name} : la case piégée n’est jamais prise avant le SPLASH`);
      assert.equal(/"trap"/.test(e.raw), false, `${name} : aucun champ trap`);
    }
  }
  for (const name of ['b1', 'b2']) for (const e of log[name]) assert.equal(e.play.secret.trap, trap, 'les parieurs voient la case piégée');
  assert.ok(log.b1[0].raw.includes(`"trap":${trap}`));
  // SPLASH : tout le monde la voit.
  const st = s.mgState();
  s.play(st.turn, { slot: trap });
  for (const who of ['tv', s.camp.rouge, s.camp.bleu, b3]) assert.equal(stateOf(s, who).splash.slot, trap);
  assert.equal(JSON.stringify(s.game.publicState({ host: true }).votedIds ?? []).includes('trap'), false);
});

test('Passe : une seule fois par duelliste, elle termine le tour, refusée la deuxième fois', async () => {
  const s = await start();
  const st = s.mgState();
  const first = st.turn;
  assert.equal(s.play(first, { pass: true }), null);
  assert.equal(st.passes[first], 0);
  assert.equal(st.phase, 'beat', 'la Passe termine le tour');
  assert.equal(st.taken.filter(Boolean).length, 0);
  s.tick(RU.BEAT_MS + 50);
  assert.equal(st.turn, other(first));
  safePick(s); // l'autre joue une case
  assert.equal(st.turn, first);
  assert.match(s.play(first, { pass: true }) ?? '', /Plus de Passe/, 'deuxième Passe refusée');
  assert.equal(st.turn, first, 'le tour continue');
});

test('il ne reste que la case piégée : sans Passe on la prend (annonce suspense) ; avec une Passe on peut l’envoyer à l’adversaire', async () => {
  const s = await start();
  const st = s.mgState();
  st.passes = { rouge: 0, bleu: 0 };
  // 5 cases sûres prises à tour de rôle.
  for (let i = 0; i < 5; i++) safePick(s);
  assert.equal(st.phase, 'turn');
  assert.equal(st.forced, true, 'la dernière case est la case piégée, sans Passe');
  assert.equal(stateOf(s, 'tv').forced, true, 'l’écran l’annonce');
  const victim = st.turn;
  s.tick(RU.SUSPENSE_MS + 50);
  assert.equal(st.phase, 'splash');
  assert.equal(s.winner(), other(victim), 'le joueur la prend automatiquement et perd');

  const t = await start();
  const tt = t.mgState();
  const facing = other(tt.first); // après 5 cases sûres, c'est à l'autre que celui qui a commencé
  tt.passes = { [facing]: 1, [other(facing)]: 0 };
  for (let i = 0; i < 5; i++) safePick(t);
  assert.equal(tt.turn, facing);
  assert.equal(tt.forced, false, 'avec une Passe, rien n’est imposé');
  assert.equal(t.play(facing, { pass: true }), null);
  t.tick(RU.BEAT_MS + 50);
  assert.equal(tt.turn, other(facing));
  assert.equal(tt.forced, true, 'l’adversaire sans Passe doit prendre la case piégée');
  t.tick(RU.SUSPENSE_MS + 50);
  assert.equal(t.winner(), facing);
});

test('temps écoulé : le serveur choisit une case libre au hasard', async () => {
  const s = await start();
  const st = s.mgState();
  const who = st.turn;
  s.tick(RU.TURN_MS + 50);
  assert.equal(st.taken.filter(Boolean).length, 1);
  assert.ok(st.taken.includes(who), 'la case est attribuée au joueur qui n’a pas répondu');
  const free = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const x = await start();
    x.tick(RU.TURN_MS + 50);
    free.add(x.mgState().taken.findIndex(Boolean));
  }
  assert.ok(free.size > 1, 'le choix varie');
});

test('deux appuis rapides, clic après la fin du tour, événement périmé, case déjà prise : ignorés', async () => {
  const s = await start();
  const st = s.mgState();
  const who = st.turn;
  const slot = st.taken.findIndex((c, i) => !c && i !== st.trap);
  assert.equal(s.play(who, { slot }), null);
  assert.match(s.play(who, { slot: (slot + 1) % 6 === st.trap ? (slot + 2) % 6 : (slot + 1) % 6 }) ?? '', /Pas maintenant/, 'deuxième appui pendant le CLIC');
  s.tick(RU.BEAT_MS + 50);
  assert.match(s.play(who, { slot: 5 }) ?? '', /Pas ton tour/, 'clic de l’autre tour');
  assert.match(s.play(other(who), { slot, t: 1 }) ?? '', /Trop tard/, 'événement du tour précédent');
  assert.match(s.play(other(who), { slot }) ?? '', /déjà choisie/);
  assert.match(s.play(other(who), { slot: 9 }) ?? '', /invalide/);
  assert.equal(st.taken.filter(Boolean).length, 1, 'rien n’a bougé');
  s.tick(RU.TURN_MS + 50);
  assert.match(s.play(who, { slot: 0 }) ?? '', /Pas maintenant|Pas ton tour|déjà/, 'clic après la fin du tour');
});

test('un seul changement de phase à la fois : aucun minuteur du jeu ne reste après le SPLASH', async () => {
  const s = await start();
  const st = s.mgState();
  s.play(st.turn, { slot: st.trap });
  assert.equal(st.phase, 'splash');
  const before = st.token;
  s.tick(RU.TURN_MS * 3);
  assert.equal(st.token, before, 'aucun minuteur périmé n’a agi');
  assert.equal(st.phase, 'splash');
});
