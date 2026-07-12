const crypto = require('node:crypto');
const { buildDeck, shuffle } = require('./deck');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const FORCE_COUP_AT = 10;

const ACTIONS = {
  income: {
    label: 'Income', cost: 0, gain: 1, needsTarget: false, claim: null,
    blockableBy: [], challengeable: false,
    desc: 'Take 1 coin from the treasury. Always safe.'
  },
  foreignAid: {
    label: 'Foreign Aid', cost: 0, gain: 2, needsTarget: false, claim: null,
    blockableBy: ['Duke'], challengeable: false,
    desc: 'Take 2 coins from the treasury. Anyone may block this by claiming Duke.'
  },
  coup: {
    label: 'Coup', cost: 7, needsTarget: true, claim: null,
    blockableBy: [], challengeable: false,
    desc: 'Pay 7 coins. Target immediately loses an influence. Cannot be blocked or challenged.'
  },
  tax: {
    label: 'Tax', cost: 0, gain: 3, needsTarget: false, claim: 'Duke',
    blockableBy: [], challengeable: true,
    desc: 'Claim Duke to take 3 coins from the treasury.'
  },
  assassinate: {
    label: 'Assassinate', cost: 3, needsTarget: true, claim: 'Assassin',
    blockableBy: ['Contessa'], challengeable: true,
    desc: 'Pay 3 coins, claim Assassin, and force a target to lose an influence. The target may block by claiming Contessa.'
  },
  steal: {
    label: 'Steal', cost: 0, needsTarget: true, claim: 'Captain',
    blockableBy: ['Captain', 'Ambassador'], challengeable: true,
    desc: 'Claim Captain to take up to 2 coins from a target. The target may block by claiming Captain or Ambassador.'
  },
  exchange: {
    label: 'Exchange', cost: 0, needsTarget: false, claim: 'Ambassador',
    blockableBy: [], challengeable: true,
    desc: 'Claim Ambassador to draw 2 cards from the deck, then return any two cards to the deck.'
  },
};

function id() {
  return crypto.randomUUID();
}

