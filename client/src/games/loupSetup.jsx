// Composition d'une partie de Loup-Garou (lobby de la TV) : compteurs + / − par rôle, composition conseillée,
// options, avertissements. Le serveur valide (total = joueurs connectés) et bloque le lancement tant que ce n'est pas bon.
import { ROLE_INFO } from './loupRoles.js';

const ORDER = ['loup', 'villageois', 'voyante', 'sorciere', 'chasseur', 'cupidon', 'salvateur', 'ours', 'idiot', 'ancien', 'ivrogne', 'distributeur'];
const UNIQUE = (role) => role !== 'loup' && role !== 'villageois';
const OPTIONS = [
  ['dernieresParoles', 'Dernières paroles des morts'],
  ['rolesMaison', 'Rôles maison (Ivrogne, Distributeur)'],
  ['potionGorgee', 'Potion de gorgée de la Sorcière'],
];

export function LoupSetup({ state, gameAct }) {
  const lobby = state.lobby;
  if (!lobby) return null;
  const { counts, options, players, errors, warnings, custom } = lobby;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const set = (role, delta) => {
    const next = { ...counts, [role]: Math.max(0, (counts[role] ?? 0) + delta) };
    if (UNIQUE(role)) next[role] = Math.min(1, next[role]);
    gameAct({ type: 'config', counts: next, options });
  };
  return (
    <section className="loup-setup">
      <div className="loup-setup-head">
        <h3>
          Composition : {total} rôle{total > 1 ? 's' : ''} pour {players} joueur{players > 1 ? 's' : ''}
        </h3>
        <button className="ctrl" onClick={() => gameAct({ type: 'config', counts: null, options })} disabled={!custom}>
          Composition recommandée
        </button>
      </div>
      <div className="loup-setup-roles">
        {ORDER.map((role) => (
          <div key={role} className={`loup-setup-role ${(counts[role] ?? 0) > 0 ? 'is-on' : ''}`}>
            <span>
              {ROLE_INFO[role].icon} {ROLE_INFO[role].name}
            </span>
            <button className="ctrl" onClick={() => set(role, -1)} disabled={!counts[role]} aria-label={`Un ${ROLE_INFO[role].name} de moins`}>
              −
            </button>
            <strong>{counts[role] ?? 0}</strong>
            <button className="ctrl" onClick={() => set(role, 1)} disabled={UNIQUE(role) && counts[role] >= 1} aria-label={`Un ${ROLE_INFO[role].name} de plus`}>
              +
            </button>
          </div>
        ))}
      </div>
      <div className="loup-setup-options">
        {OPTIONS.map(([key, label]) => (
          <label key={key}>
            <input type="checkbox" checked={!!options[key]} onChange={(e) => gameAct({ type: 'config', options: { ...options, [key]: e.target.checked } })} /> {label}
          </label>
        ))}
      </div>
      {errors.map((e) => (
        <p key={e} className="loup-setup-error">
          ⛔ {e}
        </p>
      ))}
      {warnings.map((w) => (
        <p key={w} className="loup-setup-warning">
          ⚠️ {w}
        </p>
      ))}
    </section>
  );
}
