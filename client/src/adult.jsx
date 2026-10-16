// Mode 18+ côté écrans : bouton de l'hôte, écran d'attente des confirmations (TV), question de l'âge (téléphone).
// Le serveur décide de tout (server/gameStore.js, requestAdult) : le mode ne s'active que si chaque joueur connecté a dit oui.
import { useEffect, useRef, useState } from 'react';
import { Avatar } from './components.jsx';
import { sounds } from './sound.js';

const TRANSITION_MS = 2600;
/** Le thème bascule au milieu de la transition, quand l'écran est noir. */
const SWITCH_AT_MS = 1100;

const applyTheme = (on) => {
  if (on) document.documentElement.dataset.theme = 'after-dark';
  else delete document.documentElement.dataset.theme;
};

/**
 * Thème « after-dark » piloté par l'état de la partie : la TV et tous les téléphones basculent ensemble.
 * À l'arrivée sur la page (reconnexion), le bon thème est posé sans animation ; ensuite, chaque changement
 * passe par la transition (écran noir, battement rouge, « 18+ »).
 */
export function AdultTheme({ active }) {
  const [transition, setTransition] = useState(null);
  const previous = useRef(null);

  useEffect(() => {
    const changed = previous.current !== null && previous.current !== active;
    previous.current = active;
    if (!changed) {
      applyTheme(active);
      return undefined;
    }
    setTransition(active ? 'on' : 'off');
    if (active) sounds.heartbeat();
    const flip = setTimeout(() => applyTheme(active), SWITCH_AT_MS);
    const done = setTimeout(() => setTransition(null), TRANSITION_MS);
    return () => {
      clearTimeout(flip);
      clearTimeout(done);
      applyTheme(active);
    };
  }, [active]);

  // En quittant la partie (accueil, autre partie), on revient au thème normal.
  useEffect(() => () => applyTheme(false), []);

  if (!transition) return null;
  return (
    <div className={`adult-transition adult-transition-${transition}`} aria-hidden="true">
      <span className="adult-transition-mark">{transition === 'on' ? '18+' : 'Mode normal'}</span>
    </div>
  );
}

/** Bouton discret de l'hôte (grille des jeux, lobby) : lance la demande de confirmation. */
export function AdultButton({ state, act }) {
  if (state.adult?.active || state.adult?.pending) return null;
  return (
    <button className="ctrl adult-button" onClick={() => act('host:adultRequest')} title="Contenus sexuels directs, adultes uniquement">
      <FlameIcon /> Mode 18+
    </button>
  );
}

/** Mode actif : retour au mode normal en un clic, bien visible sur la TV (un invité peut arriver à tout moment). */
export function AdultOffButton({ state, act }) {
  if (!state.adult?.active) return null;
  const inRound = ['question', 'revealing', 'results'].includes(state.phase);
  return (
    <button
      className="adult-off"
      onClick={() => (!inRound || window.confirm('Repasser en mode normal ? La manche en cours sera abandonnée.')) && act('host:adultOff')}
    >
      <span className="adult-off-badge">18+</span> Repasser en mode normal
    </button>
  );
}

/** TV : avertissement et suivi des confirmations. L'hôte peut annuler ou retirer ceux qui bloquent. */
export function AdultGateModal({ state, act, onKick }) {
  const adult = state.adult;
  if (!adult?.pending) return null;
  const connected = state.players.filter((p) => p.connected);
  const status = (p) => (adult.confirmedIds.includes(p.id) ? 'yes' : adult.refusedIds.includes(p.id) ? 'no' : 'wait');
  const done = connected.filter((p) => status(p) === 'yes').length;
  return (
    <div className="modal-backdrop adult-backdrop">
      <div className="modal adult-modal" role="dialog" aria-labelledby="adult-title">
        <p className="adult-mark">18+</p>
        <h2 id="adult-title">Mode réservé aux adultes</h2>
        <p className="lead">
          Contenus sexuels directs, pour les 18 ans et plus. <strong>Chaque joueur doit confirmer sur son téléphone.</strong>
        </p>
        <p className="adult-count">
          {done} / {connected.length} ont confirmé
        </p>
        <ul className="adult-list">
          {connected.map((p) => (
            <li key={p.id} className={`adult-row adult-${status(p)}`}>
              <Avatar player={p} size={44} />
              <span className="adult-name">{p.name}</span>
              <span className="adult-status">{{ yes: 'Confirmé', no: 'Pas pour moi', wait: 'En attente…' }[status(p)]}</span>
              {status(p) !== 'yes' && (
                <button className="ctrl" onClick={() => onKick(p)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">Le mode s’active tout seul quand tout le monde a confirmé. Un joueur qui refuse n’est jamais mis dans un jeu 18+.</p>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => act('host:adultCancel')}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/** Téléphone : question de l'âge, pendant la demande de l'hôte ou en arrivant dans une partie déjà en 18+. */
export function AdultConfirm({ state, request, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { answer, gate } = state.adult;

  async function reply(yes) {
    setBusy(true);
    const res = await request('player:adultAnswer', { yes });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.removed) onRemoved();
  }

  return (
    <div className="center adult-confirm">
      <p className="adult-mark">18+</p>
      <h1>Mode 18+</h1>
      <p className="lead">
        {gate ? 'Cette partie est en mode 18+. ' : 'L’hôte veut activer le mode 18+. '}
        Tu confirmes avoir <strong>18 ans ou plus</strong> et être d’accord pour jouer avec des <strong>questions sexuelles explicites</strong> ?
      </p>
      {answer === 'no' && !gate && <p className="adult-refused">Tu as refusé : le mode 18+ ne s’activera pas avec toi dans la partie.</p>}
      {answer === 'yes' ? (
        <p className="adult-waiting">C’est noté. On attend les autres…</p>
      ) : (
        <div className="adult-answers">
          <button className="btn btn-primary btn-xl btn-block" disabled={busy} onClick={() => reply(true)}>
            J’ai 18 ans ou plus, je suis partant(e)
          </button>
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => reply(false)}>
            {gate ? 'Non, pas pour moi (je quitte la partie)' : 'Non, pas pour moi'}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function FlameIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2c1 3.5-1.5 5.2-1.5 7.7 0 1.4 1 2.3 2.1 2.3 1.6 0 2.4-1.5 2-3.7 2.6 1.8 4.4 4.6 4.4 7.6A7 7 0 0 1 12 23a7 7 0 0 1-7-7.1C5 10.4 10.4 7.6 12 2Z" />
    </svg>
  );
}
