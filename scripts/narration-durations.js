// Mesure la durée de chaque clip du narrateur (ffprobe) et l'écrit dans client/public/narration/durations.json ({ fichier: secondes }).
// Le serveur s'en sert pour attendre la fin d'une phrase avant d'enchaîner (garde-fou si la TV n'envoie pas d'accusé).
//   npm run narration:durations     (aussi lancé à la fin de npm run narration)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib/elevenlabs.js';

export function writeDurations() {
  const dir = path.join(ROOT, 'client/public/narration');
  const out = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort()) {
    const raw = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, file)], { encoding: 'utf8' });
    out[file] = Math.round(Number(raw) * 100) / 100;
  }
  fs.writeFileSync(path.join(dir, 'durations.json'), `${JSON.stringify(out, null, 1)}\n`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const d = writeDurations();
  const v = Object.values(d);
  console.log(`${v.length} clips, total ${v.reduce((a, b) => a + b, 0).toFixed(0)} s, plus long ${Math.max(...v)} s`);
}