class Game {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.deck = [];
    this.phase = 'lobby'; // lobby | playing | roundover | gameover
    this.turnIndex = 0;
    this.hostId = null;
    this.pending = null;
    this.pendingLoseInfluence = null;
    this.pendingExchange = null;
    this.log = [];
    this.winnerId = null;
    this.createdAt = Date.now();
    this.logMode = 'full'; // 'full' | 'off' — set once at room creation, host-only
    this.turnNumber = 0;
    this.victoryTarget = 1; // round wins needed to take the match (1-3), set at creation
    this.roundNumber = 0;
    this.lastRoundWinnerId = null;
    this.readyForNextRound = new Set();
  }

  // permanent entries (revealed cards, eliminations, connection/game milestones) always
  // stay visible. Everything else is a "claim" that only sticks around for the current
  // and next player's turn when logMode is 'off', mirroring real-table memory.
  pushLog(msg, { permanent = false } = {}) {
    this.log.push({ text: msg, turn: this.turnNumber, permanent });
    if (this.log.length > 300) this.log.shift();
  }

  getVisibleLog() {
    if (this.logMode !== 'off' || this.phase === 'gameover' || this.phase === 'roundover') {
      return this.log.map((e) => e.text);
    }
    return this.log
      .filter((e) => e.permanent || this.turnNumber - e.turn <= 1)
      .map((e) => e.text);
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  isAlive(p) {
    return p.influences.some((c) => !c.revealed);
  }

  aliveCount() {
    return this.players.filter((p) => this.isAlive(p)).length;
  }

  addPlayer(name, socketId) {
    if (this.phase !== 'lobby') throw new Error('Game already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('Room is full (max 6 players).');
    const trimmed = (name || '').trim().slice(0, 16) || 'Player';
    if (this.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('That name is already taken in this room.');
    }
    const player = {
      id: id(),
      token: id(),
      name: trimmed,
      coins: 0,
      influences: [],
      connected: true,
      socketId,
      roundWins: 0,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.pushLog(`${trimmed} joined the room.`, { permanent: true });
    return player;
  }

  reconnect(playerId, token, socketId) {
    const player = this.getPlayer(playerId);
    if (!player || player.token !== token) throw new Error('Could not rejoin that room.');
    player.connected = true;
    player.socketId = socketId;
    this.pushLog(`${player.name} reconnected.`, { permanent: true });
    return player;
  }

  removePlayer(playerId) {
    if (this.phase === 'lobby') {
      const p = this.getPlayer(playerId);
      this.players = this.players.filter((pl) => pl.id !== playerId);
      if (p) this.pushLog(`${p.name} left the room.`, { permanent: true });
      if (this.hostId === playerId) {
        this.hostId = this.players[0] ? this.players[0].id : null;
      }
    } else {
      const p = this.getPlayer(playerId);
      if (p) {
        p.connected = false;
        this.pushLog(`${p.name} disconnected.`, { permanent: true });
      }
    }
  }

  // Lets the host arrange turn order (seating) before the game starts — used by
  // Tabletop mode to match players' real-life seating so play proceeds around
  // the "table" the same way it would in person.
  reorderPlayers(requesterId, order) {
    if (requesterId !== this.hostId) throw new Error('Only the host can arrange seating.');
    if (this.phase !== 'lobby') throw new Error('Seating can only be arranged before the game starts.');
    const currentIds = this.players.map((p) => p.id);
    const isValidPermutation = Array.isArray(order)
      && order.length === currentIds.length
      && currentIds.every((id2) => order.includes(id2))
      && new Set(order).size === order.length;
    if (!isValidPermutation) throw new Error('Invalid seating order.');
    this.players = order.map((id2) => this.getPlayer(id2));
  }

  startGame(requesterId) {
    if (requesterId !== this.hostId) throw new Error('Only the host can start the game.');
    if (this.phase !== 'lobby') throw new Error('Game already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players.`);

    this.roundNumber = 1;
    this._dealRound();
    this.phase = 'playing';
    this.turnIndex = 0;
    this.pushLog(
      `Round 1 begins${this.victoryTarget > 1 ? ` — first to ${this.victoryTarget} round wins takes the match` : ''}. Cards are dealt — 2 coins and 2 influence each.`,
      { permanent: true }
    );
    this.pushLog(`${this.players[0].name} goes first.`, { permanent: true });
    return true;
  }

  _dealRound() {
    this.deck = buildDeck();
    for (const p of this.players) {
      p.coins = 2;
      p.influences = [
        { card: this.deck.pop(), revealed: false },
        { card: this.deck.pop(), revealed: false },
      ];
    }
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  nextTurn() {
    if (this.phase !== 'playing') return;
    const alive = this.players.filter((p) => this.isAlive(p));
    if (alive.length <= 1) {
      this._concludeRound(alive[0] || null);
      return;
    }
    let attempts = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
      attempts++;
    } while (!this.isAlive(this.players[this.turnIndex]) && attempts <= this.players.length);
    this.turnNumber += 1;
    this.pushLog(`It's ${this.currentPlayer().name}'s turn.`);
  }

  _concludeRound(winner) {
    this.lastRoundWinnerId = winner ? winner.id : null;
    if (winner) {
      winner.roundWins += 1;
    }
    if (winner && winner.roundWins >= this.victoryTarget) {
      this.phase = 'gameover';
      this.winnerId = winner.id;
      this.pushLog(`${winner.name} wins Round ${this.roundNumber} and the match!`, { permanent: true });
      return;
    }
    this.phase = 'roundover';
    this.readyForNextRound = new Set();
    this.pushLog(
      winner ? `${winner.name} wins Round ${this.roundNumber}! (${winner.roundWins}/${this.victoryTarget} to win the match)` : `Round ${this.roundNumber} ended.`,
      { permanent: true }
    );
  }

  // Host-only: every connected player must ready up before the next round deals.
  // Disconnected players are excluded from the gate so a dropped connection can't
  // stall the match forever.
  readyUp(playerId) {
    if (this.phase !== 'roundover') throw new Error('No round transition is pending.');
    const player = this.getPlayer(playerId);
    if (!player) throw new Error('Unknown player.');
    this.readyForNextRound.add(playerId);
    const relevant = this.players.filter((p) => p.connected);
    const allReady = relevant.length > 0 && relevant.every((p) => this.readyForNextRound.has(p.id));
    if (allReady) this._startNextRound();
  }

  _startNextRound() {
    this.roundNumber += 1;
    this._dealRound();
    // Rotate who starts, cycling through the same seating order each round.
    this.turnIndex = (this.roundNumber - 1) % this.players.length;
    this.phase = 'playing';
    this.readyForNextRound = new Set();
    this.pending = null;
    this.pendingLoseInfluence = null;
    this.pendingExchange = null;
    this.pushLog(`Round ${this.roundNumber} begins! Cards are dealt — 2 coins and 2 influence each.`, { permanent: true });
    this.pushLog(`${this.currentPlayer().name} goes first.`, { permanent: true });
  }

  endGame(requesterId) {
    if (requesterId !== this.hostId) throw new Error('Only the host can end the game.');
    if (this.phase !== 'roundover') throw new Error('The game can only be ended between rounds.');
    const maxWins = Math.max(0, ...this.players.map((p) => p.roundWins));
    const leaders = maxWins > 0 ? this.players.filter((p) => p.roundWins === maxWins) : [];
    this.winnerId = leaders.length === 1 ? leaders[0].id : null;
    this.phase = 'gameover';
    this.pushLog(
      this.winnerId
        ? `${this.getPlayer(this.winnerId).name} ends the game in the lead!`
        : 'The host ended the game.',
      { permanent: true }
    );
  }

  requestLoseInfluence(playerId, callback) {
    const player = this.getPlayer(playerId);
    const unrevealed = player.influences.filter((c) => !c.revealed);
    if (unrevealed.length === 0) {
      callback();
      return;
    }
    if (unrevealed.length === 1) {
      const idx = player.influences.indexOf(unrevealed[0]);
      player.influences[idx].revealed = true;
      this.pushLog(`${player.name} loses their last influence — it was the ${unrevealed[0].card}!`, { permanent: true });
      this.checkElimination(player);
      callback();
      return;
    }
    this.pendingLoseInfluence = { playerId, callback };
  }

  chooseLoseInfluence(playerId, cardIndex) {
    if (!this.pendingLoseInfluence || this.pendingLoseInfluence.playerId !== playerId) {
      throw new Error('No influence loss pending for you.');
    }
    const player = this.getPlayer(playerId);
    const card = player.influences[cardIndex];
    if (!card || card.revealed) throw new Error('Invalid card choice.');
    card.revealed = true;
    this.pushLog(`${player.name} reveals ${card.card} and loses that influence.`, { permanent: true });
    this.checkElimination(player);
    const cb = this.pendingLoseInfluence.callback;
    this.pendingLoseInfluence = null;
    cb();
  }

  checkElimination(player) {
    if (!this.isAlive(player)) {
      this.pushLog(`${player.name} has been eliminated!`, { permanent: true });
    }
  }

  computeEligibleResponders(actorId) {
    return this.players.filter((p) => p.id !== actorId && this.isAlive(p)).map((p) => p.id);
  }

  handleAction(playerId, type, targetId) {
    if (this.phase !== 'playing') throw new Error('Game is not in progress.');
    if (this.pending || this.pendingLoseInfluence || this.pendingExchange) {
      throw new Error('Another action is currently being resolved.');
    }
    const current = this.currentPlayer();
    if (current.id !== playerId) throw new Error("It's not your turn.");
    const def = ACTIONS[type];
    if (!def) throw new Error('Unknown action.');
    if (current.coins >= FORCE_COUP_AT && type !== 'coup') {
      throw new Error('You have 10+ coins — you must Coup.');
    }
    let target = null;
    if (def.needsTarget) {
      target = this.getPlayer(targetId);
      if (!target || !this.isAlive(target)) throw new Error('Invalid target.');
      if (target.id === current.id) throw new Error('You cannot target yourself.');
    }
    if (def.cost > 0 && current.coins < def.cost) throw new Error('Not enough coins.');

    current.coins -= def.cost;

    if (type === 'income') {
      current.coins += def.gain;
      this.pushLog(`${current.name} takes Income (+1 coin).`);
      this.nextTurn();
      return;
    }

    if (type === 'coup') {
      this.pushLog(`${current.name} launches a Coup against ${target.name}!`);
      this.pending = { kind: 'resolving' };
      this.requestLoseInfluence(target.id, () => {
        this.pending = null;
        this.nextTurn();
      });
      return;
    }

    this.pending = {
      kind: 'action',
      type,
      actorId: current.id,
      targetId: target ? target.id : null,
      claim: def.claim,
      blockableBy: def.blockableBy,
      challengeable: def.challengeable,
      responses: {},
      eligibleResponders: this.computeEligibleResponders(current.id),
    };
    const claimTxt = def.claim ? ` (claiming ${def.claim})` : '';
    const targetTxt = target ? ` targeting ${target.name}` : '';
    this.pushLog(`${current.name} attempts ${def.label}${claimTxt}${targetTxt}.`);
  }

  respond(playerId, response, blockClaim) {
    if (!this.pending) throw new Error('Nothing to respond to.');
    const player = this.getPlayer(playerId);
    if (!player) throw new Error('Unknown player.');

    if (this.pending.kind === 'action') {
      if (playerId === this.pending.actorId) throw new Error('You cannot respond to your own action.');
      if (!this.pending.eligibleResponders.includes(playerId)) throw new Error('You cannot respond right now.');
      if (this.pending.responses[playerId]) throw new Error('You already responded.');

      if (response === 'challenge') {
        if (!this.pending.challengeable) throw new Error('This action cannot be challenged.');
        this._resolveChallenge(playerId, this.pending.actorId, this.pending.claim, (proven) => {
          if (proven) {
            this._resolvePendingAction();
          } else {
            this.pending = null;
            this.nextTurn();
          }
        });
        return;
      }

      if (response === 'block') {
        const isTarget = this.pending.targetId !== null;
        if (isTarget && playerId !== this.pending.targetId) {
          throw new Error('Only the target may block this action.');
        }
        if (!this.pending.blockableBy.includes(blockClaim)) {
          throw new Error('Invalid block claim.');
        }
        const actor = this.getPlayer(this.pending.actorId);
        const blocker = player;
        this.pushLog(`${blocker.name} blocks, claiming ${blockClaim}.`);
        this.pending = {
          kind: 'block',
          type: this.pending.type,
          actorId: this.pending.actorId,
          targetId: this.pending.targetId,
          claim: this.pending.claim,
          blockerId: playerId,
          blockClaim,
          responses: {},
          eligibleResponders: this.players
            .filter((p) => p.id !== playerId && this.isAlive(p))
            .map((p) => p.id),
        };
        return;
      }

      if (response === 'allow') {
        this.pending.responses[playerId] = 'allow';
        const allResponded = this.pending.eligibleResponders.every((id2) => this.pending.responses[id2]);
        if (allResponded) {
          this._resolvePendingAction();
        }
        return;
      }
      throw new Error('Unknown response.');
    }

    if (this.pending.kind === 'block') {
      if (playerId === this.pending.blockerId) throw new Error('You cannot respond to your own block.');
      if (!this.pending.eligibleResponders.includes(playerId)) throw new Error('You cannot respond right now.');
      if (this.pending.responses[playerId]) throw new Error('You already responded.');

      if (response === 'challenge') {
        this._resolveChallenge(playerId, this.pending.blockerId, this.pending.blockClaim, (proven) => {
          if (proven) {
            // Block claim upheld -> original action stays cancelled.
            this.pending = null;
            this.nextTurn();
          } else {
            // Block was a bluff -> original action proceeds.
            this._resolvePendingAction();
          }
        });
        return;
      }

      if (response === 'allow') {
        this.pending.responses[playerId] = 'allow';
        const allResponded = this.pending.eligibleResponders.every((id2) => this.pending.responses[id2]);
        if (allResponded) {
          this.pushLog('The block goes unchallenged.');
          this.pending = null;
          this.nextTurn();
        }
        return;
      }
      throw new Error('Unknown response.');
    }

    throw new Error('Nothing to respond to.');
  }

  _resolveChallenge(challengerId, claimantId, claimedCharacter, onDone) {
    const claimant = this.getPlayer(claimantId);
    const challenger = this.getPlayer(challengerId);
    const idx = claimant.influences.findIndex((c) => !c.revealed && c.card === claimedCharacter);
    this.pushLog(`${challenger.name} challenges ${claimant.name}'s claim of ${claimedCharacter}!`);
    if (idx !== -1) {
      const card = claimant.influences[idx];
      claimant.influences.splice(idx, 1);
      this.deck.push(card.card);
      shuffle(this.deck);
      claimant.influences.push({ card: this.deck.pop(), revealed: false });
      this.pushLog(`${claimant.name} reveals ${claimedCharacter} — the challenge fails! ${claimant.name} draws a new card.`);
      this.requestLoseInfluence(challengerId, () => onDone(true));
    } else {
      this.pushLog(`${claimant.name} cannot reveal ${claimedCharacter} — bluff caught!`);
      this.requestLoseInfluence(claimantId, () => onDone(false));
    }
  }

  _resolvePendingAction() {
    const { type, actorId, targetId } = this.pending;
    const actor = this.getPlayer(actorId);
    const target = targetId ? this.getPlayer(targetId) : null;

    if (type === 'foreignAid') {
      actor.coins += 2;
      this.pushLog(`${actor.name} collects Foreign Aid (+2 coins).`);
      this.pending = null;
      this.nextTurn();
      return;
    }
    if (type === 'tax') {
      actor.coins += 3;
      this.pushLog(`${actor.name} collects Tax as Duke (+3 coins).`);
      this.pending = null;
      this.nextTurn();
      return;
    }
    if (type === 'steal') {
      const amt = Math.min(2, target.coins);
      target.coins -= amt;
      actor.coins += amt;
      this.pushLog(`${actor.name} steals ${amt} coin${amt === 1 ? '' : 's'} from ${target.name}.`);
      this.pending = null;
      this.nextTurn();
      return;
    }
    if (type === 'assassinate') {
      this.pushLog(`${actor.name}'s assassination succeeds!`);
      this.pending = { kind: 'resolving' };
      this.requestLoseInfluence(target.id, () => {
        this.pending = null;
        this.nextTurn();
      });
      return;
    }
    if (type === 'exchange') {
      const drawn = [this.deck.pop(), this.deck.pop()].filter(Boolean);
      this.pendingExchange = { playerId: actorId, offered: drawn };
      this.pushLog(`${actor.name} draws 2 cards from the deck to exchange.`);
      this.pending = null;
      return;
    }
    this.pending = null;
    this.nextTurn();
  }

  exchangeChoice(playerId, keepIndexes) {
    if (!this.pendingExchange || this.pendingExchange.playerId !== playerId) {
      throw new Error('No exchange pending for you.');
    }
    const player = this.getPlayer(playerId);
    const revealedCards = player.influences.filter((c) => c.revealed);
    const unrevealedCards = player.influences.filter((c) => !c.revealed).map((c) => c.card);
    // Must match the combined "offered" array shown to the client in getStateFor: current hand + drawn cards.
    const offered = [...unrevealedCards, ...this.pendingExchange.offered];
    const uniqueIdx = [...new Set(keepIndexes)];
    if (uniqueIdx.length !== unrevealedCards.length || uniqueIdx.some((i) => i < 0 || i >= offered.length)) {
      throw new Error('Invalid selection.');
    }
    const keep = uniqueIdx.map((i) => offered[i]);
    const returned = offered.filter((_, i) => !uniqueIdx.includes(i));
    this.deck.push(...returned);
    shuffle(this.deck);
    player.influences = [...revealedCards, ...keep.map((card) => ({ card, revealed: false }))];
    this.pushLog(`${player.name} finishes the Exchange.`);
    this.pendingExchange = null;
    this.nextTurn();
  }

  // Build a sanitized view of state for a specific viewer.
  getStateFor(viewerId) {
    const current = this.phase === 'playing' || this.phase === 'gameover' ? this.currentPlayer() : null;
    const players = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      connected: p.connected,
      isHost: p.id === this.hostId,
      alive: this.isAlive(p),
      roundWins: p.roundWins,
      influences: p.influences.map((c) => {
        if (c.revealed) return { card: c.card, revealed: true };
        if (p.id === viewerId) return { card: c.card, revealed: false };
        return { revealed: false };
      }),
    }));

    let pendingView = null;
    if (this.pending && this.pending.kind !== 'resolving') {
      const actor = this.getPlayer(this.pending.actorId);
      const target = this.pending.targetId ? this.getPlayer(this.pending.targetId) : null;
      const blocker = this.pending.blockerId ? this.getPlayer(this.pending.blockerId) : null;
      const iAmEligible = this.pending.eligibleResponders && this.pending.eligibleResponders.includes(viewerId);
      const alreadyResponded = !!(this.pending.responses && this.pending.responses[viewerId]);
      const options = [];
      if (iAmEligible && !alreadyResponded) {
        if (this.pending.kind === 'action') {
          if (this.pending.challengeable) options.push('challenge');
          const isTarget = this.pending.targetId !== null;
          if (!isTarget || viewerId === this.pending.targetId) {
            for (const c of this.pending.blockableBy) options.push(`block:${c}`);
          }
          options.push('allow');
        } else if (this.pending.kind === 'block') {
          options.push('challenge');
          options.push('allow');
        }
      }
      pendingView = {
        kind: this.pending.kind,
        type: this.pending.type,
        actorId: this.pending.actorId,
        actorName: actor ? actor.name : '',
        targetId: this.pending.targetId,
        targetName: target ? target.name : null,
        claim: this.pending.claim,
        blockClaim: this.pending.blockClaim || null,
        blockerName: blocker ? blocker.name : null,
        waitingOn: this.pending.eligibleResponders
          ? this.pending.eligibleResponders.filter((id2) => !this.pending.responses[id2]).map((id2) => this.getPlayer(id2).name)
          : [],
        myOptions: options,
      };
    }

    let loseInfluenceView = null;
    if (this.pendingLoseInfluence) {
      const p = this.getPlayer(this.pendingLoseInfluence.playerId);
      if (this.pendingLoseInfluence.playerId === viewerId) {
        loseInfluenceView = {
          forMe: true,
          options: p.influences.map((c, i) => ({ index: i, card: c.card, revealed: c.revealed })).filter((o) => !o.revealed),
        };
      } else {
        loseInfluenceView = { forMe: false, waitingOnName: p.name };
      }
    }

    let exchangeView = null;
    if (this.pendingExchange) {
      if (this.pendingExchange.playerId === viewerId) {
        const player = this.getPlayer(viewerId);
        const currentCards = player.influences.filter((c) => !c.revealed).map((c) => c.card);
        exchangeView = {
          forMe: true,
          keepCount: currentCards.length,
          offered: [...currentCards, ...this.pendingExchange.offered],
        };
      } else {
        const p = this.getPlayer(this.pendingExchange.playerId);
        exchangeView = { forMe: false, waitingOnName: p.name };
      }
    }

    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      you: viewerId,
      turnPlayerId: current ? current.id : null,
      forceCoupAt: FORCE_COUP_AT,
      players,
      deckCount: this.deck.length,
      log: this.getVisibleLog().slice(-40),
      logMode: this.logMode,
      pending: pendingView,
      loseInfluence: loseInfluenceView,
      exchange: exchangeView,
      winnerId: this.winnerId,
      actions: ACTIONS,
      roundNumber: this.roundNumber,
      victoryTarget: this.victoryTarget,
      roundWinnerId: this.lastRoundWinnerId,
      readyPlayerIds: this.phase === 'roundover' ? [...this.readyForNextRound] : [],
    };
  }
}

module.exports = { Game, ACTIONS, MIN_PLAYERS, MAX_PLAYERS };
