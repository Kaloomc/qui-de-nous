import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { PlayerChip, TimerBar, VoteProgress, allVoted } from '../components.jsx';
import { navigate, request, storage, useConnected, useGameState, useJoinUrl, useOnConnect } from '../lib.js';
import { GAMES, gameById, gameOf, playersLabel } from '../games/index.js';
import { GameIcon, LockIcon, Logo } from '../icons.jsx';
import { Podium, sipsLabel, totalSips } from '../sips.jsx';
import { isMuted, setMuted, sounds, unlockAudio } from '../sound.js';

const RESULTS_CHOICES = [5000, 10000, 15000, 20000];
const VOTE_CHOICES = [0, 15000, 30000, 45000];
const ROUNDS_CHOICES = [0, 10, 20, 30];

export default function Host({ code }) {
  const connected = useConnected();
  const state = useGameState(code);
  const [fatal, setFatal] = useState(null);
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useOnConnect(async () => {
    const hostSecret = storage.get(`qdn:host:${code}`);
    if (!hostSecret) return setFatal('Cet appareil n’est pas l’hôte de cette partie.');
    const res = await request('host:resume', { code, hostSecret });
    if (!res.ok) setFatal(res.error);
  });

  /** Action propre au jeu en cours (« Suivant », « Lancer la roue »…). */
  const gameAct = (action) => act('host:gameAction', { action });

  async function act(event, payload) {
    unlockAudio();
    setError(null);
    const res = await request(event, payload);
    if (!res.ok) setError(res.error);
  }

  function changeSettings(patch) {
    storage.set('qdn:settings', { ...state.settings, ...patch });
    act('host:settings', { settings: patch });
  }

  const kick = (player) => {
    if (window.confirm(`Retirer ${player.name} de la partie ?`)) act('host:kick', { playerId: player.id });
  };

  if (fatal) {
    return (
      <main className="page center">
        <h1>Oups</h1>
        <p className="lead">{fatal}</p>
        <button className="btn btn-primary btn-xl" onClick={() => navigate('/')}>
          Retour à l’accueil
        </button>
      </main>
    );
  }

  if (!state) return <main className="page center muted">Chargement…</main>;

  const mode = gameOf(state);
  const round = state.round?.number;
  const inGame = ['question', 'revealing', 'results'].includes(state.phase);
  const endButton = (
    <button className="btn btn-ghost" onClick={() => act('host:end')}>
      Terminer
    </button>
  );

  return (
    <main className={`page host phase-${state.phase} mode-${mode.id}`} onPointerDown={unlockAudio}>
      {!connected && <div className="banner">Connexion perdue, reconnexion…</div>}
      {inGame && <HostControls state={state} act={act} onSettings={() => setSettingsOpen(true)} onToggleAuto={() => changeSettings({ auto: !state.settings.auto })} />}
      {state.paused && inGame && <div className="paused-banner">Pause</div>}

      {state.phase === 'picking' && <GamePicker state={state} onPick={(id) => act('host:pickGame', { mode: id })} />}

      {state.phase === 'lobby' && (
        <Lobby
          state={state}
          mode={mode}
          onStart={() => act('host:start')}
          onKick={kick}
          onSettings={() => setSettingsOpen(true)}
          onChangeGame={() => act('host:chooseGame')}
        />
      )}

      {state.phase === 'question' && mode.hostLayout === 'custom' && (
        <div className="question">
          <mode.HostQuestion state={state} gameAct={gameAct} />
          <div className="actions">{endButton}</div>
        </div>
      )}

      {state.phase === 'question' && mode.hostLayout !== 'custom' && (
        <div className="question">
          <mode.HostQuestion state={state} />
          <div className="vote-status">
            <VoteProgress state={state} />
            <TimerBar timer={state.voteTimer} state={state}>
              {(s) => (state.waitingForPlayers ? 'En attente de joueurs connectés…' : `Fin du vote dans ${s} s`)}
            </TimerBar>
          </div>
          <div className="grid grid-host-small">
            {state.players.map((p) => {
              const voted = state.votedIds.includes(p.id);
              return (
                <PlayerChip
                  key={p.id}
                  player={p}
                  size={72}
                  dim={!voted}
                  badge={voted ? '✓' : null}
                  caption={sipsLabel(totalSips(state, p.id))}
                  onRemove={() => kick(p)}
                />
              );
            })}
          </div>
          {state.settings.auto && !state.paused && (
            <p className="auto-hint">
              {state.waitingForPlayers ? 'Mode auto en attente : il faut au moins 2 joueurs connectés.' : 'Mode auto : révélation dès que tout le monde a voté.'}
            </p>
          )}
          <div className="actions">
            {endButton}
            <button className={`btn btn-primary btn-xl ${allVoted(state) ? 'pulse' : ''}`} onClick={() => act('host:reveal', { round })}>
              {state.settings.auto ? 'Révéler maintenant' : 'Révéler'}
            </button>
          </div>
        </div>
      )}

      {state.phase === 'revealing' && (
        <div className="results-screen">
          <mode.HostReveal key={round} state={state} gameAct={gameAct} />
        </div>
      )}

      {state.phase === 'results' && (
        <div className="results-screen">
          <mode.HostResults key={round} state={state} gameAct={gameAct} />
          <TimerBar timer={state.pendingTimer} state={state} small>
            {(s) => `Réponse attendue : encore ${s} s`}
          </TimerBar>
          <TimerBar timer={state.nextTimer} state={state} small>
            {(s) => (state.isLastRound ? `Fin de la partie dans ${s} s` : `Question suivante dans ${s} s`)}
          </TimerBar>
          {state.settings.auto && state.waitingForPlayers && <p className="auto-hint">Mode auto en attente : il faut au moins 2 joueurs connectés.</p>}
          <div className="actions">
            {state.isLastRound ? (
              <>
                <button className="btn btn-ghost" onClick={() => act('host:next', { round })}>
                  Encore une question
                </button>
                <button className="btn btn-primary btn-xl" onClick={() => act('host:end')}>
                  Terminer la partie
                </button>
              </>
            ) : (
              <>
                {endButton}
                <button className="btn btn-primary btn-xl" onClick={() => act('host:next', { round })}>
                  Question suivante
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {state.phase === 'ended' && (
        <Ended state={state} mode={mode} onRestart={(m) => act('host:restart', { mode: m })} onChangeGame={() => act('host:chooseGame')} />
      )}

      {settingsOpen && <SettingsModal settings={state.settings} onChange={changeSettings} onClose={() => setSettingsOpen(false)} />}

      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </main>
  );
}

function HostControls({ state, act, onSettings, onToggleAuto }) {
  const [muted, setMutedState] = useState(isMuted);
  const { auto, voteMs } = state.settings;
  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };
  return (
    <div className="host-controls">
      <button className={`ctrl ${auto ? 'ctrl-on' : ''}`} onClick={onToggleAuto} aria-pressed={auto}>
        Auto : {auto ? 'activé' : 'désactivé'}
      </button>
      {(auto || voteMs > 0) && (
        <button className={`ctrl ${state.paused ? 'ctrl-warn' : ''}`} onClick={() => act(state.paused ? 'host:unpause' : 'host:pause')}>
          {state.paused ? 'Reprendre' : 'Pause'}
        </button>
      )}
      <button className="ctrl" onClick={onSettings}>
        Réglages
      </button>
      <button className="ctrl" onClick={toggleSound} aria-pressed={!muted}>
        Son : {muted ? 'coupé' : 'activé'}
      </button>
    </div>
  );
}

const seconds = (ms) => `${ms / 1000} s`;

function settingsSummary(settings) {
  return [
    settings.auto ? `Auto (résultats ${seconds(settings.resultsMs)})` : 'Manuel',
    settings.voteMs ? `vote ${seconds(settings.voteMs)}` : 'vote sans limite',
    settings.maxRounds ? `${settings.maxRounds} questions` : 'questions illimitées',
  ].join(' · ');
}

function Segmented({ label, hint, value, options, onChange, disabled }) {
  return (
    <div className={`setting ${disabled ? 'setting-disabled' : ''}`}>
      <div className="setting-head">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'is-selected' : ''}
            onClick={() => onChange(o.value)}
            disabled={disabled}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsModal({ settings, onChange, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Réglages de la partie" onClick={(e) => e.stopPropagation()}>
        <h2>Réglages de la partie</h2>
        <div className="setting setting-switch">
          <div className="setting-head">
            <strong>Mode auto</strong>
            <small>Révèle dès que tous les joueurs connectés ont voté, puis passe tout seul à la question suivante.</small>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.auto}
            className={`switch ${settings.auto ? 'is-on' : ''}`}
            onClick={() => onChange({ auto: !settings.auto })}
          >
            <span />
          </button>
        </div>
        <Segmented
          label="Affichage des résultats"
          hint="Temps avant la question suivante en mode auto."
          value={settings.resultsMs}
          options={RESULTS_CHOICES.map((v) => ({ value: v, label: seconds(v) }))}
          onChange={(v) => onChange({ resultsMs: v })}
          disabled={!settings.auto}
        />
        <Segmented
          label="Minuteur de vote"
          hint="À zéro, on révèle avec les votes reçus : ceux qui n’ont pas voté boivent."
          value={settings.voteMs}
          options={VOTE_CHOICES.map((v) => ({ value: v, label: v ? seconds(v) : 'Sans limite' }))}
          onChange={(v) => onChange({ voteMs: v })}
        />
        <Segmented
          label="Nombre de questions"
          hint="En mode auto, la partie se termine toute seule après la dernière."
          value={settings.maxRounds}
          options={ROUNDS_CHOICES.map((v) => ({ value: v, label: v ? String(v) : 'Illimité' }))}
          onChange={(v) => onChange({ maxRounds: v })}
        />
        <div className="actions">
          <button className="btn btn-primary btn-xl" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/** Grille des jeux : grandes cartes, navigation au clavier (flèches + Entrée), à la souris ou au tactile. */
function GamePicker({ state, onPick }) {
  const gridRef = useRef(null);
  const cardRefs = useRef({});
  const count = state.players.length;

  useEffect(() => {
    const last = gameById(storage.get('qdn:lastMode'));
    const first = last?.playable ? last : GAMES.find((g) => g.playable);
    cardRefs.current[first.id]?.focus();
  }, []);

  // Écouté sur toute la page : les flèches marchent même si le focus a été perdu (clic à côté, carte « Bientôt »…).
  useEffect(() => {
    function onKeyDown(e) {
      const columns = getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
      if (!step) return;
      e.preventDefault();
      const index = GAMES.findIndex((g) => cardRefs.current[g.id] === document.activeElement);
      if (index < 0) {
        cardRefs.current[GAMES.find((g) => g.playable).id]?.focus();
        return;
      }
      let next = index + step;
      // Les cartes « Bientôt » ne prennent pas le focus : on continue dans la même direction.
      while (next >= 0 && next < GAMES.length && !GAMES[next].playable) next += Math.sign(step);
      if (next >= 0 && next < GAMES.length) cardRefs.current[GAMES[next].id]?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function pick(game) {
    storage.set('qdn:lastMode', game.id);
    onPick(game.id);
  }

  return (
    <div className="picker">
      <Logo size="sm" />
      <h2 className="picker-title">À quoi on joue ?</h2>
      {count > 0 && (
        <p className="lead">
          {count} joueur{count > 1 ? 's' : ''} déjà dans la partie : personne n’a besoin de rescanner.
        </p>
      )}
      <div ref={gridRef} className="game-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            ref={(el) => {
              cardRefs.current[g.id] = el;
            }}
            className={`game-card ${g.playable ? '' : 'is-locked'}`}
            onClick={() => pick(g)}
            disabled={!g.playable}
            aria-label={g.playable ? `${g.name} : ${g.tagline}` : `${g.name} : bientôt disponible`}
          >
            {!g.playable && (
              <span className="game-card-soon">
                <LockIcon /> Bientôt
              </span>
            )}
            <span className="game-card-art">
              <GameIcon icon={g.icon} size={110} />
            </span>
            <strong className="game-card-name">{g.name}</strong>
            <span className="game-card-tagline">{g.tagline}</span>
            <span className="game-card-rule">{g.rule}</span>
            <span className="game-card-players">{playersLabel(g)}</span>
          </button>
        ))}
      </div>
      <p className="picker-hint">Flèches pour choisir, Entrée pour valider.</p>
    </div>
  );
}

function GamePill({ game, onChange }) {
  return (
    <div className="game-pill">
      <GameIcon icon={game.icon} size={56} />
      <div className="game-pill-text">
        <strong>{game.name}</strong>
        <span>{game.rule}</span>
      </div>
      {onChange && (
        <button className="ctrl" onClick={onChange}>
          Changer de jeu
        </button>
      )}
    </div>
  );
}

function Lobby({ state, mode, onStart, onKick, onSettings, onChangeGame }) {
  const joinUrl = useJoinUrl(state.code);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 640, margin: 1, color: { dark: '#14102a', light: '#ffffff' } }).then(setQr);
  }, [joinUrl]);

  const count = state.players.length;
  return (
    <div className="lobby">
      <section className="lobby-join">
        <Logo size="sm" />
        <GamePill game={mode} onChange={onChangeGame} />
        <div className="qr">{qr && <img src={qr} alt={`QR code vers ${joinUrl}`} />}</div>
        <p className="join-hint">Scanne pour rejoindre, ou va sur</p>
        <p className="join-url">{joinUrl.replace(/^https?:\/\//, '').replace(/\/join\/.*$/, '')}</p>
        <p className="join-hint">avec le code</p>
        <p className="join-code">{state.code}</p>
      </section>

      <section className="lobby-players">
        <h2>
          {count} joueur{count > 1 ? 's' : ''} <span className="muted lobby-advice">· {playersLabel(mode)} conseillés</span>
        </h2>
        {count === 0 ? (
          <p className="muted big">En attente des joueurs…</p>
        ) : (
          <div className="grid grid-host">
            {state.players.map((p) => (
              <div key={p.id} className="pop-in">
                <PlayerChip player={p} size={110} onRemove={() => onKick(p)} />
              </div>
            ))}
          </div>
        )}
        <div className="actions lobby-actions">
          <button className="settings-summary" onClick={onSettings}>
            <span>Réglages</span>
            <strong>{settingsSummary(state.settings)}</strong>
            <em>Modifier</em>
          </button>
          <button className="btn btn-primary btn-xl" onClick={onStart} disabled={count < (mode.minToStart ?? 2)}>
            {count < (mode.minToStart ?? 2) ? `Il faut au moins ${mode.minToStart ?? 2} joueurs` : 'Lancer la partie'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Ended({ state, mode, onRestart, onChangeGame }) {
  const n = state.round?.number ?? 0;
  useEffect(() => {
    const id = setTimeout(() => sounds.reveal(), 900);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="center ended">
      <h1 className="logo logo-sm">Partie terminée</h1>
      <p className="lead">
        {mode.name} · {n > 0 ? `${n} question${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}. ` : ''}
        Merci d’avoir joué !
      </p>
      <Podium state={state} />
      {mode.EndStats && <mode.EndStats state={state} />}
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Accueil
        </button>
        <button className="btn btn-secondary btn-xl" onClick={onChangeGame}>
          Changer de jeu
        </button>
        <button className="btn btn-primary btn-xl" onClick={() => onRestart(mode.id)}>
          Rejouer avec les mêmes joueurs
        </button>
      </div>
    </div>
  );
}
