import { useState } from 'react';
import { CODE_LENGTH, navigate, request, storage, useConnected } from '../lib.js';
import { DEFAULT_MODE, MODES, MODE_LIST } from '../modes/index.js';

export default function Home() {
  const connected = useConnected();
  const [code, setCode] = useState('');
  const [mode, setMode] = useState(() => (MODES[storage.get('qdn:lastMode')] ? storage.get('qdn:lastMode') : DEFAULT_MODE));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function pickMode(id) {
    setMode(id);
    storage.set('qdn:lastMode', id);
  }

  async function createGame() {
    setBusy(true);
    setError(null);
    const res = await request('host:create', { mode });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    storage.set(`qdn:host:${res.code}`, res.hostSecret);
    navigate(`/host/${res.code}`);
  }

  function join(e) {
    e.preventDefault();
    if (code.length === CODE_LENGTH) navigate(`/join/${code}`);
  }

  return (
    <main className="page home">
      <h1 className="logo">
        Qui de <span>nous</span> ?
      </h1>
      <p className="tagline">Le jeu de soirée où vos amis votent… et où les perdants boivent.</p>

      <div className="home-cards">
        <section className="card">
          <h2>Sur la TV ou le PC</h2>
          <p>Choisis le jeu, crée la partie et affiche le QR code pour que tout le monde rejoigne.</p>
          <div className="mode-picker" role="radiogroup" aria-label="Mode de jeu">
            {MODE_LIST.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={`mode-option ${mode === m.id ? 'is-selected' : ''}`}
                onClick={() => pickMode(m.id)}
              >
                <strong>{m.label}</strong>
                <span>{m.tagline}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-xl" onClick={createGame} disabled={!connected || busy}>
            {busy ? 'Création…' : 'Créer une partie'}
          </button>
        </section>

        <form className="card" onSubmit={join}>
          <h2>Sur ton téléphone</h2>
          <p>Scanne le QR code de l’écran, ou tape le code de la partie.</p>
          <input
            className="input code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH))}
            placeholder="CODE"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            aria-label="Code de la partie"
          />
          <button className="btn btn-secondary btn-xl" disabled={code.length !== CODE_LENGTH}>
            Rejoindre
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
      {!connected && <p className="muted">Connexion au serveur…</p>}
      <p className="disclaimer">À consommer avec modération. L’eau compte aussi comme boisson.</p>
    </main>
  );
}
