// Noir Boire Mangue (nom : NBM_NAME dans shared/games.js) : une phrase à trou, chacun la complète sur son téléphone (réponse libre ou
// carte toute prête), les réponses passent une par une sur la TV sans nom d'auteur et tout le monde les note avec 4 boutons.
// Chaque écran est remonté avec une `key` basée sur l'identifiant d'étape (`phaseId`) et toute action porte ce `phaseId` : le
// serveur ignore ce qui vient d'une étape passée.
import { Fragment, useEffect, useState } from 'react';
import { Avatar, TimerBar } from '../components.jsx';
import { fmt, fmtGroup } from '../format.js';
import { sipsLabel } from '../sips.jsx';
import { sounds } from '../sound.js';

export const id = 'nbm';
export const waitingText = 'Les autres notent…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Manche suivante';

const MAX_ANSWER = 60; // même limite que le serveur (server/rules/nbm.js)
/** Les cartes sont écrites en minuscules pour s'insérer dans une phrase : majuscule seulement si le trou ouvre la phrase ou une citation. */
const startsSentence = (before) => /(^|[.!?…]\s+|[«"“]\s*)$/.test(before);
const capitalizeFirst = (text) => (text ? text.charAt(0).toLocaleUpperCase('fr') + text.slice(1) : text);
/** Les quatre notes, dans l'ordre des boutons : libellé, points, symbole (le sens ne repose jamais sur la couleur seule). */
const RATINGS = [
  { id: 'nul', label: 'Nul', points: 0, icon: '😐' },
  { id: 'meh', label: 'Meh', points: 1, icon: '🙂' },
  { id: 'drole', label: 'Drôle', points: 2, icon: '😂' },
  { id: 'golden', label: 'Golden', points: 4, icon: '🌟' },
];

const playerOf = (state, pid) => state.players.find((p) => p.id === pid) ?? { id: pid, name: '?', photoUrl: null };
const sizeClass = (text) => (text.length > 70 ? 'is-long' : text.length > 40 ? 'is-medium' : '');

/** La phrase à trou ; avec `answer`, la réponse prend la place du trou (en très gros, en jaune). */
function Sentence({ text, answer = null, censored = false, big = false, small = false }) {
  const parts = String(text ?? '').split('___');
  const before = parts[0];
  const shown = answer != null && startsSentence(before) ? capitalizeFirst(answer) : answer;
  const filler = censored ? <em className="nbm-blank is-censored">censurée</em> : answer != null ? <span className="nbm-blank is-filled">{shown}</span> : <span className="nbm-blank">___</span>;
  const total = String(text ?? '').length + (answer?.length ?? 0);
  return (
    <h1 className={`nbm-sentence ${big ? 'is-big' : ''} ${small ? 'is-small' : ''} ${sizeClass({ length: total })}`}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && filler}
        </Fragment>
      ))}
    </h1>
  );
}

// ---------- TV ----------

export function HostQuestion({ state, gameAct }) {
  const round = state.round;
  let body;
  if (round.step === 'waiting') {
    body = (
      <>
        <h1>On attend des joueurs…</h1>
        <p className="lead">Il faut au moins 3 joueurs connectés.</p>
      </>
    );
  } else if (round.step === 'announce') {
    body = (
      <div className="nbm-stage" key={round.phaseId}>
        <p className="round">Manche {round.number} / {round.total}</p>
        <Sentence text={round.sentence} big />
        <p className="lead">Complète la phrase sur ton téléphone. Fais rire la salle.</p>
      </div>
    );
  } else if (round.step === 'write') {
    body = (
      <div className="nbm-stage" key={round.phaseId}>
        <p className="round">Manche {round.number} / {round.total}</p>
        <Sentence text={round.sentence} big />
        <p className="nbm-count">
          <strong>{round.written.n}</strong> / {round.written.of} ont répondu
        </p>
        <TimerBar timer={round.timer} state={state}>
          {(s) => `${s} s pour écrire`}
        </TimerBar>
      </div>
    );
  } else {
    const cur = round.current;
    body = (
      <div className="nbm-stage nbm-stage-rate" key={round.phaseId}>
        <p className="round">
          Manche {round.number} / {round.total} · réponse {cur?.index} / {cur?.of}
        </p>
        <button className="nbm-answer-card" onClick={() => gameAct({ type: 'censor' })} title="Touche la réponse pour la masquer si elle est déplacée">
          <Sentence text={round.sentence} answer={cur?.text} censored={cur?.censored} big />
        </button>
        {round.step === 'rate' ? (
          <>
            <p className="nbm-count">
              <strong>{round.rated.n}</strong> / {round.rated.of} ont noté
            </p>
            <TimerBar timer={round.timer} state={state} small>
              {(s) => `${s} s pour noter`}
            </TimerBar>
          </>
        ) : (
          <MiniResult mini={round.mini} />
        )}
        <p className="muted small">Touche la réponse pour la masquer si elle est déplacée.</p>
      </div>
    );
  }
  return <div className={`nbm nbm-tv nbm-step-${round.step}`}>{body}</div>;
}

