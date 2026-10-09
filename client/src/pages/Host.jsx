import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Avatar, PieChart, PlayerChip } from '../components.jsx';
import { colorFor, navigate, request, storage, useConnected, useGameState, useJoinUrl, useOnConnect } from '../lib.js';

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

  return (
    <main className={`page host phase-${state.phase}`}>
      {!connected && <div className="banner">Connexion perdue, reconnexion…</div>}
      {state.phase === 'lobby' && <Lobby state={state} onStart={() => act('host:start')} onKick={kick} />}
      {state.phase === 'question' && (
        <Question state={state} onReveal={() => act('host:reveal')} onEnd={() => act('host:end')} onKick={kick} />
      )}
      {state.phase === 'results' && (
        <Results state={state} onNext={() => act('host:next')} onEnd={() => act('host:end')} />
      )}
      {state.phase === 'ended' && <Ended state={state} onRestart={() => act('host:restart')} />}
      {error && <div className="toast" onClick={() => setError(null)}>{error}</div>}
    </main>
  );
}

function Lobby({ state, onStart, onKick }) {
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

function Question({ state, onReveal, onEnd, onKick }) {
  const voted = new Set(state.votedIds);
  const total = state.players.length;
  const done = state.votedIds.filter((id) => state.players.some((p) => p.id === id)).length;
  const allVoted = total > 0 && done >= total;

  return (
    <div className="question">
      <p className="round">Question {state.round.number}</p>
      <h1 key={state.round.number} className="question-text slide-in">
        {state.round.text}
      </h1>

      <div className="vote-progress">
        <div className="vote-count">
          <strong>{done}</strong> / {total} ont voté
        </div>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="grid grid-host-small">
        {state.players.map((p) => (
          <PlayerChip key={p.id} player={p} size={80} dim={!voted.has(p.id)} badge={voted.has(p.id) ? '✓' : null} onRemove={() => onKick(p)} />
        ))}
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onEnd}>
          Terminer
        </button>
        <button className={`btn btn-primary btn-xl ${allVoted ? 'pulse' : ''}`} onClick={onReveal}>
          Révéler les résultats
        </button>
      </div>
    </div>
  );
}

function Results({ state, onNext, onEnd }) {
  const { results } = state;
  const byId = new Map(state.players.map((p, i) => [p.id, { ...p, color: colorFor(i) }]));
  const top = results.topIds.map((id) => byId.get(id)).filter(Boolean);
  const drinkers = results.wrongVoterIds.map((id) => byId.get(id)).filter(Boolean);
  const nonVoters = new Set(results.nonVoterIds);
  const slices = [...byId.values()]
    .map((p) => ({ id: p.id, value: results.counts[p.id] ?? 0, color: p.color, player: p }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="results">
      <p className="round">Question {state.round.number}</p>
      <h2 className="results-question">{state.round.text}</h2>

      <div className="results-main">
        <section className="winner">
          {top.length === 0 ? (
            <p className="big">Personne n’a voté !</p>
          ) : (
            <>
              <p className="winner-label">{top.length > 1 ? 'Égalité !' : 'Le plus voté'}</p>
              <div className="winner-list">
                {top.map((p) => (
                  <div key={p.id} className="winner-card zoom-in">
                    <Avatar player={p} size={top.length > 1 ? 160 : 240} className="winner-avatar" />
                    <p className="winner-name">{p.name}</p>
                  </div>
                ))}
              </div>
              <p className="winner-votes">
                {results.topCount} vote{results.topCount > 1 ? 's' : ''} · {top.length > 1 ? 'ils boivent' : 'boit'} !
              </p>
            </>
          )}
        </section>

        {slices.length > 0 && (
          <section className="chart">
            <PieChart slices={slices} size={320} />
            <ul className="legend">
              {slices.map((s, i) => (
                <li key={s.id} className="fade-up" style={{ animationDelay: `${400 + i * 100}ms` }}>
                  <span className="swatch" style={{ background: s.color }} />
                  <Avatar player={s.player} size={40} />
                  <span className="legend-name">{s.player.name}</span>
                  <span className="legend-value">{s.value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="drinkers">
        <h3>{drinkers.length ? 'N’ont pas voté pour le plus voté : ils boivent aussi' : 'Tout le monde a voté comme la majorité !'}</h3>
        <div className="drinkers-row">
          {drinkers.map((p, i) => (
            <div key={p.id} className="fade-up" style={{ animationDelay: `${900 + i * 80}ms` }}>
              <PlayerChip player={p} size={72} badge={nonVoters.has(p.id) ? 'zzz' : null} />
            </div>
          ))}
        </div>
      </section>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onEnd}>
          Terminer
        </button>
        <button className="btn btn-primary btn-xl" onClick={onNext}>
          Question suivante
        </button>
      </div>
    </div>
  );
}

function Ended({ state, onRestart }) {
  return (
    <div className="center ended">
      <h1 className="logo">Partie terminée</h1>
      <p className="lead">
        {state.round ? `${state.round.number} question${state.round.number > 1 ? 's' : ''} jouée${state.round.number > 1 ? 's' : ''}. ` : ''}
        Merci d’avoir joué !
      </p>
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Accueil
        </button>
        <button className="btn btn-primary btn-xl" onClick={onRestart}>
          Rejouer avec les mêmes joueurs
        </button>
      </div>
    </div>
  );
}
