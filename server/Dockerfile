# Servidor Claude Royale (Colyseus) — build a partir da RAIZ do monorepo:
#   docker build -f server/Dockerfile -t claude-royale-server .
#   docker run -p 2567:2567 claude-royale-server
FROM node:22-alpine

RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN pnpm install --filter @claude-royale/server... --frozen-lockfile

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/

ENV PORT=2567
EXPOSE 2567

CMD ["pnpm", "--filter", "@claude-royale/server", "start"]
