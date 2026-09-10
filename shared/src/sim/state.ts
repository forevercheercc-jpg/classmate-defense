import {
  COUNTDOWN_SECONDS, CORE_HP, CORE_POS, DEPLOY_MAX_X_LEFT, DEPLOY_MIN_X_RIGHT,
  DEPLOY_SECONDS, DEFENSE_BATTLE_SECONDS,
  ELIXIR_MAX, ELIXIR_START, GRID_H, GRID_W, HAND_SIZE, KING_TOWER, LANE_COUNT,
  LANE_XS, LEFT_KING_POS, LEFT_PRINCESS_POS,
  MOB_SPAWN_MAX_Y, MOB_SPAWN_Y, MOB_STATS, POINT_BUFF, POINT_HP, POINT_YS,
  POINTS_PER_LANE, PRINCESS_TOWER, UNIT_RADIUS, WAVES_M0, WAVE_BREAK_SECONDS,
  mirrorX,
} from '../constants';
import type { MobVariant } from '../constants';
import { DEFAULT_DECK, getCard, levelMultiplier } from '../cards';
import type { CardDef } from '../engine/model';
import type {
  PlayerSim, Side, SimEntity, SimState, TowerKind,
} from '../types';

/**
 * 创建一个 SimState。
 * opts.defense === true → 防守模式：1 核心 + 9 点位 + 波次调度，无卡牌手牌。
 * opts.defense 不传或 false → 原 CR 1v1 对战结构。
 */
export function createInitialState(opts?: { defense?: boolean }): SimState {
  if (opts?.defense) return createInitialDefenseState();
  const state: SimState = {
    tick: 0,
    time: 0,
    phase: 'waiting',
    timeRemaining: COUNTDOWN_SECONDS,
    suddenDeath: false,
    tiebreaker: false,
    players: {
      left: createPlayer('left'),
      right: createPlayer('right'),
    },
    entities: {},
    nextEntityId: 1,
    events: [],
  };
  spawnTowers(state, 'left');
  spawnTowers(state, 'right');
  return state;
}

/**
 * 防守模式的初始状态（M0 简化版）：
 * - 1 个核心（用 tower kind='king' 复用现有塔战斗逻辑）
 * - 9 个点位（每条路 3 个，tower kind='princess'）
 * - 防守方 = side='left'；怪物方 = side='right'
 * - 玩家手牌/圣水空（暂时不用）；怪物通过 stepWave 刷
 * - wave=1，waveCountdown=WAVE_BREAK_SECONDS 先给玩家喘息
 */
function createInitialDefenseState(): SimState {
  const state: SimState = {
    tick: 0,
    time: 0,
    phase: 'battle',
    timeRemaining: DEFENSE_BATTLE_SECONDS,
    suddenDeath: false,
    tiebreaker: false,
    players: {
      left:  { side: 'left',  elixir: ELIXIR_MAX, crowns: 0, hand: [], queue: [] },
      right: { side: 'right', elixir: 0,          crowns: 0, hand: [], queue: [] },
    },
    entities: {},
    nextEntityId: 1,
    events: [],
    defense: true,
    wave: 1,
    waveSpawned: 0,
    waveCountdown: WAVE_BREAK_SECONDS,
    coreHp: CORE_HP,
    coreMaxHp: CORE_HP,
  };

  // 9 个点位（每条路：前哨 / 中间 / 核心前）
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    for (let p = 0; p < POINTS_PER_LANE; p++) {
      const entity: SimEntity = {
        id: `e${state.nextEntityId++}`,
        kind: 'tower',
        tower: 'princess',
        side: 'left',
        x: LANE_XS[lane],
        y: POINT_YS[p],
        hp: POINT_HP,
        maxHp: POINT_HP,
        attackCooldown: 0,
        action: 'idle',
        facing: -1, // 怪物从屏幕下方来袭，tower 朝向是参考
        lane,
        pointIndex: p,
        buff: POINT_BUFF[p],
      };
      state.entities[entity.id] = entity;
    }
  }

  // 核心
  const core: SimEntity = {
    id: `e${state.nextEntityId++}`,
    kind: 'tower',
    tower: 'king',
    side: 'left',
    x: CORE_POS.x,
    y: CORE_POS.y,
    hp: CORE_HP,
    maxHp: CORE_HP,
    attackCooldown: 0,
    action: 'idle',
    facing: -1,
  };
  state.entities[core.id] = core;

  return state;
}

