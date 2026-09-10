import { GRID_H, GRID_W } from './constants';

/**
 * Projeção 2.5D da arena em paisagem.
 * O grid lógico (gx: 0..GRID_W, gy: 0..GRID_H) é desenhado como um trapézio:
 * o topo da tela (gy = 0) fica "mais longe" — menor e comprimido — e a base
 * (gy = GRID_H) fica "mais perto" — maior, imitando o ângulo de câmera do
 * Clash Royale adaptado para paisagem.
 */
export const VIEW_W = 1280;
export const VIEW_H = 720;

const ARENA_TOP = 70;
const ARENA_BOTTOM = 700;
const ARENA_HEIGHT = ARENA_BOTTOM - ARENA_TOP;

/** Escala percebida na linha mais distante (gy=0) vs. mais próxima (gy=GRID_H). */
const FAR_SCALE = 0.7;
const NEAR_SCALE = 1.05;

/** Compressão das linhas distantes: < 1 aproxima as linhas do topo entre si. */
const ROW_COMPRESSION = 0.62;

const CENTER_X = VIEW_W / 2;
const BASE_TILE_W = 38;

export interface ScreenPoint {
  x: number;
  y: number;
  /** Fator de escala para sprites nessa profundidade */
  scale: number;
}

/** Escala de profundidade para uma linha lógica gy. */
export function depthScale(gy: number): number {
  const t = clamp01(gy / GRID_H);
  return FAR_SCALE + (NEAR_SCALE - FAR_SCALE) * t;
}

/** Converte coordenada de grid (gx, gy) em coordenada de tela 1280x720. */
export function gridToScreen(gx: number, gy: number): ScreenPoint {
  const t = clamp01(gy / GRID_H);
  const eased = t * (ROW_COMPRESSION + (1 - ROW_COMPRESSION) * t);
  const scale = depthScale(gy);
  return {
    x: CENTER_X + (gx - GRID_W / 2) * BASE_TILE_W * scale,
    y: ARENA_TOP + ARENA_HEIGHT * eased,
    scale,
  };
}

/** Converte coordenada de tela de volta para o grid (para input de deploy). */
export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  // Inverte a easing quadrática: (1-c)t² + c·t - u = 0
  const u = (sy - ARENA_TOP) / ARENA_HEIGHT;
  const c = ROW_COMPRESSION;
  const a = 1 - c;
  const t = a === 0
    ? u
    : (-c + Math.sqrt(c * c + 4 * a * Math.max(0, u))) / (2 * a);
  const gy = clamp01(t) * GRID_H;
  const scale = depthScale(gy);
  const gx = (sx - CENTER_X) / (BASE_TILE_W * scale) + GRID_W / 2;
  return { gx, gy };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
