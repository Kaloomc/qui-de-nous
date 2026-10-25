import { useEffect, useState } from 'react';
import { Avatar, PieChart, PlayerChip, useRevealSound } from '../components.jsx';
import { colorFor, serverNow, useRemaining } from '../lib.js';
import { sounds } from '../sound.js';
import { roundCaption } from '../sips.jsx';
import { fmt, fmtGroup } from '../format.js';

export const id = 'qui-de-nous';
export const waitingText = 'En attente des autres…';

// La révélation dure revealMs (server/games/quiDeNous.js) : « Attention… », puis 3, 2, 1 sur les 3 dernières secondes.
const COUNTDOWN_MS = 3000;
const LEGEND_MAX = 8;

/** Les photos défilent comme une roulette qui ralentit pendant le compte à rebours. */
function useRoulette(count, endsAt, state) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2) return undefined;
    let delay = 70;
    let i = 0;
    let id;
    const step = () => {
      if (serverNow(state) >= endsAt) return;
      i = (i + 1) % count;
      setIndex(i);
      delay *= 1.13;
      id = setTimeout(step, delay);
    };
    id = setTimeout(step, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, endsAt]);
  return index;
}

export function HostReveal({ state }) {
  const { reveal, round, players } = state;
  const remaining = useRemaining({ endsAt: reveal.endsAt }, state, 100) ?? 0;
  const count = remaining > COUNTDOWN_MS ? null : Math.max(1, Math.ceil(remaining / 1000));
  const shown = players[useRoulette(players.length, reveal.endsAt, state) % Math.max(1, players.length)];

  useEffect(() => {
    const ms = reveal.endsAt - serverNow(state);
    if (ms > 500) sounds.drumroll(ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (count) sounds.count(count);
  }, [count]);

  return (
    <div className={`qdn-reveal ${count ? `shake-${count}` : ''}`}>
      <p className="round">Question {round.number}</p>
      <h2 className="results-question">{round.text}</h2>
      <p className="announce">{count ? 'Résultat dans…' : 'Attention…'}</p>
      <div className="roulette-row">
        {shown && (
          <div className="roulette">
            <Avatar player={shown} size={200} className="roulette-avatar" />
            <p className="roulette-name">{shown.name}</p>
          </div>
        )}
        <p key={count ?? 0} className={`countdown ${count ? 'pop-in' : 'countdown-idle'}`}>
          {count ?? '?'}
        </p>
      </div>
    </div>
  );
}

const CIBLE_LABEL = { homme: 'Question réservée aux hommes', femme: 'Question réservée aux femmes' };

/** Question réservée à un genre : seuls les joueurs de ce genre sont candidats ; les autres votent quand même. */
function Candidates({ state }) {
  const { cible, candidateIds } = state.round;
  if (!candidateIds) return null;
  const candidates = state.players.filter((p) => candidateIds.includes(p.id));
  return (
    <section className="qdn-candidates" aria-label="Candidats">
      <p className="qdn-candidates-label">{CIBLE_LABEL[cible]} · tout le monde vote</p>
      <div className="qdn-candidates-row">
        {candidates.map((p) => (
          <span key={p.id} className="qdn-candidate">
            <Avatar player={p} size={candidates.length > 12 ? 44 : 64} />
            <span>{p.name}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function HostQuestion({ state }) {
  return (
    <>
      <p className="round">Question {state.round.number}</p>
      <h1 key={state.round.number} className={`question-text slide-in ${state.round.text.length > 85 ? 'question-text-long' : ''}`}>
        {state.round.text}
      </h1>
      <Candidates state={state} />
    </>
  );
}

export function HostResults({ state }) {
  const { results } = state;
  useRevealSound(state);
  const byId = new Map(state.players.map((p, i) => [p.id, { ...p, color: colorFor(i, state.adult?.active) }]));
  const top = results.topIds.map((pid) => byId.get(pid)).filter(Boolean);
  const drinkers = results.wrongVoterIds.map((pid) => byId.get(pid)).filter(Boolean);
  const nonVoters = new Set(results.nonVoterIds);
  const slices = [...byId.values()]
    .map((p) => ({ id: p.id, value: results.counts[p.id] ?? 0, color: p.color, player: p }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="results">
      <p className="round">Question {state.round.number}</p>
      <h2 className="results-question">{state.round.text}</h2>

      <div className="results-main">
        <section className="winner">
          {top.length === 0 ? (
            <p className="big">Personne n’a voté !</p>
          ) : (
            <>
              <p className="winner-label">{top.length > 1 ? 'Égalité !' : fmt('{m=Le plus voté|f=La plus votée|n=En tête des votes}', top[0])}</p>
              <div className="winner-list">
                {top.map((p) => (
                  <div key={p.id} className="winner-card zoom-in">
                    <Avatar player={p} size={top.length > 1 ? 130 : 180} className="winner-avatar" />
                    <p className="winner-name">{p.name}</p>
                  </div>
                ))}
              </div>
              <p className="winner-votes">
                {results.topCount} vote{results.topCount > 1 ? 's' : ''} · {top.length > 1 ? fmtGroup('{m=ils boivent|f=elles boivent|n=ça boit}', top) : 'boit'} !{top.length === 1 && roundCaption(state, top[0].id) ? ` (${roundCaption(state, top[0].id)})` : ''}
              </p>
            </>
          )}
        </section>

        {slices.length > 0 && (
          <section className="chart">
            <PieChart slices={slices} size={270} />
            <ul className="legend">
              {slices.slice(0, LEGEND_MAX).map((s, i) => (
                <li key={s.id} className="fade-up" style={{ animationDelay: `${400 + i * 100}ms` }}>
                  <span className="swatch" style={{ background: s.color }} />
                  <Avatar player={s.player} size={40} />
                  <span className="legend-name">{s.player.name}</span>
                  <span className="legend-value">{s.value}</span>
                </li>
              ))}
              {/* À 20-30 joueurs, la liste complète sortirait de l'écran de la TV. */}
              {slices.length > LEGEND_MAX && (
                <li className="fade-up muted" style={{ animationDelay: `${400 + LEGEND_MAX * 100}ms` }}>
                  + {slices.length - LEGEND_MAX} autres
                  <span className="legend-value">{slices.slice(LEGEND_MAX).reduce((n, s) => n + s.value, 0)}</span>
                </li>
              )}
            </ul>
          </section>
        )}
      </div>

      <section className="drinkers">
        <h3>{drinkers.length ? 'Boivent aussi : ceux qui n’ont pas voté comme la majorité' : 'Tout le monde a voté comme la majorité !'}</h3>
        <div className="drinkers-row">
          {drinkers.map((p, i) => (
            <div key={p.id} className="fade-up" style={{ animationDelay: `${900 + i * 80}ms` }}>
              <PlayerChip player={p} size={56} badge={nonVoters.has(p.id) ? 'zzz' : null} caption={roundCaption(state, p.id)} inline />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PlayerVote({ state, me, onVote }) {
  const { candidateIds, cible } = state.round;
  // Question réservée à un genre : seuls les candidats sont proposés (tout le monde vote, mais pas pour n'importe qui).
  const options = candidateIds ? state.players.filter((p) => candidateIds.includes(p.id)) : state.players;
  return (
    <div className="vote">
      <p className="round">Question {state.round.number}</p>
      <h1 className="vote-question">{state.round.text}</h1>
      {candidateIds && <p className="muted">{CIBLE_LABEL[cible]} : vote pour {cible === 'femme' ? 'l’une d’elles' : 'l’un d’eux'}.</p>}
      <div className="grid grid-vote">
        {options.map((p) => (
          <button key={p.id} className="vote-option" onClick={() => onVote(p.id)}>
            <Avatar player={p} size={88} />
            <span>{p.id === me.id ? `${p.name} (moi)` : p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function VoteSummary({ state, choice }) {
  const target = state.players.find((p) => p.id === choice);
  if (!target) return null;
  return (
    <div className="voted-for">
      <Avatar player={target} size={64} />
      <span>Tu as voté pour {target.name}</span>
    </div>
  );
}

export function verdict(state, me) {
  const { results } = state;
  const isTop = results.topIds.includes(me.id);
  const isWrong = results.wrongVoterIds.includes(me.id);
  const didNotVote = results.nonVoterIds.includes(me.id);
  const topNames = results.topIds
    .map((pid) => state.players.find((p) => p.id === pid)?.name)
    .filter(Boolean)
    .join(' et ');
  const top = results.topIds.map((pid) => state.players.find((p) => p.id === pid)).filter(Boolean);
  const extra = topNames && !isTop ? fmtGroup(`{m=Le plus voté|f=La plus votée|n=En tête des votes} : ${topNames}`, top) : null;

  if (isTop && isWrong) {
    return { drinks: true, title: 'Tu bois 2 fois !', detail: '{m=Tu es le plus voté|f=Tu es la plus votée|n=Tu es en tête des votes}, et en plus tu n’as pas voté comme les autres.', extra };
  }
  if (isTop) {
    return {
      drinks: true,
      title: 'Tu bois !',
      detail: results.topIds.length > 1 ? '{m=Tu fais partie des plus votés|f=Tu fais partie des plus votées|n=Tu fais partie des têtes de vote}.' : '{m=Tu es le plus voté|f=Tu es la plus votée|n=Tu es en tête des votes}.',
      extra,
    };
  }
  if (isWrong) {
    const detail = didNotVote ? 'Tu n’as pas voté à temps.' : `Tu n’as pas voté pour ${topNames || 'la tête du vote'}.`;
    return { drinks: true, title: 'Tu bois !', detail, extra };
  }
  return { drinks: false, title: 'Tu ne bois pas', detail: 'Bien vu, tu as voté comme la majorité.', extra };
}