function createPlayer(side: Side): PlayerSim {
  const deck = shuffle([...DEFAULT_DECK]);
  return {
    side,
    elixir: ELIXIR_START,
    crowns: 0,
    hand: deck.slice(0, HAND_SIZE),
    queue: deck.slice(HAND_SIZE),
  };
}

/** Substitui o deck de um jogador (antes da batalha começar). */
export function setPlayerDeck(
  state: SimState,
  side: Side,
  deckIds: string[],
  cardLevels?: Record<string, number>,
): void {
  const deck = shuffle([...deckIds]);
  const player = state.players[side];
  player.hand = deck.slice(0, HAND_SIZE);
  player.queue = deck.slice(HAND_SIZE);
  player.cardLevels = cardLevels;
}

function spawnTowers(state: SimState, side: Side): void {
  const flip = (x: number) => (side === 'left' ? x : mirrorX(x));
  addTower(state, side, 'king', flip(LEFT_KING_POS.x), LEFT_KING_POS.y);
  for (const pos of LEFT_PRINCESS_POS) {
    addTower(state, side, 'princess', flip(pos.x), pos.y);
  }
}

function addTower(state: SimState, side: Side, tower: TowerKind, x: number, y: number): void {
  const stats = tower === 'king' ? KING_TOWER : PRINCESS_TOWER;
  const entity: SimEntity = {
    id: `e${state.nextEntityId++}`,
    kind: 'tower',
    side, tower, x, y,
    hp: stats.hp,
    maxHp: stats.hp,
    dormant: tower === 'king',
    attackCooldown: 0,
    action: 'idle',
    facing: side === 'left' ? 1 : -1,
  };
  state.entities[entity.id] = entity;
}

export interface PlayCardResult {
  ok: boolean;
  error?: string;
}

/** Custo efetivo de uma carta na mão (Espelho = última carta + 1). */
export function effectiveCost(player: PlayerSim, cardId: string): number | null {
  const card = getCard(cardId);
  if (!card) return null;
  if (card.type !== 'mirror') return card.cost;
  const last = player.lastPlayed ? getCard(player.lastPlayed) : undefined;
  if (!last || last.type === 'mirror') return null;
  return Math.min(ELIXIR_MAX, last.cost + 1);
}

/** Joga uma carta da mão em (x, y). Valida fase, custo, mão e zona de deploy. */
export function playCard(state: SimState, side: Side, cardId: string, x: number, y: number): PlayCardResult {
  if (state.phase !== 'battle') return { ok: false, error: 'batalha não está em andamento' };

  const player = state.players[side];
  const card = getCard(cardId);
  if (!card || card.hidden) return { ok: false, error: 'carta desconhecida' };
  if (!player.hand.includes(cardId)) return { ok: false, error: 'carta fora da mão' };

  const cost = effectiveCost(player, cardId);
  if (cost === null) return { ok: false, error: 'espelho sem carta anterior' };
  if (player.elixir < cost) return { ok: false, error: 'elixir insuficiente' };

  // Espelho executa a última carta jogada.
  const effective = card.type === 'mirror' ? getCard(player.lastPlayed!)! : card;

  const gx = clamp(x, 0.5, GRID_W - 0.5);
  const gy = clamp(y, 0.5, GRID_H - 0.5);

  if (effective.type === 'troop' || effective.type === 'building' || effective.type === 'champion') {
    const inOwnSide = side === 'left' ? gx <= DEPLOY_MAX_X_LEFT : gx >= DEPLOY_MIN_X_RIGHT;
    if (!inOwnSide) return { ok: false, error: 'fora da zona de deploy' };
    if (effective.type === 'champion') {
      const alreadyOnField = Object.values(state.entities).some(
        (e) => e.side === side && e.cardId === effective.id && e.hp > 0,
      );
      if (alreadyOnField) return { ok: false, error: 'campeão já está em campo' };
    }
    if (effective.type === 'building') {
      placeBuilding(state, side, effective, gx, gy);
    } else {
      // Evolução: cada `cyclesRequired` usos carregam a forma evoluída.
      const evolution = effective.components.evolution;
      let evolved = false;
      if (evolution) {
        player.playCounts ??= {};
        const charge = player.playCounts[effective.id] ?? 0;
        if (charge >= evolution.cyclesRequired) {
          evolved = true;
          player.playCounts[effective.id] = 0;
        } else {
          player.playCounts[effective.id] = charge + 1;
        }
      }
      spawnUnits(state, side, effective.id, gx, gy, undefined, evolved);
    }
  } else if (effective.components.spell) {
    castSpell(state, side, effective, gx, gy);
  }

  player.elixir -= cost;
  if (card.type !== 'mirror') player.lastPlayed = cardId;
  cycleHand(player, cardId);
  return { ok: true };
}

