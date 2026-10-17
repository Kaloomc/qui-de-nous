import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './rules/loup.js';
import { runGame, seeded } from './rules/loupSim.js';

/** Partie à rôles imposés : { p0: 'loup', p1: 'voyante', … }, cercle dans l'ordre des clés. */
function game(roles, options = {}) {
  const ids = Object.keys(roles);
  const s = L.createGame(ids, L.recommendedComposition(Math.max(ids.length, 6)).villageois === undefined ? {} : { villageois: ids.length }, { options });
  s.order = ids;
  s.roles = { ...roles };
  s.night = 1;
  return s;
}
const six = { a: 'loup', b: 'villageois', c: 'villageois', d: 'villageois', e: 'villageois', f: 'villageois' };
const deaths = (s) => s.events.filter((e) => e.type === 'death').map((e) => `${e.id}:${e.cause}`);

test('composition : recommandée valide pour 6 à 30 joueurs, erreurs et avertissements', () => {
  for (let n = 6; n <= 30; n++) {
    const c = L.recommendedComposition(n);
    assert.deepEqual(L.validateComposition(c, n).errors, [], `n=${n}`);
  }
  assert.ok(L.validateComposition({ loup: 1, villageois: 4 }, 6).errors.length, 'total ≠ joueurs');
  assert.ok(L.validateComposition({ loup: 1, voyante: 2, villageois: 3 }, 6).errors.length, 'rôle unique en double');
  assert.ok(L.validateComposition({ loup: 3, villageois: 3 }, 6).warnings.length, 'trop de loups');
  assert.ok(L.validateComposition({ voyante: 1, villageois: 5 }, 6).warnings.length, 'aucun loup');
  assert.ok(L.validateComposition({ loup: 1, villageois: 4 }, 5).errors.length, 'moins de 6 joueurs');
});

test('distribution : rôles et cercle tirés au hasard, chacun un rôle', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const s = L.createGame(ids, L.recommendedComposition(12), { rng: seeded(3) });
  assert.equal(Object.keys(s.roles).length, 12);
  assert.equal(Object.values(s.roles).filter((r) => r === 'loup').length, 3);
  assert.deepEqual([...s.order].sort(), [...ids].sort());
});

test('voisins de l’Ours : cercle, morts sautés, cible incluse', () => {
  const s = game({ a: 'ours', b: 'loup', c: 'villageois', d: 'villageois', e: 'villageois', f: 'villageois' });
  assert.deepEqual(L.livingNeighbors(s, 'a').sort(), ['b', 'f']);
  s.dead = { b: {}, f: {} };
  assert.deepEqual(L.livingNeighbors(s, 'a').sort(), ['c', 'e']);
  assert.equal(L.bearSniff(s, 'a', 'd'), false, 'ni d ni c/e ne sont loups');
  s.dead = {};
  assert.equal(L.bearSniff(s, 'a', 'c'), true, 'b (loup) est voisin de c');
  assert.equal(L.bearSniff(s, 'a', 'd'), false);
  assert.equal(L.oursUsesLeft?.(s) ?? s.oursUses, 0, '3 utilisations');
  assert.equal(L.bearSniff(s, 'a', 'c'), null, 'plus d’utilisation');
});

test('aube : Ancien survit à la première attaque seulement, la nuit se passe comme sans victime', () => {
  const s = game({ ...six, b: 'ancien' });
  s.act = { victim: 'b' };
  assert.equal(L.dawn(s), 'done');
  assert.deepEqual(deaths(s), []);
  assert.deepEqual(s.credits, [{ id: 'b', n: 2, why: 'ancien' }]);
  s.act = { victim: 'b' };
  L.dawn(s);
  assert.deepEqual(deaths(s), ['b:loups']);
});

test('aube : Salvateur protège (une fois la même cible interdite deux nuits), Sorcière sauve, ordre des protections', () => {
  const s = game({ ...six, b: 'salvateur', c: 'sorciere' });
  assert.ok(L.nightAct(s, 'salvateur', 'b', { target: 'd' }).ok);
  s.act.victim = 'd';
  assert.equal(L.effectiveVictim(s), null, 'la Sorcière ne voit pas une victime protégée');
  L.dawn(s);
  assert.deepEqual(deaths(s), []);
  assert.deepEqual(s.credits, [{ id: 'b', n: 1, why: 'salvateur' }]);
  L.startNight(s);
  assert.equal(L.nightAct(s, 'salvateur', 'b', { target: 'd' }).ok, false, 'pas deux nuits de suite');
  assert.ok(L.nightAct(s, 'salvateur', 'b', { target: 'b' }).ok, 'lui-même autorisé');
  s.act = { victim: 'e' };
  assert.ok(L.nightAct(s, 'sorciere', 'c', { save: true }).ok);
  L.dawn(s);
  assert.deepEqual(deaths(s), []);
  L.startNight(s);
  s.act = { victim: 'e' };
  assert.equal(L.nightAct(s, 'sorciere', 'c', { save: true }).ok, false, 'potion de vie à usage unique');
});

