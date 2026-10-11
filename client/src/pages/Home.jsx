import { useState } from 'react';
import { GAMES } from '../games/index.js';
import { Credit } from '../credit.jsx';
import { GameIcon, Logo } from '../icons.jsx';
import { CODE_LENGTH, navigate, request, storage, useConnected } from '../lib.js';

export default function Home() {
  const connected = useConnected();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function createGame() {
    setBusy(true);
    setError(null);
    // Pas de jeu ici : l'hôte le choisit ensuite dans la grille, sur la TV.
    const res = await request('host:create', { settings: storage.get('qdn:settings') });
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
      <Logo />
      <p className="tagline">Le jeu de soirée qui fait boire tout le monde.</p>

      <div className="home-cards">
        <section className="card">
          <h2>Sur la TV ou le PC</h2>
          <p>Crée la partie, choisis un jeu et affiche le QR code pour que tout le monde rejoigne.</p>
          <div className="home-games" aria-hidden="true">
            {GAMES.filter((g) => g.playable).map((g) => (
              <span key={g.id} className="home-game">
                <GameIcon icon={g.icon} size={34} />
                {g.name}
              </span>
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
      <p className="disclaimer">Jeu réservé aux 18 ans et plus, à consommer avec modération. L’eau compte aussi comme boisson.</p>
      <Credit />
    </main>
  );
}