function cycleHand(player: PlayerSim, cardId: string): void {
  const idx = player.hand.indexOf(cardId);
  const next = player.queue.shift();
  if (next !== undefined) {
    player.hand[idx] = next;
    player.queue.push(cardId);
  }
}

/** Invoca as unidades de uma carta em torno de (x, y). Usado também por spawners e morte. */
export function spawnUnits(
  state: SimState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
  countOverride?: number,
  evolved = false,
): void {
  const card = getCard(cardId);
  const c = card?.components;
  if (!card || !c?.health || !c.movement || !c.targeting) return;
  const count = countOverride ?? card.deployCount ?? 1;
  const level = state.players[side].cardLevels?.[cardId] ?? 1;
  const hpMultiplier =
    (evolved ? (c.evolution?.multipliers?.hp ?? 1) : 1) * levelMultiplier(level);
  const bonusShield = evolved ? (c.evolution?.bonusShield ?? 0) : 0;
  // Dispersão de geração: espalha unidades múltiplas em torno do ponto.
  const offsets = [
    { x: 0, y: 0 }, { x: 0, y: -0.8 }, { x: 0, y: 0.8 },
    { x: -0.8, y: 0 }, { x: 0.8, y: 0 }, { x: -0.8, y: -0.8 },
    { x: 0.8, y: 0.8 }, { x: -0.8, y: 0.8 }, { x: 0.8, y: -0.8 },
    { x: 0, y: -1.6 }, { x: 0, y: 1.6 }, { x: -1.6, y: 0 },
  ];
  for (let i = 0; i < count; i++) {
    const off = offsets[i % offsets.length];
    const entity: SimEntity = {
      id: `e${state.nextEntityId++}`,
      kind: 'unit',
      side,
      cardId,
      x: clamp(x + off.x, 0.5, GRID_W - 0.5),
      y: clamp(y + off.y, 0.5, GRID_H - 0.5),
      hp: Math.round(c.health.hp * hpMultiplier),
      maxHp: Math.round(c.health.hp * hpMultiplier),
      shield: (c.health.shield ?? 0) + bonusShield || undefined,
      attackCooldown: 0,
      action: 'idle',
      facing: side === 'left' ? 1 : -1,
      flying: c.movement.flying === true,
      spawnCooldown: c.spawner?.interval,
      walked: 0,
      abilityCooldown: c.ability ? 0 : undefined,
      evolved: evolved || undefined,
      level: level > 1 ? level : undefined,
      deployingUntil: state.time + DEPLOY_SECONDS,
    };
    state.entities[entity.id] = entity;
  }
  applyDeployEffect(state, side, card, x, y);
  state.events.push({ type: 'spawn', x, y, cardId, side });
}

