/**
 * Balanceamento por simulação em massa: roda N partidas bot vs bot com decks
 * aleatórios e imprime a taxa de vitória por carta.
 *
 * Uso: pnpm --filter @claude-royale/server balance [numPartidas]
 */
import {
  CARDS, DECK_SIZE, TICK_DT, collectionCards, createInitialState, decideBotAction,
  playCard, setPlayerDeck, stepSimulation,
} from '@claude-royale/shared';
import type { Side, SimState } from '@claude-royale/shared';

const MATCHES = Number(process.argv[2] ?? 400);
const MAX_SECONDS = 300; // 3 min + morte súbita + folga
const ALL_CARDS = collectionCards().map((card) => card.id);

interface CardStats {
  games: number;
  wins: number;
  draws: number;
}

const stats = new Map<string, CardStats>(ALL_CARDS.map((id) => [id, { games: 0, wins: 0, draws: 0 }]));

function randomDeck(): string[] {
  const pool = [...ALL_CARDS];
  const deck: string[] = [];
  while (deck.length < DECK_SIZE) {
    deck.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return deck;
}

function runMatch(): { winner: string; leftDeck: string[]; rightDeck: string[] } {
  const state: SimState = createInitialState();
  const leftDeck = randomDeck();
  const rightDeck = randomDeck();
  setPlayerDeck(state, 'left', leftDeck);
  setPlayerDeck(state, 'right', rightDeck);
  state.phase = 'battle';
  state.timeRemaining = 180;

  const cooldowns: Record<Side, number> = { left: 0, right: 0 };
  const maxTicks = MAX_SECONDS / TICK_DT;

  for (let tick = 0; tick < maxTicks && state.phase !== 'ended'; tick++) {
    for (const side of ['left', 'right'] as Side[]) {
      cooldowns[side] -= TICK_DT;
      if (cooldowns[side] > 0) continue;
      const action = decideBotAction(state, side, 'medium');
      if (action) {
        playCard(state, side, action.cardId, action.x, action.y);
        cooldowns[side] = 1.5;
      } else {
        cooldowns[side] = 0.4;
      }
    }
    stepSimulation(state, TICK_DT);
  }

  return { winner: state.winner ?? 'draw', leftDeck, rightDeck };
}

console.log(`Rodando ${MATCHES} partidas bot vs bot (decks aleatórios)…`);
const startedAt = Date.now();

for (let i = 0; i < MATCHES; i++) {
  const { winner, leftDeck, rightDeck } = runMatch();
  for (const [deck, side] of [[leftDeck, 'left'], [rightDeck, 'right']] as const) {
    for (const cardId of deck) {
      const s = stats.get(cardId)!;
      s.games++;
      if (winner === 'draw') s.draws++;
      else if (winner === side) s.wins++;
    }
  }
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${MATCHES}…`);
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nConcluído em ${elapsed}s\n`);
console.log('Carta            | Partidas | Winrate | Empates');
console.log('-----------------|----------|---------|--------');

const rows = [...stats.entries()]
  .map(([id, s]) => ({
    id,
    games: s.games,
    winrate: s.games > 0 ? (s.wins / (s.games - s.draws || 1)) * 100 : 0,
    draws: s.draws,
  }))
  .sort((a, b) => b.winrate - a.winrate);

for (const row of rows) {
  console.log(
    `${CARDS[row.id].name.padEnd(16)} | ${String(row.games).padStart(8)} | ${row.winrate.toFixed(1).padStart(6)}% | ${row.draws}`,
  );
}

const spread = rows[0].winrate - rows[rows.length - 1].winrate;
console.log(`\nSpread (melhor - pior): ${spread.toFixed(1)} pontos percentuais`);
console.log('Cartas acima de 55% merecem nerf; abaixo de 45%, buff.');
