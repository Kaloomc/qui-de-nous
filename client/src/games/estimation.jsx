import { useState } from 'react';
import { Avatar, PlayerGrid, useRevealSound } from '../components.jsx';
import { roundCaption, StatBoard } from '../sips.jsx';
import { useRemaining } from '../lib.js';

export const id = 'estimation';
export const waitingText = 'En attente des autres…';

/** Les années s'écrivent sans espace (2007), le reste à la française (384 400 ; 42,195). */
export function formatNumber(value, unite) {
  if (value == null) return '?';
  if (unite === 'année') return String(value);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value);
}

const unitLabel = (unite) => (unite && unite !== 'année' ? ` ${unite}` : '');
/** Photos affichées au maximum pour une même réponse sur la règle, puis « +N ». */
const GROUP_MAX = 5;

export function HostQuestion({ state }) {
  const { round } = state;
  return (
    <>
      <p className="round">Question {round.number} · Estimation</p>
      <h1 key={round.number} className={`question-text slide-in ${round.question.length > 85 ? 'question-text-long' : ''}`}>
        {round.question}
      </h1>
      <p className="unit-chip">Réponse en {round.unite === 'année' ? 'année' : round.unite}</p>
    </>
  );
}

/**
 * Règle graduée : chaque estimation est une photo posée à sa place. Les photos trop proches
 * se décalent vers le haut pour rester lisibles.
 */
function Ruler({ state, showAnswer }) {
  const { results, round } = state;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const entries = Object.entries(results.values)
    .map(([pid, value]) => ({ player: byId.get(pid), value }))
    .filter((e) => e.player);
  // Échelle « compressée » autour de la médiane : l'ordre est respecté, mais une réponse délirante
  // (42 pour une année) ne tasse pas toutes les autres dans un coin.
  const all = [...entries.map((e) => e.value), results.answer].sort((a, b) => a - b);
  const median = all[Math.floor(all.length / 2)];
  const spread = all.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(all.length / 2)] || 1;
  const f = (v) => Math.sign(v - median) * Math.log1p(Math.abs(v - median) / spread);
  let min = Math.min(...all.map(f));
  let max = Math.max(...all.map(f));
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pos = (v) => 4 + ((f(v) - min) / (max - min)) * 92;

  // Même réponse = un seul repère : les photos se serrent côte à côte, la valeur n'est écrite qu'une fois.
  const groups = [];
  for (const e of entries.sort((a, b) => a.value - b.value)) {
    if (groups.at(-1)?.value === e.value) groups.at(-1).players.push(e.player);
    else groups.push({ value: e.value, players: [e.player] });
  }
  const lastAtLevel = [];
  const markers = groups.map((g) => {
    const x = pos(g.value);
    const shown = Math.min(g.players.length, GROUP_MAX);
    // Un groupe est plus large qu'une photo seule : il faut plus de place avant de le poser sur la même ligne.
    const width = 6 + (shown - 1) * 1.6;
    let level = 0;
    while (level < 2 && lastAtLevel[level] != null && x - lastAtLevel[level] < width) level += 1;
    lastAtLevel[level] = x + (shown - 1) * 0.8;
    return { ...g, x, level };
  });

  const tag = (pid) => {
    if (!showAnswer) return '';
    if (results.closestIds.includes(pid)) return 'marker-best';
    if (results.furthestIds.includes(pid)) return 'marker-worst';
    return '';
  };

  return (
    <div className="ruler">
      <div className="ruler-line" />
      {markers.map((m, i) => {
        const size = m.players.length === 1 ? 64 : m.players.length <= 3 ? 56 : 48;
        const hidden = m.players.length - GROUP_MAX;
        return (
          <div
            key={m.players[0].id}
            className={`ruler-marker land ${tag(m.players[0].id)}`}
            style={{ left: `${m.x}%`, '--level': m.level, animationDelay: `${300 + i * 180}ms` }}
          >
            <div className="ruler-avatars">
              {m.players.slice(0, GROUP_MAX).map((p) => (
                <Avatar key={p.id} player={p} size={size} />
              ))}
              {hidden > 0 && <span className="ruler-more">+{hidden}</span>}
            </div>
            <span className="ruler-value">
              {formatNumber(m.value, round.unite)}
              {m.players.length > 1 && <small> ×{m.players.length}</small>}
            </span>
          </div>
        );
      })}
      {showAnswer && (
        <div className="ruler-answer zoom-in" style={{ left: `${pos(results.answer)}%` }}>
          <span className="ruler-answer-value">
            {formatNumber(results.answer, round.unite)}
            {unitLabel(round.unite)}
          </span>
        </div>
      )}
    </div>
  );
}

export function HostReveal({ state }) {
  const remaining = useRemaining({ endsAt: state.reveal.endsAt }, state, 250) ?? 0;
  return (
    <div className="estimation">
      <p className="round">Question {state.round.number} · Estimation</p>
      <h2 className="results-question">{state.round.question}</h2>
      <p className="announce">{remaining > state.reveal.durationMs - 1200 ? 'Attention…' : 'Et la bonne réponse est…'}</p>
      <Ruler state={state} showAnswer={false} />
    </div>
  );
}