function placeBuilding(state: SimState, side: Side, card: CardDef, x: number, y: number): void {
  const c = card.components;
  if (!c.health || !c.lifetime) return;
  const level = state.players[side].cardLevels?.[card.id] ?? 1;
  const hp = Math.round(c.health.hp * levelMultiplier(level));
  const entity: SimEntity = {
    id: `e${state.nextEntityId++}`,
    kind: 'building',
    side,
    cardId: card.id,
    x, y,
    hp,
    maxHp: hp,
    shield: c.health.shield,
    attackCooldown: 0,
    action: 'idle',
    facing: side === 'left' ? 1 : -1,
    lifetime: c.lifetime.seconds,
    spawnCooldown: c.spawner?.interval,
    elixirCooldown: c.resource?.elixirInterval,
    level: level > 1 ? level : undefined,
  };
  state.entities[entity.id] = entity;
  applyDeployEffect(state, side, card, x, y);
  state.events.push({ type: 'spawn', x, y, cardId: card.id, side });
}

/** Gatilho onDeploy: dano de implantação em área. */
function applyDeployEffect(state: SimState, side: Side, card: CardDef, x: number, y: number): void {
  const effect = card.components.deployEffect;
  if (!effect) return;
  state.events.push({ type: 'areaDamage', x, y, radius: effect.radius });
  for (const entity of Object.values(state.entities)) {
    if (entity.side === side || entity.hp <= 0 || entity.kind === 'zone') continue;
    const d = Math.hypot(entity.x - x, entity.y - y);
    if (d <= effect.radius + UNIT_RADIUS) {
      applyDamage(state, entity, effect.damage);
    }
  }
}

