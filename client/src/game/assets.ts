/**
 * Manifesto dos assets do pack "Tiny Swords" (Pixel Frog).
 * Licença: uso pessoal/comercial permitido, modificações permitidas,
 * redistribuição/revenda proibida. https://pixelfrog-assets.itch.io/tiny-swords
 */
export type UnitAsset = 'warrior' | 'archer' | 'pawn';
export type UnitAnim = 'idle' | 'run' | 'attack';
export type SideColor = 'blue' | 'red';

export const UNIT_FRAME_SIZE = 192;

/** Quantidade de frames de cada spritesheet (largura / 192). */
export const UNIT_ANIM_FRAMES: Record<UnitAsset, Record<UnitAnim, number>> = {
  warrior: { idle: 8, run: 6, attack: 4 },
  archer: { idle: 6, run: 4, attack: 8 },
  pawn: { idle: 8, run: 6, attack: 4 },
};

export interface CardVisual {
  /** Sprite de tropa (ausente para construções) */
  unit?: UnitAsset;
  /** Construção: usa o sprite de torre em escala reduzida */
  building?: boolean;
  /** Escala visual relativa (1 = tamanho padrão de tropa) */
  scale: number;
  /** Tint opcional para diferenciar variantes do mesmo sprite */
  tint?: number;
}

/** Mapeia cada carta para o sprite que a representa na arena. */
export const CARD_VISUALS: Record<string, CardVisual> = {
  // Comuns
  bombardeiro: { unit: 'pawn', scale: 1.0, tint: 0xb0bec5 },
  arqueiras: { unit: 'archer', scale: 1.0 },
  cavaleiro: { unit: 'warrior', scale: 1.0 },
  lanceiros: { unit: 'pawn', scale: 0.9, tint: 0xc8ffc0 },
  salteadores: { unit: 'pawn', scale: 0.95, tint: 0xa5d6a7 },
  esqueletos: { unit: 'pawn', scale: 0.82, tint: 0xd1c4e9 },
  morcegos: { unit: 'pawn', scale: 0.72, tint: 0xb39ddb },
  canhao: { building: true, scale: 0.32, tint: 0xbcaaa4 },
  barbaros: { unit: 'warrior', scale: 0.95, tint: 0xffcc80 },
  bobina: { building: true, scale: 0.34, tint: 0x80deea },
  nuvemDeMorcegos: { unit: 'pawn', scale: 0.72, tint: 0x9575cd },
  morteiro: { building: true, scale: 0.34, tint: 0x90a4ae },
  // Raras
  executor: { unit: 'warrior', scale: 1.05, tint: 0x90a4ae },
  mosqueteira: { unit: 'archer', scale: 1.16, tint: 0xead9ff },
  gigante: { unit: 'warrior', scale: 1.62, tint: 0xcfd8dc },
  postoDeLanceiros: { building: true, scale: 0.36, tint: 0xaed581 },
  valquiria: { unit: 'warrior', scale: 1.08, tint: 0xffb27a },
  ossuario: { building: true, scale: 0.28, tint: 0xb39ddb },
  torreBombas: { building: true, scale: 0.36, tint: 0xa1887f },
  acampamento: { building: true, scale: 0.38, tint: 0xffab91 },
  torreDeChamas: { building: true, scale: 0.36, tint: 0xef9a9a },
  javali: { unit: 'warrior', scale: 1.12, tint: 0xbcaaa4 },
  mago: { unit: 'archer', scale: 1.1, tint: 0x90caf9 },
  pocoDeElixir: { building: true, scale: 0.34, tint: 0xf48fb1 },
  curandeira: { unit: 'archer', scale: 1.05, tint: 0xa7ffeb },
  // Épicas
  principe: { unit: 'warrior', scale: 1.18, tint: 0xffe082 },
  dragaozinho: { unit: 'pawn', scale: 1.05, tint: 0xa5d6a7 },
  legiaoDeOssos: { unit: 'pawn', scale: 0.82, tint: 0xd1c4e9 },
  bruxa: { unit: 'archer', scale: 1.08, tint: 0xce93d8 },
  carregadorDeBomba: { unit: 'warrior', scale: 1.3, tint: 0xb0bec5 },
  dirigivel: { unit: 'pawn', scale: 1.35, tint: 0xef9a9a },
  colosso: { unit: 'warrior', scale: 1.5, tint: 0x78909c },
  golem: { unit: 'warrior', scale: 1.7, tint: 0xa1887f },
  guardiaoRunico: { unit: 'warrior', scale: 1.05, tint: 0x9fa8da },
  laminaFaminta: { unit: 'warrior', scale: 1.0, tint: 0xef9a9a },
  trollRegenerante: { unit: 'warrior', scale: 1.35, tint: 0xaed581 },
  balestra: { building: true, scale: 0.36, tint: 0xbcaaa4 },
  // Internas
  fragmentoDeGolem: { unit: 'warrior', scale: 1.0, tint: 0xbcaaa4 },
};

/** Lado esquerdo joga de azul, direito de vermelho — igual nas duas janelas. */
export function sideColor(side: string): SideColor {
  return side === 'left' ? 'blue' : 'red';
}

export function unitSheetKey(unit: UnitAsset, color: SideColor, anim: UnitAnim): string {
  return `${unit}_${color}_${anim}`;
}

export function unitSheetUrl(unit: UnitAsset, color: SideColor, anim: UnitAnim): string {
  return `/assets/tiny-swords/units/${unit}_${color}_${anim}.png`;
}

export const BUILDING_TEXTURES = [
  { key: 'castle_blue', url: '/assets/tiny-swords/buildings/castle_blue.png' },
  { key: 'castle_red', url: '/assets/tiny-swords/buildings/castle_red.png' },
  { key: 'tower_blue', url: '/assets/tiny-swords/buildings/tower_blue.png' },
  { key: 'tower_red', url: '/assets/tiny-swords/buildings/tower_red.png' },
];

export const STATIC_DECO = [
  { key: 'rock1', url: '/assets/tiny-swords/deco/rock1.png' },
  { key: 'rock2', url: '/assets/tiny-swords/deco/rock2.png' },
];

/** Decorações animadas: { frames, frameW, frameH } */
export const ANIMATED_DECO = [
  { key: 'tree1', url: '/assets/tiny-swords/deco/tree1.png', frames: 8, frameW: 192, frameH: 256 },
  { key: 'tree2', url: '/assets/tiny-swords/deco/tree2.png', frames: 8, frameW: 192, frameH: 256 },
  { key: 'bush1', url: '/assets/tiny-swords/deco/bush1.png', frames: 8, frameW: 128, frameH: 128 },
  { key: 'water_rocks', url: '/assets/tiny-swords/deco/water_rocks.png', frames: 8, frameW: 128, frameH: 64 },
];

/** SFX (Kenney, CC0). A música toca via <audio> no React. */
export const SFX = [
  'sfx_melee', 'sfx_arrow', 'sfx_tower_hit', 'sfx_explosion', 'sfx_deploy',
  'sfx_death', 'sfx_tower_down', 'sfx_countdown',
] as const;

export function sfxUrl(key: string): string {
  return `/assets/audio/${key}.ogg`;
}

export const FIRE = {
  key: 'fire',
  url: '/assets/tiny-swords/fx/fire.png',
  frames: 8, // 512 / 64
  frameW: 64,
  frameH: 64,
};

export const EXPLOSION = {
  key: 'explosion',
  url: '/assets/tiny-swords/fx/explosion.png',
  frames: 8,
  frameW: 192,
  frameH: 192,
};
