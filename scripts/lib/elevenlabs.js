// Pipeline ElevenLabs commun aux voix de « Réflexes » (scripts/voices.js) et du narrateur du Loup-Garou (scripts/narration.js) :
// clé dans .env (jamais commitée), synthèse d'un texte en MP3, nettoyage du son avec ffmpeg (silence coupé, volume harmonisé).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Charge .env (sans écraser les variables déjà définies). */
export function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function requireKey() {
  readEnv();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Ajoute ELEVENLABS_API_KEY=… dans le fichier .env à la racine du projet.');
  return key;
}

/** Texte → MP3 (Buffer). config : { model, seed, settings }. */
export async function synthesize(text, voiceId, key, config) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: config.model, seed: config.seed, voice_settings: config.settings }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Coupe le silence au début et à la fin (le son part pile au bon moment), puis met le pic à -1 dB. */
export function clean(input, output) {
  const trimmed = `${output}.tmp.wav`;
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-af', trim, trimmed]);
  const stats = spawnSync('ffmpeg', ['-i', trimmed, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(stats)?.[1] ?? 0);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', trimmed, '-af', `volume=${(-1 - peak).toFixed(1)}dB`, '-ac', '1', '-b:a', '96k', output]);
  fs.rmSync(trimmed);
}
