// Choix du genre (écran « Rejoindre » et lobby du téléphone) : trois grands boutons à icône, jamais affichés sur la TV.
// Le choix ne repose pas que sur la couleur : chaque bouton a son symbole, une coche quand il est sélectionné et un libellé
// pour les lecteurs d'écran (aria-label).
const COLORS = { m: '#4da3ff', f: '#ff5fa2', n: '#a6a3bd' };

export const GENDER_OPTIONS = [
  ['m', 'Homme'],
  ['f', 'Femme'],
  ['n', 'Je préfère ne pas dire'],
];

/** ♂ bleu, ♀ rose, rond gris à trois points (pas le symbole ⚧). */
export function GenderIcon({ id, size = 56 }) {
  const stroke = { stroke: COLORS[id], strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  return (
    <svg className="gender-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {id === 'm' && (
        <>
          <circle cx="26" cy="38" r="15" {...stroke} />
          <path d="M37 27 L53 11 M39 11 H53 V25" {...stroke} />
        </>
      )}
      {id === 'f' && (
        <>
          <circle cx="32" cy="24" r="15" {...stroke} />
          <path d="M32 39 V58 M22 49 H42" {...stroke} />
        </>
      )}
      {id === 'n' && (
        <>
          <circle cx="32" cy="32" r="26" fill={`${COLORS.n}33`} stroke={COLORS.n} strokeWidth="5" />
          <circle cx="20" cy="32" r="3.6" fill={COLORS.n} />
          <circle cx="32" cy="32" r="3.6" fill={COLORS.n} />
          <circle cx="44" cy="32" r="3.6" fill={COLORS.n} />
        </>
      )}
    </svg>
  );
}

export function GenderPicker({ value, onChange, legend, hint, compact = false }) {
  return (
    <fieldset className={`gender-picker ${compact ? 'is-compact' : ''}`}>
      <legend>{legend}</legend>
      <div className="gender-options" role="radiogroup" aria-label={legend}>
        {GENDER_OPTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            aria-label={label}
            title={label}
            data-gender={id}
            className={`gender-option is-${id} ${value === id ? 'is-selected' : ''}`}
            onClick={() => onChange(id)}
          >
            <GenderIcon id={id} size={compact ? 44 : 60} />
            {value === id && (
              <span className="gender-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      {hint && <p className="muted small">{hint}</p>}
    </fieldset>
  );
}