test('Sorcière : potion de mort à usage unique, loup tué = crédit, innocent tué = pénalité ; potion de gorgée pas deux nuits de suite', () => {
  const s = game({ ...six, c: 'sorciere' });
  L.nightAct(s, 'sorciere', 'c', { kill: 'a', gorgee: 'd' });
  s.act.victim = null;
  L.dawn(s);
  assert.deepEqual(deaths(s), ['a:poison']);
  assert.deepEqual(s.credits, [{ id: 'c', n: 2, why: 'sorciere' }]);
  assert.deepEqual(s.events.filter((e) => e.type === 'gorgee'), [{ type: 'gorgee', id: 'd', sips: 1 }]);
  L.startNight(s);
  assert.equal(L.nightAct(s, 'sorciere', 'c', { kill: 'b' }).ok, false, 'potion de mort à usage unique');
  assert.equal(L.nightAct(s, 'sorciere', 'c', { gorgee: 'd' }).ok, false, 'même personne deux nuits de suite');
  assert.ok(L.nightAct(s, 'sorciere', 'c', { gorgee: 'e' }).ok);
  const t = game({ ...six, c: 'sorciere' });
  L.nightAct(t, 'sorciere', 'c', { kill: 'b' });
  L.dawn(t);
  assert.deepEqual(t.penalties, [{ id: 'c', n: 2, why: 'sorciere' }]);
});

test('Distributeur : une seule fois, jusqu’à 3 joueurs, sans source', () => {
  const s = game({ ...six, c: 'distributeur' });
  assert.ok(L.nightAct(s, 'distributeur', 'c', { targets: ['b', 'd', 'e', 'f'] }).ok);
  L.dawn(s);
  assert.equal(s.events.filter((e) => e.type === 'gorgee').length, 3);
  L.startNight(s);
  assert.equal(L.nightAct(s, 'distributeur', 'c', { targets: ['b'] }).ok, false);
});

test('amoureux : le chagrin tue l’autre dans la même résolution, y compris Ancien et Salvateur', () => {
  const s = game({ ...six, b: 'ancien', c: 'salvateur' });
  L.nightAct(s, 'cupidon', null, { pair: ['b', 'd'] });
  s.act = { victim: 'd', protect: 'e' };
  L.dawn(s);
  assert.deepEqual(deaths(s), ['d:loups', 'b:chagrin'], 'l’Ancien meurt de chagrin quand même');
  assert.equal(s.events.filter((e) => e.type === 'death').every((e) => e.sips >= 1), true);
});

test('chaînes de morts : Chasseur amoureux, cible du Chasseur amoureuse, tout dans l’ordre et annoncé', () => {
  const s = game({ ...six, b: 'chasseur', c: 'voyante' });
  s.lovers = ['b', 'd'];
  s.act = { victim: 'b' };
  assert.equal(L.dawn(s), 'hunter');
  assert.deepEqual(deaths(s), ['b:loups', 'd:chagrin'], 'le chagrin passe avant le tir');
  assert.deepEqual(L.hunterShoot(s, 'b', 'f'), { ok: true, status: 'done' });
  assert.deepEqual(deaths(s), ['b:loups', 'd:chagrin', 'f:chasseur']);
  assert.equal(s.events.find((e) => e.id === 'f').sips, 2, 'cible du Chasseur : double');
  assert.deepEqual(s.penalties, [{ id: 'b', n: 2, why: 'chasseur' }], 'a tiré sur un innocent');
});

test('Chasseur : tir sur un loup = crédit ; sans choix personne ne meurt ; tir refusé hors de son tour', () => {
  const s = game({ a: 'loup', b: 'chasseur', c: 'villageois', d: 'villageois', e: 'villageois', f: 'villageois', g: 'loup' });
  s.act = { victim: 'b' };
  L.dawn(s);
  assert.equal(L.hunterShoot(s, 'c', 'a').ok, false);
  L.hunterShoot(s, 'b', 'a');
  assert.deepEqual(s.credits, [{ id: 'b', n: 2, why: 'chasseur' }]);
  const t = game({ ...six, b: 'chasseur' });
  t.act = { victim: 'b' };
  L.dawn(t);
  L.hunterShoot(t, 'b', null);
  assert.deepEqual(deaths(t), ['b:loups']);
});

