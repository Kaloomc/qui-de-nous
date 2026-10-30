// Mode Duel côté écrans (TV et téléphones). Écrans provisoires : l'habillage complet vient à l'étape 3.
export const id = 'duel';
export const waitingText = 'Les paris sont ouverts…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Duel suivant';

const name = (state, pid) => state.players.find((p) => p.id === pid)?.name ?? '?';

export function HostQuestion({ state, gameAct }) {
  const r = state.round;
  return (
    <div className="duel-host">
      <h2>{r.step === 'waiting' ? 'En attente de joueurs…' : `${name(state, r.red)} contre ${name(state, r.blue)}`}</h2>
      <p>{r.step}</p>
      <button className="ctrl" onClick={() => gameAct({ type: 'skip' })}>
        Passer ce duel
      </button>
    </div>
  );
}

export function HostReveal({ state }) {
  return <h2>{state.results ? `Vainqueur : ${state.results.winner}` : '…'}</h2>;
}

export function HostResults({ state }) {
  return <h2>{state.results ? `Vainqueur : ${state.results.winner}` : '…'}</h2>;
}

export function PlayerRound({ state, me, act, vote }) {
  const r = state.round;
  const my = r.me;
  if (my?.role === 'duelist') {
    return (
      <div className="center">
        <h1>Tu es {my.camp.toUpperCase()}</h1>
        {r.step === 'ready' && !my.ready && (
          <button className="btn btn-primary btn-xl" onClick={() => act({ type: 'ready', phaseId: r.phaseId })}>
            Prêt
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="center">
      {r.step === 'bets' && my?.role === 'bettor' ? (
        ['rouge', 'bleu'].map((camp) => (
          <button key={camp} className="btn btn-primary btn-xl" onClick={() => vote(camp)}>
            {name(state, camp === 'rouge' ? r.red : r.blue)}
          </button>
        ))
      ) : (
        <h1>Spectateur</h1>
      )}
    </div>
  );
}

export function PlayerResults({ verdict }) {
  return verdict;
}

export function verdict(state, me) {
  const drinks = (state.roundSips?.[me.id] ?? 0) > 0;
  return { drinks, title: drinks ? 'Tu bois !' : 'Bien joué', detail: '' };
}

export function EndStats() {
  return null;
}
