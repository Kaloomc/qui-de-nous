const room = (code) => `game:${code}`;

export function registerSockets(io, store) {
  const broadcast = (game) => io.to(room(game.code)).emit('state', game.publicState());

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
      if (socket.data.role === 'host') game.hostSockets.delete(socket.id);
      if (socket.data.role === 'player') game.players.get(socket.data.playerId)?.sockets.delete(socket.id);
      socket.leave(room(game.code));
      socket.data = {};
      broadcast(game);
    }

    function attachHost(game) {
      detach();
      socket.join(room(game.code));
      socket.data = { code: game.code, role: 'host' };
      game.hostSockets.add(socket.id);
      game.touch();
    }

    function attachPlayer(game, player) {
      detach();
      socket.join(room(game.code));
      socket.data = { code: game.code, role: 'player', playerId: player.id };
      player.sockets.add(socket.id);
      game.touch();
    }

    on('host:create', (_, ack) => {
      const game = store.create();
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
      'host:next': (game) => game.nextQuestion(),
      'host:reveal': (game) => game.reveal(),
      'host:end': (game) => game.end(),
      'host:restart': (game) => game.restart(),
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

    on('player:vote', ({ targetId }, ack) => {
      const game = currentGame();
      if (!game || socket.data.role !== 'player') return ack({ ok: false, error: 'Tu n’es pas dans la partie.' });
      const error = game.vote(socket.data.playerId, targetId);
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
