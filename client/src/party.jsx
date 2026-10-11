import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Segmented, TimerBar } from './components.jsx';
import { GAMES, gameOf } from './games/index.js';
import { GameIcon } from './icons.jsx';
import { storage, useJoinUrl, useRemaining } from './lib.js';
import { PartyBoard } from './sips.jsx';

// Mode soirée côté écran : le serveur enchaîne les jeux (server/party.js, Game.startParty), la TV ne fait qu'afficher.

const DURATIONS = [
  { value: 30 * 60 * 1000, label: '30 min' },
  { value: 60 * 60 * 1000, label: '1 h' },
  { value: 120 * 60 * 1000, label: '2 h' },
  { value: 0, label: 'Sans fin' },
];

/** Grosse carte en tête de la grille des jeux. */
export function PartyCard({ onClick }) {
  return (
    <button className="game-card party-card" onClick={onClick}>
      <span className="game-card-art">
        <GameIcon icon="shot" size={90} />
      </span>
      <span className="party-card-text">
        <strong className="game-card-name">Mode soirée</strong>
        <span className="game-card-tagline">Un bouton, et Gorgée enchaîne les jeux tout seul. Personne n’a besoin de toucher le PC.</span>
      </span>
    </button>
  );
}

/** Réglages avant de lancer : durée et jeux inclus (tous cochés par défaut). Le mode auto est forcé. */
export function PartySetupModal({ playerCount, onStart, onClose }) {
  const saved = storage.get('qdn:party') ?? {};
  const playable = GAMES.filter((g) => g.playable);
  const [durationMs, setDuration] = useState(DURATIONS.some((d) => d.value === saved.durationMs) ? saved.durationMs : DURATIONS[1].value);
  const [included, setIncluded] = useState(() => new Set(playable.map((g) => g.id).filter((id) => !saved.excluded?.includes(id))));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id) => {
    const next = new Set(included);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIncluded(next);
  };
  const ready = playable.some((g) => included.has(g.id) && playerCount >= (g.minToStart ?? 2));

  async function start() {
    storage.set('qdn:party', { durationMs, excluded: playable.map((g) => g.id).filter((id) => !included.has(id)) });
    setBusy(true);
    const ok = await onStart({ durationMs, games: [...included] });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Mode soirée" onClick={(e) => e.stopPropagation()}>
        <h2>Mode soirée</h2>
        <p className="muted">Gorgée enchaîne 3 à 5 manches par jeu, en alternant les rythmes. Le mode auto reste activé.</p>
        <Segmented label="Durée de la soirée" hint="La manche en cours se termine toujours avant le récap." value={durationMs} options={DURATIONS} onChange={setDuration} />
        <div className="setting">
          <div className="setting-head">
            <strong>Jeux inclus</strong>
            <small>Un jeu qui demande plus de joueurs attend que vous soyez assez nombreux.</small>
          </div>
          <div className="party-games">
            {playable.map((g) => (
              <label key={g.id} className={`party-game ${included.has(g.id) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={included.has(g.id)} onChange={() => toggle(g.id)} />
                <GameIcon icon={g.icon} size={36} />
                <span>{g.name}</span>
                {playerCount < (g.minToStart ?? 2) && <small>{g.minToStart} joueurs min.</small>}
              </label>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary btn-xl" onClick={start} disabled={!ready || busy}>
            {ready ? 'Lancer la soirée' : playerCount < 2 ? 'Il faut au moins 2 joueurs' : 'Coche au moins un jeu jouable'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLeft(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${minutes} min`;
}

function PartyClock({ state }) {
  const remaining = useRemaining(state.party.clock, state, 1000);
  if (!state.party.clock) return <span>sans fin</span>;
  if (state.party.timeUp || remaining === 0) return <span>temps écoulé</span>;
  return <span>encore {formatLeft(remaining)}</span>;
}

/** Barre de l'hôte pendant la soirée : où on en est, et Pause / Jeu suivant / Terminer la soirée. */
export function PartyBar({ state, act }) {
  const { party } = state;
  const mode = gameOf(state);
  const inRound = ['question', 'revealing', 'results'].includes(state.phase);
  let status = null;
  if (party.ending) status = 'Fin de la soirée après cette manche';
  else if (party.skipping) status = 'Jeu suivant après cette manche';
  else if (party.timeUp) status = 'Dernière manche';
  return (
    <div className="party-bar">
      <span className="party-bar-info">
        <strong>Mode soirée</strong> · Jeu {party.gameNumber}
        {inRound && ` · ${mode.name} ${state.round?.number ?? 0}/${party.blockRounds}`} · <PartyClock state={state} />
        {status && <em> · {status}</em>}
      </span>
      <button className={`ctrl ${state.paused ? 'ctrl-warn' : ''}`} onClick={() => act(state.paused ? 'host:unpause' : 'host:pause')}>
        {state.paused ? 'Reprendre' : 'Pause'}
      </button>
      <button className="ctrl" onClick={() => act('host:partySkip')} disabled={party.skipping}>
        Jeu suivant
      </button>
      <button
        className="ctrl"
        onClick={() => {
          if (!party.ending || window.confirm('Terminer la soirée tout de suite, sans attendre la fin de la manche ?')) act('host:partyEnd');
        }}
      >
        {party.ending ? 'Terminer maintenant' : 'Terminer la soirée'}
      </button>
    </div>
  );
}

/** Libellé du minuteur des résultats en soirée. */
export function partyNextLabel(state, mode) {
  const { party } = state;
  if (party.ending || party.timeUp) return 'Fin de la soirée';
  if (party.skipping || (state.round?.number ?? 0) >= party.blockRounds) return 'Jeu suivant';
  return mode.nextLabel ?? 'Question suivante';
}

/** Entre deux jeux : nom, icône, accroche et classement des gorgées, puis le jeu démarre tout seul. */
export function PartyTransition({ state }) {
  const mode = gameOf(state);
  const joinUrl = useJoinUrl(state.code);
  const [qr, setQr] = useState(null);
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 240, margin: 1, color: { dark: '#14102a', light: '#ffffff' } }).then(setQr);
  }, [joinUrl]);

  const waiting = state.party.step === 'waiting';
  return (
    <div className="party-transition">
      {waiting ? (
        <div className="party-transition-game zoom-in">
          <h1>En attente de joueurs…</h1>
          <p className="lead">Il faut assez de joueurs connectés pour le prochain jeu. La soirée reprend dès qu’ils sont là.</p>
        </div>
      ) : (
        <div key={state.party.gameNumber} className="party-transition-game zoom-in">
          <p className="round">Jeu {state.party.gameNumber} · {state.party.blockRounds} manches</p>
          <span className="game-card-art party-transition-art">
            <GameIcon icon={mode.icon} size={150} />
          </span>
          <h1 className="party-transition-name">{mode.name}</h1>
          <p className="lead">{mode.tagline}</p>
          <p className="muted">{mode.rule}</p>
          <TimerBar timer={state.party.transitionTimer} state={state}>
            {(s) => `C’est parti dans ${s} s`}
          </TimerBar>
        </div>
      )}
      <aside className="party-transition-side">
        <PartyBoard state={state} />
        <div className="party-join">
          {qr && <img src={qr} alt="QR code pour rejoindre" />}
          <span>
            En retard ? Code <strong>{state.code}</strong>
          </span>
        </div>
      </aside>
    </div>
  );
}
