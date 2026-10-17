// Durées du narrateur côté serveur : le serveur attend la fin des phrases (accusé de la TV, sinon durée + 2 s) avant d'enchaîner.
// Les durées mesurées viennent de client/public/narration/durations.json (npm run narration:durations) ; sans mesure, on estime
// à la lecture du texte (60 ms par caractère, 2 s au minimum), comme le repli texte de la TV.
import { readFileSync } from 'node:fs';
import { narrationFile } from '../shared/narration.js';

const read = (rel) => {
  try {
    return JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
  } catch {
    return null;
  }
};
const items = read('./content/narration-loup-garou.json') ?? [];
const measured = read('../client/public/narration/durations.json') ?? {};
const texts = new Map(items.map((i) => [i.id, i.variantes]));

export const GATE_SLACK_MS = 2000;
export const readMs = (text) => Math.max(2000, text.length * 60);

/** Durée de repli (texte seul) d'une phrase : la plus longue de ses variantes. */
export const textMs = (id) => Math.max(2000, ...(texts.get(id) ?? []).map(readMs));

/** Durée la plus longue d'une phrase (mesurée si possible) : borne haute de ce que la TV peut mettre à la dire. */
export function clipMs(id) {
  const n = texts.get(id)?.length ?? 0;
  const ms = Array.from({ length: n }, (_, i) => (measured[narrationFile(id, i)] ?? 0) * 1000).filter(Boolean);
  return ms.length ? Math.max(...ms) : textMs(id);
}

/** Temps après lequel on avance sans accusé : les silences + les phrases + 2 s de marge. */
export const gateMs = (clips) => clips.reduce((sum, c) => sum + (c.after ?? 0) + clipMs(c.id), GATE_SLACK_MS);
