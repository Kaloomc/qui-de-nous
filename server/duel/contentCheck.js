// Contrôle des fichiers de contenu de la partie 2 du mode Duel (utilisé par `npm run check-duel-content` et par les tests) :
// format, volumes, doublons, sources, cohérence (indices, dates). Chaque fonction renvoie la liste des problèmes.
export const MIN = { vf: 200, qui: 50, chrono: 50, geo: 120 };

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const URL_OK = /^https:\/\/[^\s/]+\.[^\s/]+\/\S+$/;
const sourceOk = (s) => typeof s === 'string' && s.split(' ; ').every((u) => URL_OK.test(u));

function common(list, label, min, push) {
  if (!Array.isArray(list)) {
    push(`${label} : le fichier doit contenir une liste.`);
    return false;
  }
  if (list.length < min) push(`${label} : volume insuffisant (${list.length}, minimum ${min}).`);
  const ids = new Set();
  for (const x of list) {
    if (!x || typeof x.id !== 'string') push(`${label} : entrée sans identifiant.`);
    else if (ids.has(x.id)) push(`${label} ${x.id} : identifiant en double.`);
    else ids.add(x.id);
    if (!sourceOk(x?.source)) push(`${label} ${x?.id} : source (URL https) manquante ou invalide.`);
  }
  return true;
}

export function checkVf(list, min = MIN.vf) {
  const errors = [];
  if (!common(list, 'vrai-faux', min, (m) => errors.push(m))) return errors;
  const seen = new Set();
  for (const x of list) {
    if (typeof x.texte !== 'string' || x.texte.length < 15 || x.texte.length > 150) errors.push(`vrai-faux ${x.id} : texte hors de 15 à 150 caractères.`);
    if (typeof x.vrai !== 'boolean') errors.push(`vrai-faux ${x.id} : « vrai » doit être un booléen.`);
    if (typeof x.explication !== 'string' || !x.explication) errors.push(`vrai-faux ${x.id} : explication manquante.`);
    if (seen.has(norm(x.texte))) errors.push(`vrai-faux ${x.id} : affirmation en double.`);
    seen.add(norm(x.texte));
  }
  return errors;
}

export function checkQui(list, min = MIN.qui) {
  const errors = [];
  if (!common(list, 'qui-suis-je', min, (m) => errors.push(m))) return errors;
  const seen = new Set();
  for (const x of list) {
    if (!Array.isArray(x.indices) || x.indices.length !== 4 || x.indices.some((i) => typeof i !== 'string' || i.length < 10)) errors.push(`qui-suis-je ${x.id} : il faut 4 indices.`);
    if (!Array.isArray(x.choix) || x.choix.length !== 4 || new Set(x.choix.map(norm)).size !== 4) errors.push(`qui-suis-je ${x.id} : il faut 4 choix distincts.`);
    if (!Number.isInteger(x.bonne) || x.bonne < 0 || x.bonne > 3) errors.push(`qui-suis-je ${x.id} : « bonne » invalide.`);
    else if (Array.isArray(x.indices) && x.choix) {
      // Aucun indice ne nomme la réponse.
      const answer = norm(x.choix[x.bonne]).replace(/^(le|la|les|l|un|une) /, '');
      for (const i of x.indices) if (answer.length > 3 && norm(i).includes(answer)) errors.push(`qui-suis-je ${x.id} : un indice nomme la réponse (« ${x.choix[x.bonne]} »).`);
    }
    if (seen.has(norm(x.choix?.[x.bonne]))) errors.push(`qui-suis-je ${x.id} : réponse en double.`);
    seen.add(norm(x.choix?.[x.bonne]));
  }
  return errors;
}

export function checkChrono(list, min = MIN.chrono) {
  const errors = [];
  if (!common(list, 'ordre-chrono', min, (m) => errors.push(m))) return errors;
  const seen = new Set();
  for (const x of list) {
    if (!Array.isArray(x.evenements) || x.evenements.length !== 5) {
      errors.push(`ordre-chrono ${x.id} : il faut 5 événements.`);
      continue;
    }
    const years = x.evenements.map((e) => e.annee);
    if (years.some((y) => !Number.isInteger(y))) errors.push(`ordre-chrono ${x.id} : année invalide.`);
    const sorted = [...years].sort((a, b) => a - b);
    for (let i = 1; i < 5; i++) if (sorted[i] - sorted[i - 1] < 8) errors.push(`ordre-chrono ${x.id} : écart de moins de 8 ans (ordre ambigu).`);
    for (const e of x.evenements) if (/\b(1[0-9]{3}|20[0-9]{2})\b/.test(e.texte)) errors.push(`ordre-chrono ${x.id} : une date apparaît dans le texte (« ${e.texte} »).`);
    const key = x.evenements.map((e) => norm(e.texte)).sort().join('|');
    if (seen.has(key)) errors.push(`ordre-chrono ${x.id} : série en double.`);
    seen.add(key);
  }
  return errors;
}

export function checkGeo(list, min = MIN.geo) {
  const errors = [];
  if (!common(list, 'villes-geo', min, (m) => errors.push(m))) return errors;
  const names = new Set();
  for (const x of list) {
    if (!Number.isFinite(x.lat) || !Number.isFinite(x.lon) || Math.abs(x.lat) > 90 || Math.abs(x.lon) > 180) errors.push(`villes-geo ${x.id} : coordonnées invalides.`);
    if (names.has(x.nom)) errors.push(`villes-geo ${x.id} : nom en double.`);
    names.add(x.nom);
  }
  if (new Set(list.map((x) => x.continent)).size < 5) errors.push('villes-geo : tous les continents doivent être représentés.');
  return errors;
}
