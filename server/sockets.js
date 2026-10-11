const room = (code) => `game:${code}`;
const hostRoom = (code) => `game:${code}:host`;

export function registerSockets(io, store) {
  // Chaque écran reçoit son propre état : la TV voit les résultats pendant le suspense (pour animer),
  // et chaque téléphone ne voit que ses informations secrètes (le mot de l'Imposteur, par exemple).
  const broadcast = (game) => {
    io.to(hostRoom(game.code)).emit('state', game.publicState({ host: true }));
    for (const player of game.players.values()) {
      if (player.sockets.size === 0) continue;
      const state = game.publicState({ playerId: player.id });
      for (const id of player.sockets) io.to(id).emit('state', state);
    }
  };
  store.onChange = broadcast;

  io.on('connection', (socket) => {
    const on = (event, fn) =>
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          fn(payload && typeof payload === 'object' ? payload : {}, reply);
        } catch (err) {
          console.error(`[${event}]`, err);
          reply({ ok: false, error: 'Erreur serveur.' });
        }
      });

    const currentGame = () => (socket.data.code ? store.get(socket.data.code) : undefined);

    function detach() {
      const game = currentGame();
      if (!game) return;
      const { role, playerId } = socket.data;
      socket.leave(room(game.code));
      socket.leave(hostRoom(game.code));
      socket.data = {};
      if (role === 'host') game.hostSockets.delete(socket.id);
      if (role === 'player') {
        const player = game.players.get(playerId);
        if (player) game.disconnectPlayer(player, socket.id);
      }
      broadcast(game);
    }

    function attachHost(game) {
      detach();
      socket.join(room(game.code));
      socket.join(hostRoom(game.code));
      socket.data = { code: game.code, role: 'host' };
      game.hostSockets.add(socket.id);
      game.touch();
    }

    function attachPlayer(game, player) {
      detach();
      socket.join(room(game.code));
      socket.data = { code: game.code, role: 'player', playerId: player.id };
      game.connectPlayer(player, socket.id);
      game.touch();
    }

    on('host:create', ({ mode, settings }, ack) => {
      const game = store.create(mode, settings);
      attachHost(game);
      ack({ ok: true, code: game.code, hostSecret: game.hostSecret });
      broadcast(game);
    });

    on('host:resume', ({ code, hostSecret }, ack) => {
      const game = store.get(code);
      if (!game) return ack({ ok: false, error: 'Partie introuvable (le serveur a peut-être redémarré).' });
      if (game.hostSecret !== hostSecret) return ack({ ok: false, error: 'Tu n’es pas l’hôte de cette partie.' });
      attachHost(game);
      ack({ ok: true });
      broadcast(game);
    });

    const hostActions = {
      'host:start': (game) => game.start(),
      'host:next': (game, { round }) => game.hostNext(Number.isInteger(round) ? round : undefined),
      'host:reveal': (game, { round }) => game.reveal(Number.isInteger(round) ? round : undefined),
      'host:end': (game) => (game.partyActive ? game.endParty() : game.end()),
      'host:partyStart': (game, { durationMs, games }) => game.startParty({ durationMs, games }),
      'host:partySkip': (game) => game.skipPartyGame(),
      'host:partyEnd': (game) => game.endParty(),
      'host:restart': (game, { mode }) => game.restart(mode),
      'host:chooseGame': (game) => game.chooseGame(),
      'host:pickGame': (game, { mode }) => game.pickGame(mode),
      'host:gameAction': (game, { action }) => game.gameHostAction(action),
      'host:settings': (game, { settings }) => game.setSettings(settings),
      'host:resetSips': (game) => game.resetPartySips(),
      'host:pause': (game) => game.pause(),
      'host:unpause': (game) => game.resume(),
      'host:kick': (game, { playerId }) => {
        const player = game.players.get(playerId);
        if (!player) return 'Joueur inconnu.';
        for (const id of player.sockets) io.to(id).emit('kicked');
        game.removePlayer(playerId);
        return null;
      },
    };

    for (const [event, action] of Object.entries(hostActions)) {
      on(event, (payload, ack) => {
        const game = currentGame();
        if (!game || socket.data.role !== 'host') return ack({ ok: false, error: 'Tu n’es pas l’hôte.' });
        const error = action(game, payload);
        if (error) return ack({ ok: false, error });
        game.touch();
        broadcast(game);
        ack({ ok: true });
      });
    }

    on('player:join', ({ code, playerId, secret, name, photo }, ack) => {
      const game = store.get(code);
      if (!game) return ack({ ok: false, error: 'Partie introuvable. Vérifie le code.' });
      if (game.phase === 'ended') return ack({ ok: false, error: 'Cette partie est terminée.' });
      const { player, error } = game.upsertPlayer({ playerId, secret, name, photo });
      if (error) return ack({ ok: false, error });
      attachPlayer(game, player);
      ack({ ok: true, playerId: player.id, secret: player.secret, round: game.round, myVote: game.votes.get(player.id) ?? null });
      broadcast(game);
    });

    on('player:resume', ({ code, playerId, secret }, ack) => {
      const game = store.get(code);
      if (!game) return ack({ ok: false, error: 'Partie introuvable.', gone: true });
      const player = game.findPlayer(playerId, secret);
      if (!player) return ack({ ok: false, error: 'Joueur inconnu.' });
      attachPlayer(game, player);
      ack({ ok: true, round: game.round, myVote: game.votes.get(player.id) ?? null });
      broadcast(game);
    });

    on('player:vote', ({ choice }, ack) => {
      const game = currentGame();
      if (!game || socket.data.role !== 'player') return ack({ ok: false, error: 'Tu n’es pas dans la partie.' });
      const error = game.vote(socket.data.playerId, choice);
      if (error) return ack({ ok: false, error });
      game.touch();
      broadcast(game);
      ack({ ok: true });
    });

    on('player:action', ({ action }, ack) => {
      const game = currentGame();
      if (!game || socket.data.role !== 'player') return ack({ ok: false, error: 'Tu n’es pas dans la partie.' });
      const error = game.action(socket.data.playerId, action);
      if (error) return ack({ ok: false, error });
      game.touch();
      broadcast(game);
      ack({ ok: true });
    });

    on('player:leave', (_, ack) => {
      const game = currentGame();
      if (game && socket.data.role === 'player') {
        const { playerId } = socket.data;
        detach();
        game.removePlayer(playerId);
        broadcast(game);
      }
      ack({ ok: true });
    });

    socket.on('disconnect', detach);
  });
}
