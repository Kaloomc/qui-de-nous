import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NARRATION_EVENTS, narrationFile } from '../shared/narration.js';
import { ROLES, ROLE_IDS } from './rules/loup.js';
import { allClips, characters, clipHash, planClips } from '../scripts/lib/narration-plan.js';

const items = JSON.parse(readFileSync(new URL('./content/narration-loup-garou.json', import.meta.url), 'utf8'));
const byId = new Map(items.map((i) => [i.id, i]));
const CONFIG = { model: 'm', seed: 1, settings: { stability: 0.5 } };

test('narration : format valide, identifiants uniques, phrases courtes et sans doublon', () => {
  assert.equal(byId.size, items.length, 'identifiant en double');
  const texts = new Set();
  for (const item of items) {
    assert.ok(item.id && item.categorie && Array.isArray(item.variantes) && item.variantes.length > 0, item.id);
    for (const text of item.variantes) {
      assert.ok(typeof text === 'string' && text.trim().length > 10, `${item.id} : texte vide`);
      assert.ok(text.length <= 140, `${item.id} : trop long (${text.length})`);
      assert.ok(!texts.has(text), `phrase en double : ${text}`);
      texts.add(text);
    }
  }
  const total = allClips(items).length;
  assert.ok(total >= 100 && total <= 140, `${total} clips`);
});

test('narration : tous les événements demandés par la TV ont des clips (au moins 3 variantes pour les phrases répétées)', () => {
  const needed = [...NARRATION_EVENTS, ...ROLE_IDS.map((r) => `role_${r}`), ...ROLE_IDS.filter((r) => ROLES[r].phase).flatMap((r) => [`wake_${ROLES[r].phase}`, `sleep_${ROLES[r].phase}`])];
  for (const id of needed) assert.ok(byId.has(id), `clip manquant : ${id}`);
  for (const id of ['intro', 'sleep', 'dawn', 'no_victim', 'victim_one', 'vote_result', 'debate_start', 'gorgee', 'novote']) assert.ok(byId.get(id).variantes.length >= 3, `${id} : peu de variantes`);
  for (const id of ['sleep', 'no_victim']) assert.ok(byId.get(id).variantes.length >= 5, `${id} : 5 variantes au moins`);
});

test('narration : aucun prénom ni texte discriminatoire (phrases neutres en genre)', () => {
  const banned = /\b(moche|handicap|fou|folle|schizo|noir|arabe|juif|pd|gay|trans)\b/i;
  const names = /\b(Ana|Ben|Léa|Tom|Zoé|Hugo|Inès|Yanis|Marie|Jean|Paul|Pierre|Julie|Lucas|Emma)\b/;
  for (const { id, variantes } of items) for (const t of variantes) assert.ok(!banned.test(t) && !names.test(t), `${id} : ${t}`);
});

test('plan de génération : seuls les clips manquants ou modifiés sont refaits, force et only', () => {
  const clips = allClips(items);
  const files = new Set(clips.map((c) => c.file));
  const manifest = { clips: Object.fromEntries(clips.map((c) => [c.file, clipHash(c.text, 'voixA', CONFIG)])) };
  const exists = (f) => files.has(f);
  assert.deepEqual(planClips(items, manifest, 'voixA', CONFIG, exists), [], 'tout est à jour');
  assert.equal(planClips(items, manifest, 'voixB', CONFIG, exists).length, clips.length, 'autre voix : tout refaire');
  assert.equal(planClips(items, manifest, 'voixA', { ...CONFIG, seed: 2 }, exists).length, clips.length, 'autres réglages : tout refaire');
  assert.equal(planClips(items, manifest, 'voixA', CONFIG, (f) => f !== 'intro-1.mp3').length, 1, 'fichier manquant');
  const changed = items.map((i) => (i.id === 'deal' ? { ...i, variantes: ['Un tout nouveau texte pour le premier clip.', ...i.variantes.slice(1)] } : i));
  assert.deepEqual(planClips(changed, manifest, 'voixA', CONFIG, exists).map((c) => c.file), ['deal-1.mp3'], 'texte modifié : ce clip seulement');
  assert.equal(planClips(items, manifest, 'voixA', CONFIG, exists, { force: true }).length, clips.length);
  assert.deepEqual(planClips(items, manifest, 'voixA', CONFIG, exists, { force: true, only: ['intro'] }).map((c) => c.id), Array(5).fill('intro'));
  assert.equal(narrationFile('intro', 0), 'intro-1.mp3');
  assert.ok(characters(clips) > 5000);
});
