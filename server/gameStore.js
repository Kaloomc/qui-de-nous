import { randomBytes, randomInt } from 'node:crypto';
import { GAMES, isGame, isPlayable, partyGames } from './games/index.js';
import { eligibleGames, PARTY_DURATIONS, pickNextBlock, TRANSITION_MS } from './party.js';
import { computeTrophies, recordRound, sipsRanking } from './recap.js';
import { QuestionHistory } from './questionHistory.js';
import { TIMING } from './timing.js';

export { TIMING };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
const GAME_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 20;
export const MAX_PLAYERS = 50;
const MAX_PHOTO_BYTES = 300 * 1024;
const PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;


export const SETTING_CHOICES = {
  resultsMs: [5000, 10000, 15000, 20000],
  voteMs: [0, 15000, 30000, 45000],
  maxRounds: [0, 10, 20, 30],
};

export const DEFAULT_SETTINGS = { auto: false, resultsMs: 10000, voteMs: 0, maxRounds: 0 };
/** Mode soirée sans minuteur de vote réglé : on en met un, pour qu'un joueur distrait ne bloque pas l'enchaînement. */
const PARTY_VOTE_MS = 30000;
const PARTY_MESSAGE = 'Le mode soirée est en cours : termine la soirée d’abord.';
const LATE_MESSAGE = 'Tu joues dès la prochaine manche.';
const ADULT_PENDING_MESSAGE = 'Le mode 18+ attend la confirmation de tous les joueurs : attends-les, retire ceux qui bloquent ou annule.';

const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

const token = () => randomBytes(12).toString('hex');

function parsePhoto(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = PHOTO_DATA_URL.exec(dataUrl);
  if (!match) return null;
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0 || data.length > MAX_PHOTO_BYTES) return null;
  // Vrai type du fichier (signature), pas seulement l'en-tête de la data URL.
  const signature = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] }[match[1]];
  if (!signature.every((byte, i) => data[i] === byte)) return null;
  if (match[1] === 'image/webp' && data.toString('latin1', 8, 12) !== 'WEBP') return null;
  return { mime: match[1], data };
}

export function sanitizeSettings(patch) {
  const clean = {};
  if (!patch || typeof patch !== 'object') return clean;
  if (typeof patch.auto === 'boolean') clean.auto = patch.auto;
  for (const [key, allowed] of Object.entries(SETTING_CHOICES)) {
    if (allowed.includes(patch[key])) clean[key] = patch[key];
  }
  return clean;
}

/**
 * Une partie. Phases : picking (choix du jeu) → lobby → question (manche en cours) → revealing → results → … → ended.
 * `mode` est l'id du jeu en cours (voir shared/games.js) ; null tant que l'hôte n'a pas choisi.
 * Le serveur est la seule source de vérité : les minuteurs (vote, révélation,
 * question suivante) vivent ici, et `onChange` prévient les écrans quand l'un d'eux fait avancer la partie.
 *
 * Chaque jeu (server/games/*.js) peut ajouter des crochets optionnels pour sortir du schéma « tout le monde vote » :
 *   drawQuestion(game), startRound(game), acceptsVotes(game), isValidVote(game, choice, playerId),
 *   expectedVoters(game, players), handleAction(game, playerId, payload), hostAction(game, payload),
 *   computeResults(playerIds, votes, game), afterReveal(game) → true si le résultat attend une action,
 *   resolvePending(game), sipsOf(results), updateStats(stats, results, game), onPresenceChange(game),
 *   publicRound(game, viewer).
 * `game.roundData` est l'état privé de la manche, réservé au jeu.
 */
export class Game {
  constructor(code, mode = null, { clock = realClock, onChange = () => {} } = {}) {
    this.code = code;
    this.mode = isPlayable(mode) ? mode : null;
    this.clock = clock;
    this.onChange = onChange;
    this.hostSecret = token();
    this.hostSockets = new Set();
    this.players = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.timers = {};
    this.pausedTimers = {};
    // Questions déjà posées à ce groupe : survit à reset(), donc à « Rejouer » et « Changer de jeu ».
    this.history = new QuestionHistory();
    // Gorgées de toute la soirée, par joueur : survit aussi à reset(). Seule une nouvelle partie (nouveau QR code)
    // ou le bouton « Remettre les compteurs à zéro » de l'hôte les efface.
    this.partySips = new Map();
    // Statistiques de la soirée pour les trophées du récap (server/recap.js), et jeux joués : survivent aussi à reset().
    this.partyStats = new Map();
    this.playedModes = new Set();
    // Mode soirée (enchaînement automatique des jeux), null hors soirée. Voir startParty().
    this.party = null;
    // Mode 18+ : actif seulement quand chaque joueur connecté a confirmé sur son téléphone (voir requestAdult()).
    // Mémoire de la partie uniquement : rien n'est gardé une fois la partie supprimée.
    this.adult = { active: false, pending: false, confirmed: new Set(), refused: new Set(), changedAt: 0 };
    this.reset();
    this.touch();
  }

