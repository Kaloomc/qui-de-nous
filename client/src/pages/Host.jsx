import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { PlayerChip, Segmented, TimerBar, VoteProgress, allVoted } from '../components.jsx';
import { navigate, request, socket, storage, useConnected, useGameState, useJoinUrl, useOnConnect, useStable, useWakeLock } from '../lib.js';
import { GAMES, gameById, gameOf, playersLabel } from '../games/index.js';
import { Credit } from '../credit.jsx';
import { GameIcon, LockIcon, Logo } from '../icons.jsx';
import { PartyBar, PartyCard, PartySetupModal, PartyTransition, partyNextLabel } from '../party.jsx';
import { HostRecap } from '../recap.jsx';
import { preloadNarration } from '../narrator.js';
import { LoupSetup } from '../games/loupSetup.jsx';
import { AdultButton, AdultGateModal, AdultOffButton, AdultTheme } from '../adult.jsx';
import { PartyBoard, Podium, sipsLabel, totalSips } from '../sips.jsx';
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
  const [partySetupOpen, setPartySetupOpen] = useState(false);

  useWakeLock();
  // Loup-Garou : la voix du narrateur se précharge dès le lobby (aucune latence pendant la partie).
  useEffect(() => {
    if (state?.mode === 'loup') preloadNarration();
  }, [state?.mode]);

  useOnConnect(async function resume() {
    const hostSecret = storage.get(`qdn:host:${code}`);
    if (!hostSecret) return setFatal('Cet appareil n’est pas l’hôte de cette partie.');
    const res = await request('host:resume', { code, hostSecret });
    // Réseau lent : on réessaie au lieu de bloquer la TV sur un écran d'erreur.
    if (res.timeout) {
      setTimeout(() => socket.connected && resume(), 2000);
      return;
    }
    setFatal(res.ok ? null : res.error);
  });

  /** Action propre au jeu en cours (« Suivant », « Lancer la roue »…). */
  const gameAct = (action) => act('host:gameAction', { action, roundId: state?.roundId });

  async function act(event, payload) {
    unlockAudio();
    setError(null);
    const res = await request(event, payload);
    if (!res.ok) setError(res.error);
    return res.ok;
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
  // Mode soirée en cours : la barre de la soirée remplace « Terminer » et le bouton du mode auto.
  const party = state.party && state.party.step !== 'over' ? state.party : null;
  const endButton = party ? null : (
    <button className="btn btn-ghost" onClick={() => act('host:end')}>
      Terminer
    </button>
  );

  return (
    <main className={`page host phase-${state.phase} mode-${mode.id} ${state.adult?.active ? 'adult-on' : ''}`} onPointerDown={unlockAudio}>
      {!connected && <div className="banner">Connexion perdue, reconnexion…</div>}
      {party && <PartyBar state={state} act={act} />}
      {inGame && (
        <HostControls state={state} act={act} party={!!party} onSettings={() => setSettingsOpen(true)} onToggleAuto={() => changeSettings({ auto: !state.settings.auto })} />
      )}
      {state.paused && (inGame || party) && <div className="paused-banner">Pause</div>}
      <AdultTheme active={!!state.adult?.active} />
      <AdultOffButton state={state} act={act} />
      <AdultGateModal state={state} act={act} onKick={kick} />

      {state.phase === 'picking' && (
        <GamePicker
          state={state}
          onPick={(id) => act('host:pickGame', { mode: id })}
          onParty={() => setPartySetupOpen(true)}
          onResetSips={() => act('host:resetSips')}
          adultSlot={<AdultButton state={state} act={act} />}
        />
      )}

      {state.phase === 'lobby' && party && <PartyTransition state={state} />}

      {state.phase === 'lobby' && !party && (
        <Lobby
          state={state}
          mode={mode}
          onStart={() => act('host:start')}
          onKick={kick}
          onSettings={() => setSettingsOpen(true)}
          onChangeGame={() => act('host:chooseGame')}
          adultSlot={<AdultButton state={state} act={act} />}
          extra={mode.id === 'loup' ? <LoupSetup state={state} gameAct={gameAct} /> : null}
          blocked={mode.id === 'loup' ? state.lobby?.errors?.[0] : null}
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
            <button className={`btn btn-primary btn-xl ${allVoted(state) ? 'pulse' : ''}`} onClick={() => act('host:reveal', { roundId: state.roundId })}>
              {state.settings.auto ? 'Révéler maintenant' : 'Révéler'}
            </button>
          </div>
        </div>
      )}

      {state.phase === 'revealing' && (
        <div className="results-screen">
          <mode.HostReveal key={state.roundId} state={state} gameAct={gameAct} />
        </div>
      )}

      {state.phase === 'results' && (
        <div className="results-screen">
          <mode.HostResults key={state.roundId} state={state} gameAct={gameAct} />
          <TimerBar timer={state.pendingTimer} state={state} small>
            {(s) => `Réponse attendue : encore ${s} s`}
          </TimerBar>
          <TimerBar timer={state.nextTimer} state={state} small>
            {(s) =>
              party
                ? `${partyNextLabel(state, mode)} dans ${s} s`
                : state.isLastRound
                  ? `Fin de la partie dans ${s} s`
                  : `${mode.nextLabel ?? 'Question suivante'} dans ${s} s`
            }
          </TimerBar>
          {state.settings.auto && state.waitingForPlayers && <p className="auto-hint">Mode auto en attente : il faut au moins 2 joueurs connectés.</p>}
          <div className="actions">
            {state.isLastRound ? (
              <>
                <button className="btn btn-ghost" onClick={() => act('host:next', { roundId: state.roundId })}>
                  {mode.nextLabel ? 'Encore une manche' : 'Encore une question'}
                </button>
                <button className="btn btn-primary btn-xl" onClick={() => act('host:end')}>
                  Terminer la partie
                </button>
              </>
            ) : (
              <>
                {endButton}
                <button className="btn btn-primary btn-xl" onClick={() => act('host:next', { roundId: state.roundId })}>
                  {mode.nextLabel ?? 'Question suivante'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {state.phase === 'ended' && (
        <Ended state={state} mode={mode} onRestart={(m) => act('host:restart', { mode: m })} onChangeGame={() => act('host:chooseGame')} />
      )}

      {partySetupOpen && (
        <PartySetupModal playerCount={state.players.filter((p) => p.connected).length} onStart={(options) => act('host:partyStart', options)} onClose={() => setPartySetupOpen(false)} />
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

function HostControls({ state, act, party, onSettings, onToggleAuto }) {
  const [muted, setMutedState] = useState(isMuted);
  const { auto, voteMs } = state.settings;
  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };
  return (
    <div className="host-controls">
      {!party && (
        <button className={`ctrl ${auto ? 'ctrl-on' : ''}`} onClick={onToggleAuto} aria-pressed={auto}>
          Auto : {auto ? 'activé' : 'désactivé'}
        </button>
      )}
      {!party && (auto || voteMs > 0) && (
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
function GamePicker({ state, onPick, onParty, onResetSips, adultSlot }) {
  const gridRef = useRef(null);
  const cardRefs = useRef({});
  const count = state.players.length;

  useEffect(() => {
    const last = gameById(storage.get('qdn:lastMode'));
    const first = last?.playable ? last : GAMES.find((g) => g.playable);
    // Sans preventScroll, focus() faisait défiler la page jusqu'à la carte du dernier jeu (souvent en 2e ligne) :
    // la grille sautait sous la souris et le clic suivant tombait sur une autre carte (L'Imposteur, en haut à gauche).
    window.scrollTo(0, 0);
    cardRefs.current[first.id]?.focus({ preventScroll: true });
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

  // Un choix à la fois : les cartes restent bloquées jusqu'à la réponse du serveur (qui, lui, applique le dernier choix).
  const [picking, setPicking] = useState(false);
  async function pick(game) {
    if (picking) return;
    storage.set('qdn:lastMode', game.id);
    setPicking(true);
    await onPick(game.id);
    setPicking(false);
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
      <PartyCard onClick={onParty} />
      <div ref={gridRef} className="game-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            ref={(el) => {
              cardRefs.current[g.id] = el;
            }}
            className={`game-card ${g.playable ? '' : 'is-locked'}`}
            onClick={() => pick(g)}
            disabled={!g.playable || picking}
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
      {adultSlot}
      <PartyBoard state={state} onReset={onResetSips} />
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

function Lobby({ state, mode, onStart, onKick, onSettings, onChangeGame, adultSlot, extra, blocked }) {
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
        <Credit />
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
        {extra}
        <div className="actions lobby-actions">
          <button className="settings-summary" onClick={onSettings}>
            <span>Réglages</span>
            <strong>{settingsSummary(state.settings)}</strong>
            <em>Modifier</em>
          </button>
          {adultSlot}
          <button className="btn btn-primary btn-xl" onClick={onStart} disabled={count < (mode.minToStart ?? 2) || !!blocked}>
            {count < (mode.minToStart ?? 2) ? `Il faut au moins ${mode.minToStart ?? 2} joueurs` : blocked ? 'Compo à corriger' : 'Lancer la partie'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Ended({ state, mode, onRestart, onChangeGame }) {
  const n = state.round?.number ?? 0;
  const recap = useStable(state.recap);
  // Fin du mode soirée : le récap s'affiche directement. Sinon, il est à un clic (« Récap de la soirée »).
  const [showRecap, setShowRecap] = useState(state.party?.step === 'over');
  useEffect(() => {
    if (showRecap) return undefined;
    const id = setTimeout(() => sounds.reveal(), 900);
    return () => clearTimeout(id);
  }, [showRecap]);

  if (showRecap && recap) {
    return (
      <HostRecap
        recap={recap}
        code={state.code}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              Accueil
            </button>
            {state.party?.step !== 'over' && (
              <button className="btn btn-ghost" onClick={() => setShowRecap(false)}>
                Retour au podium
              </button>
            )}
            <button className="btn btn-secondary btn-xl" onClick={onChangeGame}>
              Choisir un jeu
            </button>
          </>
        }
      />
    );
  }

  return (
    <div className="center ended">
      <h1 className="logo logo-sm">{state.party?.step === 'over' ? 'Soirée terminée' : 'Partie terminée'}</h1>
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
        <button className="btn btn-ghost" onClick={() => setShowRecap(true)}>
          Récap de la soirée
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
