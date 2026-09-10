# Agent instructions — Claude Royale

Guidance for AI coding agents (and humans in a hurry) working on this repository.

## Golden rules

1. **ALL game logic lives in `shared/`** — cards, combat, pathing, elixir, win conditions. The server (`server/`) mirrors simulation state into the Colyseus schema; the client (`client/`) only renders interpolated state and sends intents. Never put gameplay rules in the client.
2. **The server is authoritative.** Never trust anything from the client beyond validated intents.
3. **Cards are data, not code.** New cards go in [shared/src/cards.ts](shared/src/cards.ts) by composing components from [shared/src/engine/model.ts](shared/src/engine/model.ts). New mechanics = new components; never special-case a card name inside the simulation core.
4. **Balance changes are data patches** via `pnpm --filter @claude-royale/server edit-card <card> <attr> <value> [reason]` — never hand-edit numbers without recording the patch (history is player-visible).
5. **Simulation changes require tests** in `shared/test/` (Vitest). The simulation is deterministic — same inputs, same outputs — keep it that way (no `Math.random()` outside the seeded RNG, no `Date.now()` in sim code).

## Commands

```bash
pnpm install                # workspace install (pnpm 9 — pinned via packageManager)
pwsh tools/fetch-assets.ps1 # download Tiny Swords sprites (not in git, license)
pnpm dev                    # client (Vite :5173) + server (Colyseus :2567)
pnpm test                   # simulation + card engine unit tests
pnpm --filter @claude-royale/client exec tsc --noEmit   # client typecheck (CI runs this)
pnpm --filter @claude-royale/server balance 600         # headless bot-vs-bot balance run
```

CI = shared tests + client typecheck. Your change must keep both green.

## Layout

```
client/src/game/  # Phaser scene, 2.5D projection, entities, effects (render only)
client/src/ui/    # React screens, card hand, HUD, overlays
client/src/net/   # Colyseus client
server/src/       # BattleRoom, matchmaking, leaderboard, telemetry, admin tools
shared/src/       # THE game: cards.ts, engine/, sim/, projection.ts, constants
shared/test/      # Vitest — simulation and engine specs
tools/e2e/        # Playwright scripts (screenshots, GIF, smoke flows)
```

## Conventions

- Language: code identifiers/comments are mostly **PT-BR** (match surrounding style); public-facing docs and GitHub artifacts are **English**.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`...).
- pnpm only. Do not add npm/yarn lockfiles.
- Assets: only CC0 or licensed-for-use packs; Tiny Swords/Synty files are gitignored on purpose (redistribution prohibited) — never commit them. Never use Supercell fan-kit assets.
- Deploys are maintainer-only — see [docs/DEPLOY.md](docs/DEPLOY.md). Server auto-deploys from `master`; client is published manually (`pnpm deploy:client`) because licensed assets aren't in git.

## Gotchas

- `stepSimulation` does NOT clear `events` — the consumer clears them (events between ticks would be lost otherwise).
- Rooms use `setPrivate`, not `lock`, so `joinById` keeps working for reconnection; there's a StrictMode guard on reconnect.
- `pnpm/action-setup` in workflows must not pin a `version` — it reads `packageManager` from package.json.
- Dependabot ignores npm majors deliberately (Phaser 4 and @colyseus/schema 4 are breaking migrations).
