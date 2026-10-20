// Le Savant : écrans de la TV (question, lecture des réponses, choix, révélation, podium) et des téléphones (écrire, désigner le
// Savant, distribuer ses gorgées). Chaque écran est remonté avec une `key` basée sur l'identifiant d'étape (`phaseId`), et toute
// action porte ce `phaseId` : le serveur ignore ce qui vient d'une étape passée.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Avatar, TimerBar } from '../components.jsx';
import { sipsLabel } from '../sips.jsx';
import { sounds } from '../sound.js';

export const id = 'savant';
export const waitingText = 'Un seul d’entre vous connaît la vérité…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Manche suivante';

const MOCKS = [
  'Les autres écrivent… ça sent le mensonge.',
  'Quelqu’un connaît la vérité. Les autres bluffent comme ils respirent.',
  'Prépare ton regard de détective.',
  'Chut. Ils sont en train de mentir.',
  'Ne regarde pas leurs écrans, ils sont fragiles.',
  'Garde ton sérieux. Eux n’en ont déjà plus.',
];
const hash = (text) => [...String(text)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

const playerOf = (state, pid) => state.players.find((p) => p.id === pid) ?? { id: pid, name: '?', photoUrl: null };
const names = (state, ids) => ids.map((pid) => playerOf(state, pid).name).join(', ');

/** La question, avec son trou mis en évidence. */
function Question({ text, big = false }) {
  const parts = String(text ?? '').split('___');
  return (
    <h1 className={`savant-question ${big ? 'is-big' : ''}`}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <span className="savant-blank">___</span>}
        </Fragment>
      ))}
    </h1>
  );
}

const sizeFor = (n) => (n > 20 ? 30 : n > 12 ? 40 : 56);
const densityOf = (n) => (n > 20 ? 'is-xdense' : n > 12 ? 'is-dense' : '');

/**
 * Les réponses, avec leur auteur. mode « read » : elles apparaissent une à une (`--i` × `--step`) ; mode « reveal » / « results » :
 * le Savant est mis en valeur, le choix du Chercheur marqué, et chaque vote est visible sur la réponse choisie.
 */
