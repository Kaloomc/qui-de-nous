// Réglages du Savant dans le lobby de la TV : nombre de manches et temps d'écriture.
const ROUNDS = [
  [5, '5 manches'],
  [8, '8 manches'],
  [10, '10 manches'],
  ['players', 'Une par joueur (10 au plus)'],
  [0, 'Sans fin'],
];
const WRITE = [
  [15000, '15 s'],
  [20000, '20 s'],
  [30000, '30 s'],
];

export function SavantSetup({ state, gameAct }) {
  const lobby = state.lobby;
  if (!lobby) return null;
  return (
    <section className="savant-setup">
      <p className="savant-label">Nombre de manches</p>
      <div className="savant-setup-row" role="group" aria-label="Nombre de manches">
        {ROUNDS.map(([value, label]) => (
          <button key={String(value)} className={`ctrl ${lobby.rounds === value ? 'ctrl-on' : ''}`} aria-pressed={lobby.rounds === value} onClick={() => gameAct({ type: 'config', rounds: value })}>
            {label}
          </button>
        ))}
      </div>
      <p className="savant-label">Temps pour écrire</p>
      <div className="savant-setup-row" role="group" aria-label="Temps pour écrire">
        {WRITE.map(([value, label]) => (
          <button key={value} className={`ctrl ${lobby.writeMs === value ? 'ctrl-on' : ''}`} aria-pressed={lobby.writeMs === value} onClick={() => gameAct({ type: 'config', writeMs: value })}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
