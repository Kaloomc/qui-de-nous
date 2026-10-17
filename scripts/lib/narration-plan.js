// Plan de génération des clips du narrateur (pur, testé) : quels clips manquent, ou ont un texte / une voix / des réglages
// différents de ceux de la dernière génération (repéré par un hash). Aucun appel réseau ici.
import { createHash } from 'node:crypto';
import { narrationFile } from '../../shared/narration.js';

/** Tous les clips voulus : [{ id, categorie, file, text }]. */
export function allClips(items) {
  return items.flatMap((item) => item.variantes.map((text, n) => ({ id: item.id, categorie: item.categorie, file: narrationFile(item.id, n), text })));
}

/** Empreinte d'un clip : change dès que le texte, la voix ou les réglages changent. */
export const clipHash = (text, voiceId, config) => createHash('sha1').update(JSON.stringify([text, voiceId, config.model, config.seed, config.settings])).digest('hex').slice(0, 12);

/**
 * Clips à (re)générer. manifest : { clips: { fichier: hash } } de la dernière génération ; exists(file) : le fichier est sur le disque.
 * options : { force, only: [ids] }.
 */
export function planClips(items, manifest, voiceId, config, exists, { force = false, only = null } = {}) {
  const wanted = allClips(items).filter((c) => !only || only.includes(c.id));
  return wanted.filter((c) => force || !exists(c.file) || manifest?.clips?.[c.file] !== clipHash(c.text, voiceId, config));
}

/** Nombre de caractères facturés pour une liste de clips. */
export const characters = (clips) => clips.reduce((sum, c) => sum + c.text.length, 0);
