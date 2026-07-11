# Coup — Online

A real-time, mobile-friendly implementation of the bluffing card game **Coup**. One person creates a game and gets a short room code; everyone else joins from their own phone using that code. The server is the single source of truth for game state, so hands stay secret and bluffs actually work.

## Features

- **Create / Join with a room code** — 4-letter codes (no ambiguous characters), shareable as a link too ("Copy Invite Link" on the lobby screen).
- **Play from your phone** — each player only ever sees their own hand; everyone connects from their own device instead of passing cards around a table.
- **Full Coup rules engine**, server-authoritative: Income, Foreign Aid, Coup, Tax, Assassinate, Steal, Exchange, challenges, blocks, forced Coup at 10+ coins, elimination, and win detection.
- **Contextual action helpers** — every action button shows its coin cost/gain and a one-line explanation; disabled automatically when you can't afford it or must Coup.
- **Always-available cheat sheet** — a 📜 button on every screen opens a reference for all 5 characters, their actions/blocks, and how challenges work.
- **Reconnect support** — if your phone drops connection or the tab refreshes, you rejoin the same seat automatically.
- **Coup-inspired dark/noir visual theme** with per-character colors (Duke purple, Assassin black, Captain blue, Ambassador green, Contessa crimson).

## Running it locally

```bash
cd coup
npm install
npm start
```

Then open `http://localhost:3000` — on your phone, use your machine's LAN IP (e.g. `http://192.168.1.23:3000`) so other devices on the same network can join.

## Deploying

This needs a persistent Node.js process (it uses WebSockets via Socket.IO), so it **cannot** be hosted on static hosting like GitHub Pages. Any small Node host works well: Render, Railway, Fly.io, a VPS, etc.

1. Push this `coup/` folder (or the whole repo) to your host of choice.
2. Set the start command to `npm start` (runs `server/index.js`).
3. The server reads `PORT` from the environment (defaults to 3000).
4. Once deployed, share the app's URL — friends create/join rooms exactly like the local flow, from anywhere (not just the same WiFi).

Game state is kept in memory per room; there's no database. That's intentional for a lightweight party game — rooms are cleaned up automatically once everyone disconnects.

## How to play (quick version)

Each player starts with **2 coins** and **2 face-down influence cards** (character identities only they can see). On your turn you take one action — some are free (Income, Foreign Aid, Coup), others require *claiming* a character (Tax = Duke, Assassinate = Assassin, Steal = Captain, Exchange = Ambassador) whether or not you actually have it. Other players can **Challenge** your claim (if you're bluffing, you lose an influence; if not, they do) or **Block** with a countering character if the action allows it. Lose both influences and you're out. Last player standing wins. Full details are in the in-app cheat sheet.

## Project structure

```
coup/
  server/
    index.js   Express + Socket.IO wiring, socket event handlers
    game.js    Authoritative game engine (rules, turns, challenges, blocks)
    rooms.js   Room code generation + in-memory room registry
    deck.js    Character deck construction/shuffling
  public/
    index.html Single-page app shell (home / lobby / game / modals)
    css/theme.css
    js/app.js  Client rendering + Socket.IO event handling
```
