import { randomBytes, randomInt } from 'node:crypto';
import { DEFAULT_MODE, MODES, isMode } from './modes.js';
import { shuffle } from './rules.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
const GAME_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 20;
const MAX_PHOTO_BYTES = 300 * 1024;
const PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export const TIMING = {
  /** Petit délai après le dernier vote, pour que la TV affiche « N / N » avant de révéler. */
  autoRevealDelayMs: 1200,
  /** Un joueur déconnecté est encore attendu pendant ce délai (rechargement de page, réseau qui saute). */
  disconnectGraceMs: 5000,
  /** Moins de 2 joueurs connectés quand un minuteur expire : on réessaie après ce délai. */
  retryMs: 5000,
};

export const SETTING_CHOICES = {
  resultsMs: [5000, 10000, 15000, 20000],
  voteMs: [0, 15000, 30000, 45000],
  maxRounds: [0, 10, 20, 30],
};

export const DEFAULT_SETTINGS = { auto: false, resultsMs: 10000, voteMs: 0, maxRounds: 0 };

const PAUSABLE = ['vote', 'next'];

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
 * Une partie. Phases : lobby → question → revealing → results → question… → ended.
 * Le serveur est la seule source de vérité : les minuteurs (vote, révélation,
 * question suivante) vivent ici, et `onChange` prévient les écrans quand l'un d'eux fait avancer la partie.
 */
export class Game {
  constructor(code, mode = DEFAULT_MODE, { clock = realClock, onChange = () => {} } = {}) {
    this.code = code;
    this.mode = isMode(mode) ? mode : DEFAULT_MODE;
    this.clock = clock;
    this.onChange = onChange;
    this.hostSecret = token();
    this.hostSockets = new Set();
    this.players = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.timers = {};
    this.pausedTimers = {};
    this.reset();
    this.touch();
  }

  reset() {
    this.clearTimers();
    this.phase = 'lobby';
    this.paused = false;
    this.questionPool = [];
    this.round = 0;
    this.question = null;
    this.votes = new Map();
    this.results = null;
    this.reveal_ = null;
    this.waitingForPlayers = false;
    this.sips = new Map();
    this.roundSips = null;
  }

  /** Ajoute les gorgées du tour au total, une seule fois, à la fin du suspense (jamais avant : pas de spoiler). */
  applySips() {
    if (this.roundSips || !this.results) return;
    this.roundSips = {};
    for (const [id, n] of Object.entries(this.rules.sipsOf(this.results))) {
      if (!this.players.has(id)) continue;
      this.roundSips[id] = n;
      this.sips.set(id, (this.sips.get(id) ?? 0) + n);
    }
  }

