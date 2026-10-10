import { Avatar, useRevealSound } from '../components.jsx';
import { useRemaining } from '../lib.js';
import { StatBoard } from '../sips.jsx';

export const id = 'qui-me-connait';
export const waitingText = 'En attente des autres…';

const LETTERS = ['a', 'b', 'c', 'd'];

/** Remplace {nom} et {de_nom} (« de Bob », « d’Alice ») dans la question. */
export function fillName(text, name = '?') {
  const de = /^[aeiouyhàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`;
  return text.replaceAll('{de_nom}', de).replaceAll('{nom}', name);
}

const targetOf = (state) => state.players.find((p) => p.id === state.round.targetId);

function ChoiceGrid({ state, showVoters = false, showAnswer = false }) {
  const { round, results } = state;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  return (
    <div className="choice-grid">
      {round.choix.map((text, i) => {
        const letter = LETTERS[i];
        const voters = showVoters
          ? Object.entries(results.choices)
              .filter(([pid, c]) => c === letter && pid !== round.targetId)
              .map(([pid]) => byId.get(pid))
              .filter(Boolean)
          : [];
        const status = showAnswer ? (results.answer === letter ? 'choice-correct' : 'choice-wrong') : '';
        return (
          <div key={letter} className={`choice-card ${status}`}>
            <span className="option-letter">{letter.toUpperCase()}</span>
            <span className="choice-text">{text}</span>
            {voters.length > 0 && (
              <span className="choice-voters">
                {voters.map((p, j) => (
                  <span key={p.id} className="pop-in" style={{ animationDelay: `${400 + j * 120}ms` }}>
                    <Avatar player={p} size={44} />
                  </span>
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TargetBanner({ target, label }) {
  if (!target) return null;
  return (
    <div className="connait-target">
      <Avatar player={target} size={72} className="roulette-avatar" />
      <div>
        <p className="connait-label">{label}</p>
        <p className="connait-name">{target.name}</p>
      </div>
    </div>
  );
}

export function HostQuestion({ state }) {
  const target = targetOf(state);
  return (
    <>
      <p className="round">Question {state.round.number} · Qui me connaît le mieux ?</p>
      <TargetBanner target={target} label="Tout le monde parle de" />
      <h1 key={state.round.number} className="question-text connait-question slide-in">
        {fillName(state.round.question, target?.name)}
      </h1>
      <ChoiceGrid state={state} />
    </>
  );
}

export function HostReveal({ state }) {
  const target = targetOf(state);
  const remaining = useRemaining({ endsAt: state.reveal.endsAt }, state, 250) ?? 0;
  return (
    <div className="connait">
      <p className="round">Question {state.round.number} · Qui me connaît le mieux ?</p>
      <h2 className="results-question">{fillName(state.round.question, target?.name)}</h2>
      <p className="announce">{remaining > state.reveal.durationMs - 1200 ? 'Attention…' : `Qu’a répondu ${target?.name ?? 'la cible'} ?`}</p>
      <ChoiceGrid state={state} showVoters />
    </div>
  );
}

const REASONS = {
  nobody: (name) => `Personne n’a trouvé : personne ne connaît ${name}, ${name} boit aussi !`,
  everyone: (name) => `Tout le monde a trouvé : ${name} est trop prévisible et boit !`,
  noAnswer: (name) => `${name} n’a pas répondu : ${name} boit !`,
};

export function HostResults({ state }) {
  const { results } = state;
  useRevealSound(state);
  const target = targetOf(state);
  const name = target?.name ?? 'La cible';
  const right = results.correctIds.length;
  return (
    <div className="connait">
      <p className="round">Question {state.round.number} · Qui me connaît le mieux ?</p>
      <h2 className="results-question">{fillName(state.round.question, target?.name)}</h2>
      <ChoiceGrid state={state} showVoters showAnswer />
      <p className="verdict-line fade-up" style={{ animationDelay: '500ms' }}>
        {results.reason ? REASONS[results.reason](name) : `${right} ${right > 1 ? 'ont' : 'a'} trouvé. Les autres boivent !`}
      </p>
    </div>
  );
}

export function PlayerVote({ state, me, onVote }) {
  const target = targetOf(state);
  const isTarget = me.id === state.round.targetId;
  return (
    <div className="vote">
      <p className="round">{isTarget ? 'C’est toi la cible !' : `Qu’a répondu ${target?.name} ?`}</p>
      <h1 className="vote-question">{fillName(state.round.question, target?.name)}</h1>
      <p className="muted">{isTarget ? 'Réponds sincèrement, en secret.' : 'Devine ce que la cible a répondu.'}</p>
      {state.round.choix.map((text, i) => (
        <button key={LETTERS[i]} className="answer-choice" onClick={() => onVote(LETTERS[i])}>
          <span className="option-letter">{LETTERS[i].toUpperCase()}</span>
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}

export function VoteSummary({ state, choice }) {
  const i = LETTERS.indexOf(choice);
  if (i < 0) return null;
  return (
    <div className="answer-choice answer-choice-static">
      <span className="option-letter">{choice.toUpperCase()}</span>
      <span>{state.round.choix[i]}</span>
    </div>
  );
}

export function verdict(state, me) {
  const { results } = state;
  const target = targetOf(state);
  const answerIndex = LETTERS.indexOf(results.answer);
  const extra = answerIndex >= 0 ? `Réponse ${results.answer.toUpperCase()} : ${state.round.choix[answerIndex]}` : null;
  if (me.id === results.targetId) {
    if (results.reason === 'nobody') return { drinks: true, title: 'Tu bois !', detail: 'Personne ne te connaît…', extra };
    if (results.reason === 'everyone') return { drinks: true, title: 'Tu bois !', detail: 'Trop prévisible : tout le monde a trouvé.', extra };
    if (results.reason === 'noAnswer') return { drinks: true, title: 'Tu bois !', detail: 'Tu n’as pas répondu à temps.', extra };
    return { drinks: false, title: 'Tu ne bois pas', detail: 'Certains te connaissent bien.', extra };
  }
  if (results.correctIds.includes(me.id)) return { drinks: false, title: 'Bien vu !', detail: `Tu connais bien ${target?.name}.`, extra };
  if (results.reason === 'noAnswer') return { drinks: false, title: 'Tu ne bois pas', detail: `${target?.name} n’a pas répondu.`, extra };
  return { drinks: true, title: 'Tu bois !', detail: results.nonVoterIds.includes(me.id) ? 'Tu n’as pas répondu à temps.' : 'Mauvaise réponse.', extra };
}

export function EndStats({ state }) {
  return (
    <StatBoard
      state={state}
      title="Qui connaît le mieux le groupe ?"
      valueOf={(s) => (s.guesses ? Math.round(((s.correct ?? 0) / s.guesses) * 100) : null)}
      format={(n) => `${n} % de bonnes réponses`}
    />
  );
}
