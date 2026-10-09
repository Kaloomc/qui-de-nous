import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PlayerChip, VoteProgress, allVoted } from '../components.jsx';
import { navigate, request, storage, useConnected, useGameState, useJoinUrl, useOnConnect } from '../lib.js';
import { MODE_LIST, modeOf } from '../modes/index.js';
import { isMuted, setMuted, unlockAudio } from '../sound.js';

export default function Host({ code }) {
  const connected = useConnected();
  const state = useGameState(code);
  const [fatal, setFatal] = useState(null);
  const [error, setError] = useState(null);

  useOnConnect(async () => {
    const hostSecret = storage.get(`qdn:host:${code}`);
    if (!hostSecret) return setFatal('Cet appareil n’est pas l’hôte de cette partie.');
    const res = await request('host:resume', { code, hostSecret });
    if (!res.ok) setFatal(res.error);
  });

  async function act(event, payload) {
    unlockAudio();
    setError(null);
    const res = await request(event, payload);
    if (!res.ok) setError(res.error);
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

  const mode = modeOf(state);
  const endButton = (
    <button className="btn btn-ghost" onClick={() => act('host:end')}>
      Terminer
    </button>
  );

  return (
    <main className={`page host phase-${state.phase} mode-${mode.id}`} onPointerDown={unlockAudio}>
      {!connected && <div className="banner">Connexion perdue, reconnexion…</div>}
      {mode.hasSound && state.phase !== 'lobby' && <SoundToggle />}

      {state.phase === 'lobby' && <Lobby state={state} mode={mode} onStart={() => act('host:start')} onKick={kick} />}

      {state.phase === 'question' && (
        <div className="question">
          <mode.HostQuestion state={state} />
          <VoteProgress state={state} />
          <div className="grid grid-host-small">
            {state.players.map((p) => {
              const voted = state.votedIds.includes(p.id);
              return <PlayerChip key={p.id} player={p} size={72} dim={!voted} badge={voted ? '✓' : null} onRemove={() => kick(p)} />;
            })}
          </div>
          <div className="actions">
            {endButton}
            <button className={`btn btn-primary btn-xl ${allVoted(state) ? 'pulse' : ''}`} onClick={() => act('host:reveal')}>
              Révéler
            </button>
          </div>
        </div>
      )}

      {state.phase === 'results' && (
        <div className="results-screen">
          <mode.HostResults key={state.round.number} state={state} />
          <div className="actions">
            {endButton}
            <button className="btn btn-primary btn-xl" onClick={() => act('host:next')}>
              Question suivante
            </button>
          </div>
        </div>
      )}

      {state.phase === 'ended' && <Ended state={state} mode={mode} onRestart={(m) => act('host:restart', { mode: m })} />}

      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </main>
  );
}

function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted);
  const toggle = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };
  return (
    <button className="sound-toggle" onClick={toggle} aria-pressed={!muted}>
      Son : {muted ? 'coupé' : 'activé'}
    </button>
  );
}

function Lobby({ state, mode, onStart, onKick }) {
  const joinUrl = useJoinUrl(state.code);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 640, margin: 1, color: { dark: '#14102a', light: '#ffffff' } }).then(setQr);
  }, [joinUrl]);

  const count = state.players.length;
  return (
    <div className="lobby">
      <section className="lobby-join">
        <h1 className="logo logo-sm">
          Qui de <span>nous</span> ?
        </h1>
        <p className="mode-pill">
          {mode.label} <span>· {mode.tagline}</span>
        </p>
        <div className="qr">{qr && <img src={qr} alt={`QR code vers ${joinUrl}`} />}</div>
        <p className="join-hint">Scanne pour rejoindre, ou va sur</p>
        <p className="join-url">{joinUrl.replace(/^https?:\/\//, '').replace(/\/join\/.*$/, '')}</p>
        <p className="join-hint">avec le code</p>
        <p className="join-code">{state.code}</p>
      </section>

      <section className="lobby-players">
        <h2>
          {count} joueur{count > 1 ? 's' : ''}
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
        <div className="actions">
          <button className="btn btn-primary btn-xl" onClick={onStart} disabled={count < 2}>
            {count < 2 ? 'Il faut au moins 2 joueurs' : 'Lancer la partie'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Ended({ state, mode, onRestart }) {
  const n = state.round?.number ?? 0;
  const others = MODE_LIST.filter((m) => m.id !== mode.id);
  return (
    <div className="center ended">
      <h1 className="logo">Partie terminée</h1>
      <p className="lead">
        {n > 0 ? `${n} question${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}. ` : ''}
        Merci d’avoir joué !
      </p>
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Accueil
        </button>
        {others.map((m) => (
          <button key={m.id} className="btn btn-secondary btn-xl" onClick={() => onRestart(m.id)}>
            Changer de jeu : {m.label}
          </button>
        ))}
        <button className="btn btn-primary btn-xl" onClick={() => onRestart(mode.id)}>
          Rejouer avec les mêmes joueurs
        </button>
      </div>
    </div>
  );
}