function Cards({ state, round, results, animate = false, onCensor }) {
  const cards = round.cards ?? [];
  const n = cards.length;
  return (
    <div className={`savant-cards ${densityOf(n)}`} style={{ '--step': `${animate ? round.readStepMs : 0}ms` }}>
      {cards.map((c, i) => {
        const author = playerOf(state, c.id);
        const voters = results ? Object.entries(results.votes).filter(([, target]) => target === c.id).map(([voter]) => voter) : [];
        const dry = c.text == null && !c.censored;
        return (
          <div
            key={c.id}
            className={`savant-card ${results?.savantId === c.id ? 'is-savant' : ''} ${results?.choice === c.id ? 'is-choice' : ''} ${c.censored ? 'is-censored' : ''} ${dry ? 'is-dry' : ''}`}
            style={{ '--i': i }}
            onClick={onCensor ? () => onCensor(c.id) : undefined}
            title={onCensor ? 'Touche pour masquer cette réponse' : undefined}
          >
            <div className="savant-card-head">
              <Avatar player={author} size={sizeFor(n)} />
              <span className="savant-card-name">{author.name}</span>
            </div>
            <span className="savant-card-text">{c.censored ? '🙈 censurée' : dry ? 'a séché…' : c.text}</span>
            {results && (voters.length > 0 || results.choice === c.id) && (
              <span className="savant-card-votes">
                {results.choice === c.id && <em className="savant-pointed">👉 {playerOf(state, results.seekerId).name}</em>}
                {voters.slice(0, 8).map((v) => (
                  <Avatar key={v} player={playerOf(state, v)} size={22} />
                ))}
                {voters.length > 8 && <em>+{voters.length - 8}</em>}
                {voters.length > 0 && <em className="savant-votecount">×{voters.length}</em>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Un petit son à chaque réponse qui apparaît pendant la lecture (si le son est actif). */
function useCardSounds(round) {
  const { phaseId, step } = round;
  const n = round.cards?.length ?? 0;
  const gap = round.readStepMs;
  useEffect(() => {
    if (step !== 'read') return undefined;
    const ids = Array.from({ length: n }, (_, i) => setTimeout(() => sounds.tick(n > 1 ? i / (n - 1) : 0), 150 + i * gap));
    return () => ids.forEach(clearTimeout);
  }, [phaseId, step, n, gap]);
}

// ---------- TV ----------

export function HostQuestion({ state, gameAct }) {
  const round = state.round;
  useCardSounds(round);
  const censor = (pid) => gameAct({ type: 'censor', id: pid });
  let body;
  if (round.step === 'waiting') {
    body = (
      <>
        <h1>On attend des joueurs…</h1>
        <p className="lead">Il faut au moins 4 joueurs connectés pour jouer au Savant.</p>
      </>
    );
  } else if (round.step === 'announce') {
    const seeker = playerOf(state, round.seekerId);
    body = (
      <div className="savant-announce" key={round.phaseId}>
        {round.restarted && <p className="savant-restart">Le Chercheur a disparu : on recommence avec une autre question !</p>}
        <p className="round">Manche {round.number}</p>
        <Avatar player={seeker} size={160} className="savant-seeker" />
        <h1>Au tour de {seeker.name} de chercher !</h1>
        <p className="lead">Un seul d’entre vous connaît la vérité. Les autres inventent.</p>
      </div>
    );
  } else if (round.step === 'write') {
    body = (
      <div className="savant-write" key={round.phaseId}>
        <p className="round">Manche {round.number} · {playerOf(state, round.seekerId).name} cherche</p>
        <Question text={round.question} big />
        <p className="savant-count">
          <strong>{round.written.n}</strong> / {round.written.of} ont écrit
        </p>
        <TimerBar timer={round.timer} state={state}>
          {(s) => `${s} s pour écrire`}
        </TimerBar>
      </div>
    );
  } else {
    // Lecture, puis choix : la question à gauche, les réponses à droite.
    const choosing = round.step === 'choice';
    body = (
      <div className={`savant-board ${densityOf(round.cards?.length ?? 0)}`} key={round.phaseId}>
        <div className="savant-side">
          <p className="round">Manche {round.number}</p>
          <Question text={round.question} />
          {choosing ? (
            <>
              <p className="savant-think">🕵️ {playerOf(state, round.seekerId).name} réfléchit…</p>
              <p className="savant-count">
                <strong>{round.voted.n}</strong> / {round.voted.of} ont voté
              </p>
              <TimerBar timer={round.timer} state={state}>
                {(s) => `${s} s pour désigner le Savant`}
              </TimerBar>
            </>
          ) : (
            <p className="lead">Lisez bien. Un seul dit la vérité.</p>
          )}
          <p className="muted small">Touche une réponse pour la masquer si elle est déplacée.</p>
        </div>
        <Cards state={state} round={round} animate={!choosing} onCensor={censor} />
      </div>
    );
  }
  return <div className={`savant savant-tv savant-step-${round.step}`}>{body}</div>;
}

/** Révélation (et résultats) : la vraie réponse, l'explication, le Savant démasqué, le choix du Chercheur et tous les votes. */
function Board({ state, animate }) {
  const { round, results } = state;
  const seeker = playerOf(state, results.seekerId);
  const savant = playerOf(state, results.savantId);
  const choice = results.choice ? playerOf(state, results.choice) : null;
  const cls = animate ? 'is-animated' : 'is-static';
  return (
    <div className={`savant savant-tv savant-reveal ${cls}`}>
      {animate && (
        <div className="savant-attention" aria-hidden="true">
          <h1>Attention…</h1>
          <div className="suspense-dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      <div className={`savant-board ${densityOf(round.cards?.length ?? 0)}`}>
        <div className="savant-side">
          <Question text={results.question} />
          <div className="savant-truth-block">
            <p className="savant-label">La vraie réponse</p>
            <p className="savant-answer">{results.answer}</p>
          </div>
          <p className="savant-explication">{results.explication}</p>
          <p className="savant-who">
            🧠 Le Savant était <Avatar player={savant} size={34} /> <strong>{savant.name}</strong>
          </p>
          <p className={`savant-verdict ${results.found ? 'is-found' : 'is-missed'}`}>
            {choice
              ? results.found
                ? `${seeker.name} l’a trouvé !`
                : `${seeker.name} a désigné ${choice.name}… raté !`
              : `${seeker.name} n’a désigné personne : raté !`}
          </p>
          {state.phase === 'results' && !state.pending && <Sips state={state} />}
          {state.phase === 'results' && state.pending && <p className="lead pulse-text">Les gorgées se distribuent…</p>}
        </div>
        <Cards state={state} round={round} results={results} />
      </div>
    </div>
  );
}

/** Qui boit quoi (les gorgées définitives du tour), avec les points gagnés. */
function Sips({ state }) {
  const { results, roundSips } = state;
  const rows = Object.entries(roundSips ?? {}).filter(([, n]) => n > 0);
  const given = Object.entries(results.settled?.given ?? {});
  const dense = rows.length > 8;
  return (
    <div className="savant-sips">
      {rows.length === 0 ? <p className="lead">Personne ne boit.</p> : <p className="savant-label">🍺 Gorgées</p>}
      <div className={`savant-sips-list ${dense ? 'is-dense' : ''}`}>
        {rows.map(([pid, n]) => (
          <span key={pid} className="savant-sip" title={`${playerOf(state, pid).name} : ${sipsLabel(n)}`}>
            <Avatar player={playerOf(state, pid)} size={dense ? 30 : 36} />
            {!dense && <span>{playerOf(state, pid).name}</span>}
            <strong>{n}</strong>
          </span>
        ))}
      </div>
      {given.length > 0 && (
        <p className="muted small">
          {given
            .slice(0, 4)
            .map(([from, to]) => `${playerOf(state, from).name} donne ${Object.entries(to).map(([t, n]) => `${n} à ${playerOf(state, t).name}`).join(' et ')}`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}

export function HostReveal({ state }) {
  useEffect(() => {
    sounds.drumroll(1700);
    const id = setTimeout(() => sounds.reveal(), 1900);
    return () => clearTimeout(id);
  }, []);
  return <Board state={state} animate />;
}

export function HostResults({ state }) {
  return <Board state={state} animate={false} />;
}

/** Fin de partie : le podium des points, avec un titre moqueur pour chacun. */
const TITLES = ['Le Savant du village', 'Le détective de comptoir', 'Le bluffeur qui ne rougit jamais'];
export function EndStats({ state }) {
  const rows = state.players
    .map((p) => ({ player: p, points: state.stats?.[p.id]?.points ?? 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .filter((r) => r.points > 0);
  if (!rows.length) return null;
  return (
    <section className="savant-podium">
      <h2>Le podium du Savant</h2>
      <div className="savant-podium-list">
        {rows.map((r, i) => (
          <div key={r.player.id} className={`savant-podium-row rank-${i + 1}`}>
            <span className="savant-medal">{['🥇', '🥈', '🥉'][i]}</span>
            <Avatar player={r.player} size={i === 0 ? 96 : 72} />
            <strong>{r.player.name}</strong>
            <span>{r.points} point{r.points > 1 ? 's' : ''}</span>
            <em>{TITLES[i]}</em>
          </div>
        ))}
      </div>
      <p className="muted small">Un verre d’eau compte aussi.</p>
    </section>
  );
}

// ---------- Téléphones ----------

export function PlayerRound({ state, me: player, act, vote, myVote }) {
  const round = state.round;
  const me = round.me;
  if (!me) return <div className="center muted">Connexion à la partie…</div>;
  if (round.step === 'waiting')
    return (
      <div className="center">
        <h1>On attend des joueurs…</h1>
        <p className="lead">Il faut au moins 4 joueurs connectés.</p>
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
      <div className="center savant-phone" key={key}>
        <h1>{me.role === 'seeker' ? '🕵️ À toi de chercher !' : '✍️ Tu es Écrivain'}</h1>
        <p className="lead">
          {me.role === 'seeker' ? 'Un seul joueur connaît la vérité. Démasque-le.' : 'Sois crédible. Un seul d’entre vous connaît la vérité.'}
        </p>
      </div>
    );
  if (round.step === 'write') return <Write key={key} state={state} round={round} me={me} act={act} />;
  if (round.step === 'read')
    return (
      <div className="center savant-phone" key={key}>
        <h1>👀 Lis les réponses</h1>
        <p className="lead">Regarde l’écran : un seul dit la vérité.</p>
        {me.myAnswer && <p className="muted">Ta réponse : « {me.myAnswer} »</p>}
      </div>
    );
  return <Choose key={key} state={state} round={round} me={me} player={player} vote={vote} myVote={myVote ?? me.vote} />;
}

function Write({ state, round, me, act }) {
  const [text, setText] = useState(me.myAnswer ?? '');
  const [busy, setBusy] = useState(false);
  const mock = useMemo(() => MOCKS[hash(round.phaseId) % MOCKS.length], [round.phaseId]);
  if (me.role === 'seeker')
    return (
      <div className="center savant-phone">
        <h1>🕵️ Les autres écrivent…</h1>
        <p className="lead">{mock}</p>
        <TimerBar timer={round.timer} state={state} small>
          {(s) => `${s} s`}
        </TimerBar>
      </div>
    );
  const sent = !!me.myAnswer && me.myAnswer === text.trim();
  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    await act({ type: 'answer', text, phaseId: round.phaseId });
    setBusy(false);
  }
  return (
    <form className="vote savant-phone" onSubmit={submit}>
      <TimerBar timer={round.timer} state={state} small>
        {(s) => `${s} s pour écrire`}
      </TimerBar>
      <h2 className="savant-question-small">{round.question}</h2>
      {me.truth ? (
        <div className="savant-truth">
          <p className="savant-label">Tu es le Savant 🧠 · la vraie réponse :</p>
          <p className="savant-answer">{me.truth}</p>
          <p className="muted">Reformule-la avec tes mots, sans te trahir.</p>
        </div>
      ) : (
        <p className="lead">Invente une réponse crédible.</p>
      )}
      <input
        className="input savant-input"
        value={text}
        maxLength={60}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        placeholder={me.truth ? 'Ta reformulation' : 'Ta réponse (60 caractères)'}
        aria-label="Ta réponse"
      />
      <button className="btn btn-primary btn-xl btn-block" disabled={!text.trim() || busy || sent}>
        {sent ? 'Envoyé ✓' : 'Envoyer'}
      </button>
      {sent && <p className="muted small">Tu peux encore la modifier tant que le chrono tourne.</p>}
    </form>
  );
}

function Choose({ state, round, me, player, vote, myVote }) {
  const options = (round.cards ?? []).filter((c) => c.id !== player.id);
  return (
    <div className="vote savant-phone">
      <TimerBar timer={round.timer} state={state} small>
        {(s) => `${s} s pour voter`}
      </TimerBar>
      <h1 className="vote-question">{me.role === 'seeker' ? '🕵️ Qui est le Savant ?' : 'Qui est le Savant ? (vote secret)'}</h1>
      <div className="savant-options">
        {options.map((c) => {
          const author = playerOf(state, c.id);
          return (
            <button key={c.id} className={`savant-option ${myVote === c.id ? 'is-selected' : ''}`} onClick={() => vote(c.id)}>
              <Avatar player={author} size={48} />
              <span className="savant-option-body">
                <strong>{author.name}</strong>
                <span>{c.censored ? '🙈 censurée' : c.text ?? 'a séché…'}</span>
              </span>
            </button>
          );
        })}
      </div>
      {myVote && <p className="savant-saved">Vote enregistré, suspense… (tu peux encore changer)</p>}
    </div>
  );
}

export function PlayerResults({ state, me, act, verdict }) {
  const { results } = state;
  const credits = results.credits?.[me.id] ?? 0;
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
    <div className="vote savant-phone">
      <TimerBar timer={state.pendingTimer} state={state} small>
        {(s) => `${s} s`}
      </TimerBar>
      <h1 className="vote-question">
        🍺 Tu distribues {credits} gorgée{credits > 1 ? 's' : ''} ({credits - used} restante{credits - used > 1 ? 's' : ''})
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
  const points = r.points?.[me.id] ?? 0;
  const extra = points > 0 ? `+${points} point${points > 1 ? 's' : ''}` : 'Un verre d’eau compte aussi.';
  const gave = Object.keys(r.settled?.given?.[me.id] ?? {}).length > 0;
  let detail;
  if (me.id === r.seekerId) detail = r.found ? '🕵️ Tu as trouvé le Savant !' : '🕵️ Tu t’es trompé de Savant.';
  else if (me.id === r.savantId) detail = r.found ? '🧠 Tu étais le Savant : démasqué !' : '🧠 Tu étais le Savant : personne ne t’a cru.';
  else if (r.bluffers?.includes(me.id)) detail = r.choice === me.id ? '🎭 Le Chercheur est tombé dans ton piège !' : '🎭 Bluffeur';
  else detail = 'Tu regardais le spectacle.';
  return { drinks, title: drinks ? 'Tu bois !' : gave ? 'Bien joué !' : 'Tu ne bois pas', detail, extra };
}
