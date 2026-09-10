# Production deployment

How the official Claude Royale instance (clauderoyale.net) is hosted and deployed. For self-hosting, see the "Host your own" section in the [README](../README.md).

## Architecture

| Piece | Where | URL |
|-------|-------|-----|
| Client (static) | Cloudflare Pages, project `claude-royale` | https://clauderoyale.net (`www` and `claude-royale.pages.dev` redirect here) |
| Game server | Fly.io app `claude-royale`, region `gru` (São Paulo) | `wss://ws.clauderoyale.net` |
| DNS / CDN / e-mail | Cloudflare (zone `clauderoyale.net`) | — |

- `ws.clauderoyale.net` is a **DNS-only** (grey cloud) CNAME to `claude-royale.fly.dev` — proxying it through Cloudflare breaks Fly's TLS certificate validation and adds latency to every game tick.
- The Fly machine never auto-stops (`min_machines_running = 1`) — live WebSocket matches would die with it. A health check on `/leaderboard` restarts the machine if the server hangs.
- The leaderboard/profiles/telemetry persist on a Fly volume (`claude_royale_data`, mounted at `/app/server/data`). Fly takes daily volume snapshots (5-day retention).
- E-mail (`hello@` / `support@` / `security@clauderoyale.net`) is Cloudflare Email Routing with a catch-all rule; MX/SPF/DKIM live in the zone DNS.

## Deploying

### Server — automatic

Any push to `master` touching `server/`, `shared/`, `fly.toml` or `pnpm-lock.yaml` triggers
[.github/workflows/deploy-server.yml](../.github/workflows/deploy-server.yml), which runs `flyctl deploy`.
Requires the `FLY_API_TOKEN` repository secret (Fly dashboard → Tokens → Deploy token).

Manual alternative: `fly deploy` from the repo root (needs [flyctl](https://fly.io/docs/flyctl/) and `fly auth login`).

### Client — manual, one command

```bash
pnpm deploy:client
```

Builds the client (`client/.env.production` pins `VITE_SERVER_URL=wss://ws.clauderoyale.net`) and uploads `client/dist` to Cloudflare Pages via wrangler. Requires `npx wrangler login` once.

**Why manual instead of git-connected Pages builds:** the Synty UI pack and some audio files are licensed assets that are NOT in the git repository (see `.gitignore`). A CI build would ship a visually degraded client. Building locally — where the assets exist — keeps the published game complete. If this ever moves to CI, the private assets need to come from a private bucket (e.g. R2) at build time.

## Monitoring

- **Uptime**: UptimeRobot checks `https://clauderoyale.net` and `https://ws.clauderoyale.net/leaderboard` every 5 minutes and e-mails on downtime.
- **Traffic / Core Web Vitals**: Cloudflare Web Analytics (RUM), auto-injected by the Cloudflare proxy — no snippet in the code.
- **Server logs**: `fly logs -a claude-royale`.

## Gotchas learned in production

- `pnpm/action-setup` must NOT pin a `version` — the version comes from `packageManager` in package.json; setting both fails the workflow.
- Docker builds install with `--frozen-lockfile` and the lockfile copied in; without it, corepack grabs the latest pnpm and dependency resolution differs from local.
- Dependabot ignores npm majors on purpose: Phaser 4 and @colyseus/schema 4 are breaking migrations to be done deliberately.
