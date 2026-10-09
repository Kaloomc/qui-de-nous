import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components.jsx';
import { navigate, request, socket, storage, useConnected, useGameState, useOnConnect } from '../lib.js';
import { modeOf } from '../modes/index.js';
import { fileToSquareJpeg } from '../photo.js';

export default function Player({ code }) {
  const connected = useConnected();
  const state = useGameState(code);
  const identityKey = `qdn:player:${code}`;
  const [identity, setIdentity] = useState(() => storage.get(identityKey));
  const [status, setStatus] = useState(identity ? 'resuming' : 'form');
  const [fatal, setFatal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [myVote, setMyVote] = useState(null);

  function forget(message) {
    storage.remove(identityKey);
    setIdentity(null);
    setStatus('form');
    setNotice(message);
  }

  useOnConnect(async () => {
    const saved = storage.get(identityKey);
    if (!saved) return;
    const res = await request('player:resume', { code, ...saved });
    if (res.ok) {
      setStatus('joined');
      setMyVote(res.myVote ? { round: res.round, choice: res.myVote } : null);
    } else if (res.gone) {
      storage.remove(identityKey);
      setFatal('Cette partie n’existe plus.');
    } else {
      forget(null);
    }
  });

  useEffect(() => {
    const onKicked = () => forget('Tu as été retiré de la partie par l’hôte.');
    socket.on('kicked', onKicked);
    return () => socket.off('kicked', onKicked);
  }, []);

  const round = state?.round?.number ?? null;
  const currentVote = myVote && myVote.round === round ? myVote : null;

  async function join(name, photo) {
    const res = await request('player:join', { code, ...(identity ?? {}), name, photo });
    if (!res.ok) return res.error;
    const next = { playerId: res.playerId, secret: res.secret };
    storage.set(identityKey, next);
    storage.set('qdn:lastName', name);
    if (photo) storage.set('qdn:lastPhoto', photo);
    setIdentity(next);
    setNotice(null);
    setStatus('joined');
    return null;
  }

  async function vote(choice) {
    const previous = myVote;
    setMyVote({ round, choice });
    const res = await request('player:vote', { choice });
    if (!res.ok) {
      setMyVote(previous);
      setNotice(res.error);
    }
  }

  async function leave() {
    if (!window.confirm('Quitter la partie ?')) return;
    await request('player:leave');
    storage.remove(identityKey);
    navigate('/');
  }

  if (fatal) {
    return (
      <main className="page center">
        <h1>Oups</h1>
        <p className="lead">{fatal}</p>
        <button className="btn btn-primary btn-xl" onClick={() => navigate('/')}>
          Accueil
        </button>
      </main>
    );
  }

  const me = state?.players.find((p) => p.id === identity?.playerId);
  const mode = modeOf(state);

  let content;
  if (status === 'form') content = <JoinForm code={code} onJoin={join} notice={notice} />;
  else if (status === 'resuming' || !state || !me) content = <div className="center muted">Connexion à la partie…</div>;
  else if (state.phase === 'lobby') content = <Waiting me={me} state={state} mode={mode} onLeave={leave} />;
  else if (state.phase === 'question') {
    content = currentVote ? (
      <Voted state={state} mode={mode} choice={currentVote.choice} onChange={() => setMyVote(null)} />
    ) : (
      <mode.PlayerVote state={state} me={me} onVote={vote} />
    );
  } else if (state.phase === 'results') content = <Results key={round} state={state} mode={mode} me={me} />;
  else content = <Ended onHome={() => navigate('/')} />;

  return (
    <main className="page player">
      {!connected && <div className="banner">Connexion perdue, reconnexion…</div>}
      {status === 'joined' && notice && (
        <div className="toast" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {content}
    </main>
  );
}

function JoinForm({ code, onJoin, notice }) {
  const [name, setName] = useState(() => storage.get('qdn:lastName') ?? '');
  const [photo, setPhoto] = useState(() => storage.get('qdn:lastPhoto'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto(await fileToSquareJpeg(file));
      setError(null);
    } catch {
      setError('Impossible de lire cette image.');
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const err = await onJoin(name.trim(), photo);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form className="join-form" onSubmit={submit}>
      <p className="round">Partie {code}</p>
      <h1>Qui es-tu ?</h1>

      <button type="button" className="photo-picker" onClick={() => cameraInput.current?.click()} aria-label="Prendre un selfie">
        {photo ? <img src={photo} alt="Ta photo" /> : <span>Ajoute ta tête</span>}
      </button>
      <div className="photo-buttons">
        <button type="button" className="btn btn-secondary" onClick={() => cameraInput.current?.click()}>
          Selfie
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => galleryInput.current?.click()}>
          Galerie
        </button>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} />

      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ton prénom"
        maxLength={20}
        autoComplete="given-name"
        enterKeyHint="go"
      />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-xl btn-block" disabled={busy || !name.trim()}>
        {busy ? 'Connexion…' : 'Rejoindre la partie'}
      </button>
      {!photo && <p className="muted small">Sans photo, on affichera ton initiale.</p>}
    </form>
  );
}

function Waiting({ me, state, mode, onLeave }) {
  return (
    <div className="center waiting">
      <Avatar player={me} size={160} className="bounce" />
      <h1>C’est bon, {me.name} !</h1>
      <p className="mode-pill">
        {mode.label} <span>· {mode.tagline}</span>
      </p>
      <p className="lead">
        {state.players.length} joueur{state.players.length > 1 ? 's' : ''} dans la partie.
        <br />
        Regarde l’écran, ça va bientôt commencer.
      </p>
      <button className="btn btn-ghost small" onClick={onLeave}>
        Quitter la partie
      </button>
    </div>
  );
}

function Voted({ state, mode, choice, onChange }) {
  const done = state.votedIds.length;
  return (
    <div className="center voted">
      <p className="round">Question {state.round.number}</p>
      <div className="check pop-in">✓</div>
      <h1>Vote enregistré</h1>
      <mode.VoteSummary state={state} choice={choice} />
      <p className="lead">
        {mode.waitingText} ({done}/{state.players.length})
      </p>
      <button className="btn btn-ghost" onClick={onChange}>
        Changer mon vote
      </button>
    </div>
  );
}

/** Attend la fin de l'animation de la TV avant d'afficher le verdict, pour ne rien spoiler. */
function Results({ state, mode, me }) {
  const [ready, setReady] = useState(mode.revealDelayMs === 0);
  useEffect(() => {
    if (mode.revealDelayMs === 0) return undefined;
    const timer = setTimeout(() => setReady(true), mode.revealDelayMs);
    return () => clearTimeout(timer);
  }, [mode]);

  if (!ready) {
    return (
      <div className="center suspense">
        <div className="suspense-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1>Suspense…</h1>
        <p className="lead">Les yeux sur l’écran !</p>
      </div>
    );
  }

  const { drinks, title, detail, extra } = mode.verdict(state, me);
  return (
    <div className={`verdict ${drinks ? 'verdict-drink' : 'verdict-safe'}`}>
      <p className="verdict-title zoom-in">{title}</p>
      <p className="verdict-detail">{detail}</p>
      {extra && <p className="verdict-top">{extra}</p>}
      <p className="muted small">Regarde l’écran pour les résultats.</p>
    </div>
  );
}

function Ended({ onHome }) {
  return (
    <div className="center">
      <h1>Partie terminée</h1>
      <p className="lead">Merci d’avoir joué !</p>
      <button className="btn btn-primary btn-xl" onClick={onHome}>
        Accueil
      </button>
    </div>
  );
}
