export type Side = 'left' | 'right';
export type EntityKind = 'unit' | 'tower' | 'building' | 'zone';
export type TowerKind = 'king' | 'princess';
export type EntityAction = 'idle' | 'walk' | 'attack';
export type Phase = 'waiting' | 'countdown' | 'battle' | 'ended';
export type EntityStatus = '' | 'stunned' | 'frozen' | 'raged' | 'charging';

import type { MobVariant } from './constants';

/** 元素 / 法术派系（同学局改造：魔兽世界六派系） */
export type Element = 'frost' | 'fire' | 'nature' | 'holy' | 'shadow' | 'arcane';

/** 防守模式怪物种类（M0 简化）：horde / ogre / imp */
export type { MobVariant };


/** 六方循环克制：克制方 -> 被克方（×1.25 克制 / ×0.8 被克） */
export const ELEMENT_COUNTER: Record<Element, Element> = {
  frost: 'fire',    // 冰克火：寒冰熄灭烈焰
  fire: 'nature',   // 火克自然：烈焰焚林
  nature: 'arcane', // 自然克奥术：荒野反制魔法
  arcane: 'shadow', // 奥术克暗影：秩序压制虚空
  shadow: 'holy',   // 暗影克神圣：黑暗侵蚀圣光
  holy: 'frost',    // 神圣克冰霜：圣光驱散亡灵严寒
};

/** 阵营亲和：相邻点位的两名英雄若构成这些组合则加成（替代五行相生） */
export const ELEMENT_SYNERGY: Array<[Element, Element]> = [
  ['holy', 'nature'],  // 生命系：圣光 + 自然
  ['fire', 'arcane'],  // 毁灭系：烈焰 + 奥术
  ['frost', 'shadow'], // 亡灵系：冰霜 + 暗影
];

export interface SimEntity {
  id: string;
  kind: EntityKind;
  side: Side;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Escudo restante: consumido antes da vida */
  shield?: number;
  /** id da carta para unidades, construções e zonas */
  cardId?: string;
  tower?: TowerKind;
  /** Torre do rei começa adormecida: só ataca após tomar dano ou perder uma princesa */
  dormant?: boolean;
  /** Cooldown de ataque restante em segundos */
  attackCooldown: number;
  targetId?: string;
  action: EntityAction;
  /** 1 = olhando para a direita, -1 = esquerda */
  facing: 1 | -1;
  flying?: boolean;
  /** Instantes (state.time) até quando cada status vale */
  stunnedUntil?: number;
  frozenUntil?: number;
  ragedUntil?: number;
  /** Construções: segundos de vida restantes */
  lifetime?: number;
  /** Spawners: segundos até a próxima leva */
  spawnCooldown?: number;
  /** Coletor: segundos até o próximo elixir */
  elixirCooldown?: number;
  /** Zonas (veneno): segundos até o próximo pulso */
  pulseCooldown?: number;
  /** Carga (Príncipe) */
  walked?: number;
  charging?: boolean;
  /** Campeões: recarga da habilidade ativa */
  abilityCooldown?: number;
  /** Forma evoluída da carta */
  evolved?: boolean;
  /** Nível da carta no momento do deploy (1–3) */
  level?: number;
  /** Tempo de implantação: até este instante a unidade não age */
  deployingUntil?: number;
  /** 防守模式：所属路线 0..2 */
  lane?: number;
  /** 防守模式：点位序号 0=前哨 1=中间 2=核心前 */
  pointIndex?: number;
  /** 五行元素（英雄与怪物都有） */
  element?: Element;
  /** 点位强化倍率（越靠近核心越高） */
  buff?: number;
  /** 防守模式怪物种类（horde / ogre / imp），有了就走怪物步进 */
  mobVariant?: MobVariant;
}

/** Dano em trânsito: aplicado quando o projétil chega ao alvo. */
export interface PendingHit {
  /** Instante (state.time) em que o projétil atinge */
  at: number;
  /** Alvo direto (ausente para dano em área na posição) */
  targetId?: string;
  x: number;
  y: number;
  damage: number;
  splashRadius?: number;
  targetsAir?: boolean;
  /** Lado do ATACANTE */
  side: Side;
  attackerId?: string;
  lifestealPct?: number;
  healOnKill?: number;
}

export interface PlayerSim {
  side: Side;
  elixir: number;
  crowns: number;
  hand: string[];
  /** Fila de cartas fora da mão; a primeira é a "próxima" */
  queue: string[];
  /** Última carta jogada (para o Espelho) */
  lastPlayed?: string;
  /** Contadores de uso por carta (carga das evoluções) */
  playCounts?: Record<string, number>;
  /** Níveis das cartas do deck (1–3), validados pelo servidor */
  cardLevels?: Record<string, number>;
}

export type SimEvent =
  | { type: 'spawn'; x: number; y: number; cardId: string; side: Side }
  | { type: 'death'; x: number; y: number; kind: EntityKind }
  | { type: 'spell'; x: number; y: number; radius: number; cardId: string; fromX: number; fromY: number }
  | { type: 'towerHit'; x: number; y: number }
  | { type: 'projectile'; fromX: number; fromY: number; toX: number; toY: number; kind: 'arrow' | 'bolt' }
  | { type: 'hit'; x: number; y: number; ranged: boolean; amount: number }
  | { type: 'areaDamage'; x: number; y: number; radius: number }
  | { type: 'ability'; x: number; y: number; cardId: string; side: Side };

export interface SimState {
  tick: number;
  /** Tempo acumulado de simulação em segundos (para statuses) */
  time: number;
  phase: Phase;
  timeRemaining: number;
  suddenDeath: boolean;
  /** Desempate final: as torres do rei drenam vida até uma cair. */
  tiebreaker: boolean;
  players: Record<Side, PlayerSim>;
  entities: Record<string, SimEntity>;
  nextEntityId: number;
  winner?: Side | 'draw';
  /** Eventos gerados no tick atual (limpos a cada passo) */
  events: SimEvent[];
  /** Projéteis em voo com dano agendado */
  pendingHits?: PendingHit[];
  /** ===== 防守模式字段（同学局改造新增） ===== */
  /** 是否为防守模式 */
  defense?: boolean;
  /** 当前波次（0 表示尚未开始） */
  wave?: number;
  /** 当前波已刷怪数 */
  waveSpawned?: number;
  /** 当前波内距下一只刷出的秒数（waveCountdown=0 后开始倒数） */
  waveSpawnTimer?: number;
  /** 距下一波开始的秒数（波间倒计时） */
  waveCountdown?: number;
  /** 核心血量 */
  coreHp?: number;
  coreMaxHp?: number;
}

/** 波次定义：某波刷什么怪、刷多少 */
export interface WaveDef {
  wave: number;
  mob: string;        // 怪物卡 id
  count: number;      // 该波总数
  interval: number;   // 每只间隔（秒）
  lanes: number[];    // 在哪些路刷（默认全 3 路）
}
