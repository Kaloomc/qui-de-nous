// Choix du genre (écran « Rejoindre » et lobby du téléphone) : trois boutons, jamais affichés sur la TV.
const OPTIONS = [
  ['m', 'Homme'],
  ['f', 'Femme'],
  ['n', 'Je préfère ne pas dire'],
];

export function GenderPicker({ value, onChange, legend, hint, compact = false }) {
  return (
    <fieldset className={`gender-picker ${compact ? 'is-compact' : ''}`}>
      <legend>{legend}</legend>
      <div className="gender-options" role="radiogroup" aria-label={legend}>
        {OPTIONS.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`gender-option ${value === id ? 'is-selected' : ''}`} onClick={() => onChange(id)}>
            {label}
          </button>
        ))}
      </div>
      {hint && <p className="muted small">{hint}</p>}
    </fieldset>
  );
}
