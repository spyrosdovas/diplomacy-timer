(() => {
  const socket = io();

  const CHAR_META = {
    Duke: { cls: 'char-duke', symbol: '♦' },
    Assassin: { cls: 'char-assassin', symbol: '♠' },
    Captain: { cls: 'char-captain', symbol: '♣' },
    Ambassador: { cls: 'char-ambassador', symbol: '♥' },
    Contessa: { cls: 'char-contessa', symbol: '★' },
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let session = loadSession();
  let lastState = null;
  let pendingActionType = null; // when opening target modal
  let exchangeSelection = [];

  function loadSession() {
    try {
      const raw = localStorage.getItem('coup.session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveSession(s) {
    session = s;
    localStorage.setItem('coup.session', JSON.stringify(s));
  }
  function clearSession() {
    session = null;
    localStorage.removeItem('coup.session');
  }

  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }

  $$('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal('#' + btn.dataset.closeModal));
  });
  $$('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // ---------- Home screen ----------
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => b.classList.remove('active'));
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  $('#btn-create').addEventListener('click', () => {
    const name = $('#create-name').value.trim();
    if (!name) return showToast('Enter your name first.');
    socket.emit('createRoom', { name }, (res) => {
      if (!res || !res.ok) return showToast((res && res.error) || 'Could not create room.');
      saveSession({ code: res.code, playerId: res.playerId, token: res.token });
    });
  });

  $('#btn-join').addEventListener('click', () => {
    const code = $('#join-code').value.trim().toUpperCase();
    const name = $('#join-name').value.trim();
    if (!code || code.length !== 4) return showToast('Enter the 4-letter room code.');
    if (!name) return showToast('Enter your name first.');
    socket.emit('joinRoom', { code, name }, (res) => {
      if (!res || !res.ok) return showToast((res && res.error) || 'Could not join room.');
      saveSession({ code: res.code, playerId: res.playerId, token: res.token });
    });
  });

  // Prefill join code from ?code= link
  const params = new URLSearchParams(location.search);
  if (params.get('code')) {
    $('#join-code').value = params.get('code').toUpperCase();
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    $$('.tab-panel').forEach((p) => p.classList.remove('active'));
    $('.tab-btn[data-tab="join"]').classList.add('active');
    $('#tab-join').classList.add('active');
  }

  ['#btn-cheatsheet-home', '#btn-cheatsheet-lobby', '#btn-cheatsheet-game'].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener('click', () => openModal('#modal-cheatsheet'));
  });

  // ---------- Lobby ----------
  $('#btn-start').addEventListener('click', () => {
    socket.emit('startGame', {}, (res) => {
      if (!res || !res.ok) showToast((res && res.error) || 'Could not start game.');
    });
  });

  $('#btn-leave-lobby').addEventListener('click', leaveRoom);
  $('#btn-leave-game').addEventListener('click', () => {
    if (confirm('Leave this game?')) leaveRoom();
  });

  function leaveRoom() {
    socket.emit('leaveRoom');
    clearSession();
    lastState = null;
    showScreen('#screen-home');
  }

  $('#btn-copy-link').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?code=${$('#lobby-code').textContent}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied!');
    } catch (e) {
      prompt('Copy this link:', url);
    }
  });

  $('#btn-play-again').addEventListener('click', () => {
    closeModal('#modal-gameover');
    leaveRoom();
  });

  // ---------- Socket lifecycle ----------
  socket.on('connect', () => {
    if (session) {
      socket.emit('rejoinRoom', session, (res) => {
        if (!res || !res.ok) {
          clearSession();
          showScreen('#screen-home');
        }
      });
    }
  });

  socket.on('errorMsg', (msg) => showToast(msg));

  socket.on('state', (state) => {
    lastState = state;
    render(state);
  });

  // ---------- Render ----------
  function render(state) {
    if (state.phase === 'lobby') {
      renderLobby(state);
      showScreen('#screen-lobby');
      return;
    }
    showScreen('#screen-game');
    renderGame(state);
    if (state.phase === 'gameover') {
      const me = state.players.find((p) => p.id === state.you);
      const winner = state.players.find((p) => p.id === state.winnerId);
      $('#gameover-title').textContent = winner ? `${winner.name} Wins!` : 'Game Over';
      $('#gameover-sub').textContent = winner && winner.id === state.you
        ? 'You out-bluffed the whole table.'
        : (winner ? `${winner.name} was the last influence standing.` : '');
      openModal('#modal-gameover');
    }
  }

  function renderLobby(state) {
    $('#lobby-code').textContent = state.code;
    $('#lobby-count').textContent = state.players.length;
    const isHost = state.hostId === state.you;
    $('#lobby-players').innerHTML = state.players.map((p) => `
      <li>
        <span class="player-name">${escapeHtml(p.name)}
          ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
          ${p.id === state.you ? '<span class="you-badge">YOU</span>' : ''}
        </span>
        <span>${p.connected ? '' : '⚠️ offline'}</span>
      </li>
    `).join('');

    const startBtn = $('#btn-start');
    if (isHost) {
      startBtn.classList.remove('hidden');
      startBtn.disabled = state.players.length < 2;
      $('#lobby-status').textContent = state.players.length < 2
        ? 'Need at least 2 players to start.'
        : `Ready to start with ${state.players.length} players.`;
    } else {
      startBtn.classList.add('hidden');
      $('#lobby-status').textContent = 'Waiting for the host to start the game…';
    }
  }

  function renderGame(state) {
    $('#game-code').textContent = state.code;
    $('#deck-count').textContent = `🂠 ${state.deckCount}`;

    const me = state.players.find((p) => p.id === state.you);
    const others = state.players.filter((p) => p.id !== state.you);

    $('#opponents-row').innerHTML = others.map((p) => renderOpponentCard(p, state)).join('');

    const log = $('#game-log');
    const wasAtBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
    log.innerHTML = state.log.map((l) => `<div class="log-entry">${escapeHtml(l)}</div>`).join('');
    if (wasAtBottom || true) log.scrollTop = log.scrollHeight;

    renderActionZone(state, me);
    renderMe(state, me);
  }

  function renderOpponentCard(p, state) {
    const isTurn = state.turnPlayerId === p.id;
    const pips = p.influences.map((c) => {
      if (c.revealed) {
        const meta = CHAR_META[c.card] || {};
        return `<div class="pip revealed ${meta.cls || ''}" title="${c.card}">${meta.symbol || ''}</div>`;
      }
      return `<div class="pip facedown"></div>`;
    }).join('');
    return `
      <div class="opp-card ${isTurn ? 'is-turn' : ''} ${p.alive ? '' : 'is-dead'}">
        ${!p.connected ? '<span class="opp-disconnected">⚠️</span>' : ''}
        <div class="opp-name">${escapeHtml(p.name)}</div>
        <div class="opp-coins">🪙 ${p.coins}</div>
        <div class="opp-influences">${pips}</div>
      </div>
    `;
  }

  function renderMe(state, me) {
    if (!me) return;
    $('#me-name').textContent = me.name + (state.turnPlayerId === me.id ? ' (your turn)' : '');
    $('#me-coins').textContent = `🪙 ${me.coins}`;
    $('#me-cards').innerHTML = me.influences.map((c) => {
      const meta = CHAR_META[c.card] || {};
      return `<div class="me-card ${meta.cls || ''} ${c.revealed ? 'revealed' : ''}">${c.card || '?'}</div>`;
    }).join('');
  }

  function renderActionZone(state, me) {
    const zone = $('#action-zone');
    if (state.phase === 'gameover') { zone.innerHTML = ''; return; }
    if (!me) { zone.innerHTML = ''; return; }

    // 1. I must choose a card to lose
    if (state.loseInfluence && state.loseInfluence.forMe) {
      zone.innerHTML = `
        <div class="pending-box">
          <div class="pending-desc">You must give up an influence. Choose which card to reveal:</div>
          <div class="lose-card-row" id="lose-row"></div>
        </div>`;
      const row = $('#lose-row');
      state.loseInfluence.options.forEach((opt) => {
        const meta = CHAR_META[opt.card] || {};
        const card = document.createElement('div');
        card.className = `big-card ${meta.cls || ''}`;
        card.innerHTML = `<div class="symbol">${meta.symbol || ''}</div>${opt.card}`;
        card.addEventListener('click', () => socket.emit('chooseLoseInfluence', { index: opt.index }));
        row.appendChild(card);
      });
      return;
    }
    if (state.loseInfluence && !state.loseInfluence.forMe) {
      zone.innerHTML = `<div class="pending-box"><div class="pending-waiting">Waiting on ${escapeHtml(state.loseInfluence.waitingOnName)} to lose an influence…</div></div>`;
      return;
    }

    // 2. Exchange (Ambassador)
    if (state.exchange && state.exchange.forMe) {
      exchangeSelection = exchangeSelection.filter((i) => i < state.exchange.offered.length);
      zone.innerHTML = `
        <div class="pending-box">
          <div class="pending-desc">Choose ${state.exchange.keepCount} card${state.exchange.keepCount > 1 ? 's' : ''} to keep:</div>
          <div class="exchange-card-row" id="exchange-row"></div>
          <button id="exchange-confirm" class="btn btn-primary btn-sm">Confirm</button>
        </div>`;
      const row = $('#exchange-row');
      state.exchange.offered.forEach((card, i) => {
        const meta = CHAR_META[card] || {};
        const el = document.createElement('div');
        el.className = `big-card ${meta.cls || ''} ${exchangeSelection.includes(i) ? 'selected' : ''}`;
        el.innerHTML = `<div class="symbol">${meta.symbol || ''}</div>${card}`;
        el.addEventListener('click', () => {
          const idx = exchangeSelection.indexOf(i);
          if (idx >= 0) {
            exchangeSelection.splice(idx, 1);
          } else if (exchangeSelection.length < state.exchange.keepCount) {
            exchangeSelection.push(i);
          }
          renderActionZone(lastState, me);
        });
        row.appendChild(el);
      });
      $('#exchange-confirm').disabled = exchangeSelection.length !== state.exchange.keepCount;
      $('#exchange-confirm').addEventListener('click', () => {
        socket.emit('exchangeChoice', { keepIndexes: exchangeSelection });
        exchangeSelection = [];
      });
      return;
    }
    if (state.exchange && !state.exchange.forMe) {
      zone.innerHTML = `<div class="pending-box"><div class="pending-waiting">Waiting on ${escapeHtml(state.exchange.waitingOnName)} to exchange cards…</div></div>`;
      return;
    }

    // 3. Pending action / block awaiting responses
    if (state.pending) {
      const p = state.pending;
      let desc;
      if (p.kind === 'action') {
        const label = state.actions[p.type].label;
        desc = `<b>${escapeHtml(p.actorName)}</b> attempts <b>${label}</b>${p.claim ? ` (claiming ${p.claim})` : ''}${p.targetName ? ` on <b>${escapeHtml(p.targetName)}</b>` : ''}.`;
      } else {
        desc = `<b>${escapeHtml(p.actorName || '')}</b>'s action is blocked by <b>${escapeHtml(p.blockerName)}</b>, who claims <b>${p.blockClaim}</b>.`;
      }
      const btns = [];
      p.myOptions.forEach((opt) => {
        if (opt === 'allow') {
          btns.push(`<button class="btn btn-ghost btn-sm" data-resp="allow">Allow</button>`);
        } else if (opt === 'challenge') {
          btns.push(`<button class="btn btn-primary btn-sm" data-resp="challenge">Challenge!</button>`);
        } else if (opt.startsWith('block:')) {
          const c = opt.split(':')[1];
          btns.push(`<button class="btn btn-ghost btn-sm" data-resp="block" data-claim="${c}">Block as ${c}</button>`);
        }
      });
      zone.innerHTML = `
        <div class="pending-box">
          <div class="pending-desc">${desc}</div>
          <div class="pending-btns">${btns.join('') || '<span class="pending-waiting">Waiting…</span>'}</div>
          ${p.waitingOn && p.waitingOn.length ? `<div class="pending-waiting">Waiting on: ${p.waitingOn.map(escapeHtml).join(', ')}</div>` : ''}
        </div>`;
      $$('#action-zone [data-resp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          socket.emit('respond', { response: btn.dataset.resp, blockClaim: btn.dataset.claim });
        });
      });
      return;
    }

    // 4. My turn: show action grid
    if (state.turnPlayerId === me.id) {
      zone.innerHTML = `
        <div class="turn-banner">Your Move</div>
        <div class="actions-grid" id="actions-grid"></div>`;
      const grid = $('#actions-grid');
      Object.entries(state.actions).forEach(([type, def]) => {
        const affordable = me.coins >= def.cost;
        const forcedCoup = me.coins >= state.forceCoupAt;
        const disabled = !affordable || (forcedCoup && type !== 'coup');
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.disabled = disabled;
        btn.innerHTML = `
          <div class="a-title"><span>${def.label}</span>${def.cost ? `<span class="a-cost">−${def.cost}🪙</span>` : (def.gain ? `<span class="a-cost">+${def.gain}🪙</span>` : '')}</div>
          <div class="a-desc">${def.desc}</div>`;
        btn.addEventListener('click', () => {
          if (def.needsTarget) {
            openTargetPicker(type, def, state);
          } else {
            socket.emit('action', { type });
          }
        });
        grid.appendChild(btn);
      });
      return;
    }

    // 5. Waiting on someone else's turn
    const turnPlayer = state.players.find((p) => p.id === state.turnPlayerId);
    zone.innerHTML = `<div class="pending-box"><div class="pending-waiting">Waiting on ${escapeHtml(turnPlayer ? turnPlayer.name : '…')} to take a turn…</div></div>`;
  }

  function openTargetPicker(type, def, state) {
    pendingActionType = type;
    $('#target-title').textContent = `Choose a target for ${def.label}`;
    const targets = state.players.filter((p) => p.id !== state.you && p.alive);
    $('#target-list').innerHTML = targets.map((p) => `
      <div class="target-item" data-target="${p.id}">
        <span>${escapeHtml(p.name)}</span>
        <span>🪙 ${p.coins}</span>
      </div>
    `).join('');
    $$('.target-item').forEach((el) => {
      el.addEventListener('click', () => {
        socket.emit('action', { type: pendingActionType, targetId: el.dataset.target });
        closeModal('#modal-target');
      });
    });
    openModal('#modal-target');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
