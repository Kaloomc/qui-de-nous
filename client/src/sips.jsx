import { Avatar } from './components.jsx';

export const sipsLabel = (n) => `${n} gorgée${n > 1 ? 's' : ''}`;

export const totalSips = (state, playerId) => state.sips?.[playerId] ?? 0;

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
