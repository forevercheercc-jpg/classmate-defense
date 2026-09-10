# Contributing to Claude Royale

Thanks for your interest in contributing! Claude Royale is a real-time multiplayer battler for the browser, and there is plenty of room to help — code, balance, art direction, translations, and docs.

## Getting started

```bash
pnpm install
pnpm dev        # starts client (Vite) + server (Colyseus)
pnpm test       # simulation + card engine unit tests (Vitest)
```

- Client: http://localhost:5173
- Server: ws://localhost:2567

Open the game in two tabs and press ⚔️ Battle in both to start a match, or use **Train vs Bot** for a single-tab session.

## Project layout

```
client/   # Vite + React + Phaser 3 (rendering + UI only)
server/   # Node + Colyseus (authoritative rooms)
shared/   # ALL game logic: cards, simulation, projection — pure TypeScript
tools/    # e2e scripts (Playwright) and asset fetching
```

The golden rule: **game logic lives in `shared/`**, never in the client. The server is authoritative; the client renders interpolated state and sends intents.

## Making changes

1. Fork and create a branch from `master`.
2. Keep PRs focused — one feature or fix per PR.
3. Add or update tests in `shared/test/` for any simulation/engine change.
4. Run the checks CI will run:
   ```bash
   pnpm --filter @claude-royale/shared test
   pnpm --filter @claude-royale/client exec tsc --noEmit
   ```
5. For balance changes, use the data-patch tool so history stays consistent:
   ```bash
   pnpm --filter @claude-royale/server edit-card <card> <attribute> <value> [reason]
   ```
   and back your numbers with the simulator: `pnpm --filter @claude-royale/server balance 600`.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.

## Adding a card

Cards are defined by **component composition** in `shared/src/cards.ts` (see `shared/src/engine/model.ts` for available components). New mechanics should be added as new components — do not special-case card names in the simulation core. Validation runs at load time: an invalid card fails the build, not a live match.

## Art & audio

Only use assets whose license allows inclusion (CC0, or free packs that permit commercial use). Never add assets from Supercell's fan kit — their terms prohibit use in other games. Document every asset source in the README credits.

## Deployment

You don't need to deploy anything — a maintainer handles releases. Pushes to `master` auto-deploy the game server; the client is published by the maintainer (licensed assets are not in the repo, so CI can't build the full client). Details in [docs/DEPLOY.md](docs/DEPLOY.md). Your job ends at a green CI. ✅

## Reporting bugs / proposing features

Use the [issue templates](.github/ISSUE_TEMPLATE). For gameplay bugs, a room code + replay description helps a lot. For balance discussions, include simulator output when possible.

## Code of Conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
