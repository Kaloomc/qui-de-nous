// Contrôle du contenu de Culture G éclair (utilisé par `npm run check-culture` et par les tests) :
// format, volume, doublons (questions et réponses), source présente, une seule bonne réponse parmi 4 choix distincts.
export const MIN_VOLUME = 150;

export function checkCulture(list) {
  const errors = [];
  if (!Array.isArray(list)) return ['Le fichier doit contenir une liste.'];
  if (list.length < MIN_VOLUME) errors.push(`Volume insuffisant : ${list.length} questions (minimum ${MIN_VOLUME}).`);
  const ids = new Set();
  const questions = new Set();
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const q of list) {
    const where = q?.id ?? JSON.stringify(q)?.slice(0, 40);
    if (!q || typeof q !== 'object') {
      errors.push(`${where} : entrée invalide.`);
      continue;
    }
    if (typeof q.id !== 'string' || !q.id) errors.push(`${where} : identifiant manquant.`);
    else if (ids.has(q.id)) errors.push(`${where} : identifiant en double.`);
    ids.add(q.id);
    if (typeof q.question !== 'string' || q.question.length < 10 || q.question.length > 140) errors.push(`${where} : question absente ou hors de 10 à 140 caractères.`);
    else if (questions.has(norm(q.question))) errors.push(`${where} : question en double.`);
    questions.add(norm(q.question));
    if (!Array.isArray(q.choix) || q.choix.length !== 4) errors.push(`${where} : il faut 4 choix.`);
    else {
      if (new Set(q.choix.map(norm)).size !== 4) errors.push(`${where} : choix en double.`);
      if (q.choix.some((c) => typeof c !== 'string' || !c.trim() || c.length > 70)) errors.push(`${where} : choix vide ou trop long (70 caractères au plus).`);
    }
    if (!Number.isInteger(q.bonne) || q.bonne < 0 || q.bonne > 3) errors.push(`${where} : « bonne » doit être un entier de 0 à 3.`);
    if (typeof q.categorie !== 'string' || !q.categorie) errors.push(`${where} : catégorie manquante.`);
    if (typeof q.source !== 'string' || !/^https:\/\/[^\s/]+\.[^\s/]+\/\S+$/.test(q.source)) errors.push(`${where} : source (URL https) manquante ou invalide.`);
  }
  return errors;
}
