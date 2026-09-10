# Motor de cartas — guia rápido

## Arquitetura

Uma carta é **identidade + componentes** (`model.ts`). Nada de hierarquia de
classes: qualquer combinação de componentes é válida, e a simulação
(`../sim/step.ts`) só reage aos componentes presentes na entidade.

```
CardDef
├── identidade: id, name, description, type, subtype, rarity, cost, tags,
│               deployCount, unlock, hidden, extras
└── components
    ├── health      → vida, escudo, regeneração
    ├── movement    → velocidade, voador, salta rio
    ├── targeting   → ar/terra/construções, aggro
    ├── attack      → dano, intervalo, alcance, área, roubo de vida, cura por abate
    ├── charge      → investida (Príncipe)
    ├── spawner     → geração periódica (Bruxa, cabanas)
    ├── deathEffect → bomba e/ou invocação ao morrer
    ├── deployEffect→ dano ao entrar na arena
    ├── resource    → produção de elixir
    ├── lifetime    → vida útil de construções
    ├── aura        → cura contínua em aliados
    ├── spell       → feitiços (dano, stun, freeze, rage, zona, multi-alvo, invocação)
    ├── ability     → habilidade ativa de campeão
    └── evolution   → forma evoluída após N usos
```

## Criando uma carta nova em 5 minutos

1. Adicione a entrada em `../cards.ts` combinando componentes:

```ts
sentinela: {
  id: 'sentinela', name: 'Sentinela', rarity: 'rara', type: 'troop',
  subtype: 'defesa', cost: 3, emoji: '🦉', color: '#8d6e63',
  tags: ['terrestre', 'longo-alcance'],
  description: 'Atiradora paciente com alcance enorme.',
  components: {
    health: { hp: 300 },
    movement: { speed: 1.2 },
    targeting: { targets: 'any', aggroRange: 8, targetsAir: true },
    attack: { damage: 90, hitSpeed: 1.8, range: 7 },
  },
},
```

2. Adicione o visual em `client/src/game/assets.ts` (`CARD_VISUALS`).
3. Rode `pnpm --filter @claude-royale/shared test` — a validação
   (`validateAll`) reprova valores incoerentes no carregamento.
4. Balanceie: `pnpm --filter @claude-royale/server balance 400`.

## Balanceamento sem tocar no código

- `pnpm --filter @claude-royale/server edit-card <id> <atributo> <valor> [motivo]`
  registra um patch em `../balanceHistory.ts` com classificação automática
  (intervalos menores = buff; custo maior = nerf).
- O histórico completo aparece para o jogador na Coleção.

## Atributos derivados

`derived.ts` calcula DPS, vida efetiva, eficiência por elixir, total gerado
etc. **Nunca** armazene valores deriváveis nos componentes.

## Estendendo o motor

- Novo componente: adicione a interface em `model.ts`, o campo em
  `CardComponents`, a regra de validação e o comportamento em `sim/step.ts`
  (ou `sim/state.ts` para efeitos de uso).
- Propriedades exclusivas de uma carta: use `extras` sem tocar no núcleo.
- Gatilhos hoje cobertos: deploy, ataque, dano causado/recebido, abate,
  morte, intervalo (spawner/recurso/zona), habilidade ativa.
