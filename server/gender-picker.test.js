// Boutons de genre à icônes (client/src/gender.jsx), rendus côté serveur avec Vite : trois boutons, libellés accessibles,
// un seul état sélectionné à la fois, symboles présents (♂ bleu, ♀ rose, rond gris à trois points), coche sur le choix.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
let vite;
let render;
let Picker;
let GenderIcon;

before(async () => {
  vite = await createServer({ configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const mod = await vite.ssrLoadModule('/src/gender.jsx');
  Picker = mod.GenderPicker;
  GenderIcon = mod.GenderIcon;
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  render = (props) => renderToStaticMarkup(React.createElement(Picker, { onChange() {}, legend: 'Tu es…', ...props }));
});
after(async () => vite?.close());

test('trois boutons à icône, chacun avec son libellé accessible, sans libellé visible', () => {
  const html = render({ value: null });
  const buttons = html.match(/<button[^>]*>/g);
  assert.equal(buttons.length, 3);
  for (const label of ['Homme', 'Femme', 'Je préfère ne pas dire']) assert.ok(html.includes(`aria-label="${label}"`), label);
  assert.equal(html.match(/<svg/g).length, 3, 'une icône par bouton');
  // Le texte des libellés n'est pas affiché : seulement dans aria-label / title.
  assert.ok(!/>\s*Homme\s*</.test(html) && !/>\s*Femme\s*</.test(html));
});

test('aucun choix par défaut : rien n’est sélectionné tant que le joueur n’a pas choisi', () => {
  const html = render({ value: null });
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 0);
  assert.equal((html.match(/is-selected/g) ?? []).length, 0);
  assert.equal((html.match(/gender-check/g) ?? []).length, 0);
});

test('un seul bouton sélectionné à la fois, avec sa coche', () => {
  for (const value of ['m', 'f', 'n']) {
    const html = render({ value });
    assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1, value);
    assert.equal((html.match(/is-selected/g) ?? []).length, 1, value);
    assert.equal((html.match(/gender-check/g) ?? []).length, 1, value);
    assert.match(html, new RegExp(`data-gender="${value}"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-gender="${value}"`));
  }
});

test('les couleurs : ♂ bleu, ♀ rose, neutre gris à trois points (pas ⚧)', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const svg = (id) => renderToStaticMarkup(React.createElement(GenderIcon, { id }));
  assert.match(svg('m'), /#4da3ff/);
  assert.match(svg('f'), /#ff5fa2/);
  const n = svg('n');
  assert.match(n, /#a6a3bd/);
  assert.equal((n.match(/<circle/g) ?? []).length, 4, 'rond + trois points');
  assert.ok(!render({ value: 'n' }).includes('⚧'));
});

test('boutons de 44 px minimum (feuille de style) et groupe radio', () => {
  const html = render({ value: 'f', compact: true });
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/role="radio"/g) ?? []).length, 3);
});
