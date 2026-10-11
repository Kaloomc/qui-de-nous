import { useState } from 'react';
import { Avatar, PlayerChip, PlayerGrid, TimerBar, VoteProgress, allVoted, useRevealSound } from '../components.jsx';
import { useRemaining } from '../lib.js';
import { roundCaption, StatBoard } from '../sips.jsx';

export const id = 'imposteur';
export const waitingText = 'En attente des autres…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';

const CLUE_MAX_LENGTH = 20; // même limite que le serveur (server/rules/imposteur.js)

const byIdOf = (state) => new Map(state.players.map((p) => [p.id, p]));

const currentLap = (round) =>
  round.step === 'speaking' && round.order.length ? Math.floor((round.turnNumber - 1) / round.order.length) + 1 : null;

/**
 * Les joueurs dans l'ordre de parole, avec leurs indices écrits sous leur nom.
 * L'indice du tour en cours apparaît en grand, celui du tour précédent reste visible en plus petit.
 * Les indices sont affichés en texte brut (React échappe tout : pas de HTML interprété).
 */
function ClueBoard({ state, votedIds }) {
  const { round } = state;
  const byId = byIdOf(state);
  const lap = currentLap(round);
  const voted = votedIds ? new Set(votedIds) : null;
  return (
    <div className="speaking-order clue-board">
      {round.order.map((pid) => {
        const p = byId.get(pid);
        if (!p) return null;
        const current = pid === round.speakerId;
        const clues = (round.clues ?? []).filter((c) => c.playerId === pid).sort((a, b) => b.lap - a.lap);
        return (
          <div key={pid} className={`speaking-slot ${current ? 'is-current' : ''} ${voted && !voted.has(pid) ? 'is-waiting' : ''}`}>
            <div className="chip-avatar">
              <Avatar player={p} size={current ? 72 : 56} />
              {voted?.has(pid) && <span className="chip-badge">✓</span>}
            </div>
            <span>{p.name}</span>
            {current && <span className="clue clue-typing">écrit…</span>}
            {clues.map((c) => (
              <span key={c.lap} className={`clue ${lap && c.lap < lap ? 'clue-old' : ''} pop-in`}>
                {c.text}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function HostQuestion({ state, gameAct }) {
  const { round } = state;
  const byId = byIdOf(state);
  const speaker = byId.get(round.speakerId);
  const lap = round.order.length ? Math.ceil(round.turnNumber / round.order.length) : 1;

  if (round.step === 'words') {
    return (
      <div className="imposteur">
        <p className="round">Manche {round.number} · L’Imposteur</p>
        {round.categorie && <p className="unit-chip">Catégorie : {round.categorie}</p>}
        <h1 className="question-text slide-in">Chacun regarde son mot en secret.</h1>
        <p className="lead">Tout le monde a le même… sauf un. Et l’imposteur ne sait pas que c’est lui.</p>
        <TimerBar timer={round.wordsTimer} state={state}>
          {(s) => `Les indices commencent dans ${s} s`}
        </TimerBar>
        <ClueBoard state={state} />
        <button className="btn btn-primary btn-xl" onClick={() => gameAct({ type: 'startSpeaking' })}>
          Lancer les indices
        </button>
      </div>
    );
  }

  if (round.step === 'speaking') {
    return (
      <div className="imposteur">
        <p className="round">
          Manche {round.number} · Tour d’indices {lap} / 2{round.categorie ? ` · ${round.categorie}` : ''}
        </p>
        {speaker && (
          <div key={round.turnNumber} className="speaker zoom-in">
            <Avatar player={speaker} size={120} className="roulette-avatar" />
            <p className="speaker-name">À toi, {speaker.name} !</p>
            <p className="lead">Écris ton indice sur ton téléphone. Ni trop précis, ni trop vague…</p>
          </div>
        )}
        <TimerBar timer={round.turnTimer} state={state}>
          {(s) => (s > 0 ? `${s} s` : 'Temps écoulé !')}
        </TimerBar>
        <ClueBoard state={state} />
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => gameAct({ type: 'skipToVote' })}>
            Passer au vote
          </button>
          <button className="btn btn-primary btn-xl" onClick={() => gameAct({ type: 'nextTurn' })}>
            Suivant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="imposteur">
      <p className="round">Manche {round.number} · Le vote</p>
      <h1 className="question-text slide-in">Qui est l’imposteur ?</h1>
      <VoteProgress state={state} />
      <TimerBar timer={state.voteTimer} state={state}>
        {(s) => `Fin du vote dans ${s} s`}
      </TimerBar>
      <ClueBoard state={state} votedIds={state.votedIds} />
      <button className={`btn btn-primary btn-xl ${allVoted(state) ? 'pulse' : ''}`} onClick={() => gameAct({ type: 'reveal' })}>
        Révéler
      </button>
    </div>
  );
}

function VoteTally({ state }) {
  const { results } = state;
  const byId = byIdOf(state);
  const rows = Object.entries(results.counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([pid, n]) => ({ player: byId.get(pid), n }))
    .filter((r) => r.player);
  return (
    <div className="vote-tally">
      {rows.map((r, i) => (
        <div key={r.player.id} className="land" style={{ animationDelay: `${300 + i * 200}ms` }}>
          <PlayerChip player={r.player} size={84} badge={String(r.n)} />
        </div>
      ))}
      {rows.length === 0 && <p className="lead">Personne n’a voté…</p>}
    </div>
  );
}

export function HostReveal({ state }) {
  const remaining = useRemaining({ endsAt: state.reveal.endsAt }, state, 250) ?? 0;
  return (
    <div className="imposteur">
      <p className="round">Manche {state.round.number} · L’Imposteur</p>
      <p className="announce">{remaining > state.reveal.durationMs - 1200 ? 'Attention…' : 'Les votes sont tombés. L’imposteur était…'}</p>
      <VoteTally state={state} />
    </div>
  );
}

export function HostResults({ state }) {
  const { results, round } = state;
  useRevealSound(state);
  const byId = byIdOf(state);
  const imposter = byId.get(results.imposterId);
  let headline;
  if (!results.present) headline = 'L’imposteur a quitté la partie : personne ne boit.';
  else if (!results.unmasked) headline = `Raté ! ${imposter?.name} vous a tous eus : tout le monde boit, sauf lui.`;
  else if (state.pending) headline = `Démasqué ! Dernière chance pour ${imposter?.name} : deviner le mot des autres…`;
  else if (results.lastChance?.success) headline = `${imposter?.name} a trouvé « ${results.mot} » ! Ceux qui l’ont démasqué boivent à sa place.`;
  else headline = `Démasqué ! ${imposter?.name} boit${results.wrongVoterIds.length ? ', avec ceux qui ne l’ont pas trouvé' : ''}.`;

  return (
    <div className="imposteur">
      <p className="round">Manche {round.number} · L’Imposteur</p>
      <div className="imposteur-reveal">
        {imposter && (
          <div className="speaker zoom-in">
            <Avatar player={imposter} size={150} className={results.unmasked ? 'avatar-caught' : 'roulette-avatar'} />
            <p className="speaker-name">{imposter.name}</p>
            <p className="muted">était l’imposteur</p>
          </div>
        )}
        <div className="word-pair fade-up" style={{ animationDelay: '400ms' }}>
          <div className="word-card">
            <span>Mot des autres</span>
            <strong>{results.mot}</strong>
          </div>
          <div className="word-card word-card-imposter">
            <span>Mot de l’imposteur</span>
            <strong>{results.proche}</strong>
          </div>
        </div>
      </div>
      <p className="verdict-line fade-up" style={{ animationDelay: '700ms' }}>
        {headline}
      </p>
      {state.pending && round.options && (
        <div className="last-chance-options">
          {round.options.map((w) => (
            <span key={w} className="mode-pill">
              {w}
            </span>
          ))}
        </div>
      )}
      {!state.pending && results.lastChance && !results.lastChance.success && (
        <p className="verdict-line">Raté, il a répondu « {results.lastChance.guess} ».</p>
      )}
      <VoteTally state={state} />
    </div>
  );
}

function SecretWord({ word }) {
  const [hidden, setHidden] = useState(false);
  return (
    <button className={`secret-word ${hidden ? 'is-hidden' : ''}`} onClick={() => setHidden(!hidden)}>
      <span className="secret-label">Ton mot</span>
      <strong>{hidden ? '••••••' : word}</strong>
      <span className="secret-hint">{hidden ? 'Touche pour l’afficher' : 'Touche pour le cacher'}</span>
    </button>
  );
}

export function PlayerRound({ state, me, act, vote, myVote }) {
  const { round } = state;
  const byId = byIdOf(state);
  if (!round.myWord) {
    return (
      <div className="center">
        <h1>Manche en cours</h1>
        <p className="lead">Tu as rejoint en pleine manche : tu joues à la prochaine. Tu peux quand même voter !</p>
        {round.step === 'voting' && !myVote && <PlayerGrid players={state.players.filter((p) => p.id !== me.id)} onPick={vote} />}
      </div>
    );
  }
  if (round.step === 'voting') {
    if (myVote) {
      const target = byId.get(myVote);
      return (
        <div className="center voted">
          <div className="check pop-in">✓</div>
          <h1>Vote enregistré</h1>
          {target && (
            <div className="voted-for">
              <Avatar player={target} size={64} />
              <span>Tu accuses {target.name}</span>
            </div>
          )}
          <p className="lead">En attente des autres… ({state.votedIds.length}/{state.players.length})</p>
        </div>
      );
    }
    return (
      <div className="vote">
        <p className="round">Le vote</p>
        <h1 className="vote-question">Qui est l’imposteur ?</h1>
        <SecretWord word={round.myWord} />
        <PlayerGrid players={state.players.filter((p) => p.id !== me.id)} onPick={vote} />
      </div>
    );
  }
  const myTurn = round.speakerId === me.id;
  const speaker = byId.get(round.speakerId);
  return (
    <div className="center imposteur-phone">
      <SecretWord word={round.myWord} />
      {round.step === 'words' && <p className="lead">Retiens bien ton mot. Ne le montre à personne !</p>}
      {round.step === 'speaking' && myTurn && <ClueForm key={round.turnNumber} act={act} />}
      {round.step === 'speaking' && !myTurn && speaker && <p className="lead">{speaker.name} écrit son indice…</p>}
    </div>
  );
}

/** Champ de saisie de l'indice : un ou deux mots, vérifiés par le serveur (qui renvoie l'erreur à afficher). */
function ClueForm({ act }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const clue = text.replace(/\s+/g, ' ').trim();
    if (!clue) return setError('Écris un indice avant d’envoyer.');
    setSending(true);
    const err = await act({ type: 'clue', text: clue });
    setSending(false);
    setError(err);
  }

  return (
    <form className="clue-form pop-in" onSubmit={submit}>
      <p className="your-turn">À toi ! Écris ton indice.</p>
      <input
        className="input"
        autoFocus
        enterKeyHint="send"
        autoComplete="off"
        maxLength={CLUE_MAX_LENGTH}
        placeholder="Un ou deux mots"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-xl" disabled={sending}>
        Envoyer
      </button>
    </form>
  );
}

export function PlayerResults({ state, me, act, verdict }) {
  const { results, round } = state;
  if (state.pending && results.imposterId === me.id && round.options) {
    return (
      <div className="vote">
        <p className="round">Démasqué !</p>
        <h1 className="vote-question">Dernière chance : quel était le mot des autres ?</h1>
        {round.options.map((w) => (
          <button key={w} className="answer-choice" onClick={() => act({ type: 'guess', word: w })}>
            <span>{w}</span>
          </button>
        ))}
      </div>
    );
  }
  if (state.pending) {
    return (
      <div className="center suspense">
        <h1>Démasqué !</h1>
        <p className="lead">L’imposteur tente sa dernière chance…</p>
      </div>
    );
  }
  return verdict;
}

export function verdict(state, me) {
  const { results } = state;
  const isImposter = me.id === results.imposterId;
  const extra = `Mots : « ${results.mot} » / imposteur : « ${results.proche} »`;
  const sips = state.roundSips?.[me.id] ?? 0;
  if (isImposter) {
    if (!results.unmasked) return { drinks: false, title: 'Bien joué !', detail: 'Tu étais l’imposteur et personne ne t’a démasqué.', extra };
    if (results.lastChance?.success) return { drinks: false, title: 'Sauvé !', detail: 'Démasqué, mais tu as trouvé le mot des autres.', extra };
    return { drinks: true, title: 'Tu bois !', detail: 'Tu étais l’imposteur, et tu t’es fait démasquer.', extra };
  }
  if (sips > 0) {
    const detail = !results.unmasked
      ? 'L’imposteur vous a tous eus.'
      : results.lastChance?.success && results.votersForImposter.includes(me.id)
        ? 'L’imposteur a deviné votre mot : tu bois à sa place.'
        : 'Tu n’as pas désigné l’imposteur.';
    return { drinks: true, title: 'Tu bois !', detail, extra: roundCaption(state, me.id) ? `${extra}` : extra };
  }
  return { drinks: false, title: 'Tu ne bois pas', detail: 'Bien vu, tu as démasqué l’imposteur.', extra };
}

export function EndStats({ state }) {
  return <StatBoard state={state} title="Les meilleurs imposteurs" valueOf={(s) => s.fooled} format={(n) => `${n} fois incognito`} />;
}
