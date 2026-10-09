import { useState } from 'react';
import { CODE_LENGTH, navigate, request, storage, useConnected } from '../lib.js';

export default function Home() {
  const connected = useConnected();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function createGame() {
    setBusy(true);
    setError(null);
    const res = await request('host:create');
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
          <p>Crée la partie et affiche le QR code pour que tout le monde rejoigne.</p>
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