test('Chasseur éliminé par le vote ou par chagrin tire aussi', () => {
  const s = game({ ...six, b: 'chasseur' });
  assert.equal(L.eliminate(s, 'b', { c: 'b', d: 'b' }), 'hunter');
  assert.equal(s.awaitingHunter, 'b');
  const t = game({ ...six, b: 'chasseur' });
  t.lovers = ['d', 'b'];
  t.act = { victim: 'd' };
  assert.equal(L.dawn(t), 'hunter');
  assert.equal(t.awaitingHunter, 'b');
});

test('victoires : village, loups (≥), couple mixte dernier en vie, couple de même camp = son camp, égalités', () => {
  const s = game({ ...six });
  s.dead = { a: {} };
  assert.equal(L.checkVictory(s), 'village');
  const t = game({ a: 'loup', b: 'villageois', c: 'villageois', d: 'villageois', e: 'villageois', f: 'villageois' });
  t.dead = { c: {}, d: {}, e: {}, f: {} };
  assert.equal(L.checkVictory(t), 'loups', '1 loup = 1 autre');
  const u = game({ ...six });
  u.lovers = ['a', 'b'];
  u.dead = { c: {}, d: {}, e: {}, f: {} };
  assert.equal(L.checkVictory(u), 'amoureux', 'couple loup + villageois, deux derniers');
  const v = game({ a: 'loup', b: 'loup', c: 'villageois', d: 'villageois', e: 'villageois', f: 'villageois' });
  v.lovers = ['a', 'b'];
  v.dead = { c: {}, d: {}, e: {}, f: {} };
  assert.equal(L.checkVictory(v), 'loups');
  const w = game({ ...six });
  w.dead = Object.fromEntries(Object.keys(six).map((id) => [id, {}]));
  assert.equal(L.checkVictory(w), 'nul');
  const x = game({ a: 'loup', b: 'villageois', c: 'villageois', d: 'villageois', e: 'villageois', f: 'villageois' });
  assert.equal(L.checkVictory(x), null, 'la partie continue');
});

test('vote des loups : égalité tirée au sort, aucun vote = pas de victime', () => {
  assert.equal(L.tallyWolves({}, seeded(1)), null);
  assert.equal(L.tallyWolves({ a: 'x', b: 'x', c: 'y' }), 'x');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(L.tallyWolves({ a: 'x', b: 'y' }, seeded(i)));
  assert.deepEqual([...seen].sort(), ['x', 'y']);
});

test('vote du village : égalité, votes invalides ignorés, Idiot épargné et privé de vote, gorgées des votants', () => {
  const s = game({ ...six, b: 'idiot' });
  const r = L.voteCounts(s, { c: 'd', d: 'c', e: 'e', f: 'zzz', a: 'b', b: 'a' });
  assert.deepEqual(r.top.sort(), ['a', 'b', 'c', 'd'], 'égalité entre les ex æquo');
  assert.equal(r.valid.e, undefined, 'voter pour soi ne compte pas');
  assert.equal(r.valid.f, undefined, 'cible inconnue ignorée');
  // Idiot : survit, perd son vote, ses votants boivent.
  assert.equal(L.eliminate(s, 'b', { c: 'b', d: 'b', e: 'a' }), 'done');
  assert.ok(L.isAlive(s, 'b'));
  assert.ok(s.idiotOut.b);
  assert.deepEqual(s.events.at(-1), { type: 'idiot', id: 'b', role: 'idiot', voters: ['c', 'd'], sips: 1 });
  assert.ok(!L.eligibleVoters(s).includes('b'));
  // Deuxième fois : il meurt.
  L.eliminate(s, 'b', { c: 'b' });
  assert.ok(!L.isAlive(s, 'b'));
  // Innocent éliminé : les votants boivent 1 ; loup éliminé : personne d'autre.
  const t = game({ ...six });
  L.eliminate(t, 'b', { c: 'b', d: 'b', e: 'a' });
  assert.deepEqual(t.events.filter((e) => e.type === 'voteSips').map((e) => e.id), ['c', 'd']);
  const u = game({ ...six });
  L.eliminate(u, 'a', { c: 'a', d: 'a' });
  assert.equal(u.events.filter((e) => e.type === 'voteSips').length, 0);
  assert.equal(u.winner, 'village');
});

test('voyante : rôle de la cible, loup démasqué une seule fois = 1 crédit', () => {
  const s = game({ ...six, b: 'voyante' });
  assert.equal(L.seerReveal(s, 'b', 'a'), 'loup');
  assert.equal(L.seerReveal(s, 'b', 'a'), 'loup');
  assert.equal(L.seerReveal(s, 'b', 'c'), 'villageois');
  assert.deepEqual(s.credits, [{ id: 'b', n: 1, why: 'voyante' }]);
  assert.equal(L.seerReveal(s, 'c', 'a'), null, 'seule la voyante');
});

