# Cliente Claude Royale (estático via nginx) — build a partir da RAIZ do monorepo:
#   docker build -f client/Dockerfile --build-arg VITE_SERVER_URL=wss://seu-servidor -t claude-royale-client .
#   docker run -p 8080:80 claude-royale-client
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/

RUN pnpm install --filter @claude-royale/client... --frozen-lockfile

COPY shared/ shared/
COPY client/ client/

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN pnpm --filter @claude-royale/client build

FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
