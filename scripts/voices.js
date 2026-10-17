// Génère une seule fois les voix de « Réflexes » avec ElevenLabs : un MP3 par mot dans client/public/voix/.
// Les fichiers sont ensuite commités : pendant les parties, plus besoin d'internet ni de clé.
//
//   npm run voices                         mots manquants seulement (lit server/content/words-feu.json)
//   npm run voices -- --force              tout régénérer
//   npm run voices -- --words FEU,FOOT     seulement ces mots
//   npm run voices -- --voice <id> --out <dossier>
// Voix : George (voix par défaut d'ElevenLabs, utilisable avec l'offre gratuite).
//
// Clé : ELEVENLABS_API_KEY dans le fichier .env (jamais commité). Nettoyage du son avec ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { VOICE_EXTRAS, voiceFile } from '../shared/voices.js';
import { ROOT, clean, requireKey, synthesize } from './lib/elevenlabs.js';

/** Réglages communs à tous les mots : même voix, même graine, voix stable pour une intonation identique. */
export const VOICE_CONFIG = {
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
  model: 'eleven_multilingual_v2',
  seed: 4242,
  settings: { stability: 0.85, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1 },
};

/** Texte envoyé : toujours le même modèle (« Foot ! ») pour une attaque franche et le même ton partout. */
const spoken = (word) => {
  const text = `${word.charAt(0)}${word.slice(1).toLowerCase()}`;
  return /[?!]$/.test(text) ? text : `${text} !`;
};

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') out.force = true;
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}

async function main() {
  const key = requireKey();
  const opts = args();
  const { pieges, neutres } = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/content/words-feu.json'), 'utf8'));
  const words = opts.words ? opts.words.split(',').map((w) => w.trim()).filter(Boolean) : [...VOICE_EXTRAS, ...pieges, ...neutres];
  const outDir = path.resolve(ROOT, opts.out ?? 'client/public/voix');
  const voiceId = opts.voice ?? VOICE_CONFIG.voiceId;
  fs.mkdirSync(outDir, { recursive: true });

  let made = 0;
  for (const word of words) {
    const target = path.join(outDir, voiceFile(word));
    if (fs.existsSync(target) && !opts.force) continue;
    const raw = `${target}.raw.mp3`;
    fs.writeFileSync(raw, await synthesize(spoken(word), voiceId, key, VOICE_CONFIG));
    clean(raw, target);
    fs.rmSync(raw);
    made += 1;
    console.log(`✓ ${word} → ${path.relative(ROOT, target)}`);
  }
  // Liste des fichiers disponibles : la TV la lit pour tout précharger.
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.mp3') && !f.includes('.raw.')).sort();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({ voice: voiceId, files }, null, 2)}\n`);
  console.log(`${made} fichier(s) généré(s), ${words.length - made} déjà présent(s).`);
}

main().catch((err) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
