// Mode Duel côté TV : carte en tête de la grille (comme « Mode soirée ») et écran d'options du lobby (clavier ou souris).
import { GameIcon } from '../icons.jsx';

/** Carte « Mode Duel » en haut de la grille des jeux. */
export function DuelCard({ onClick }) {
  return (
    <button className="game-card party-card duel-card" onClick={onClick}>
      <span className="game-card-art">
        <GameIcon icon="duel" size={90} />
      </span>
      <span className="party-card-text">
        <strong className="game-card-name">Mode Duel</strong>
        <span className="game-card-tagline">Deux joueurs s’affrontent dans un mini-jeu, tous les autres parient sur le vainqueur.</span>
      </span>
    </button>
  );
}

const COTES = [
  { id: 'standard', label: 'Standard', rule: 'Le perdant boit 1 gorgée, plus 1 pour 2 paris contre lui (8 au plus).' },
  { id: 'hardcore', label: 'Hardcore', rule: 'Le perdant boit autant de gorgées que de paris contre lui (15 au plus).' },
];

/** Options du mode (lobby) : Roi de la colline, cote, mini-jeux actifs. Le serveur valide chaque réglage. */
export function DuelSetup({ state, gameAct }) {
  const lobby = state.lobby;
  if (!lobby) return null;
  const { options, games } = lobby;
  const active = options.games ?? games.map((g) => g.id);
  const send = (patch) => gameAct({ type: 'config', ...patch });
  const toggle = (id) => {
    const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id];
    if (next.length) send({ games: next });
  };
  return (
    <section className="duel-setup">
      <div className="duel-setup-row">
        <label className="duel-switch">
          <input type="checkbox" checked={options.king} onChange={(e) => send({ king: e.target.checked })} />
          <span>
            <strong>👑 Roi de la colline</strong>
            <small>Le gagnant reste et affronte un nouveau challenger (5 victoires d’affilée au plus).</small>
          </span>
        </label>
      </div>
      <div className="duel-setup-row">
        <strong className="duel-setup-title">Cote</strong>
        <div className="duel-cotes" role="radiogroup" aria-label="Cote">
          {COTES.map((c) => (
            <button key={c.id} role="radio" aria-checked={options.cote === c.id} className={`ctrl ${options.cote === c.id ? 'ctrl-on' : ''}`} onClick={() => send({ cote: c.id })}>
              {c.label}
            </button>
          ))}
        </div>
        <small className="duel-cote-rule">{COTES.find((c) => c.id === options.cote)?.rule}</small>
      </div>
      <div className="duel-setup-row">
        <strong className="duel-setup-title">Mini-jeux</strong>
        <div className="duel-games">
          {games.map((g) => (
            <label key={g.id} className={`duel-game ${active.includes(g.id) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={active.includes(g.id)} onChange={() => toggle(g.id)} />
              <GameIcon icon={g.icon} size={28} />
              <span>{g.name}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