export function HostResults({ state }) {
  const { results, round } = state;
  useRevealSound(state);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const names = (ids) => ids.map((pid) => byId.get(pid)?.name).filter(Boolean).join(', ');
  const closest = names(results.closestIds);
  const furthest = names(results.furthestIds);
  const chooser = byId.get(results.chooserId);
  const chosen = byId.get(results.chosenId);

  return (
    <div className="estimation">
      <p className="round">Question {round.number} · Estimation</p>
      <h2 className="results-question">{round.question}</h2>
      <Ruler state={state} showAnswer />
      <div className="estimation-verdicts fade-up" style={{ animationDelay: '600ms' }}>
        {closest && (
          <p className="verdict-line verdict-line-good">
            {results.exactIds.length ? 'Dans le mille' : 'Le plus proche'} : <strong>{closest}</strong>
          </p>
        )}
        {furthest && (
          <p className="verdict-line verdict-line-bad">
            Le plus loin : <strong>{furthest}</strong> boit !
          </p>
        )}
        {!furthest && Object.keys(results.values).length > 1 && <p className="verdict-line">Tout le monde à égalité : personne n’est le plus loin.</p>}
        {state.pending && chooser && (
          <p className="verdict-line pulse-text">
            {chooser.name} choisit qui boit {furthest ? `avec ${furthest}` : 'une gorgée'}…
          </p>
        )}
        {chosen && (
          <p className="verdict-line verdict-line-bad">
            {chooser?.name} désigne <strong>{chosen.name}</strong> : {roundCaption(state, chosen.id) ?? 'il boit'} !
          </p>
        )}
      </div>
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

export function PlayerVote({ state, onVote }) {
  const { round } = state;
  const [text, setText] = useState('');
  const value = text === '' ? null : Number(text.replace(',', '.'));
  const valid = value != null && Number.isFinite(value);

  function press(key) {
    if (key === '⌫') return setText((t) => t.slice(0, -1));
    if (key === ',' && (text.includes(',') || text === '')) return;
    if (text.length >= 13) return;
    setText((t) => (t === '0' && key !== ',' ? key : t + key));
  }

  return (
    <div className="vote estimation-vote">
      <p className="round">Question {round.number}</p>
      <h1 className="vote-question">{round.question}</h1>
      <div className="estimate-display" aria-live="polite">
        {text === '' ? <span className="muted">Ton estimation</span> : formatNumber(value ?? 0, round.unite) + (text.endsWith(',') ? ',' : '')}
        {round.unite && round.unite !== 'année' && <small>{round.unite}</small>}
      </div>
      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className="keypad-key" onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-xl btn-block" disabled={!valid} onClick={() => onVote(value)}>
        Valider
      </button>
    </div>
  );
}

export function VoteSummary({ state, choice }) {
  if (typeof choice !== 'number') return null;
  return (
    <p className="voted-for">
      Ta réponse : {formatNumber(choice, state.round.unite)}
      {unitLabel(state.round.unite)}
    </p>
  );
}

/** Le plus proche désigne quelqu'un pendant que le résultat est en attente ; les autres voient leur verdict. */
export function PlayerResults({ state, me, act, verdict }) {
  const { results } = state;
  if (state.pending && results.chooserId === me.id) {
    const others = state.players.filter((p) => p.id !== me.id);
    return (
      <div className="vote">
        <p className="round">Bien joué, tu es le plus proche !</p>
        <h1 className="vote-question">Qui boit avec le plus loin ?</h1>
        <PlayerGrid players={others} onPick={(targetId) => act({ type: 'pick', targetId })} />
      </div>
    );
  }
  return verdict;
}

export function verdict(state, me) {
  const { results } = state;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const value = results.values[me.id];
  const extra = `Bonne réponse : ${formatNumber(results.answer, state.round.unite)}${unitLabel(state.round.unite)}`;
  const chooserName = byId.get(results.chooserId)?.name;

  if (results.chosenId === me.id) return { drinks: true, title: 'Tu bois !', detail: `${chooserName} t’a désigné.`, extra };
  if (value == null) return { drinks: true, title: 'Tu bois !', detail: 'Tu n’as pas répondu à temps.', extra };
  if (results.furthestIds.includes(me.id)) return { drinks: true, title: 'Tu bois !', detail: 'Tu es le plus loin de la réponse.', extra };
  if (results.exactIds.includes(me.id)) return { drinks: false, title: 'Dans le mille !', detail: 'Réponse exacte.', extra };
  if (results.closestIds.includes(me.id)) return { drinks: false, title: 'Le plus proche !', detail: 'Tu ne bois pas.', extra };
  return { drinks: false, title: 'Tu ne bois pas', detail: `Ta réponse : ${formatNumber(value, state.round.unite)}`, extra };
}

export function EndStats({ state }) {
  return <StatBoard state={state} title="Les plus précis" valueOf={(s) => s.closest} format={(n) => `${n} fois le plus proche`} />;
}

