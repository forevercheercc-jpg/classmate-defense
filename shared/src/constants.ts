/** Grid lógico da arena em paisagem: 32 tiles de largura x 18 de altura. */
// Lado esquerdo = jogador "left", lado direito = jogador "right".
export const GRID_W = 32;
export const GRID_H = 18;

import type { Element } from './types';

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
// 防守模式（3 路波次防守）—— 同学局改造 · M1 地图重画
// 布局参考《帝国守卫战 / Realm Defense》+ Dota 地图体系：
//   怪物从右侧 3 个入口出发，沿 3 条蜿蜒土路向左推进，
//   最终在左侧中央的石头城堡前汇流。
//   路与路之间的空地是野区（野怪营地 / 肉山）。
// ============================================================

export const LANE_COUNT = 3;

/** 波次节奏 */
export const DEFENSE_WAVE_COUNT = 8;
export const WAVE_INTERVAL_SECONDS = 14; // 每波持续
export const WAVE_BREAK_SECONDS = 4; // 波间喘息
export const DEFENSE_BATTLE_SECONDS = 480; // 单局约 8 分钟（MOBA-lite：要留打野/肉山时间）

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 三条进攻路线的航点（右手 → 左手）。
 * 每条路 7–8 个航点，在 32×18 网格里来回折弯，避免笔直三条线。
 * - 上路 lane0：贴上半区，中段向南压
 * - 中路 lane1：穿过中央，末段绕开肉山坑
 * - 下路 lane2：贴下半区，中段向北压
 * 三条路最后 2 个航点收束到城堡前的同一个汇流点。
 */
export const LANE_PATHS: ReadonlyArray<ReadonlyArray<Vec2>> = [
  // 0 — 上路（红）
  [
    { x: 32.5, y: 3.4 },
    { x: 28.2, y: 3.4 },
    { x: 25.6, y: 4.6 },
    { x: 22.4, y: 5.2 },
    { x: 19.5, y: 6.0 },
    { x: 16.8, y: 7.0 },
    { x: 14.6, y: 8.0 },
    { x: 12.6, y: 8.9 },
    { x: 10.4, y: 9.0 }, // 汇流
  ],
  // 1 — 中路（橙）
  [
    { x: 32.5, y: 9.0 },
    { x: 29.0, y: 8.8 },
    { x: 26.2, y: 9.7 },
    { x: 23.4, y: 10.6 },
    { x: 20.6, y: 11.2 },
    { x: 17.8, y: 11.3 },
    { x: 15.0, y: 11.0 },
    { x: 12.6, y: 10.2 },
    { x: 10.4, y: 9.0 }, // 汇流
  ],
  // 2 — 下路（蓝）
  [
    { x: 32.5, y: 14.6 },
    { x: 28.4, y: 14.6 },
    { x: 25.4, y: 13.6 },
    { x: 22.6, y: 12.8 },
    { x: 19.8, y: 12.0 },
    { x: 17.0, y: 10.6 },
    { x: 14.2, y: 9.8 },
    { x: 12.0, y: 9.3 },
    { x: 10.4, y: 9.0 }, // 汇流
  ],
];

/**
 * 每条路 3 个点位的坐标（前哨 / 中间 / 核心前），紧邻土路外侧。
 * buff 倍率越靠近城堡越高（见 POINT_BUFF）。
 * lane0 点位在北侧、lane2 在南侧、lane1 交替，视觉上不重叠。
 */
export const POINT_POS: ReadonlyArray<ReadonlyArray<Vec2>> = [
  // 上路
  [
    { x: 28.0, y: 2.1 },
    { x: 22.6, y: 4.1 },
    { x: 15.2, y: 6.5 },
  ],
  // 中路
  [
    { x: 28.2, y: 10.6 },
    { x: 21.0, y: 12.9 },
    { x: 14.4, y: 9.0 },
  ],
  // 下路
  [
    { x: 28.2, y: 16.0 },
    { x: 22.8, y: 11.0 },
    { x: 13.4, y: 11.6 },
  ],
];
export const POINTS_PER_LANE = 3;

/** 强化倍率：越靠近核心越高（对应前哨 / 中间 / 核心前） */
export const POINT_BUFF = [1.0, 1.35, 1.7] as const;

/** 三个进攻入口（怪物出生点），与 LANE_PATHS 首航点一致 */
export const LANE_SPAWNS: ReadonlyArray<Vec2> = [
  LANE_PATHS[0]![0]!,
  LANE_PATHS[1]![0]!,
  LANE_PATHS[2]![0]!,
];

/** 据点核心（城堡）：移到左侧中央，三条路的终点 */
export const CORE_POS = { x: 7.4, y: 9.0 };
export const CORE_HP = 5000;
export const CORE_RADIUS = 1.6;
export const CORE_DAMAGE = 130;
export const CORE_RANGE = 7;

/** 点位（可被怪物摧毁、玩家可退守） */
export const POINT_HP = 900;
export const POINT_RADIUS = 1.3;

