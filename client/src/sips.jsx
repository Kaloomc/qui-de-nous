import { Avatar } from './components.jsx';

export const sipsLabel = (n) => `${n} gorgée${n > 1 ? 's' : ''}`;

/** Total de la soirée (tous jeux confondus) : le serveur le garde jusqu'à une nouvelle partie. */
export const totalSips = (state, playerId) => state.sips?.[playerId] ?? 0;

/** Part du jeu en cours dans ce total. */
export const gameSipsOf = (state, playerId) => state.gameSips?.[playerId] ?? 0;

/** Légende sous un joueur dans les résultats : « +2 · 5 au total » s'il a bu ce tour-ci. */
export function roundCaption(state, playerId) {
  const n = state.roundSips?.[playerId];
  return n ? `+${n} · ${totalSips(state, playerId)} au total` : null;
}

/** Classement par gorgées décroissantes ; les ex æquo partagent le même rang (1, 1, 3…). */
export function ranking(state) {
  const rows = state.players
    .map((p) => ({ player: p, sips: totalSips(state, p.id) }))
    .sort((a, b) => b.sips - a.sips || a.player.name.localeCompare(b.player.name));
  return rows.map((row) => ({ ...row, rank: 1 + rows.filter((r) => r.sips > row.sips).length }));
}

/** Classement de fin propre à un jeu (bombes explosées, bonnes réponses…), affiché sous le podium. */
export function StatBoard({ state, title, valueOf, format, limit = 5 }) {
  const rows = state.players
    .map((p) => ({ player: p, value: valueOf(state.stats?.[p.id] ?? {}) }))
    .filter((r) => r.value != null && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  if (rows.length === 0) return null;
  return (
    <div className="stat-board fade-up" style={{ animationDelay: '2s' }}>
      <h3>{title}</h3>
      <ol className="ranking">
        {rows.map((r, i) => (
          <li key={r.player.id}>
            <span className="ranking-rank">{i + 1}</span>
            <Avatar player={r.player} size={36} />
            <span className="ranking-name">{r.player.name}</span>
            <span className="ranking-sips">{format(r.value)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** « dont 2 dans ce jeu », seulement si la soirée a commencé avant ce jeu. */
function GamePart({ state, row }) {
  const n = gameSipsOf(state, row.player.id);
  return n !== row.sips ? <span className="sips-game-part">dont {n} dans ce jeu</span> : null;
}

/**
 * Petit classement des gorgées de la soirée (grille des jeux) : photos, prénoms, totaux, le plus gros buveur en avant.
 * onReset : bouton discret de l'hôte pour tout remettre à zéro (avec confirmation).
 */
export function PartyBoard({ state, onReset }) {
  const rows = ranking(state).filter((r) => r.sips > 0);
  if (rows.length === 0) return null;
  const [top, ...others] = rows;
  function reset() {
    if (window.confirm('Remettre à zéro les gorgées de toute la soirée ?')) onReset();
  }
  return (
    <div className="party-board fade-up">
      <div className="party-board-top">
        <Avatar player={top.player} size={64} className="podium-champion" />
        <div>
          <span className="podium-title">Le plus assoiffé de la soirée</span>
          <strong>{top.player.name}</strong>
          <span className="ranking-sips">{sipsLabel(top.sips)}</span>
        </div>
      </div>
      {others.length > 0 && (
        <ol className="ranking">
          {others.map((r) => (
            <li key={r.player.id}>
              <span className="ranking-rank">{r.rank}</span>
              <Avatar player={r.player} size={32} />
              <span className="ranking-name">{r.player.name}</span>
              <span className="ranking-sips">{r.sips}</span>
            </li>
          ))}
        </ol>
      )}
      {onReset && (
        <button className="btn btn-ghost small" onClick={reset}>
          Remettre les compteurs à zéro
        </button>
      )}
    </div>
  );
}

const TITLES = { 1: 'Le plus assoiffé', 2: 'Dauphin', 3: 'Sur le podium' };

export function Podium({ state }) {
  const rows = ranking(state);
  const total = rows.reduce((sum, r) => sum + r.sips, 0);
  if (rows.length === 0) return null;
  if (total === 0) return <p className="lead">Personne n’a bu une seule gorgée. Sobriété exemplaire !</p>;

  const step = (rank) => rows.filter((r) => r.rank === rank && r.sips > 0);
  // Ordre d'affichage classique : 2e à gauche, 1er au centre, 3e à droite.
  const steps = [2, 1, 3].map((rank) => ({ rank, rows: step(rank) })).filter((s) => s.rows.length > 0);
  const others = rows.filter((r) => r.rank > 3 || r.sips === 0);

  return (
    <div className="podium-wrap">
      <div className="podium">
        {steps.map(({ rank, rows: atRank }) => (
          <div key={rank} className={`podium-step podium-${rank}`} style={{ '--delay': `${(3 - rank) * 450}ms` }}>
            <div className="podium-players">
              {atRank.map((r) => (
                <div key={r.player.id} className="podium-player">
                  <Avatar
                    player={r.player}
                    size={(rank === 1 ? 130 : 100) * (atRank.length > 2 ? 0.7 : 1)}
                    className={rank === 1 ? 'podium-champion' : ''}
                  />
                  <span className="podium-name">{r.player.name}</span>
                  <span className="podium-sips">{sipsLabel(r.sips)}</span>
                  <GamePart state={state} row={r} />
                </div>
              ))}
            </div>
            <div className="podium-block">
              <span className="podium-rank">{rank}</span>
              <span className="podium-title">{TITLES[rank]}</span>
            </div>
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <ol className="ranking fade-up" style={{ animationDelay: '1.6s' }}>
          {others.map((r) => (
            <li key={r.player.id}>
              <span className="ranking-rank">{r.rank}</span>
              <Avatar player={r.player} size={36} />
              <span className="ranking-name">{r.player.name}</span>
              <span className="ranking-sips">{sipsLabel(r.sips)}</span>
              <GamePart state={state} row={r} />
            </li>
          ))}
        </ol>
      )}
      <p className="podium-total fade-up" style={{ animationDelay: '1.8s' }}>
        {sipsLabel(total)} en tout ce soir.
      </p>
    </div>
  );
}