  reset() {
    this.clearTimers();
    this.phase = this.mode ? 'lobby' : 'picking';
    this.paused = false;
    this.round = 0;
    this.question = null;
    this.votes = new Map();
    this.results = null;
    this.roundPlayerIds = null;
    this.reveal_ = null;
    this.waitingForPlayers = false;
    this.sips = new Map(); // gorgées du jeu en cours
    this.roundSips = null;
    this.roundData = {};
    this.pending = false;
    this.stats = new Map();
  }

  /**
   * Seul point d'entrée du comptage : un joueur boit n gorgées (1 par défaut, 2 pour « boit deux fois »,
   * le nombre du défi à la Roue…). Compte pour le jeu en cours et pour le total de la soirée.
   */
  drink(playerId, n = 1) {
    if (!this.players.has(playerId) || !Number.isInteger(n) || n <= 0) return 0;
    this.sips.set(playerId, (this.sips.get(playerId) ?? 0) + n);
    this.partySips.set(playerId, (this.partySips.get(playerId) ?? 0) + n);
    if (this.roundSips) this.roundSips[playerId] = (this.roundSips[playerId] ?? 0) + n;
    return n;
  }

  /** Remet les compteurs de la soirée à zéro (bouton de l'hôte), sans toucher au tour en cours. */
  resetPartySips() {
    this.partySips = new Map();
    this.sips = new Map();
    return null;
  }

  /** Ajoute les gorgées du tour au total, une seule fois, à la fin du suspense (jamais avant : pas de spoiler). */
  applySips() {
    if (this.roundSips || !this.results) return;
    this.roundSips = {};
    for (const [id, n] of Object.entries(this.rules.sipsOf(this.results))) this.drink(id, n);
    if (this.rules.updateStats) {
      const stats = Object.fromEntries([...this.players.keys()].map((id) => [id, this.stats.get(id) ?? {}]));
      this.rules.updateStats(stats, this.results, this);
      for (const [id, value] of Object.entries(stats)) if (this.players.has(id)) this.stats.set(id, value);
    }
    recordRound(this.partyStats, this.mode, this.results, [...this.players.keys()]);
    this.playedModes.add(this.mode);
  }

  /** Résultat définitif : gorgées et statistiques comptées, le mode auto peut enchaîner. */
  finalize() {
    if (this.phase !== 'results' && this.phase !== 'revealing') return;
    if (this.pending) this.rules.resolvePending?.(this);
    this.pending = false;
    this.cancel('pending');
    this.applySips();
    this.evaluate();
  }

