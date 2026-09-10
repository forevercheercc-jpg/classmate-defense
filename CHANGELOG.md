# Changelog

All notable changes to Claude Royale are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

## [0.2.0] - 2026-07-16

The "going live" release — the game is now playable worldwide at [clauderoyale.net](https://clauderoyale.net).

### Added
- **Production deployment**: client on Cloudflare Pages (`clauderoyale.net`), authoritative server on Fly.io São Paulo (`wss://ws.clauderoyale.net`) with persistent volume and health checks — see [docs/DEPLOY.md](docs/DEPLOY.md)
- Automatic server deploys on push (`.github/workflows/deploy-server.yml`)
- One-command self-hosting via `docker compose up --build` (new client Dockerfile + compose file)
- `pnpm deploy:client` — build + publish the client in one command
- Official contact addresses (`hello@` / `support@` / `security@clauderoyale.net`) and [SUPPORT.md](SUPPORT.md)
- Public status page (UptimeRobot) with README badge
- Security headers and canonical redirects on the web client (`_headers`, `_redirects`)
- Gameplay GIF, screenshot gallery and Mermaid architecture diagram in the README
- [AGENTS.md](AGENTS.md) / CLAUDE.md instructions for AI coding agents
- Repo tooling: `tools/e2e/screenshots.mjs` and `tools/e2e/record-gif.mjs` regenerate README media
- Dependabot (weekly, npm majors ignored by design)

### Fixed
- Reproducible Docker builds: pnpm pinned via `packageManager`, installs use `--frozen-lockfile` (unpinned corepack pnpm 11 broke builds)
- CI: `pnpm/action-setup` no longer double-pins the pnpm version
- `tools/fetch-assets.ps1` no longer hardcodes an absolute local path

### Changed
- README rewritten in English as the primary language (`README.pt-BR.md` mirror)
- SECURITY.md and CODE_OF_CONDUCT.md now use official domain addresses
- Dependencies: minor/patch updates via Dependabot; GitHub Actions bumped (checkout v7, setup-node v7, pnpm/action-setup v6)

## [0.1.0] - 2026-07-15

First public release. Real-time multiplayer Clash Royale-style battler in the browser:
1v1 matchmaking, private rooms, spectating, replays, 3-difficulty bots, 49 collectible cards
by component composition, champions and evolutions, versioned data-driven balance, PWA with
fullscreen landscape. Phaser 3 + React client, Colyseus authoritative server at 20 ticks/s,
deterministic shared simulation in pure TypeScript.

[0.2.0]: https://github.com/adrianoreinert/claude-royale/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/adrianoreinert/claude-royale/releases/tag/v0.1.0