/** Aplica dano respeitando escudo. Retorna o dano efetivamente causado. */
export function applyDamage(state: SimState, target: SimEntity, amount: number): number {
  let remaining = amount;
  if (target.shield !== undefined && target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  state.events.push({ type: 'hit', x: target.x, y: target.y, ranged: true, amount });
  return amount;
}

/**
 * Ativa a habilidade do campeão vivo do jogador (gatilho onAbility).
 * Valida elixir, recarga e presença em campo.
 */
export function useAbility(state: SimState, side: Side): PlayCardResult {
  if (state.phase !== 'battle') return { ok: false, error: 'batalha não está em andamento' };
  const champion = Object.values(state.entities).find((e) => {
    if (e.side !== side || e.kind !== 'unit' || e.hp <= 0 || !e.cardId) return false;
    return getCard(e.cardId)?.type === 'champion';
  });
  if (!champion) return { ok: false, error: 'nenhum campeão em campo' };

  const ability = getCard(champion.cardId!)!.components.ability!;
  if ((champion.abilityCooldown ?? 0) > 0) return { ok: false, error: 'habilidade em recarga' };
  const player = state.players[side];
  if (player.elixir < ability.cost) return { ok: false, error: 'elixir insuficiente' };

  player.elixir -= ability.cost;
  champion.abilityCooldown = ability.cooldownSeconds;

  const effect = ability.effect;
  if (effect.shieldGain) champion.shield = (champion.shield ?? 0) + effect.shieldGain;
  if (effect.rageSelfSeconds) champion.ragedUntil = state.time + effect.rageSelfSeconds;
  if (effect.healSelf) champion.hp = Math.min(champion.maxHp, champion.hp + effect.healSelf);
  if (effect.damage && effect.radius) {
    for (const entity of Object.values(state.entities)) {
      if (entity.side === side || entity.hp <= 0 || entity.kind === 'zone') continue;
      const d = Math.hypot(entity.x - champion.x, entity.y - champion.y);
      if (d <= effect.radius + UNIT_RADIUS) applyDamage(state, entity, effect.damage);
    }
    state.events.push({ type: 'areaDamage', x: champion.x, y: champion.y, radius: effect.radius });
  }
  state.events.push({ type: 'ability', x: champion.x, y: champion.y, cardId: champion.cardId!, side });
  return { ok: true };
}

function castSpell(state: SimState, side: Side, card: CardDef, x: number, y: number): void {
  const spell = card.components.spell!;
  const { radius } = spell;
  const spellMultiplier = levelMultiplier(state.players[side].cardLevels?.[card.id]);

  const inRadius = Object.values(state.entities).filter(
    (e) => e.kind !== 'zone' && Math.hypot(e.x - x, e.y - y) <= radius + 0.4,
  );
  const enemies = inRadius.filter((e) => e.side !== side);

  // Relâmpago: só os N inimigos de maior vida.
  const damageTargets = spell.multiTargetCount
    ? [...enemies].sort((a, b) => b.hp - a.hp).slice(0, spell.multiTargetCount)
    : enemies;

  for (const entity of damageTargets) {
    if (spell.damage && spell.damage > 0) {
      applyDamage(state, entity, Math.round(spell.damage * spellMultiplier));
    }
    if (spell.stunSeconds) entity.stunnedUntil = state.time + spell.stunSeconds;
  }
  if (spell.freezeSeconds) {
    for (const entity of enemies) entity.frozenUntil = state.time + spell.freezeSeconds;
  }
  if (spell.rageSeconds) {
    for (const entity of inRadius) {
      if (entity.side === side && entity.kind === 'unit') {
        entity.ragedUntil = state.time + spell.rageSeconds;
      }
    }
  }
  if (spell.spawn) {
    spawnUnits(state, side, spell.spawn.cardId, x, y, spell.spawn.count);
  }
  if (spell.zone) {
    const zone: SimEntity = {
      id: `e${state.nextEntityId++}`,
      kind: 'zone',
      side,
      cardId: card.id,
      x, y,
      hp: 1,
      maxHp: 1,
      attackCooldown: 0,
      action: 'idle',
      facing: 1,
      lifetime: spell.zone.durationSeconds,
      pulseCooldown: spell.zone.pulseInterval,
    };
    state.entities[zone.id] = zone;
  }

  // O feitiço "voa" a partir da torre do rei de quem lançou.
  const king = Object.values(state.entities).find(
    (e) => e.side === side && e.tower === 'king',
  );
  state.events.push({
    type: 'spell', x, y, radius, cardId: card.id,
    fromX: king?.x ?? x, fromY: king?.y ?? y,
  });
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 在防守模式某条路上刷一只怪物。M0 简化：
 * - lane: 0..2 对应 LANE_XS
 * - hpScale / damageScale 由调用方从波次表传入
 * 出生用确定性抖动（state.tick 派生），可重放。
 */
export function spawnMob(
  state: SimState,
  lane: number,
  variant: MobVariant,
  hpScale: number,
  damageScale: number,
): SimEntity {
  const stats = MOB_STATS[variant];
  // Deterministic jitter 0..1 by tick + lane
  const j = (Math.sin(state.tick * 0.137 + lane * 7.31) + 1) * 0.5;
  const xLane = LANE_XS[lane] ?? LANE_XS[1]!;
  const ySpawn = MOB_SPAWN_Y + j * (MOB_SPAWN_MAX_Y - MOB_SPAWN_Y);
  const xJitter = (j - 0.5) * 1.6;

  const id = `e${state.nextEntityId++}`;
  const entity: SimEntity = {
    id,
    kind: 'unit',
    side: 'right',
    x: xLane + xJitter,
    y: ySpawn,
    hp: Math.round(stats.hp * hpScale),
    maxHp: Math.round(stats.hp * hpScale),
    attackCooldown: 0,
    action: 'idle',
    facing: -1,
    mobVariant: variant,
    // 派系跟随任务书 3.9，供 M3 的克制/易伤计算使用
    element: stats.element,
    lane,
  };
  state.entities[id] = entity;
  state.events.push({
    type: 'spawn',
    x: entity.x,
    y: entity.y,
    cardId: `mob:${variant}`,
    side: 'right',
  });
  return entity;
}

/** 怪物中文名（任务书 3.9），用于 HUD / 击杀提示 */
export function mobName(variant: MobVariant): string {
  return MOB_STATS[variant]?.name ?? variant;
}

/** 取出当前波次定义（state.wave 1-based；越界返回 undefined） */
export function getCurrentWave(state: SimState) {
  const w = state.wave ?? 1;
  return WAVES_M0[w - 1];
}