/** La petite jauge qui suit le dernier vote : combien de Nul, Meh, Drôle et Golden la réponse a reçus. */
function MiniResult({ mini }) {
  const max = Math.max(1, ...RATINGS.map((r) => mini?.[r.id] ?? 0));
  return (
    <div className="nbm-gauge" role="img" aria-label={RATINGS.map((r) => `${r.label} : ${mini?.[r.id] ?? 0}`).join(', ')}>
      {RATINGS.map((r) => (
        <div key={r.id} className={`nbm-gauge-col is-${r.id}`}>
          <span className="nbm-gauge-count">{mini?.[r.id] ?? 0}</span>
          <span className="nbm-gauge-bar" style={{ '--h': `${((mini?.[r.id] ?? 0) / max) * 100}%` }} />
          <span className="nbm-gauge-label">
            <span aria-hidden="true">{r.icon}</span> {r.label}
          </span>
        </div>
      ))}
    </div>
  );
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const MAX_TOP_ROWS = 4;

/** Les meilleures réponses de la manche, avec leur auteur (la manche est finie : plus de secret). Les ex æquo partagent le rang. */
function Top3({ state, animate }) {
  const { results } = state;
  // Beaucoup d'ex æquo : on montre les premiers et on résume les autres, pour que tout tienne sur l'écran de la TV.
  const rows = results.top3.slice(0, MAX_TOP_ROWS);
  const more = results.top3.slice(MAX_TOP_ROWS);
  return (
    <ol className={`nbm-top3 ${rows.length > 3 ? 'is-dense' : ''}`}>
      {rows.map((row, i) => {
        const author = playerOf(state, row.authorId);
        return (
          <li key={row.authorId} className={`nbm-top-row rank-${row.rank} ${animate ? 'is-animated' : ''}`} style={{ '--i': rows.length - 1 - i }}>
            <span className="nbm-rank" aria-label={`rang ${row.rank}`}>
              {MEDALS[row.rank]} <small>{row.rank}</small>
            </span>
            <Avatar player={author} size={rows.length > 3 ? 56 : 84} />
            <span className="nbm-top-body">
              <strong className="nbm-top-name">{author.name}</strong>
              <span className="nbm-top-answer">{row.censored ? '🙈 censurée' : <Sentence text={results.sentence} answer={row.text} small />}</span>
            </span>
            <span className="nbm-top-score">
              <strong>{row.points}</strong> pt{row.points > 1 ? 's' : ''}
              {row.golden > 0 && <em>🌟 ×{row.golden}</em>}
            </span>
          </li>
        );
      })}
      {more.length > 0 && (
        <li className={`nbm-top-more ${animate ? 'is-animated' : ''}`} style={{ '--i': 0 }}>
          + {more.length} autre{more.length > 1 ? 's' : ''} dans le top 3 : {more.map((r) => playerOf(state, r.authorId).name).join(', ')}
        </li>
      )}
    </ol>
  );
}

function Sips({ state }) {
  const { results, roundSips } = state;
  const rows = Object.entries(roundSips ?? {}).filter(([, n]) => n > 0);
  const winners = results.winners.map((pid) => playerOf(state, pid));
  const losers = results.losers.map((pid) => playerOf(state, pid));
  const given = Object.entries(results.settled?.given ?? {});
  return (
    <div className="nbm-sips">
      {state.pending ? (
        <p className="lead pulse-text">
          {winners.map((p) => p.name).join(' et ')} distribue{winners.length > 1 ? 'nt' : ''} 2 gorgées…
        </p>
      ) : rows.length === 0 ? (
        <p className="lead">Personne ne boit cette fois.</p>
      ) : (
        <>
          <p className="savant-label">🍺 Gorgées</p>
          <div className="savant-sips-list">
            {rows.map(([pid, n]) => (
              <span key={pid} className="savant-sip">
                <Avatar player={playerOf(state, pid)} size={36} />
                <span>{playerOf(state, pid).name}</span>
                <strong>{n}</strong>
              </span>
            ))}
          </div>
          {given.length > 0 && (
            <p className="muted small">
              {given.map(([from, to]) => `${playerOf(state, from).name} donne ${Object.entries(to).map(([t, n]) => `${n} à ${playerOf(state, t).name}`).join(' et ')}`).join(' · ')}
            </p>
          )}
          {losers.length > 0 && (
            <p className="muted small">
              {losers.map((p) => p.name).join(', ')} : {fmtGroup('{m=dernier|f=dernière|n=en bas du classement}', losers)}
              {losers.length > 1 ? fmtGroup('{m=s|f=s|n=}', losers) : ''}, 2 gorgées.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function HostReveal({ state }) {
  useEffect(() => {
    sounds.drumroll(1500);
    const id = setTimeout(() => sounds.reveal(), 1600);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="nbm nbm-tv nbm-reveal">
      <p className="round">Manche {state.round.number} / {state.round.total}</p>
      <h1 className="nbm-attention">Les meilleures réponses…</h1>
      <Top3 state={state} animate />
    </div>
  );
}

export function HostResults({ state }) {
  const { results } = state;
  return (
    <div className="nbm nbm-tv nbm-results">
      <p className="round">Manche {state.round.number} / {state.round.total} · résultats</p>
      {results.top3.length === 0 ? (
        <h1>Personne n’a écrit à temps.</h1>
      ) : (
        <div className="nbm-results-grid">
          <Top3 state={state} />
          <Sips state={state} />
        </div>
      )}
    </div>
  );
}

/** Fin de partie : le podium des points, puis la réponse la plus drôle de la partie en très gros avec son auteur. */
const TITLES = ['La plume d’or', 'La plume d’argent', 'La plume de bronze'];
export function EndStats({ state }) {
  const rows = state.players
    .map((p) => ({ player: p, points: state.stats?.[p.id]?.points ?? 0, golden: state.stats?.[p.id]?.golden ?? 0 }))
    .sort((a, b) => b.points - a.points)
    .filter((r) => r.points > 0);
  const best = state.round?.best;
  if (!rows.length && !best) return null;
  const podium = rows.slice(0, 3);
  const author = best ? playerOf(state, best.authorId) : null;
  return (
    <section className="nbm-end">
      {best && (
        <div className="nbm-best">
          <p className="savant-label">La réponse la plus drôle de la partie · {best.points} points</p>
          <Sentence text={best.sentence} answer={best.text} big />
          <p className="nbm-best-author">
            <Avatar player={author} size={56} />
            <strong>{author.name}</strong>
          </p>
        </div>
      )}
      {podium.length > 0 && (
        <div className="nbm-plume">
          <h2>Le podium de la plume</h2>
          <div className="savant-podium-list">
            {podium.map((r, i) => (
              <div key={r.player.id} className={`savant-podium-row rank-${i + 1}`}>
                <span className="savant-medal">{['🥇', '🥈', '🥉'][i]}</span>
                <Avatar player={r.player} size={i === 0 ? 96 : 72} />
                <strong>{r.player.name}</strong>
                <span>
                  {r.points} point{r.points > 1 ? 's' : ''}
                  {r.golden > 0 ? ` · 🌟 ×${r.golden}` : ''}
                </span>
                <em>{fmt(TITLES[i], r.player)}</em>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Téléphones ----------

export function PlayerRound({ state, act }) {
  const round = state.round;
  const me = round.me;
  if (!me) return <div className="center muted">Connexion à la partie…</div>;
  if (round.step === 'waiting')
    return (
      <div className="center">
        <h1>On attend des joueurs…</h1>
        <p className="lead">Il faut au moins 3 joueurs connectés.</p>
      </div>
    );
  if (me.role === 'out')
    return (
      <div className="center">
        <h1>Manche en cours</h1>
        <p className="lead">Tu joues dès la prochaine manche. Regarde l’écran !</p>
      </div>
    );
  const key = round.phaseId;
  if (round.step === 'announce')
    return (
      <div className="center nbm-phone" key={key}>
        <p className="round">Manche {round.number} / {round.total}</p>
        <Sentence text={round.sentence} />
        <p className="lead">Prépare une réponse qui fait rire.</p>
      </div>
    );
  if (round.step === 'write') return <Write key={key} state={state} round={round} me={me} act={act} />;
  return <Rate key={key} state={state} round={round} me={me} act={act} />;
}

/** Écrire sa réponse, ou toucher l'une des 5 cartes toutes prêtes (qu'on peut ensuite modifier). */
function Write({ state, round, me, act }) {
  const [text, setText] = useState(me.myAnswer ?? '');
  const [busy, setBusy] = useState(false);
  const sent = !!me.myAnswer && me.myAnswer === text.trim();
  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    await act({ type: 'answer', text, phaseId: round.phaseId });
    setBusy(false);
  }
  return (
    <form className="vote nbm-phone" onSubmit={submit}>
      <TimerBar timer={round.timer} state={state} small>
        {(s) => `${s} s pour écrire`}
      </TimerBar>
      <Sentence text={round.sentence} small />
      <input
        className="input nbm-input"
        value={text}
        maxLength={MAX_ANSWER}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        placeholder={`Ta réponse (${MAX_ANSWER} caractères)`}
        aria-label="Ta réponse"
      />
      <button className="btn btn-primary btn-xl btn-block" disabled={!text.trim() || busy || sent}>
        {sent ? 'Envoyé ✓' : 'Envoyer'}
      </button>
      {sent && <p className="muted small">Tu peux encore la modifier tant que le chrono tourne.</p>}
      <p className="nbm-cards-title">Ou choisis une carte :</p>
      <div className="nbm-cards">
        {(me.hand ?? []).map((card) => (
          <button key={card} type="button" className={`nbm-card ${text === card ? 'is-selected' : ''}`} onClick={() => setText(card)}>
            {card}
          </button>
        ))}
      </div>
    </form>
  );
}

/** Noter la réponse affichée sur la TV, avec 4 boutons ; son auteur voit « C'est ta réponse ! » et aucun bouton. */
function Rate({ state, round, me, act }) {
  const cur = round.current;
  const [busy, setBusy] = useState(false);
  if (me.isAuthor)
    return (
      <div className="center nbm-phone">
        <h1 className="zoom-in">C’est ta réponse !</h1>
        <p className="lead">On ne vote pas pour soi. Prépare ton air innocent.</p>
        <Sentence text={round.sentence} answer={cur?.text} censored={cur?.censored} small />
      </div>
    );
  async function send(rating) {
    if (busy || me.myRating) return;
    setBusy(true);
    await act({ type: 'rate', rating, phaseId: round.phaseId });
    setBusy(false);
  }
  const locked = round.step !== 'rate' || !!me.myRating;
  return (
    <div className="vote nbm-phone">
      <p className="round">Réponse {cur?.index} / {cur?.of}</p>
      <Sentence text={round.sentence} answer={cur?.text} censored={cur?.censored} small />
      <div className="nbm-rates" role="group" aria-label="Note de la réponse">
        {RATINGS.map((r) => {
          const goldenOut = r.id === 'golden' && me.goldenUsed && me.myRating !== 'golden';
          return (
            <button
              key={r.id}
              className={`nbm-rate is-${r.id} ${me.myRating === r.id ? 'is-picked' : ''}`}
              disabled={locked || goldenOut}
              onClick={() => send(r.id)}
              aria-pressed={me.myRating === r.id}
            >
              <span className="nbm-rate-icon" aria-hidden="true">{r.icon}</span>
              <span className="nbm-rate-label">{r.label}</span>
              <small>{r.id === 'golden' ? (goldenOut ? 'Golden utilisé' : `${r.points} pts · 1 par manche`) : `${r.points} pt${r.points > 1 ? 's' : ''}`}</small>
            </button>
          );
        })}
      </div>
      <p className="muted small">
        {me.myRating ? `Noté ✓ (${RATINGS.find((r) => r.id === me.myRating)?.label}). On attend les autres…` : 'Un seul choix par réponse.'}
        {me.goldenUsed && <span className="nbm-golden-used"> · Golden utilisé 1 / 1</span>}
      </p>
    </div>
  );
}

export function PlayerResults({ state, me, act, verdict }) {
  const credits = state.results.credits?.[me.id] ?? 0;
  if (state.pending && credits > 0) return <Give key="give" state={state} me={me} credits={credits} act={act} />;
  if (state.pending)
    return (
      <div className="center suspense">
        <h1>Les gorgées se distribuent…</h1>
        <p className="lead">Un verre d’eau compte aussi.</p>
      </div>
    );
  return verdict;
}

/** « Tu distribues ! » : une grille de joueurs, une gorgée par tap ; le reste est tiré au hasard à la fin de la fenêtre de 8 s. */
function Give({ state, me, credits, act }) {
  const [alloc, setAlloc] = useState({});
  const [sent, setSent] = useState(false);
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  const others = state.players.filter((p) => p.id !== me.id && state.results.ids.includes(p.id));
  return (
    <div className="vote nbm-phone">
      <TimerBar timer={state.pendingTimer} state={state} small>
        {(s) => `${s} s`}
      </TimerBar>
      <h1 className="vote-question">
        🍺 Tu as gagné : tu distribues {credits} gorgée{credits > 1 ? 's' : ''} ({credits - used} restante{credits - used > 1 ? 's' : ''})
      </h1>
      <div className="grid grid-vote">
        {others.map((p) => (
          <button key={p.id} className={`vote-option ${alloc[p.id] ? 'is-selected' : ''}`} disabled={sent || used >= credits} onClick={() => setAlloc({ ...alloc, [p.id]: (alloc[p.id] ?? 0) + 1 })}>
            <Avatar player={p} size={72} />
            <span>
              {p.name} {alloc[p.id] ? `+${alloc[p.id]}` : ''}
            </span>
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-xl btn-block" disabled={sent} onClick={() => (setSent(true), act({ type: 'allocate', allocation: alloc }))}>
        {sent ? 'Envoyé' : 'Valider (le reste au hasard)'}
      </button>
      <button className="btn btn-ghost" disabled={sent} onClick={() => setAlloc({})}>
        Recommencer
      </button>
    </div>
  );
}

export function verdict(state, me) {
  const r = state.results;
  const drinks = (state.roundSips?.[me.id] ?? 0) > 0;
  const gave = Object.keys(r.settled?.given?.[me.id] ?? {}).length > 0;
  const mine = r.board.find((row) => row.authorId === me.id);
  const won = r.winners.includes(me.id);
  let detail;
  if (!mine) detail = 'Tu n’as pas écrit à temps : pas de points cette manche.';
  else if (mine.censored) detail = '🙈 Ta réponse a été masquée par l’hôte : pas de punition, promis.';
  else if (won) detail = `🏆 {m=Tu es le gagnant|f=Tu es la gagnante|n=Tu remportes la manche} avec ${mine.points} points : tu distribues.`;
  else detail = `Ta réponse : ${mine.points} point${mine.points > 1 ? 's' : ''}, rang ${mine.rank}${mine.golden ? ` · 🌟 ×${mine.golden}` : ''}.`;
  const extra = r.best ? `Meilleure réponse : « ${r.best.text} » (${playerOf(state, r.best.authorId).name})` : null;
  const title = drinks ? 'Tu bois !' : gave || won ? 'Bien joué !' : 'Tu ne bois pas';
  return { drinks, title, detail, extra };
}