// ---- 野区（打野） ----

/**
 * 两片丛林野区，位于路与路之间的空地。
 * 野区内有野怪营地；击杀后延迟刷新（给英雄练级）。
 */
export interface JungleArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const JUNGLE_AREAS: ReadonlyArray<JungleArea> = [
  { x: 19.5, y: 4.4, w: 7.0, h: 2.6 },  // 上半野区（上路↔中路之间）
  { x: 19.0, y: 11.6, w: 7.5, h: 2.6 }, // 下半野区（中路↔下路之间）
];

/** 野怪营地坐标（每个野区 2 个） */
export const JUNGLE_CAMPS: ReadonlyArray<Vec2> = [
  { x: 21.0, y: 5.7 },
  { x: 25.2, y: 5.7 },
  { x: 21.0, y: 12.9 },
  { x: 25.0, y: 12.9 },
];

/** 野怪营地参数 */
export const CAMP_HP = 220;
export const CAMP_DAMAGE = 9;
export const CAMP_HIT_SPEED = 0.9;
export const CAMP_SPEED = 1.5;
export const CAMP_SIGHT = 2.2;
export const CAMP_RESPAWN_SECONDS = 25;
/** 野怪经验/金币占位（M2 英雄等级接入后用） */
export const CAMP_REWARD = 12;

// ---- 肉山（Roshan） ----

/** 肉山位置：中央偏左，三条路的汇流处北侧，单独立一块坑地 */
export const ROSHAN_POS = { x: 17.4, y: 2.6 };
export const ROSHAN_HP = 1800;
export const ROSHAN_DAMAGE = 38;
export const ROSHAN_HIT_SPEED = 1.1;
export const ROSHAN_SPEED = 1.1;
export const ROSHAN_RANGE = 1.0;
export const ROSHAN_SIGHT = 4.6;
/** 肉山击杀后给全队强化（M4 接入 buff 下发） */
export const ROSHAN_TEAM_BUFF_SECONDS = 90;
export const ROSHAN_TEAM_BUFF_DAMAGE = 1.25;
export const ROSHAN_RESPAWN_SECONDS = 150;

/** 怪物出生（入口）抖动范围 —— 只在 y 上抖，避免怪物出到地图外 */
export const MOB_SPAWN_JITTER = 0.8;

// ============================================================
// 怪物表 + 简化波次（精简 M0 测试版）
// 跳过 cards.ts 的复杂组件模型，怪物走 inline stat 表。
// 后续接入英雄/技能（M3）时再换 cards 体系。
// ============================================================

/**
 * 怪物种类 —— 命名与派系取自需求文档 3.9「技能与怪物命名」。
 * M0 先做 4 只基础怪（覆盖冰霜/自然/火焰/暗影 4 系）；
 * 神圣系不出怪（作为玩家反制派系），奥术系留到 M3。
 */
export type MobVariant = 'murloc' | 'kobold' | 'imp' | 'skeleton';

export interface MobDef {
  /** 中文名（任务书 3.9） */
  name: string;
  /** 派系（任务书 3.8 六派系） */
  element: Element;
  /** 定位（任务书 3.9） */
  role: string;
  hp: number;
  damage: number;
  range: number;       // 命中半径（M0 一律近战）
  hitSpeed: number;    // 两次攻击间隔（秒）
  speed: number;       // tiles/s
  sight: number;       // 警戒/搜索半径
}

export const MOB_STATS: Record<MobVariant, MobDef> = {
  // 鱼人：冰霜，快、成群 —— 血薄数量多
  murloc:   { name: '鱼人',     element: 'frost',  role: '快、成群',
              hp: 45, damage: 7,  range: 0.5, hitSpeed: 0.60, speed: 2.6, sight: 0.5 },
  // 狗头人：自然，最弱炮灰
  kobold:   { name: '狗头人',   element: 'nature', role: '最弱炮灰',
              hp: 30, damage: 4,  range: 0.5, hitSpeed: 0.55, speed: 2.4, sight: 0.5 },
  // 小鬼：火焰，高爆 —— 血薄但伤害高
  imp:      { name: '小鬼',     element: 'fire',   role: '高爆',
              hp: 55, damage: 14, range: 0.5, hitSpeed: 0.90, speed: 2.0, sight: 0.5 },
  // 骷髅士兵：暗影，难缠（亡者复生：死后复活一次 —— M0 未实现，M3 补）
  skeleton: { name: '骷髅士兵', element: 'shadow', role: '难缠·亡者复生',
              hp: 90, damage: 10, range: 0.5, hitSpeed: 0.80, speed: 1.7, sight: 0.5 },
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
    // 1-2 波狗头人（炮灰）→ 3-4 波鱼人（成群）→ 5-6 波小鬼（高爆）→ 7-8 波骷髅（难缠）
    let variant: MobVariant;
    if (w <= 2) variant = 'kobold';
    else if (w <= 4) variant = 'murloc';
    else if (w <= 6) variant = 'imp';
    else variant = 'skeleton';
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