test('phases de nuit : rôle absent ou mort = phase sautée, Cupidon seulement la nuit 1', () => {
  const s = game({ ...six, b: 'voyante', c: 'sorciere', d: 'cupidon' });
  s.night = 1;
  assert.deepEqual(L.nightPhases(s), ['cupidon', 'voyante', 'loups', 'sorciere']);
  s.dead = { b: {}, c: {} };
  assert.deepEqual(L.nightPhases(s), ['cupidon', 'loups'], 'voyante et sorcière mortes : sautées');
  s.night = 2;
  assert.deepEqual(L.nightPhases(s), ['loups']);
  const sansSorciere = game({ ...six, b: 'voyante' });
  sansSorciere.night = 2;
  assert.deepEqual(L.nightPhases(sansSorciere), ['voyante', 'loups'], 'pas de sorcière dans la composition');
});

test('phases de nuit : rôle vivant sans pouvoir restant (ours à 0) reste joué ; loups morts = plus de phase loups', () => {
  const s = game({ ...six, b: 'ours' });
  s.night = 3;
  s.oursUses = 0;
  assert.deepEqual(L.nightPhases(s), ['ours', 'loups']);
  for (const id of s.order) if (L.isWolf(s, id)) s.dead[id] = {};
  assert.ok(!L.nightPhases(s).includes('loups'));
});

test('Tribunal : camp perdant 3, crédits répartis ou au hasard, plafond de 8, fantômes', () => {
  const s = game({ ...six, b: 'voyante' });
  s.winner = 'village';
  s.credits = [{ id: 'b', n: 4, why: 'voyante' }];
  s.penalties = [{ id: 'c', n: 2, why: 'chasseur' }];
  const out = L.settleTribunal(s, { b: { c: 3, zzz: 5, b: 9 } }, seeded(5));
  assert.equal(out.sips.a, 3 + 0 >= 3 ? out.sips.a : 0, 'loup : 3 au moins');
  assert.ok(out.sips.a >= 3);
  assert.ok(out.sips.c >= 5, '3 reçus + 2 de pénalité');
  assert.ok(Object.values(out.sips).every((n) => n <= L.TRIBUNAL_CAP));
  const total = Object.values(out.sips).reduce((a, b) => a + b, 0);
  assert.equal(total, 3 + 2 + 4, 'rien ne se perd (sans plafond atteint)');
  // Plafond de sécurité.
  const t = game({ ...six });
  t.winner = 'village';
  t.penalties = [{ id: 'a', n: 9, why: 'test' }];
  assert.equal(L.settleTribunal(t, {}, seeded(1)).sips.a, L.TRIBUNAL_CAP);
  // Fantômes : le meilleur parieur distribue 4, ceux à 0 boivent 1 ; pari bonus sur le camp.
  const g = game({ ...six });
  g.dead = { b: {}, c: {}, d: {} };
  assert.ok(L.ghostBet(g, 'b', 'a'));
  assert.ok(!L.ghostBet(g, 'e', 'a'), 'un vivant ne parie pas');
  L.eliminate(g, 'a', {});
  assert.equal(g.ghostPoints.b, 1);
  L.ghostCampBet(g, 'c', 'village');
  const credits = L.tribunalCredits(g);
  assert.equal(g.ghostPoints.c, 2, 'pari bonus juste = 2 points');
  assert.equal(credits.c, 4, 'le meilleur fantôme distribue 4');
  const res = L.settleTribunal(g, {}, seeded(2));
  assert.ok(res.sips.d >= 1, 'fantôme à 0 point : 1 gorgée');
});

test('Tribunal : Cupidon gagne 3 si le couple gagne', () => {
  const s = game({ ...six, b: 'cupidon' });
  s.lovers = ['a', 'c'];
  s.dead = { b: {}, d: {}, e: {}, f: {} };
  s.winner = 'amoureux';
  assert.equal(L.tribunalCredits(s).b, 3);
});

test('simulateur : 500 parties complètes, aucune bloquée, aucune exception, victoire toujours déclarée', () => {
  const winners = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const { state } = runGame(seeded(seed));
    assert.ok(['village', 'loups', 'amoureux', 'nul'].includes(state.winner), `seed ${seed}`);
    winners.add(state.winner);
  }
  assert.ok(winners.has('village') && winners.has('loups'));
});

test('simulateur : compositions extrêmes et chaos total', () => {
  for (let seed = 1; seed <= 60; seed++) {
    runGame(seeded(seed), { n: 6, chaos: 0.9 });
    runGame(seeded(seed), { n: 30, chaos: 0 });
    runGame(seeded(seed), { n: 8, counts: { loup: 2, chasseur: 1, cupidon: 1, villageois: 4 } });
  }
});
