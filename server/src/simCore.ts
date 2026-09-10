import {
  DECK_SIZE, TICK_DT, collectionCards, createInitialState, decideBotAction,
  playCard, setPlayerDeck, stepSimulation,
} from '@claude-royale/shared';
import type { Side, SimState } from '@claude-royale/shared';

/**
 * Núcleo de simulação em massa reutilizável (ferramenta CLI e painel admin):
 * roda N partidas bot vs bot com decks aleatórios e agrega winrate por carta
 * e a matriz de confrontos carta × carta (deck vencedor vs deck perdedor).
 */
export interface CardSimStats {
  games: number;
  wins: number;
  draws: number;
}

export interface SimulationResult {
  matches: number;
  elapsedSeconds: number;
  cards: Record<string, CardSimStats>;
  /** matchups[A][B] = { games, wins } de A quando enfrentou B em decks opostos */
  matchups: Record<string, Record<string, { games: number; wins: number }>>;
}

const MAX_SECONDS = 300;
const ALL_CARDS = () => collectionCards().map((card) => card.id);

function randomDeck(pool: string[]): string[] {
  const copy = [...pool];
  const deck: string[] = [];
  while (deck.length < DECK_SIZE) {
    deck.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return deck;
}

function runMatch(): { winner: string; left: string[]; right: string[] } {
  const state: SimState = createInitialState();
  const pool = ALL_CARDS();
  const left = randomDeck(pool);
  const right = randomDeck(pool);
  setPlayerDeck(state, 'left', left);
  setPlayerDeck(state, 'right', right);
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
    state.events = [];
  }
  return { winner: state.winner ?? 'draw', left, right };
}

export function runSimulation(matches: number): SimulationResult {
  const startedAt = Date.now();
  const cards: Record<string, CardSimStats> = {};
  const matchups: SimulationResult['matchups'] = {};
  for (const id of ALL_CARDS()) cards[id] = { games: 0, wins: 0, draws: 0 };

  for (let i = 0; i < matches; i++) {
    const { winner, left, right } = runMatch();
    for (const [deck, side] of [[left, 'left'], [right, 'right']] as const) {
      for (const cardId of deck) {
        cards[cardId].games++;
        if (winner === 'draw') cards[cardId].draws++;
        else if (winner === side) cards[cardId].wins++;
      }
    }
    // Matriz de confrontos: cada carta do deck A "enfrentou" cada carta do deck B
    if (winner !== 'draw') {
      const winDeck = winner === 'left' ? left : right;
      const loseDeck = winner === 'left' ? right : left;
      for (const a of winDeck) {
        matchups[a] ??= {};
        for (const b of loseDeck) {
          matchups[a][b] ??= { games: 0, wins: 0 };
          matchups[a][b].games++;
          matchups[a][b].wins++;
        }
      }
      for (const a of loseDeck) {
        matchups[a] ??= {};
        for (const b of winDeck) {
          matchups[a][b] ??= { games: 0, wins: 0 };
          matchups[a][b].games++;
        }
      }
    }
  }

  return {
    matches,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    cards,
    matchups,
  };
}
