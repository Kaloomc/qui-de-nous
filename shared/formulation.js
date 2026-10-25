// Moteur de formulation : accords de genre dans tous les textes (contenu des jeux et interface), côté serveur et côté client.
//
// Syntaxe, dans n'importe quel texte :
//   {cible}                          prénom du sujet (la variable `cible`) ;
//   {de_cible}                       « de Bob » / « d’Alice » (élision) ;
//   {m=il|f=elle|n=cette personne}   accord d'après le genre du sujet par défaut (`cible`) ;
//   {autre:m=il|f=elle|n=cette personne}   accord d'après le genre de la variable `autre` ;
//   dans une forme, $cible donne le prénom : {m=il|f=elle|n=$cible}.
// Les trois formes m, f et n sont obligatoires : n (« Je préfère ne pas dire ») est une vraie reformulation (prénom, « cette
// personne », tournure sans accord), jamais d'écriture inclusive à points. Les genres des joueurs sont 'm', 'f' ou 'n'.
// Un texte sans accord ni variable passe tel quel. Après rendu, aucun champ {...} ne reste (voir stripFields).

export const GENDERS = ['m', 'f', 'n'];
export const isGender = (g) => GENDERS.includes(g);
const genderOf = (subject) => (isGender(subject?.gender) ? subject.gender : 'n');

/** Valeur du champ `cible` d'une question de contenu → genre de joueur. */
export const TARGET_GENDER = { homme: 'm', femme: 'f' };
export const CIBLES = ['homme', 'femme', 'tous'];

const FIELD = /\{([^{}]*)\}/g;
const FORMS = /^(?:([a-z][a-z_]*):)?(.+)$/s;
const VARIABLE = /^(de_)?([a-z][a-z_]*)$/;
const NAME_REF = /\$([a-z][a-z_]*)/g;

/** « de Bob », « d’Alice », « d’Hugo ». */
export const deName = (name) => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`);

function parseForms(body) {
  const forms = {};
  for (const part of body.split('|')) {
    const m = /^([mfn])=(.*)$/s.exec(part);
    if (!m) return null;
    if (m[1] in forms) return null;
    forms[m[1]] = m[2];
  }
  return forms;
}

/** Retire ce qui reste de champs {...} ou d'accolades isolées (filet de sécurité : n'apparaît jamais à l'écran). */
export function stripFields(text) {
  const s = String(text);
  if (!/[{}]/.test(s)) return s;
  return s.replace(FIELD, '').replace(/[{}]/g, '').replace(/ {2,}/g, ' ').trim();
}

/**
 * Rend un texte. `subjects` : variable → { name, gender } (ex. { cible: player }).
 * `defaultSubject` : variable utilisée par les accords sans préfixe.
 */
export function render(template, subjects = {}, { defaultSubject = 'cible' } = {}) {
  if (typeof template !== 'string') return template;
  if (!/[{}]/.test(template)) return template;
  const out = template.replace(FIELD, (whole, inner) => {
    if (inner.includes('=')) {
      const m = FORMS.exec(inner);
      const forms = m ? parseForms(m[2]) : null;
      if (!forms) return '';
      const subject = subjects[m[1] ?? defaultSubject];
      const form = forms[genderOf(subject)] ?? forms.n ?? '';
      return form.replace(NAME_REF, (_, v) => subjects[v]?.name ?? '');
    }
    const v = VARIABLE.exec(inner);
    if (!v) return '';
    const subject = subjects[v[2]];
    if (!subject?.name) return v[2] === 'cible' ? 'quelqu’un' : '';
    return v[1] ? deName(subject.name) : subject.name;
  });
  return stripFields(out);
}

/** Problèmes d'un texte de contenu (liste vide si tout va bien). `variables` : noms de variables autorisés. */
export function validate(template, { variables = ['cible'] } = {}) {
  const problems = [];
  if (typeof template !== 'string') return ['texte manquant'];
  let rest = template;
  for (const [whole, inner] of template.matchAll(FIELD)) {
    rest = rest.replace(whole, '');
    if (inner.includes('=')) {
      const m = FORMS.exec(inner);
      const forms = m ? parseForms(m[2]) : null;
      if (!forms) problems.push(`accord mal formé : ${whole}`);
      else {
        for (const g of GENDERS) if (!(g in forms)) problems.push(`forme ${g === 'n' ? 'neutre (n)' : g} manquante : ${whole}`);
        if (m[1] && !variables.includes(m[1])) problems.push(`variable inconnue ${m[1]} : ${whole}`);
        for (const g of Object.keys(forms)) for (const [, v] of forms[g].matchAll(NAME_REF)) if (!variables.includes(v)) problems.push(`variable inconnue $${v} : ${whole}`);
        if (Object.values(forms).some((f) => f.trim() === '')) problems.push(`forme vide : ${whole}`);
      }
      continue;
    }
    const v = VARIABLE.exec(inner);
    if (!v) problems.push(`champ mal formé : ${whole}`);
    else if (!variables.includes(v[2])) problems.push(`variable inconnue : ${whole}`);
  }
  if (/[{}]/.test(rest)) problems.push('accolade isolée');
  return problems;
}

/** Le texte utilise-t-il au moins un accord ? */
export const hasAgreement = (template) => typeof template === 'string' && [...template.matchAll(FIELD)].some(([, inner]) => inner.includes('='));

/** Genre d'un groupe pour un accord au pluriel : 'f' si toutes sont des femmes, 'm' si tous sont des hommes, sinon 'n'. */
export function groupGender(players) {
  const genders = players.map(genderOf);
  if (!genders.length || genders.includes('n')) return 'n';
  if (genders.every((g) => g === 'f')) return 'f';
  if (genders.every((g) => g === 'm')) return 'm';
  return 'n';
}

/** Un sujet « groupe » pour render() : { name, gender } avec le genre du groupe. */
export const groupSubject = (players, name = '') => ({ name, gender: groupGender(players) });
