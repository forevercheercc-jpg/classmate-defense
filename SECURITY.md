# Security Policy

## Supported versions

Only the latest release (and `master`) receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

- Email: **security@clauderoyale.net** with subject `[SECURITY] Claude Royale`
- Or use GitHub's private vulnerability reporting on this repository
  (Security → Report a vulnerability).

Include a description, reproduction steps, and impact. You should receive a
response within 72 hours.

## Scope notes

The game server is designed to be authoritative and defensive:

- All client payloads are validated server-side.
- Card plays and emotes are rate-limited per client.
- The client only sends intents; no game state is trusted from the client.

Reports about bypassing any of the above (state tampering, rate-limit evasion,
room takeover, spectator escalation) are very welcome.
