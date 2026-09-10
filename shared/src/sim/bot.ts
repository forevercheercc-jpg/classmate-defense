import {
  DEPLOY_MAX_X_LEFT, DEPLOY_MIN_X_RIGHT, GRID_H, GRID_W, RIVER_MAX_X, RIVER_MIN_X,
} from '../constants';
import { getCard } from '../cards';
import type { Side, SimEntity, SimState } from '../types';

export interface BotAction {
  cardId: string;
  x: number;
  y: number;
}

export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Segundos entre decisões do bot, por dificuldade: [mín, máx]. */
export const BOT_CADENCE: Record<BotDifficulty, [number, number]> = {
  easy: [2.5, 4.5],
  medium: [1.2, 2.8],
  hard: [0.6, 1.4],
};

/**
 * IA do bot de treino, com três níveis:
 * - easy: reage tarde, ignora feitiços, às vezes "cochila".
 * - medium: defende invasores, feitiço em grupos, ataca com elixir alto.
 * - hard: counters por tipo de tropa, feitiço para finalizar torre,
 *   apoia pushes próprios e ataca mais cedo.
 */
export function decideBotAction(
  state: SimState,
  side: Side,
  difficulty: BotDifficulty = 'medium',
): BotAction | null {
  if (state.phase !== 'battle') return null;

  const player = state.players[side];
  const affordable = player.hand.filter((id) => {
    const card = getCard(id);
    return card !== undefined && card.type !== 'mirror' && card.cost <= player.elixir;
  });
  if (affordable.length === 0) return null;

  if (difficulty === 'easy' && Math.random() < 0.4) return null; // cochilou

  const enemySide: Side = side === 'left' ? 'right' : 'left';
  const invaders = Object.values(state.entities).filter(
    (e) => e.kind === 'unit' && e.side === enemySide && isOnSide(e.x, side),
  );
  const spellId = affordable.find(
    (id) => getCard(id)?.type === 'spell' && (getCard(id)?.components.spell?.damage ?? 0) > 0,
  );

  // hard: feitiço que finaliza uma torre inimiga vence na hora
  if (difficulty === 'hard' && spellId) {
    const damage = getCard(spellId)!.components.spell!.damage ?? 0;
    const finishable = Object.values(state.entities).find(
      (e) => e.side === enemySide && e.kind === 'tower' && e.hp <= damage,
    );
    if (finishable) return { cardId: spellId, x: finishable.x, y: finishable.y };
  }

  // Feitiço em grupo de invasores (medium e hard)
  if (difficulty !== 'easy' && spellId && invaders.length >= 2) {
    const cx = average(invaders.map((e) => e.x));
    const cy = average(invaders.map((e) => e.y));
    const radius = getCard(spellId)!.components.spell!.radius;
    const clustered = invaders.filter((e) => Math.hypot(e.x - cx, e.y - cy) <= radius);
    if (clustered.length >= 2) {
      return { cardId: spellId, x: cx, y: cy };
    }
  }

  const troops = affordable.filter((id) => {
    const type = getCard(id)?.type;
    return type === 'troop' || type === 'building';
  });
  if (troops.length === 0) return null;

  // Defesa: joga perto do invasor mais avançado
  const reactionDepth = difficulty === 'easy' ? 6 : 0;
  const threats = invaders.filter((e) => depthIntoSide(e.x, side) > reactionDepth);
  if (threats.length > 0) {
    const deepest = threats.reduce((a, b) =>
      depthIntoSide(a.x, side) > depthIntoSide(b.x, side) ? a : b,
    );
    const cardId =
      difficulty === 'hard' ? pickCounter(troops, threats) : pickRandom(troops);
    const behind = side === 'left' ? deepest.x - 1.5 : deepest.x + 1.5;
    return { cardId, x: clampDeploy(behind, side), y: clamp(deepest.y, 1, GRID_H - 1) };
  }

  // hard: apoia um push próprio já em andamento
  if (difficulty === 'hard' && player.elixir >= 5) {
    const myAttackers = Object.values(state.entities).filter(
      (e) => e.kind === 'unit' && e.side === side && isOnSide(e.x, enemySide),
    );
    if (myAttackers.length > 0) {
      const spearhead = myAttackers[0];
      const frontX = side === 'left' ? RIVER_MIN_X - 1 : RIVER_MAX_X + 1;
      return {
        cardId: pickRandom(troops),
        x: clampDeploy(frontX, side),
        y: clamp(spearhead.y, 1, GRID_H - 1),
      };
    }
  }

  // Ataque: com elixir sobrando, empurra a lane da torre inimiga mais fraca
  const attackThreshold = difficulty === 'hard' ? 6 : difficulty === 'easy' ? 8 : 7;
  if (player.elixir >= attackThreshold) {
    const enemyPrincesses = Object.values(state.entities).filter(
      (e) => e.side === enemySide && e.tower === 'princess',
    );
    const target: SimEntity | undefined =
      enemyPrincesses.length > 0
        ? difficulty === 'easy'
          ? pickRandom(enemyPrincesses)
          : enemyPrincesses.reduce((a, b) => (a.hp <= b.hp ? a : b))
        : Object.values(state.entities).find((e) => e.side === enemySide && e.tower === 'king');
    if (!target) return null;
    const frontX = side === 'left' ? RIVER_MIN_X - 1 : RIVER_MAX_X + 1;
    return {
      cardId: pickRandom(troops),
      x: clampDeploy(frontX, side),
      y: clamp(target.y, 1, GRID_H - 1),
    };
  }

  return null;
}

/** hard: escolhe o counter certo — área contra hordas, DPS alto contra tanques. */
function pickCounter(troops: string[], threats: SimEntity[]): string {
  const isSwarm = threats.length >= 3;
  const hasTank = threats.some((e) => {
    const health = getCard(e.cardId ?? '')?.components.health;
    return health !== undefined && health.hp >= 900;
  });

  if (isSwarm) {
    const splash = troops.find(
      (id) => (getCard(id)?.components.attack?.splashRadius ?? 0) > 0,
    );
    if (splash) return splash;
  }
  if (hasTank) {
    const byDps = [...troops].sort((a, b) => dps(b) - dps(a));
    return byDps[0];
  }
  return pickRandom(troops);
}

function dps(cardId: string): number {
  const card = getCard(cardId);
  const attack = card?.components.attack;
  if (!card || !attack) return 0;
  return (attack.damage / attack.hitSpeed) * (card.deployCount ?? 1);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isOnSide(x: number, side: Side): boolean {
  return side === 'left' ? x < RIVER_MIN_X : x > RIVER_MAX_X;
}

/** Quão fundo a posição está dentro do campo do lado dado (maior = mais perigoso). */
function depthIntoSide(x: number, side: Side): number {
  return side === 'left' ? RIVER_MIN_X - x : x - RIVER_MAX_X;
}

function clampDeploy(x: number, side: Side): number {
  return side === 'left'
    ? clamp(x, 0.5, DEPLOY_MAX_X_LEFT)
    : clamp(x, DEPLOY_MIN_X_RIGHT, GRID_W - 0.5);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
