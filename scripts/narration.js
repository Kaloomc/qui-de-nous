// Génère une seule fois les clips du narrateur du Loup-Garou avec ElevenLabs (même pipeline que Réflexes : scripts/lib/elevenlabs.js).
// Les MP3 sont ensuite commités : pendant les parties, plus besoin d'internet ni de clé.
//
//   npm run narration                       clips manquants ou dont le texte / la voix a changé (hash)
//   npm run narration -- --dry              ne génère rien : nombre de clips et caractères (coût) à générer
//   npm run narration -- --force            tout régénérer
//   npm run narration -- --only intro,sleep seulement ces événements
//
// Texte : server/content/narration-loup-garou.json. Sortie : client/public/narration/ (+ manifest.json).
// Clé : ELEVENLABS_API_KEY dans .env. Voix : LOUP_VOICE_ID (défaut : George, JBFqnCBsd6RMkjVDRZzb, la voix de Réflexes).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, clean, readEnv, requireKey, synthesize } from './lib/elevenlabs.js';
import { allClips, characters, clipHash, planClips } from './lib/narration-plan.js';

/** Voix plus expressive que Réflexes (un narrateur, pas un mot isolé) ; graine fixe pour retrouver la même intonation. */
export const NARRATOR_CONFIG = {
  model: 'eleven_multilingual_v2',
  seed: 5151,
  settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1 },
};
export const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

async function main() {
  readEnv();
  const argv = process.argv.slice(2);
  const opts = { force: argv.includes('--force'), dry: argv.includes('--dry'), only: argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null };
  const voiceId = process.env.LOUP_VOICE_ID || DEFAULT_VOICE;
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/content/narration-loup-garou.json'), 'utf8'));
  const outDir = path.join(ROOT, 'client/public/narration');
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { clips: {} };
  const todo = planClips(items, manifest, voiceId, NARRATOR_CONFIG, (f) => fs.existsSync(path.join(outDir, f)), opts);
  const all = allClips(items);
  console.log(`${all.length} clips au total, ${todo.length} à générer (${characters(todo)} caractères sur ${characters(all)}).`);
  if (opts.dry || todo.length === 0) return;

  const key = requireKey();
  fs.mkdirSync(outDir, { recursive: true });
  const clips = { ...manifest.clips };
  for (const clip of todo) {
    const target = path.join(outDir, clip.file);
    const raw = `${target}.raw.mp3`;
    fs.writeFileSync(raw, await synthesize(clip.text, voiceId, key, NARRATOR_CONFIG));
    clean(raw, target);
    fs.rmSync(raw);
    clips[clip.file] = clipHash(clip.text, voiceId, NARRATOR_CONFIG);
    // Le manifest est écrit au fil de l'eau : une coupure ne fait pas perdre le travail déjà payé.
    fs.writeFileSync(manifestPath, `${JSON.stringify({ voice: voiceId, clips }, null, 2)}\n`);
    console.log(`✓ ${clip.file}  ${clip.text.slice(0, 60)}`);
  }
  console.log(`${todo.length} clip(s) généré(s).`);
}

main().catch((err) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
