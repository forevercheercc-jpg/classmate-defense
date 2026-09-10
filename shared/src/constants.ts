/** Grid lógico da arena em paisagem: 32 tiles de largura x 18 de altura. */
// Lado esquerdo = jogador "left", lado direito = jogador "right".
export const GRID_W = 32;
export const GRID_H = 18;

// Rio vertical no centro da arena, atravessável apenas pelas pontes.
export const RIVER_MIN_X = 15;
export const RIVER_MAX_X = 17;
export const RIVER_CENTER_X = 16;
export const BRIDGE_YS = [4.5, 13.5] as const;
export const BRIDGE_HALF_HEIGHT = 1.3;

// Zona de deploy: só no próprio lado, antes do rio.
export const DEPLOY_MAX_X_LEFT = RIVER_MIN_X - 0.5;
export const DEPLOY_MIN_X_RIGHT = RIVER_MAX_X + 0.5;

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;

export const ELIXIR_MAX = 10;
export const ELIXIR_START = 5;
export const ELIXIR_PER_SECOND = 1 / 2.8;
export const SUDDEN_DEATH_ELIXIR_MULTIPLIER = 2;
/** Como no Clash Royale: elixir em dobro no último minuto do tempo normal. */
export const DOUBLE_ELIXIR_LAST_SECONDS = 60;

export const COUNTDOWN_SECONDS = 7;
export const BATTLE_SECONDS = 180;
export const SUDDEN_DEATH_SECONDS = 60;
/**
 * Desempate final (após a morte súbita ainda empatada): TODAS as torres drenam
 * vida proporcionalmente e uma torre cheia esvazia neste tempo (s). A torre com
 * menor % de vida cai primeiro e decide o perdedor.
 */
export const TIEBREAKER_DRAIN_SECONDS = 5;

export const HAND_SIZE = 4;

/** Tempo de implantação: a tropa "nasce" e só age depois disso */
export const DEPLOY_SECONDS = 1;
/** Velocidade dos projéteis (tiles/s) — o dano acontece no impacto */
export const PROJECTILE_SPEED = 10;

export const UNIT_RADIUS = 0.45;
export const TOWER_RADIUS = 1.3;

export const KING_TOWER = { hp: 2600, damage: 110, hitSpeed: 1.0, range: 6 };
export const PRINCESS_TOWER = { hp: 1400, damage: 90, hitSpeed: 0.9, range: 5.5 };

// Posições das torres do lado esquerdo; o direito é espelhado em GRID_W.
export const LEFT_KING_POS = { x: 2.5, y: 9 };
export const LEFT_PRINCESS_POS = [
  { x: 6, y: 4.5 },
  { x: 6, y: 13.5 },
] as const;

export function mirrorX(x: number): number {
  return GRID_W - x;
}

// ============================================================
// 防守模式（3 路波次防守）—— 同学局改造新增
// 布局：怪物从远处（y=0，屏幕顶部）沿 3 条纵向走廊向核心
//       （y=16.5，屏幕底部）推进。复用 2.5D 投影的"上远下近"透视。
// ============================================================

/** 3 条进攻路线：x 方向 左 / 中 / 右 */
export const LANE_XS = [5.5, 16, 26.5] as const;
export const LANE_COUNT = 3;

/** 每条路 3 个点位：y 方向由远到近（前哨 / 中间 / 核心前） */
export const POINT_YS = [4, 8, 12] as const;
export const POINTS_PER_LANE = 3;

/** 强化倍率：越靠近核心越高（对应前哨 / 中间 / 核心前） */
export const POINT_BUFF = [1.0, 1.35, 1.7] as const;

/** 据点核心 */
export const CORE_POS = { x: 16, y: 16.5 };
export const CORE_HP = 5000;
export const CORE_RADIUS = 1.6;
export const CORE_DAMAGE = 130;
export const CORE_RANGE = 7;

/** 点位（可被怪物摧毁、玩家可退守） */
export const POINT_HP = 900;
export const POINT_RADIUS = 1.3;

/** 怪物出生区（顶部远处） */
export const MOB_SPAWN_Y = 0.5;
export const MOB_SPAWN_MAX_Y = 2;

/** 波次节奏 */
export const DEFENSE_WAVE_COUNT = 8;
export const WAVE_INTERVAL_SECONDS = 14; // 每波持续
export const WAVE_BREAK_SECONDS = 4; // 波间喘息
export const DEFENSE_BATTLE_SECONDS = 150; // 单局约 2.5 分钟

// ============================================================
// 怪物表 + 简化波次（精简 M0 测试版）
// 跳过 cards.ts 的复杂组件模型，怪物走 inline stat 表。
// 后续接入英雄/技能（M3）时再换 cards 体系。
// ============================================================

/** 怪物种类（M0 简化：单一一档近战怪，留作变量便于 M3 扩展元素派系） */
export type MobVariant = 'horde' | 'ogre' | 'imp';

/** 简化怪物基础属性表（近战、单位一格大小） */
export const MOB_STATS: Record<MobVariant, {
  hp: number;
  damage: number;
  range: number;       // 命中半径（M0 一律近战 = TOWER_RADIUS）
  hitSpeed: number;    // 两次攻击间隔（秒）
  speed: number;       // tiles/s
  sight: number;       // 警戒/搜索半径
}> = {
  horde: { hp:  60, damage:  8, range: 0.5, hitSpeed: 0.7, speed: 2.2, sight: 0.5 },
  ogre:  { hp: 180, damage: 22, range: 0.5, hitSpeed: 1.0, speed: 1.4, sight: 0.5 },
  imp:   { hp:  30, damage:  4, range: 0.5, hitSpeed: 0.55, speed: 2.8, sight: 0.5 },
};

/** M0 简化波次：8 波线性递增、每条路都刷 */
export interface DefenseWaveDef {
  wave: number;
  variant: MobVariant;
  count: number;
  spawnInterval: number; // 同一波内连续刷两只的间隔
  hpScale: number;
  damageScale: number;
}

function buildM0Waves(): DefenseWaveDef[] {
  const waves: DefenseWaveDef[] = [];
  for (let i = 0; i < DEFENSE_WAVE_COUNT; i++) {
    const w = i + 1;
    // 1-3 波 horde；4-6 ogre；7-8 imp+ogre 混合（M0 简化先用纯 ogre 测稳定）
    let variant: MobVariant;
    if (w <= 2) variant = 'horde';
    else if (w <= 5) variant = 'imp';
    else variant = 'ogre';
    const ramp = 1 + (w - 1) * 0.18;
    waves.push({
      wave: w,
      variant,
      count: 3 + w * 2,             // 5, 7, 9, 11, ...
      spawnInterval: Math.max(0.45, 1.2 - w * 0.07),
      hpScale: ramp,
      damageScale: 1 + (w - 1) * 0.12,
    });
  }
  return waves;
}

export const WAVES_M0: DefenseWaveDef[] = buildM0Waves();

/** 怪物搜索目标时的格子扫描半径（与 CORE_RANGE/TOWER_RADIUS 一致即可） */
export const MOB_TARGET_RANGE = CORE_RANGE + 2;
