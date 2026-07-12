const path = require('node:path');
const express = require('express');
const http = require('node:http');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { createRoom, getRoom, removeRoom } = require('./rooms');
const { MIN_PLAYERS, MAX_PLAYERS } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Tabletop mode: lets players scan an invite link straight off the host's screen
// instead of typing the room code by hand.
app.get('/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 500) return res.status(400).end();
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#1a1518', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).end();
  }
});

// socket.id -> { code, playerId }
const sessions = new Map();

function broadcast(game) {
  for (const p of game.players) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit('state', game.getStateFor(p.id));
    }
  }
}

function safe(socket, fn) {
  try {
    fn();
  } catch (err) {
    socket.emit('errorMsg', err.message || 'Something went wrong.');
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name, fullLog, victoryTarget }, ack) => {
    safe(socket, () => {
      const game = createRoom({ fullLog: fullLog !== false, victoryTarget });
      const player = game.addPlayer(name, socket.id);
      sessions.set(socket.id, { code: game.code, playerId: player.id });
      socket.join(game.code);
      ack && ack({ ok: true, code: game.code, playerId: player.id, token: player.token });
      broadcast(game);
    });
  });

  socket.on('joinRoom', ({ code, name }, ack) => {
    safe(socket, () => {
      const game = getRoom(code);
      if (!game) throw new Error('Room not found. Check the code and try again.');
      const player = game.addPlayer(name, socket.id);
      sessions.set(socket.id, { code: game.code, playerId: player.id });
      socket.join(game.code);
      ack && ack({ ok: true, code: game.code, playerId: player.id, token: player.token });
      broadcast(game);
    });
  });

  socket.on('rejoinRoom', ({ code, playerId, token }, ack) => {
    safe(socket, () => {
      const game = getRoom(code);
      if (!game) throw new Error('Room not found.');
      game.reconnect(playerId, token, socket.id);
      sessions.set(socket.id, { code: game.code, playerId });
      socket.join(game.code);
      ack && ack({ ok: true, code: game.code, playerId, token });
      broadcast(game);
    });
  });

  socket.on('startGame', (_data, ack) => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.startGame(sess.playerId);
      ack && ack({ ok: true });
      broadcast(game);
    });
  });

  socket.on('readyForRound', () => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.readyUp(sess.playerId);
      broadcast(game);
    });
  });

  socket.on('endGame', () => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.endGame(sess.playerId);
      broadcast(game);
    });
  });

  socket.on('reorderPlayers', ({ order }) => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.reorderPlayers(sess.playerId, order);
      broadcast(game);
    });
  });

  socket.on('action', ({ type, targetId }) => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.handleAction(sess.playerId, type, targetId);
      broadcast(game);
    });
  });

  socket.on('respond', ({ response, blockClaim }) => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.respond(sess.playerId, response, blockClaim);
      broadcast(game);
    });
  });

  socket.on('chooseLoseInfluence', ({ index }) => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.chooseLoseInfluence(sess.playerId, index);
      broadcast(game);
    });
  });

  socket.on('exchangeChoice', ({ keepIndexes }) => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) throw new Error('Not in a room.');
      const game = getRoom(sess.code);
      if (!game) throw new Error('Room not found.');
      game.exchangeChoice(sess.playerId, keepIndexes);
      broadcast(game);
    });
  });

  socket.on('leaveRoom', () => {
    safe(socket, () => {
      const sess = sessions.get(socket.id);
      if (!sess) return;
      const game = getRoom(sess.code);
      if (game) {
        game.removePlayer(sess.playerId);
        broadcast(game);
        if (game.players.length === 0) removeRoom(game.code);
      }
      sessions.delete(socket.id);
      socket.leave(sess.code);
    });
  });

  socket.on('disconnect', () => {
    const sess = sessions.get(socket.id);
    if (!sess) return;
    const game = getRoom(sess.code);
    if (game) {
      game.removePlayer(sess.playerId);
      broadcast(game);
      if (game.players.length === 0) removeRoom(game.code);
    }
    sessions.delete(socket.id);
  });
});

app.get('/health', (_req, res) => res.json({ ok: true, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Coup server listening on port ${PORT}`);
});
