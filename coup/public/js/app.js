(() => {
  const socket = io();

  // Original vector emblems (not the commercial game's artwork) -- a crown for
  // the Duke, a dagger for the Assassin, a ship's wheel for the Captain,
  // scales for the Ambassador, a folding fan for the Contessa.
  const CHAR_META = {
    Duke: {
      cls: 'char-duke', symbol: '♦',
      art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
        <path d="M20 70 L20 45 L32 58 L50 30 L68 58 L80 45 L80 70 Z"/>
        <rect x="18" y="70" width="64" height="10" rx="2"/>
        <circle cx="50" cy="26" r="5"/><circle cx="24" cy="42" r="4"/><circle cx="76" cy="42" r="4"/>
      </svg>`,
    },
    Assassin: {
      cls: 'char-assassin', symbol: '♠',
      art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
        <circle cx="50" cy="16" r="6"/>
        <rect x="44" y="20" width="12" height="28" rx="3"/>
        <rect x="28" y="48" width="44" height="8" rx="2"/>
        <path d="M50 56 L60 60 L50 90 L40 60 Z"/>
      </svg>`,
    },
    Captain: {
      cls: 'char-captain', symbol: '♣',
      art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
        <path d="M22 30 Q22 16 36 16 L64 16 Q78 16 78 30 L78 38 Q78 58 50 72 Q22 58 22 38 Z"/>
        <rect x="30" y="34" width="16" height="9" fill="#100d0f"/>
        <rect x="54" y="34" width="16" height="9" fill="#100d0f"/>
      </svg>`,
    },
    Ambassador: {
      cls: 'char-ambassador', symbol: '♥',
      art: `<svg class="card-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="50" y1="18" x2="50" y2="78"/><line x1="22" y1="30" x2="78" y2="30"/>
        <line x1="22" y1="30" x2="14" y2="55"/><line x1="22" y1="30" x2="30" y2="55"/>
        <line x1="78" y1="30" x2="70" y2="55"/><line x1="78" y1="30" x2="86" y2="55"/>
        <path d="M14 55 Q22 66 30 55" fill="none"/><path d="M70 55 Q78 66 86 55" fill="none"/>
        <line x1="34" y1="82" x2="66" y2="82"/><circle cx="50" cy="18" r="4" fill="currentColor" stroke="none"/>
      </svg>`,
    },
    Contessa: {
      cls: 'char-contessa', symbol: '★',
      art: `<svg class="card-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
        <path d="M50 82 L18 34"/><path d="M50 82 L32 20"/><path d="M50 82 L50 16"/>
        <path d="M50 82 L68 20"/><path d="M50 82 L82 34"/>
        <path d="M18 34 Q50 6 82 34"/><circle cx="50" cy="82" r="5" fill="currentColor" stroke="none"/>
      </svg>`,
    },
  };

  function renderCardFace(cardName) {
    const meta = CHAR_META[cardName] || {};
    return `
      <span class="card-corner">${meta.symbol || ''}</span>
      ${meta.art || ''}
      <span class="card-name">${cardName || '?'}</span>
    `;
  }

  const LOG_MODE_COPY = {
    full: {
      title: '🌐 Remote Game',
      badge: '🌐 Remote',
      lobby: '🌐 Remote Game — full log stays visible all game.',
      desc: 'Full history, always visible.',
    },
    off: {
      title: '🪑 Tabletop Game',
      badge: '🪑 Tabletop',
      lobby: '🪑 Tabletop Game — claims fade after the next turn. Revealed cards & eliminations always stick. Full log returns at game end.',
      desc: 'Short memory, like a real table — claims fade after one turn. Revealed cards and eliminations always stick.',
    },
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let session = loadSession();
  let lastState = null;
  let pendingActionType = null; // when opening target modal
  let exchangeSelection = [];

  const SEAT_ITEM_HEIGHT = 60; // must match .seat-item height + gap in CSS
  let seatOrder = []; // host's working seating order (array of player ids), Tabletop mode only
  let seatDragCtx = null;

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

  function loadSavedName() {
    try {
      return localStorage.getItem('coup.playerName') || '';
    } catch (e) {
      return '';
    }
  }
  function saveName(name) {
    try {
      localStorage.setItem('coup.playerName', name);
    } catch (e) {
      // ignore (e.g. private browsing storage restrictions)
    }
    // Keep both fields in sync immediately, not just on next page load.
    $('#create-name').value = name;
    $('#join-name').value = name;
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
  $$('.tab-btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn[data-tab]').forEach((b) => b.classList.remove('active'));
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  let selectedLogMode = 'full';
  $$('#logmode-select .mode-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedLogMode = card.dataset.mode;
      $$('#logmode-select .mode-card').forEach((c) => c.classList.toggle('selected', c === card));
    });
  });

  let selectedVictoryTarget = 1;
  $$('#victory-select .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.victory) === selectedVictoryTarget);
    btn.addEventListener('click', () => {
      selectedVictoryTarget = Number(btn.dataset.victory);
      $$('#victory-select .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  $('#create-name').value = loadSavedName();
  $('#join-name').value = loadSavedName();

  $('#btn-create').addEventListener('click', () => {
    const name = $('#create-name').value.trim();
    if (!name) return showToast('Enter your name first.');
    const fullLog = selectedLogMode !== 'off';
    socket.emit('createRoom', { name, fullLog, victoryTarget: selectedVictoryTarget }, (res) => {
      if (!res || !res.ok) return showToast((res && res.error) || 'Could not create room.');
      saveName(name);
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
      saveName(name);
      saveSession({ code: res.code, playerId: res.playerId, token: res.token });
    });
  });

  // Prefill join code from ?code= link
  const params = new URLSearchParams(location.search);
  if (params.get('code')) {
    $('#join-code').value = params.get('code').toUpperCase();
    $$('.tab-btn[data-tab]').forEach((b) => b.classList.remove('active'));
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
    $$('.modal').forEach((m) => m.classList.add('hidden'));
    showScreen('#screen-home');
  }

  function inviteUrl(code) {
    return `${location.origin}${location.pathname}?code=${code}`;
  }

  async function copyInviteLink(code) {
    const url = inviteUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied!');
    } catch (e) {
      prompt('Copy this link:', url);
    }
  }

  $('#btn-copy-link').addEventListener('click', () => copyInviteLink($('#lobby-code').textContent));

  $('#btn-leaderboard-game').addEventListener('click', () => {
    if (!lastState) return;
    const target = lastState.victoryTarget;
    $('#leaderboard-hint').textContent = `Round ${lastState.roundNumber} — first to ${target} round win${target > 1 ? 's' : ''} takes the match.`;
    $('#leaderboard-rows').innerHTML = renderLeaderboardRows(lastState);
    openModal('#modal-leaderboard');
  });

  $('#game-code').addEventListener('click', () => {
    if (!lastState) return;
    $('#rejoin-code').textContent = lastState.code;
    $('#rejoin-qr-img').src = `/qr?text=${encodeURIComponent(inviteUrl(lastState.code))}`;
    openModal('#modal-rejoin');
  });

  $('#log-mode-pill').addEventListener('click', () => {
    if (!lastState) return;
    const copy = LOG_MODE_COPY[lastState.logMode === 'off' ? 'off' : 'full'];
    $('#gamemode-title').textContent = copy.title;
    $('#gamemode-desc').textContent = copy.desc;
    openModal('#modal-gamemode');
  });
  $('#btn-copy-link-game').addEventListener('click', () => copyInviteLink(lastState ? lastState.code : ''));

  $('#btn-chat-game').addEventListener('click', () => {
    if (lastState) chatSeenCount = lastState.chat.length;
    $('#chat-badge').classList.add('hidden');
    openModal('#modal-chat');
    const list = $('#chat-messages');
    list.scrollTop = list.scrollHeight;
    $('#chat-input').focus();
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chatMessage', { text });
    input.value = '';
  });

  // ---------- Socket lifecycle ----------
  function rejoinIfNeeded() {
    if (!session) return;
    socket.emit('rejoinRoom', session, (res) => {
      if (!res || !res.ok) {
        clearSession();
        showScreen('#screen-home');
      }
    });
  }

  socket.on('connect', rejoinIfNeeded);

  // Phones commonly suspend the WebSocket while the tab/app is backgrounded
  // without ever telling this page it disconnected. When the page becomes
  // visible again, force a reconnect so a stale connection doesn't sit there
  // silently until the user taps something and gets "Not in a room."
  function recoverConnection() {
    if (!session) return;
    if (socket.connected) {
      rejoinIfNeeded();
    } else {
      socket.connect();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recoverConnection();
  });
  window.addEventListener('pageshow', recoverConnection);
  window.addEventListener('focus', recoverConnection);

  socket.on('errorMsg', (msg) => {
    if (msg === 'Not in a room.' && session) {
      // The connection dropped and silently reconnected without us noticing
      // in time. Recover the session so the next tap works, and say so
      // instead of leaving the generic error as the last word.
      socket.emit('rejoinRoom', session, (res) => {
        if (res && res.ok) {
          showToast('Connection recovered — try that again.');
        } else {
          clearSession();
          showScreen('#screen-home');
          showToast(msg);
        }
      });
      return;
    }
    showToast(msg);
  });

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
    if (state.phase === 'roundover' || state.phase === 'gameover') {
      renderRoundEndModal(state);
    } else {
      closeModal('#modal-roundend');
    }
  }

  function renderLeaderboardRows(state) {
    const sorted = [...state.players].sort((a, b) => b.roundWins - a.roundWins);
    return sorted.map((p) => `
      <div class="lb-row">
        <span class="lb-name">${escapeHtml(p.name)}
          ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
          ${p.id === state.you ? '<span class="you-badge">YOU</span>' : ''}
        </span>
        <span class="lb-crowns">${p.roundWins > 0 ? '👑'.repeat(p.roundWins) : '—'}</span>
      </div>
    `).join('');
  }

  function renderRoundEndModal(state) {
    const isMatchOver = state.phase === 'gameover';
    const winner = state.players.find((p) => p.id === (isMatchOver ? state.winnerId : state.roundWinnerId));
    const isHost = state.hostId === state.you;

    $('#roundend-title').textContent = isMatchOver
      ? (winner ? `${winner.name} Wins the Game!` : 'Game Ended')
      : (winner ? `${winner.name} wins Round ${state.roundNumber}!` : `Round ${state.roundNumber} ended`);

    $('#roundend-leaderboard').innerHTML = renderLeaderboardRows(state);
    openModal('#modal-roundend');

    const btnZone = $('#roundend-buttons');
    if (isMatchOver) {
      btnZone.innerHTML = `<button id="btn-roundend-leave" class="btn btn-primary btn-block">Leave</button>`;
      $('#btn-roundend-leave').addEventListener('click', () => leaveRoom());
      return;
    }

    const iAmReady = state.readyPlayerIds.includes(state.you);
    const waitingNames = state.players.filter((p) => p.connected && !state.readyPlayerIds.includes(p.id)).map((p) => p.name);
    btnZone.innerHTML = `
      <button id="btn-ready-round" class="btn btn-primary btn-block" ${iAmReady ? 'disabled' : ''}>
        ${iAmReady ? 'Waiting for others…' : 'Ready for Next Round'}
      </button>
      ${waitingNames.length ? `<p class="hint center">Waiting on: ${waitingNames.map(escapeHtml).join(', ')}</p>` : ''}
      <button id="btn-roundend-leave" class="btn btn-text btn-block">Leave</button>
      ${isHost ? '<button id="btn-endgame" class="btn btn-text btn-block">End Game</button>' : ''}
    `;

    if (!iAmReady) {
      $('#btn-ready-round').addEventListener('click', () => socket.emit('readyForRound'));
    }
    $('#btn-roundend-leave').addEventListener('click', () => {
      if (confirm('Leave this game?')) leaveRoom();
    });
    const endGameBtn = $('#btn-endgame');
    if (endGameBtn) {
      endGameBtn.addEventListener('click', () => {
        if (confirm('End the game for everyone? This cannot be undone.')) socket.emit('endGame');
      });
    }
  }

  function logModeText(state) {
    return LOG_MODE_COPY[state.logMode === 'off' ? 'off' : 'full'].lobby;
  }

  function renderLobby(state) {
    $('#lobby-code').textContent = state.code;
    $('#lobby-count').textContent = state.players.length;
    $('#lobby-victory').textContent = `🏆 First to ${state.victoryTarget} round win${state.victoryTarget > 1 ? 's' : ''} takes the match.`;
    $('#lobby-logmode').textContent = logModeText(state);
    const isHost = state.hostId === state.you;
    const list = $('#lobby-players');
    const seatHint = $('#seat-hint');
    const qrBlock = $('#lobby-qr');

    if (state.logMode === 'off') {
      qrBlock.classList.remove('hidden');
      const qrImg = $('#qr-img');
      const wantedSrc = `/qr?text=${encodeURIComponent(inviteUrl(state.code))}`;
      if (qrImg.getAttribute('src') !== wantedSrc) qrImg.src = wantedSrc;

      list.classList.add('seat-list');
      seatHint.classList.remove('hidden');
      seatHint.textContent = isHost
        ? 'Drag players into your real sitting order — play will proceed clockwise from whoever you put first.'
        : 'The host is arranging seating order to match how you\'re sitting around the table.';
      renderSeatOrderList(state, isHost);
    } else {
      qrBlock.classList.add('hidden');

      list.classList.remove('seat-list');
      seatHint.classList.add('hidden');
      list.style.height = '';
      list.innerHTML = state.players.map((p) => `
        <li>
          <span class="player-name">${escapeHtml(p.name)}
            ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
            ${p.id === state.you ? '<span class="you-badge">YOU</span>' : ''}
          </span>
          <span>${p.connected ? '' : '⚠️ offline'}</span>
        </li>
      `).join('');
    }

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

  // Tabletop mode: seating order doubles as turn order. Host can drag to reorder;
  // everyone else sees a live, read-only view of the current arrangement.
  function renderSeatOrderList(state, isHost) {
    const list = $('#lobby-players');
    // The server's player order is always the source of truth (it's exactly what
    // determines turn order). Only skip re-syncing while a local drag is in
    // progress, so an in-flight gesture isn't clobbered by an unrelated broadcast.
    if (!seatDragCtx) {
      seatOrder = state.players.map((p) => p.id);
    }

    list.style.height = `${seatOrder.length * SEAT_ITEM_HEIGHT - (SEAT_ITEM_HEIGHT - 52)}px`;
    list.innerHTML = seatOrder.map((id, i) => {
      const p = state.players.find((pl) => pl.id === id);
      if (!p) return '';
      return `
        <li class="seat-item" data-player-id="${p.id}" style="transform: translateY(${i * SEAT_ITEM_HEIGHT}px)">
          <span class="seat-order-num">${i + 1}</span>
          <span class="player-name">${escapeHtml(p.name)}
            ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
            ${p.id === state.you ? '<span class="you-badge">YOU</span>' : ''}
            ${!p.connected ? ' ⚠️' : ''}
          </span>
          ${isHost ? `<span class="seat-handle" data-handle="${p.id}">⠿</span>` : ''}
        </li>`;
    }).join('');

    if (isHost) {
      $$('.seat-handle').forEach((handle) => {
        handle.addEventListener('pointerdown', (e) => startSeatDrag(e, handle.dataset.handle));
      });
    }
  }

  function startSeatDrag(e, playerId) {
    e.preventDefault();
    const list = $('#lobby-players');
    const item = list.querySelector(`.seat-item[data-player-id="${playerId}"]`);
    if (!item) return;
    const startIndex = seatOrder.indexOf(playerId);
    seatDragCtx = { playerId, startIndex, currentIndex: startIndex, startClientY: e.clientY };
    item.classList.add('seat-dragging');
    item.setPointerCapture(e.pointerId);
    item.addEventListener('pointermove', onSeatDragMove);
    item.addEventListener('pointerup', onSeatDragEnd);
    item.addEventListener('pointercancel', onSeatDragEnd);
  }

  function onSeatDragMove(e) {
    if (!seatDragCtx) return;
    const list = $('#lobby-players');
    const item = list.querySelector(`.seat-item[data-player-id="${seatDragCtx.playerId}"]`);
    if (!item) return;
    const deltaY = e.clientY - seatDragCtx.startClientY;
    const maxTranslate = (seatOrder.length - 1) * SEAT_ITEM_HEIGHT;
    const translate = Math.max(0, Math.min(maxTranslate, seatDragCtx.startIndex * SEAT_ITEM_HEIGHT + deltaY));
    item.style.transform = `translateY(${translate}px)`;

    const newIndex = Math.round(translate / SEAT_ITEM_HEIGHT);
    if (newIndex !== seatDragCtx.currentIndex) {
      const [moved] = seatOrder.splice(seatDragCtx.currentIndex, 1);
      seatOrder.splice(newIndex, 0, moved);
      seatDragCtx.currentIndex = newIndex;
      seatOrder.forEach((id, i) => {
        const el = list.querySelector(`.seat-item[data-player-id="${id}"]`);
        if (!el) return;
        const numEl = el.querySelector('.seat-order-num');
        if (numEl) numEl.textContent = i + 1;
        if (id === seatDragCtx.playerId) return; // dragged item follows the pointer, not the grid
        el.style.transform = `translateY(${i * SEAT_ITEM_HEIGHT}px)`;
      });
    }
  }

  function onSeatDragEnd(e) {
    if (!seatDragCtx) return;
    const list = $('#lobby-players');
    const item = list.querySelector(`.seat-item[data-player-id="${seatDragCtx.playerId}"]`);
    if (item) {
      item.classList.remove('seat-dragging');
      item.style.transform = `translateY(${seatDragCtx.currentIndex * SEAT_ITEM_HEIGHT}px)`;
      item.removeEventListener('pointermove', onSeatDragMove);
      item.removeEventListener('pointerup', onSeatDragEnd);
      item.removeEventListener('pointercancel', onSeatDragEnd);
    }
    seatDragCtx = null;
    socket.emit('reorderPlayers', { order: seatOrder });
  }

  function renderGame(state) {
    $('#round-pill').textContent = `Round ${state.roundNumber}`;
    $('#game-code').textContent = state.code;
    $('#deck-count').textContent = `🂠 ${state.deckCount}`;
    const pill = $('#log-mode-pill');
    pill.textContent = LOG_MODE_COPY[state.logMode === 'off' ? 'off' : 'full'].badge;
    pill.title = logModeText(state);

    const me = state.players.find((p) => p.id === state.you);

    if (state.logMode === 'off') {
      $('#opponents-row').classList.add('hidden');
      $('#opponents-row').innerHTML = '';
      $('#seat-circle').classList.remove('hidden');
      renderSeatCircle(state);
    } else {
      $('#seat-circle').classList.add('hidden');
      $('#seat-circle').innerHTML = '';
      $('#opponents-row').classList.remove('hidden');
      $('#opponents-row').innerHTML = state.players.map((p) => renderOpponentCard(p, state)).join('');
    }

    const log = $('#game-log');
    const wasAtBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
    log.innerHTML = state.log.map((l) => `<div class="log-entry">${escapeHtml(l)}</div>`).join('');
    if (wasAtBottom) log.scrollTop = log.scrollHeight;

    renderChat(state);
    renderActionZone(state, me);
    renderMe(state, me);
  }

  // Chat is Remote mode only -- Tabletop players are already in the same room.
  let chatSeenCount = 0;
  function renderChat(state) {
    const chatBtn = $('#btn-chat-game');
    if (state.logMode === 'off') {
      chatBtn.classList.add('hidden');
      return;
    }
    chatBtn.classList.remove('hidden');

    const isOpen = !$('#modal-chat').classList.contains('hidden');
    if (isOpen) chatSeenCount = state.chat.length;
    const unread = Math.max(0, state.chat.length - chatSeenCount);
    const badge = $('#chat-badge');
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);

    const list = $('#chat-messages');
    const wasAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 20;
    list.innerHTML = state.chat.length
      ? state.chat.map((m) => `
          <div class="chat-msg ${m.playerId === state.you ? 'chat-me' : ''}">
            <span class="chat-name">${escapeHtml(m.name)}:</span>${escapeHtml(m.text)}
          </div>
        `).join('')
      : '<div class="chat-empty">No messages yet — say hi!</div>';
    if (wasAtBottom) list.scrollTop = list.scrollHeight;
  }

  function renderPips(influences) {
    return influences.map((c) => {
      if (c.revealed) {
        const meta = CHAR_META[c.card] || {};
        return `<div class="pip revealed ${meta.cls || ''}" title="${c.card}">${meta.symbol || ''}</div>`;
      }
      return `<div class="pip facedown"></div>`;
    }).join('');
  }

  function renderOpponentCard(p, state) {
    const isTurn = state.turnPlayerId === p.id;
    const isMe = p.id === state.you;
    const pips = renderPips(p.influences);
    return `
      <div class="opp-card ${isTurn ? 'is-turn' : ''} ${p.alive ? '' : 'is-dead'} ${isMe ? 'is-me' : ''}">
        ${!p.connected ? '<span class="opp-disconnected">⚠️</span>' : ''}
        <div class="opp-name">${escapeHtml(isMe ? 'You' : p.name)}</div>
        <div class="opp-coins">🪙 ${p.coins}</div>
        <div class="opp-influences">${pips}</div>
      </div>
    `;
  }

  // Tabletop mode: circular seating layout matching the host's drag-arranged order.
  // Seat 0 (first to act) anchors the bottom; seats proceed clockwise from there,
  // mirroring how turns actually move around a real table.
  function renderSeatCircle(state) {
    const container = $('#seat-circle');
    const n = state.players.length;
    const radiusPct = 34;
    const nodes = state.players.map((p, i) => {
      const rad = (i * 360 * Math.PI) / (180 * n);
      // Clockwise from the bottom (seat 0) moves toward the left first, matching
      // a clock face: 6 o'clock -> 7,8,9 (left) -> 12 (top) -> 3 (right) -> 6.
      const dx = (-radiusPct * Math.sin(rad)).toFixed(1);
      const dy = (radiusPct * Math.cos(rad)).toFixed(1);
      const isTurn = state.turnPlayerId === p.id;
      const isMe = p.id === state.you;
      const pips = renderPips(p.influences);
      return `
        <div class="seat-node ${isTurn ? 'is-turn' : ''} ${p.alive ? '' : 'is-dead'} ${isMe ? 'is-me' : ''}"
             style="left: calc(50% + ${dx}%); top: calc(50% + ${dy}%);">
          ${!p.connected ? '<span class="opp-disconnected">⚠️</span>' : ''}
          <div class="opp-name">${escapeHtml(isMe ? 'You' : p.name)}</div>
          <div class="opp-coins">🪙 ${p.coins}</div>
          <div class="opp-influences">${pips}</div>
        </div>`;
    }).join('');
    container.innerHTML = `<div class="seat-table-surface"></div>${nodes}`;
  }

  function renderMe(state, me) {
    if (!me) return;
    $('#me-name').textContent = me.name + (state.turnPlayerId === me.id ? ' (your turn)' : '');
    $('#me-coins').textContent = `🪙 ${me.coins}`;
    $('#me-cards').innerHTML = me.influences.map((c) => {
      const meta = CHAR_META[c.card] || {};
      return `<div class="me-card ${meta.cls || ''} ${c.revealed ? 'revealed' : ''}">${renderCardFace(c.card)}</div>`;
    }).join('');
  }

  function renderActionZone(state, me) {
    const zone = $('#action-zone');
    if (state.phase === 'gameover' || state.phase === 'roundover') { zone.innerHTML = ''; return; }
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
        card.innerHTML = renderCardFace(opt.card);
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
        el.innerHTML = renderCardFace(card);
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
