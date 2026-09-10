# Testes E2E (Playwright)

Scripts de ponta a ponta contra o jogo rodando localmente (`pnpm dev`).

```bash
npm i -g playwright   # ou tenha playwright disponível via npx
node tools/e2e/pvp.mjs .      # 1v1 em duas abas: deploy, bola de fogo, HUD
node tools/e2e/bot.mjs        # vs bot: emote, desistir, replay, histórico
node tools/e2e/social.mjs     # sala privada por código, espectador, reconexão
```

Observações:
- Os scripts assumem o cliente em `http://localhost:5174` (ajuste a constante
  `URL` se o Vite escolher outra porta).
- Screenshots são gravados no diretório atual.