  /** Joueurs connectés qui jouent la manche en cours (un retardataire du mode soirée attend la suivante). */
  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.sockets.size > 0 && !this.isLate(p.id));
  }

  /** Hors de la manche : retardataire du mode soirée, ou joueur qui n'a pas (encore) confirmé le mode 18+. */
  isLate(playerId) {
    return !!this.party?.late.has(playerId) || !this.adultAllowed(playerId);
  }

  // ---------- Mode 18+ ----------

  get adultActive() {
    return this.adult.active;
  }

  /** Ce joueur peut voir le contenu de la partie : mode normal, ou mode 18+ qu'il a confirmé. */
  adultAllowed(playerId) {
    return !this.adult.active || this.adult.confirmed.has(playerId);
  }

  /** Joueurs connectés qui empêchent l'activation (pas encore répondu, ou « non »). */
  adultBlockers() {
    return [...this.players.values()].filter((p) => p.sockets.size > 0 && !this.adult.confirmed.has(p.id));
  }

  /** L'hôte demande le mode 18+ : chaque joueur connecté doit confirmer sur son téléphone. */
  requestAdult() {
    if (this.adult.active) return 'Le mode 18+ est déjà activé.';
    if (!['picking', 'lobby', 'ended'].includes(this.phase) || this.partyActive) return 'Active le mode 18+ entre deux parties (grille des jeux ou lobby).';
    if (this.connectedCount() === 0) return 'Il faut au moins un joueur connecté.';
    this.adult = { ...this.adult, pending: true, confirmed: new Set(), refused: new Set() };
    this.checkAdult();
    return null;
  }

  cancelAdult() {
    this.adult.pending = false;
    this.adult.refused.clear();
    return null;
  }

  /** Retour au mode normal, à tout moment. Une manche en cours (contenu 18+) est abandonnée. */
  disableAdult() {
    const wasActive = this.adult.active;
    this.adult = { active: false, pending: false, confirmed: new Set(), refused: new Set(), changedAt: wasActive ? this.clock.now() : this.adult.changedAt };
    if (wasActive && ['question', 'revealing', 'results'].includes(this.phase)) {
      if (this.partyActive) this.partyNextGame();
      else this.reset();
    }
    return null;
  }

  /**
   * Réponse d'un joueur (pendant la demande, ou à son arrivée si le mode est déjà actif).
   * Un « non » une fois le mode actif : il ne rejoint pas la partie (removed: true).
   */
  answerAdult(playerId, yes) {
    if (!this.players.has(playerId)) return { error: 'Tu n’es plus dans la partie.' };
    if (typeof yes !== 'boolean') return { error: 'Réponse invalide.' };
    if (!this.adult.pending && !this.adult.active) return { error: 'Rien à confirmer.' };
    if (yes) {
      this.adult.confirmed.add(playerId);
      this.adult.refused.delete(playerId);
    } else {
      this.adult.confirmed.delete(playerId);
      this.adult.refused.add(playerId);
      if (this.adult.active) {
        this.removePlayer(playerId);
        return { removed: true };
      }
    }
    this.checkAdult();
    this.evaluate();
    return {};
  }

  /** Active le mode dès que tous les joueurs connectés ont confirmé. */
  checkAdult() {
    if (!this.adult.pending || this.connectedCount() === 0 || this.adultBlockers().length > 0) return;
    this.adult.pending = false;
    this.adult.active = true;
    this.adult.refused.clear();
    this.adult.changedAt = this.clock.now();
  }

  adultState(viewer) {
    const a = this.adult;
    if (viewer.host) {
      return { active: a.active, pending: a.pending, confirmedIds: [...a.confirmed], refusedIds: [...a.refused], changedAt: a.changedAt };
    }
    const id = viewer.playerId;
    const answer = a.confirmed.has(id) ? 'yes' : a.refused.has(id) ? 'no' : null;
    // Un joueur qui n'a pas confirmé ne sait même pas que le thème est actif : il voit seulement la question de l'âge.
    return { active: a.active && answer === 'yes', pending: a.pending, gate: a.active && answer !== 'yes', answer, changedAt: a.changedAt };
  }

  get rules() {
    return GAMES[this.mode];
  }

  touch() {
    this.lastActivity = this.clock.now();
  }

  get isActive() {
    return this.hostSockets.size > 0 || [...this.players.values()].some((p) => p.sockets.size > 0);
  }

  // ---------- Minuteurs ----------

  schedule(name, ms, fn, total = ms) {
    this.cancel(name);
    const id = this.clock.setTimeout(() => {
      delete this.timers[name];
      // Une erreur dans un minuteur ne doit jamais faire tomber le serveur.
      try {
        fn();
      } catch (err) {
        console.error(`[minuteur ${name}] partie ${this.code}`, err);
      }
      try {
        this.onChange(this);
      } catch (err) {
        console.error(`[diffusion] partie ${this.code}`, err);
      }
    }, ms);
    this.timers[name] = { id, endsAt: this.clock.now() + ms, total, fn, pausable: false };
  }

  /** Comme schedule, mais gelé tant que la partie est en pause. */
  schedulePausable(name, ms, fn, total = ms) {
    if (this.paused) {
      this.cancel(name);
      this.pausedTimers[name] = { remaining: ms, total, fn };
    } else {
      delete this.pausedTimers[name];
      this.schedule(name, ms, fn, total);
      this.timers[name].pausable = true;
    }
  }

  cancel(name) {
    const timer = this.timers[name];
    if (timer) {
      this.clock.clearTimeout(timer.id);
      delete this.timers[name];
    }
    delete this.pausedTimers[name];
  }

  clearTimers() {
    for (const name of Object.keys(this.timers ?? {})) this.cancel(name);
    this.pausedTimers = {};
  }

  dispose() {
    this.clearTimers();
  }

  // ---------- Joueurs ----------

  findPlayer(playerId, secret) {
    const player = this.players.get(playerId);
    return player && player.secret === secret ? player : null;
  }

  upsertPlayer({ playerId, secret, name, photo }) {
    // Caractères de contrôle et d'inversion de sens retirés (ils cassent l'affichage sur la TV).
    const cleanName =
      typeof name === 'string'
        ? name.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
        : '';
    if (!cleanName) return { error: 'Choisis un prénom.' };
    const parsedPhoto = photo ? parsePhoto(photo) : null;
    if (photo && !parsedPhoto) return { error: 'Photo invalide ou trop lourde.' };

    let player = this.findPlayer(playerId, secret);
    if (!player) {
      if (this.players.size >= MAX_PLAYERS) return { error: `La partie est complète (${MAX_PLAYERS} joueurs maximum).` };
      let id;
      do id = token().slice(0, 8);
      while (this.players.has(id));
      player = { id, secret: token(), sockets: new Set(), disconnectedAt: null, photo: null, photoVersion: 0 };
      this.players.set(id, player);
      // Arrivé en pleine manche du mode soirée : il joue à partir de la manche suivante.
      if (this.partyActive && ['question', 'revealing', 'results'].includes(this.phase)) this.party.late.add(id);
    }
    player.name = cleanName;
    if (parsedPhoto) {
      player.photo = parsedPhoto;
      player.photoVersion += 1;
    }
    return { player };
  }

  connectPlayer(player, socketId) {
    player.sockets.add(socketId);
    player.disconnectedAt = null;
    this.checkAdult();
    this.rules?.onPresenceChange?.(this);
    this.evaluate();
  }

  disconnectPlayer(player, socketId) {
    player.sockets.delete(socketId);
    if (player.sockets.size === 0) player.disconnectedAt = this.clock.now();
    // Celui qui bloquait la demande du mode 18+ est parti : les autres peuvent l'activer.
    this.checkAdult();
    this.rules?.onPresenceChange?.(this);
    this.evaluate();
  }

  removePlayer(playerId) {
    // Ses gorgées restent dans partySips (le total de la soirée reste cohérent), mais il sort du classement.
    this.players.delete(playerId);
    this.party?.late.delete(playerId);
    this.votes.delete(playerId);
    for (const [voter, target] of this.votes) if (target === playerId) this.votes.delete(voter);
    this.stats.delete(playerId);
    this.adult.confirmed.delete(playerId);
    this.adult.refused.delete(playerId);
    this.checkAdult();
    this.rules?.onPresenceChange?.(this);
    this.evaluate();
  }

  connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.sockets.size > 0) n += 1;
    return n;
  }

  /** Joueurs dont on attend le vote : connectés, ou déconnectés depuis moins que le délai de grâce. */
  expectedVoters() {
    const now = this.clock.now();
    return [...this.players.values()].filter(
      (p) => !this.isLate(p.id) && (p.sockets.size > 0 || (p.disconnectedAt != null && now - p.disconnectedAt < TIMING.disconnectGraceMs)),
    );
  }

  get votingOpen() {
    return this.phase === 'question' && (this.rules.acceptsVotes ? this.rules.acceptsVotes(this) : true);
  }

  allExpectedVoted() {
    if (this.connectedCount() < 2 || !this.votingOpen) return false;
    const expected = this.rules.expectedVoters ? this.rules.expectedVoters(this, this.expectedVoters()) : this.expectedVoters();
    return expected.length > 0 && expected.every((p) => this.votes.has(p.id));
  }

  /** Ouvre le vote plus tard dans la manche (jeux qui ont d'autres étapes avant, comme l'Imposteur). */
  openVoting() {
    if (this.settings.voteMs > 0) this.schedulePausable('vote', this.settings.voteMs, () => this.onVoteTimeout());
    this.evaluate();
  }

  /** Action d'un joueur propre au jeu (passer la bombe, taper, deviner…). */
  action(playerId, payload) {
    if (!this.players.has(playerId)) return 'Tu n’es plus dans la partie.';
    if (this.isLate(playerId)) return LATE_MESSAGE;
    if (!this.rules?.handleAction) return 'Action inconnue.';
    const error = this.rules.handleAction(this, playerId, payload ?? {});
    if (!error) this.evaluate();
    return error;
  }

  /** Action de l'hôte propre au jeu (« Suivant », « Lancer la roue »…). */
  gameHostAction(payload) {
    if (!this.rules?.hostAction) return 'Action inconnue.';
    const error = this.rules.hostAction(this, payload ?? {});
    if (!error) this.evaluate();
    return error;
  }

  // ---------- Déroulement ----------

  start() {
    if (this.partyActive) return PARTY_MESSAGE;
    if (this.adult.pending) return ADULT_PENDING_MESSAGE;
    if (this.phase === 'picking') return 'Choisis d’abord un jeu.';
    if (this.phase !== 'lobby') return 'La partie a déjà commencé.';
    const min = this.rules.minToStart ?? 2;
    if (this.players.size < min) return `Il faut au moins ${min} joueurs.`;
    return this.nextQuestion();
  }

  /** expectedRound : numéro de la question que l'appelant croit terminer ; sert à ignorer les doublons. */
  nextQuestion(expectedRound) {
    if (expectedRound != null && expectedRound !== this.round) return null;
    if (this.phase === 'revealing') return 'Patiente, la révélation est en cours.';
    if (this.phase !== 'lobby' && this.phase !== 'results') return 'Action impossible maintenant.';
    if (this.phase === 'results' && this.pending) this.finalize();
    for (const name of Object.keys(this.timers)) if (name.startsWith('g:') || name === 'next') this.cancel(name);
    for (const name of Object.keys(this.pausedTimers)) if (name.startsWith('g:')) delete this.pausedTimers[name];
    this.party?.late.clear();
    this.question = this.drawQuestion();
    this.round += 1;
    this.votes = new Map();
    this.results = null;
    this.reveal_ = null;
    this.roundSips = null;
    this.roundData = {};
    this.pending = false;
    this.waitingForPlayers = false;
    this.phase = 'question';
    this.rules.startRound?.(this);
    if (this.votingOpen && this.settings.voteMs > 0) this.schedulePausable('vote', this.settings.voteMs, () => this.onVoteTimeout());
    this.evaluate();
    return null;
  }

  drawQuestion() {
    if (this.rules.drawQuestion) return this.rules.drawQuestion(this);
    return this.history.draw(this.mode, this.rules.questions);
  }

  vote(playerId, choice) {
    if (!this.votingOpen) return 'Le vote est fermé.';
    if (!this.players.has(playerId)) return 'Tu n’es plus dans la partie.';
    if (this.isLate(playerId)) return LATE_MESSAGE;
    if (!this.rules.isValidVote(this, choice, playerId)) return 'Choix invalide.';
    this.votes.set(playerId, choice);
    this.evaluate();
    return null;
  }

  reveal(expectedRound) {
    if (expectedRound != null && expectedRound !== this.round) return null;
    if (this.phase === 'revealing' || this.phase === 'results') return null;
    if (this.phase !== 'question') return 'Aucune question en cours.';
    this.cancel('vote');
    this.cancel('autoReveal');
    this.cancel('grace');
    for (const name of Object.keys(this.timers)) if (name.startsWith('g:')) this.cancel(name);
    this.waitingForPlayers = false;
    // Joueurs de la manche : un joueur arrivé pendant les résultats n'a ni bu ni été sauvé.
    this.roundPlayerIds = [...this.players.keys()].filter((id) => !this.isLate(id));
    this.results = this.rules.computeResults(this.roundPlayerIds, this.votes, this);
    const now = this.clock.now();
    this.reveal_ = { startedAt: now, endsAt: now + this.rules.revealMs, durationMs: this.rules.revealMs };
    this.phase = 'revealing';
    this.schedule('reveal', this.rules.revealMs, () => this.finishReveal());
    return null;
  }

  finishReveal() {
    if (this.phase !== 'revealing') return;
    this.phase = 'results';
    // Certains jeux attendent encore une action (dernière chance, désigner quelqu'un…) avant le verdict définitif.
    if (this.rules.afterReveal?.(this)) {
      this.pending = true;
      this.evaluate();
      return;
    }
    this.finalize();
  }

  onVoteTimeout() {
    if (this.phase !== 'question') return;
    if (this.connectedCount() < 2) {
      this.waitingForPlayers = true;
      this.schedulePausable('vote', TIMING.retryMs, () => this.onVoteTimeout());
      return;
    }
    this.reveal();
  }

  onNextTimeout() {
    if (this.phase !== 'results' || !this.settings.auto) return;
    if (this.connectedCount() < 2) {
      this.waitingForPlayers = true;
      return;
    }
    if (this.partyActive) this.partyAfterRound();
    else if (this.isLastRound) this.end();
    else this.nextQuestion();
  }

  get isLastRound() {
    if (this.partyActive) return false;
    return this.settings.maxRounds > 0 && this.round >= this.settings.maxRounds;
  }

  /** Recalcule ce que le mode auto doit faire. Appelé après chaque changement (vote, connexion, réglage…). */
  evaluate() {
    const autoOn = this.settings.auto && !this.paused;

    if (this.phase === 'question') {
      if (autoOn && this.allExpectedVoted()) {
        if (!this.timers.autoReveal) {
          this.schedule('autoReveal', TIMING.autoRevealDelayMs, () => {
            if (this.phase === 'question' && this.settings.auto && !this.paused && this.allExpectedVoted()) this.reveal();
          });
        }
      } else {
        this.cancel('autoReveal');
      }

      // Un joueur déconnecté qui n'a pas voté : on revérifie à la fin de son délai de grâce.
      const now = this.clock.now();
      const pending = [...this.players.values()].filter(
        (p) => p.sockets.size === 0 && p.disconnectedAt != null && !this.votes.has(p.id) && now - p.disconnectedAt < TIMING.disconnectGraceMs,
      );
      if (autoOn && pending.length) {
        const until = Math.min(...pending.map((p) => p.disconnectedAt + TIMING.disconnectGraceMs)) - now;
        this.schedule('grace', until + 1, () => this.evaluate());
      } else {
        this.cancel('grace');
      }
      this.waitingForPlayers = this.connectedCount() < 2;
      return;
    }

    if (this.phase === 'results') {
      if (this.pending) return;
      if (!this.settings.auto) {
        this.cancel('next');
        this.waitingForPlayers = false;
        return;
      }
      if (this.timers.next || this.pausedTimers.next) return;
      if (this.connectedCount() < 2) {
        this.waitingForPlayers = true;
        return;
      }
      this.waitingForPlayers = false;
      this.schedulePausable('next', this.settings.resultsMs, () => this.onNextTimeout());
    }
  }

  setSettings(patch) {
    const clean = sanitizeSettings(patch);
    // Mode soirée : le mode auto reste activé et le vote garde un minuteur.
    if (this.partyActive) {
      delete clean.auto;
      if (clean.voteMs === 0) delete clean.voteMs;
    }
    if (Object.keys(clean).length === 0) return 'Réglage invalide.';
    Object.assign(this.settings, clean);
    if ('voteMs' in clean && this.phase === 'question') {
      this.cancel('vote');
      if (this.settings.voteMs > 0) this.schedulePausable('vote', this.settings.voteMs, () => this.onVoteTimeout());
    }
    if (('auto' in clean || 'resultsMs' in clean) && this.phase === 'results') this.cancel('next');
    this.evaluate();
    return null;
  }

  pause() {
    if (this.paused) return null;
    this.paused = true;
    this.stopPartyClock();
    const now = this.clock.now();
    for (const [name, timer] of Object.entries(this.timers)) {
      if (!timer.pausable) continue;
      const saved = { remaining: Math.max(0, timer.endsAt - now), total: timer.total, fn: timer.fn };
      this.cancel(name);
      this.pausedTimers[name] = saved;
    }
    this.cancel('autoReveal');
    this.cancel('grace');
    return null;
  }

  resume() {
    if (!this.paused) return null;
    this.paused = false;
    if (this.partyActive) this.party.runningSince = this.clock.now();
    const saved = this.pausedTimers;
    this.pausedTimers = {};
    for (const [name, timer] of Object.entries(saved)) {
      this.schedule(name, timer.remaining, timer.fn, timer.total);
      this.timers[name].pausable = true;
    }
    this.evaluate();
    return null;
  }

  end() {
    if (this.phase === 'ended') return null;
    // Partie arrêtée en plein suspense : les gorgées de ce tour comptent quand même pour le podium.
    if (this.phase === 'revealing') this.phase = 'results';
    if (this.phase === 'results') this.finalize();
    this.clearTimers();
    this.paused = false;
    this.phase = 'ended';
    this.endedAt = this.clock.now();
    return null;
  }

  restart(mode = this.mode) {
    if (this.phase !== 'ended') return 'La partie n’est pas terminée.';
    if (!isPlayable(mode)) return 'Ce jeu n’est pas disponible.';
    this.party = null;
    this.mode = mode;
    this.reset();
    return null;
  }

  /** Retour à la grille des jeux, en gardant les joueurs et les réglages (depuis le lobby ou la fin de partie). */
  chooseGame() {
    if (!['picking', 'lobby', 'ended'].includes(this.phase)) return 'Termine la partie avant de changer de jeu.';
    if (this.partyActive) return PARTY_MESSAGE;
    this.party = null;
    this.mode = null;
    this.reset();
    return null;
  }

  pickGame(mode) {
    if (this.phase !== 'picking' && this.phase !== 'lobby') return 'Termine la partie avant de changer de jeu.';
    if (this.partyActive) return PARTY_MESSAGE;
    if (!isGame(mode)) return 'Jeu inconnu.';
    if (!isPlayable(mode)) return 'Ce jeu arrive bientôt !';
    this.mode = mode;
    this.reset();
    return null;
  }

  // ---------- Mode soirée ----------
  // Le serveur enchaîne les jeux : transition (5 s, phase lobby) → manches du jeu en mode auto → transition…
  // Il n'interrompt jamais une manche : « Jeu suivant », « Terminer la soirée » et la fin du temps
  // s'appliquent à la fin de la manche en cours.

  get partyActive() {
    return !!this.party && this.party.step !== 'over';
  }

  /** Lance la soirée : durée en ms (0 = sans fin, voir PARTY_DURATIONS) et ids des jeux cochés (tous par défaut). */
  startParty({ durationMs, games } = {}) {
    if (this.partyActive) return 'Le mode soirée est déjà lancé.';
    if (this.adult.pending) return ADULT_PENDING_MESSAGE;
    if (!['picking', 'lobby', 'ended'].includes(this.phase)) return 'Termine la partie avant de lancer le mode soirée.';
    if (!PARTY_DURATIONS.includes(durationMs)) return 'Durée invalide.';
    const all = partyGames();
    const included = all.filter((g) => !Array.isArray(games) || games.includes(g.id)).map((g) => g.id);
    if (!eligibleGames(all, Infinity, included).length) return 'Coche au moins un jeu.';
    if (!eligibleGames(all, this.connectedCount(), included).length) return 'Pas assez de joueurs connectés pour ces jeux.';
    this.party = {
      step: 'transition',
      durationMs,
      included,
      history: [],
      block: null,
      elapsedMs: 0,
      runningSince: this.clock.now(),
      ending: false,
      skipping: false,
      late: new Set(),
      saved: { auto: this.settings.auto, voteMs: this.settings.voteMs },
    };
    this.settings.auto = true;
    if (this.settings.voteMs === 0) this.settings.voteMs = PARTY_VOTE_MS;
    this.paused = false;
    this.partyNextGame();
    return null;
  }

  partyElapsed() {
    const p = this.party;
    return p.elapsedMs + (p.runningSince != null ? this.clock.now() - p.runningSince : 0);
  }

  get partyTimeUp() {
    return this.party.durationMs > 0 && this.partyElapsed() >= this.party.durationMs;
  }

  stopPartyClock() {
    const p = this.party;
    if (!p || p.runningSince == null) return;
    p.elapsedMs += this.clock.now() - p.runningSince;
    p.runningSince = null;
  }

  /** Choisit le jeu suivant selon les joueurs connectés et affiche la transition ; sans jeu possible, on réessaie. */
  partyNextGame() {
    const p = this.party;
    p.skipping = false;
    const all = partyGames();
    const block = pickNextBlock(eligibleGames(all, this.connectedCount(), p.included), p.history, Math.random, all);
    const paused = this.paused;
    if (block) {
      p.block = block;
      p.history.push(block.mode);
      this.mode = block.mode;
    }
    this.reset();
    this.paused = paused;
    p.late.clear();
    p.step = block ? 'transition' : 'waiting';
    this.schedulePausable('party', block ? TRANSITION_MS : TIMING.retryMs, () => (block ? this.partyStartBlock() : this.partyNextGame()));
  }

  partyStartBlock() {
    if (!this.partyActive || this.phase !== 'lobby') return;
    if (this.party.ending || this.partyTimeUp) return this.finishParty();
    // Quelqu'un est parti pendant la transition : on choisit un autre jeu.
    if (this.connectedCount() < (this.rules.minToStart ?? 2)) return this.partyNextGame();
    this.party.step = 'playing';
    this.nextQuestion();
  }

  /** Fin d'une manche (minuteur des résultats ou bouton de l'hôte) : manche suivante, jeu suivant ou fin de soirée. */
  partyAfterRound() {
    const p = this.party;
    this.cancel('next');
    if (p.ending || this.partyTimeUp) return this.finishParty();
    if (p.skipping || this.round >= p.block.rounds) return this.partyNextGame();
    this.nextQuestion();
  }

  /** Bouton « Question suivante » de l'hôte : en mode soirée, il suit le programme. */
  hostNext(expectedRound) {
    if (!this.partyActive) return this.nextQuestion(expectedRound);
    if (expectedRound != null && expectedRound !== this.round) return null;
    if (this.phase === 'revealing') return 'Patiente, la révélation est en cours.';
    if (this.phase !== 'results') return 'Action impossible maintenant.';
    if (this.pending) this.finalize();
    this.partyAfterRound();
    return null;
  }

  /** Entre deux manches : tout de suite. Pendant une manche : dès qu'elle est finie. */
  get betweenRounds() {
    return this.phase === 'lobby' || (this.phase === 'results' && !this.pending);
  }

  skipPartyGame() {
    if (!this.partyActive) return 'Le mode soirée n’est pas lancé.';
    if (this.betweenRounds) this.partyNextGame();
    else this.party.skipping = true;
    return null;
  }

  /** « Terminer la soirée » : à la fin de la manche en cours ; un deuxième appui termine tout de suite. */
  endParty() {
    if (!this.partyActive) return this.end();
    if (this.betweenRounds || this.party.ending) this.finishParty();
    else this.party.ending = true;
    return null;
  }

  finishParty() {
    const p = this.party;
    this.stopPartyClock();
    this.end();
    p.step = 'over';
    p.late.clear();
    Object.assign(this.settings, p.saved);
  }

  partyState() {
    const p = this.party;
    if (!p) return null;
    const remaining = p.durationMs > 0 ? Math.max(0, p.durationMs - this.partyElapsed()) : null;
    let clock = null;
    if (remaining != null) {
      clock = p.runningSince != null && p.step !== 'over'
        ? { endsAt: this.clock.now() + remaining, totalMs: p.durationMs, paused: false }
        : { remainingMs: remaining, totalMs: p.durationMs, paused: true };
    }
    return {
      step: p.step,
      durationMs: p.durationMs,
      included: p.included,
      gameNumber: p.history.length,
      blockRounds: p.block?.rounds ?? 0,
      ending: p.ending,
      skipping: p.skipping,
      timeUp: p.step !== 'over' && this.partyTimeUp,
      lateIds: [...p.late],
      clock,
      transitionTimer: this.timerState('party'),
    };
  }

  /** Récap de la soirée : trophées, classement des gorgées et jeux joués (joueurs encore là uniquement). */
  recap() {
    const players = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, photoUrl: this.photoUrl(p) }));
    const sips = this.sipsOfPresent(this.partySips);
    return {
      code: this.code,
      date: new Date(this.endedAt ?? this.clock.now()).toISOString(),
      players,
      trophies: computeTrophies(players, sips, this.partyStats),
      ranking: sipsRanking(players, sips),
      totalSips: Object.values(sips).reduce((a, b) => a + b, 0),
      games: [...this.playedModes],
      // Thème sombre de l'image partageable (jamais de texte explicite dedans : les trophées restent neutres).
      adult: this.adult.active,
      // Adresse du site imprimée sur l'image (si définie).
      publicUrl: process.env.PUBLIC_URL || null,
    };
  }

  photoUrl(p) {
    return p.photo ? `/api/photo/${this.code}/${p.id}?v=${p.photoVersion}` : null;
  }

  sipsOfPresent(map) {
    return Object.fromEntries([...map].filter(([id]) => this.players.has(id)));
  }

  timerState(name) {
    const timer = this.timers[name];
    if (timer) return { endsAt: timer.endsAt, totalMs: timer.total, paused: false };
    const paused = this.pausedTimers[name];
    if (paused) return { remainingMs: paused.remaining, totalMs: paused.total, paused: true };
    return null;
  }

  /**
   * viewer : { host: true } pour la TV, { playerId } pour un téléphone (un booléen est accepté : true = TV).
   * La TV reçoit les résultats dès le début de la révélation (pour animer), les téléphones seulement à la fin.
   */
  publicState(viewer = {}) {
    if (typeof viewer === 'boolean') viewer = { host: viewer };
    const forHost = !!viewer.host;
    // Joueur pas (encore) d'accord pour le mode 18+ : aucun contenu de la manche ne lui est envoyé.
    const hidden = !forHost && !this.adultAllowed(viewer.playerId);
    const showResults = !hidden && (this.phase === 'results' || (this.phase === 'revealing' && forHost));
    const inRound = this.phase === 'question' || this.phase === 'revealing' || this.phase === 'results' || this.phase === 'ended';
    let round = null;
    if (this.round > 0 && inRound && !hidden) {
      round = this.rules?.publicRound ? { number: this.round, ...this.rules.publicRound(this, viewer) } : { number: this.round, ...this.question };
    }
    return {
      code: this.code,
      mode: this.mode,
      phase: this.phase,
      serverTime: this.clock.now(),
      settings: { ...this.settings },
      paused: this.paused,
      waitingForPlayers: this.waitingForPlayers,
      isLastRound: this.isLastRound,
      hostConnected: this.hostSockets.size > 0,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.sockets.size > 0,
        photoUrl: this.photoUrl(p),
      })),
      round,
      votingOpen: this.phase === 'question' && !!this.rules && this.votingOpen,
      votedIds: this.phase === 'question' ? [...this.votes.keys()] : [],
      voteTimer: this.phase === 'question' ? this.timerState('vote') : null,
      nextTimer: this.phase === 'results' ? this.timerState('next') : null,
      reveal: this.reveal_,
      // Total de la soirée (tous jeux confondus) et part du jeu en cours, pour les joueurs encore là.
      sips: this.sipsOfPresent(this.partySips),
      gameSips: this.sipsOfPresent(this.sips),
      roundSips: this.phase === 'results' || this.phase === 'ended' ? this.roundSips : null,
      results: showResults ? this.results : null,
      roundPlayerIds: showResults ? this.roundPlayerIds : null,
      pending: this.pending,
      pendingTimer: this.pending ? this.timerState('pending') : null,
      stats: Object.fromEntries(this.stats),
      party: this.partyState(),
      adult: this.adultState(viewer),
      recap: this.phase === 'ended' ? this.recap() : null,
    };
  }
}

export class GameStore {
  constructor({ clock = realClock } = {}) {
    this.games = new Map();
    this.clock = clock;
    this.onChange = null;
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
  }

  create(mode, settings) {
    let code;
    do code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (this.games.has(code));
    const game = new Game(code, mode, { clock: this.clock, onChange: (g) => this.onChange?.(g) });
    Object.assign(game.settings, sanitizeSettings(settings));
    this.games.set(code, game);
    return game;
  }

  get(code) {
    return typeof code === 'string' ? this.games.get(code.toUpperCase()) : undefined;
  }

  sweep() {
    const limit = this.clock.now() - GAME_TTL_MS;
    for (const [code, game] of this.games) {
      if (!game.isActive && game.lastActivity < limit) {
        game.dispose();
        this.games.delete(code);
      }
    }
  }
}
