# 👑 Claude Royale

**Real-time multiplayer Clash Royale-style battler that runs entirely in the browser** — fullscreen, landscape, made to be played with your phone held sideways.

🌐 **Play it: [clauderoyale.net](https://clauderoyale.net)** · 🇧🇷 [Leia em Português](README.pt-BR.md)

[![CI](https://github.com/adrianoreinert/claude-royale/actions/workflows/ci.yml/badge.svg)](https://github.com/adrianoreinert/claude-royale/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/adrianoreinert/claude-royale?color=blue)](https://github.com/adrianoreinert/claude-royale/releases)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Status](https://img.shields.io/badge/status-live-brightgreen)](https://stats.uptimerobot.com/wHLcslngdD)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/CCnKH4XBmy)
[![itch.io](https://img.shields.io/badge/itch.io-play-fa5c5c?logo=itchdotio&logoColor=white)](https://clauderoyale.itch.io/claude-royale)
![Stack](https://img.shields.io/badge/Phaser%203%20·%20React%20·%20Colyseus-TypeScript-3178c6)

<p align="center">
  <img src="docs/media/gameplay.gif" alt="Claude Royale gameplay — live 1v1 battle" width="720">
</p>

| | |
|---|---|
| ![Home screen](docs/screenshots/home.png) | ![Live battle](docs/screenshots/battle.png) |
| *Home — matchmaking, ranking, seasonal pass* | *1v1 battle — authoritative server at 20 ticks/s* |
| ![Card collection](docs/screenshots/collection.png) | ![Match results and replay](docs/screenshots/battle-late.png) |
| *49 collectible cards with live balance history* | *Every match is recorded — watch the replay instantly* |

## What this is

A study project that grew into a full game: 1v1 real-time battles with troops, spells, towers and elixir, running on an **authoritative Node server** with a **shared deterministic simulation** — the same TypeScript code that runs the match also powers bots, headless balance simulations and unit tests.

**Highlights**

- ⚔️ **Real-time 1v1** with matchmaking, private rooms (4-letter codes), live spectating and automatic reconnection (30s grace)
- 🃏 **49 collectible cards** built by component composition — shields, life steal, healing auras, poison zones, charges, flyers, spawner buildings, resource collectors, mirror and more
- 🏆 **Champions** with active abilities and **card evolutions** that trigger every N plays
- 🤖 **Server-side bots** in 3 difficulties, bot-vs-bot spectator mode, and a headless **balance simulator** that plays hundreds of matches to calibrate card stats
- 📽️ **Replays** recorded client-side (play/pause, 2x speed)
- 📊 **Versioned balance patches** as data, with semantic classification (buff/nerf) and player-readable history in the Collection
- 📱 **PWA** — installable, offline asset cache, fullscreen landscape with orientation lock

## Play it

**Online:** [clauderoyale.net](https://clauderoyale.net)

**Locally:**

```bash
pnpm install
pwsh tools/fetch-assets.ps1   # downloads the Tiny Swords sprites (not committed — license forbids redistribution)
pnpm dev
```

- Client: http://localhost:5173 (use the **Network** URL shown by Vite to play from your phone on the same Wi-Fi)
- Server: ws://localhost:2567

Open the game in **two tabs** (or two devices) and press ⚔️ Battle in both — the match starts when both players join. Or play solo with **Train vs Bot**.

```bash
pnpm test   # simulation + card engine unit tests (Vitest)
```

## Host your own

The client is static and the server is a single Node process — any "static host + small VPS" combo works.

**One command (Docker Compose):**

```bash
docker compose up --build
# client on http://localhost:8080, server on ws://localhost:2567
```

**Manual deploy:**

```bash
# Server (Render / Railway / Fly.io / VPS) — put a TLS proxy in front (browsers require wss:// on https:// pages)
docker build -f server/Dockerfile -t claude-royale-server .
docker run -p 2567:2567 claude-royale-server

# Client (Vercel / Netlify / Cloudflare Pages)
VITE_SERVER_URL=wss://your-server.example.com pnpm --filter @claude-royale/client build   # outputs client/dist
```

## Game modes & screens

- **1v1 Battle** — real-time matchmaking, emotes, surrender, auto-reconnect
- **Play with a friend** — private room via 4-letter code
- **Spectate** — watch any live match by room code
- **Train vs Bot** — 3 difficulties (easy reacts late; medium defends and uses spells; hard counters by type, finishes towers with spells and supports pushes)
- **Watch Bots** — live bot-vs-bot, great for studying card interactions
- **Infinite elixir** — party mode for testing mechanics
- **Arena skins** — Field, Desert, Snow and Night (persisted per device)
- **Leaderboard** — server-side trophies, top 5 on the home screen
- **Collection / Deck / Profile** — card stats modal (HP, damage, DPS, range, speed, targets), 8-card deck builder with average elixir cost, editable profile with match history

## Architecture

```
claude_royale/
├── client/   # Vite + React + Phaser 3
│   └── src/
│       ├── game/   # Phaser scene, 2.5D projection, entities, effects
│       ├── ui/     # React: card hand, elixir bar, screens, overlays
│       └── net/    # Colyseus client
├── server/   # Node + Colyseus (BattleRoom mirrors the simulation into the schema)
├── shared/   # cards, constants, projection and ALL the simulation
└── tools/    # Playwright e2e scripts, asset fetcher
```

```mermaid
flowchart LR
  subgraph Browser
    UI["React UI<br/>(hand, HUD, screens)"]
    ARENA["Phaser 3 arena<br/>(2.5D projection)"]
    NET["Colyseus client"]
    UI --> NET
    ARENA --> NET
  end
  NET -- "intents (playCard)" --> ROOM
  ROOM -- "state @ 20 ticks/s" --> NET
  subgraph Server["Node server (Fly.io)"]
    ROOM["BattleRoom<br/>(authoritative)"]
  end
  subgraph Shared["shared/ — pure TypeScript"]
    SIM["Deterministic simulation<br/>cards - combat - pathing"]
  end
  ROOM --> SIM
  SIM -.-> BOTS["Bots + balance simulator"]
  SIM -.-> TESTS["Vitest unit tests"]
```

**Principles**

- **Authoritative server** — all logic (elixir, spawning, pathing, combat, win conditions) runs server-side at 20 ticks/s. The client only sends intents (`playCard`) and renders interpolated state.
- **2.5D landscape** — a logical 32×18 grid projected as a trapezoid ([shared/src/projection.ts](shared/src/projection.ts)): the top of the screen is "farther away", sprites scale with depth, and depth-sorting follows screen Y.
- **Mirrored view** — each player sees their own side on the left; the client mirrors rendering and input ([client/src/game/view.ts](client/src/game/view.ts)).
- **Fullscreen + landscape** — Fullscreen API + `screen.orientation.lock('landscape')` on battle start, CSS "rotate your device" overlay in portrait.
- **Security** — the server validates every payload and rate-limits card plays (200ms) and emotes (2s).

## Card engine (component composition)

Cards are defined by **composition** in [shared/src/engine/model.ts](shared/src/engine/model.ts): identity (name, type, subtype, rarity, cost, tags) plus optional components (`health`, `movement`, `targeting`, `attack`, `charge`, `spawner`, `deathEffect`, `deployEffect`, `resource`, `lifetime`, `aura`, `spell`) — any combination is valid, and new mechanics land as new components without touching the core.

- **Derived attributes** ([engine/derived.ts](shared/src/engine/derived.ts)): DPS, effective HP, elixir efficiency — always computed, never stored
- **Load-time validation** ([engine/model.ts](shared/src/engine/model.ts)): an invalid card fails the build, not a live match
- **Versioned balance** ([shared/src/balanceHistory.ts](shared/src/balanceHistory.ts)): stats change through DATA patches with automatic semantic classification (shorter interval = buff, higher cost = nerf…), a reason, and a player-readable history
- **Admin tool**: `pnpm --filter @claude-royale/server edit-card <card> <attribute> <value> [reason]`

## Gameplay rules

- Elixir regenerates 1 every 2.8s (2x in sudden death), capped at 10
- Matches last 3 min + 1 min sudden death; destroy the king (3 crowns) or hold more crowns to win
- Troops cross the river only at the bridges, prioritize nearby enemies over towers (the Giant only attacks buildings) and **never overlap** (collision separation)
- **The king tower starts asleep** (💤): it only wakes after taking damage or losing a princess tower — flanking is a real strategy

## Balance by simulation

```bash
pnpm --filter @claude-royale/server balance 600
```

Runs N bot-vs-bot matches with random decks and prints per-card winrates. Current card stats were calibrated this way (winrate spread reduced from ~21 to ~16 points). Escort-dependent cards (Giant) are underrated by the average bot — the hard bot supports pushes properly.

## Assets & credits

Troops, towers, decorations and explosions use the free **[Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords)** pack by Pixel Frog (personal/commercial use allowed, redistribution prohibited — see [CREDITS.md](client/public/assets/tiny-swords/CREDITS.md)). Battle music: "Medieval: Battle" by RandomMind (CC0, [OpenGameArt](https://opengameart.org/content/medieval-battle)). SFX: [Kenney](https://kenney.nl) packs (CC0). The arena terrain is procedural, drawn tile by tile with the perspective projection.

The menu UI optionally uses the paid **Synty Interface — Fantasy Menus** pack (not committed; see [CREDITS.md](client/public/assets/ui/CREDITS.md)). Without it, the UI falls back to plain CSS backgrounds — everything still works.

> ⚠️ Do not use assets from Supercell's fan kit — their terms prohibit use in other games.

## Contributing

PRs are welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, and check the [issues](https://github.com/adrianoreinert/claude-royale/issues) — look for `good first issue`. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md); security reports go through [SECURITY.md](SECURITY.md).

Questions or need help? See [SUPPORT.md](SUPPORT.md) or write to **hello@clauderoyale.net**.

## Roadmap

- [ ] Card levels / collection progression
- [ ] Tournaments (brackets with chained private rooms)
- [ ] More champions and evolutions
- [ ] Localization (i18n) — the game is currently in Portuguese

## License

[MIT](LICENSE) for the source code. Third-party assets keep their own licenses — see the note in [LICENSE](LICENSE) and [Assets & credits](#assets--credits).