  get rules() {
    return MODES[this.mode];
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
      fn();
      this.onChange(this);
    }, ms);
    this.timers[name] = { id, endsAt: this.clock.now() + ms, total, fn };
  }

  /** Comme schedule, mais gelé tant que la partie est en pause. */
  schedulePausable(name, ms, fn) {
    if (this.paused) {
      this.cancel(name);
      this.pausedTimers[name] = { remaining: ms, total: ms, fn };
    } else {
      delete this.pausedTimers[name];
      this.schedule(name, ms, fn);
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
    const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH) : '';
    if (!cleanName) return { error: 'Choisis un prénom.' };
    const parsedPhoto = photo ? parsePhoto(photo) : null;
    if (photo && !parsedPhoto) return { error: 'Photo invalide ou trop lourde.' };

    let player = this.findPlayer(playerId, secret);
    if (!player) {
      let id;
      do id = token().slice(0, 8);
      while (this.players.has(id));
      player = { id, secret: token(), sockets: new Set(), disconnectedAt: null, photo: null, photoVersion: 0 };
      this.players.set(id, player);
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
    this.evaluate();
  }

  disconnectPlayer(player, socketId) {
    player.sockets.delete(socketId);
    if (player.sockets.size === 0) player.disconnectedAt = this.clock.now();
    this.evaluate();
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.sips.delete(playerId);
    this.votes.delete(playerId);
    for (const [voter, target] of this.votes) if (target === playerId) this.votes.delete(voter);
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
      (p) => p.sockets.size > 0 || (p.disconnectedAt != null && now - p.disconnectedAt < TIMING.disconnectGraceMs),
    );
  }

  allExpectedVoted() {
    if (this.connectedCount() < 2) return false;
    return this.expectedVoters().every((p) => this.votes.has(p.id));
  }

  // ---------- Déroulement ----------

  start() {
    if (this.phase !== 'lobby') return 'La partie a déjà commencé.';
    if (this.players.size < 2) return 'Il faut au moins 2 joueurs.';
    return this.nextQuestion();
  }

  /** expectedRound : numéro de la question que l'appelant croit terminer ; sert à ignorer les doublons. */
  nextQuestion(expectedRound) {
    if (expectedRound != null && expectedRound !== this.round) return null;
    if (this.phase === 'revealing') return 'Patiente, la révélation est en cours.';
    if (this.phase !== 'lobby' && this.phase !== 'results') return 'Action impossible maintenant.';
    this.cancel('next');
    if (this.questionPool.length === 0) this.questionPool = shuffle(this.rules.questions);
    this.question = this.questionPool.pop();
    this.round += 1;
    this.votes = new Map();
    this.results = null;
    this.reveal_ = null;
    this.roundSips = null;
    this.waitingForPlayers = false;
    this.phase = 'question';
    if (this.settings.voteMs > 0) this.schedulePausable('vote', this.settings.voteMs, () => this.onVoteTimeout());
    this.evaluate();
    return null;
  }

  vote(playerId, choice) {
    if (this.phase !== 'question') return 'Le vote est fermé.';
    if (!this.players.has(playerId)) return 'Tu n’es plus dans la partie.';
    if (!this.rules.isValidVote(this, choice)) return 'Choix invalide.';
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
    this.waitingForPlayers = false;
    this.results = this.rules.computeResults([...this.players.keys()], this.votes);
    const now = this.clock.now();
    this.reveal_ = { startedAt: now, endsAt: now + this.rules.revealMs, durationMs: this.rules.revealMs };
    this.phase = 'revealing';
    this.schedule('reveal', this.rules.revealMs, () => this.finishReveal());
    return null;
  }

  finishReveal() {
    if (this.phase !== 'revealing') return;
    this.applySips();
    this.phase = 'results';
    this.evaluate();
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
    if (this.isLastRound) this.end();
    else this.nextQuestion();
  }

  get isLastRound() {
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
    const now = this.clock.now();
    for (const name of PAUSABLE) {
      const timer = this.timers[name];
      if (!timer) continue;
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
    const saved = this.pausedTimers;
    this.pausedTimers = {};
    for (const [name, timer] of Object.entries(saved)) this.schedule(name, timer.remaining, timer.fn, timer.total);
    this.evaluate();
    return null;
  }

  end() {
    if (this.phase === 'ended') return null;
    // Partie arrêtée en plein suspense : les gorgées de ce tour comptent quand même pour le podium.
    if (this.phase === 'revealing') this.applySips();
    this.clearTimers();
    this.paused = false;
    this.phase = 'ended';
    return null;
  }

  restart(mode = this.mode) {
    if (this.phase !== 'ended') return 'La partie n’est pas terminée.';
    if (!isMode(mode)) return 'Mode de jeu inconnu.';
    this.mode = mode;
    this.reset();
    return null;
  }

  timerState(name) {
    const timer = this.timers[name];
    if (timer) return { endsAt: timer.endsAt, totalMs: timer.total, paused: false };
    const paused = this.pausedTimers[name];
    if (paused) return { remainingMs: paused.remaining, totalMs: paused.total, paused: true };
    return null;
  }

  /** forHost : la TV reçoit les résultats dès le début de la révélation (pour animer), les téléphones seulement à la fin. */
  publicState(forHost = false) {
    const showResults = this.phase === 'results' || (this.phase === 'revealing' && forHost);
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
        photoUrl: p.photo ? `/api/photo/${this.code}/${p.id}?v=${p.photoVersion}` : null,
      })),
      round: this.question ? { number: this.round, ...this.question } : null,
      votedIds: this.phase === 'question' ? [...this.votes.keys()] : [],
      voteTimer: this.phase === 'question' ? this.timerState('vote') : null,
      nextTimer: this.phase === 'results' ? this.timerState('next') : null,
      reveal: this.reveal_,
      sips: Object.fromEntries(this.sips),
      roundSips: this.phase === 'results' || this.phase === 'ended' ? this.roundSips : null,
      results: showResults ? this.results : null,
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
