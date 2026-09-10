import Phaser from 'phaser';
import {
  BRIDGE_HALF_HEIGHT, BRIDGE_YS, GRID_H, GRID_W, LEFT_KING_POS,
  LEFT_PRINCESS_POS, RIVER_CENTER_X, RIVER_MAX_X, RIVER_MIN_X,
  gridToScreen, mirrorX,
} from '@claude-royale/shared';

export type ArenaTheme = 'campo' | 'deserto' | 'neve' | 'noite';

interface Palette {
  grassA: number; grassB: number; riverA: number; riverB: number;
  bridgeA: number; bridgeB: number; edge: number; path: number; pathLight: number;
}

/** Paletas dos temas de arena (skins). */
export const ARENA_PALETTES: Record<ArenaTheme, Palette> = {
  campo: {
    grassA: 0x77b64e, grassB: 0x6ead45, riverA: 0x4a90e2, riverB: 0x3f7fd6,
    bridgeA: 0xb3814f, bridgeB: 0xa2703e, edge: 0x3b5427, path: 0xb89d68, pathLight: 0xcdb887,
  },
  deserto: {
    grassA: 0xd9b975, grassB: 0xcfae67, riverA: 0x39b9ac, riverB: 0x2fa89b,
    bridgeA: 0xa9825a, bridgeB: 0x977049, edge: 0x7a6236, path: 0x9c7c4c, pathLight: 0xb59460,
  },
  neve: {
    grassA: 0xe8eef2, grassB: 0xdae4ea, riverA: 0x7fb7e6, riverB: 0x6da9dc,
    bridgeA: 0x9c7c5a, bridgeB: 0x8a6c4c, edge: 0x8fa4b0, path: 0xc4cdd4, pathLight: 0xd8e0e6,
  },
  noite: {
    grassA: 0x2e4a3a, grassB: 0x28422f, riverA: 0x2c5a8f, riverB: 0x244d7d,
    bridgeA: 0x6e5236, bridgeB: 0x5e452c, edge: 0x16241c, path: 0x5a4c38, pathLight: 0x6d5c44,
  },
};

let palette: Palette = ARENA_PALETTES.campo;

export function isArenaTheme(value: unknown): value is ArenaTheme {
  return typeof value === 'string' && value in ARENA_PALETTES;
}

/** Desenha a arena 2.5D tile a tile: cada tile é um quadrilátero projetado. */
export function drawArena(graphics: Phaser.GameObjects.Graphics, theme: ArenaTheme = 'campo'): void {
  palette = ARENA_PALETTES[theme];
  drawApron(graphics);

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      graphics.fillStyle(tileColor(gx, gy));
      fillTile(graphics, gx, gy);
    }
  }

  drawWornPaths(graphics);
  drawRiverEdges(graphics);
}

/**
 * Trilhas de terra batida ligando as pontes às torres, como no Clash Royale.
 * Desenhadas como "blobs" sobrepostos ao longo de polilinhas no grid.
 */
function drawWornPaths(graphics: Phaser.GameObjects.Graphics): void {
  const paths: Array<Array<[number, number]>> = [];
  for (const flip of [false, true]) {
    const fx = (x: number) => (flip ? mirrorX(x) : x);
    for (const [i, bridgeY] of BRIDGE_YS.entries()) {
      const princess = LEFT_PRINCESS_POS[i];
      paths.push([
        [fx(RIVER_CENTER_X), bridgeY],
        [fx(princess.x + 1.6), bridgeY],
        [fx(LEFT_KING_POS.x + 2.2), LEFT_KING_POS.y + (bridgeY < LEFT_KING_POS.y ? -1.2 : 1.2)],
      ]);
    }
  }

  for (const path of paths) {
    for (let s = 0; s < path.length - 1; s++) {
      const [x1, y1] = path[s];
      const [x2, y2] = path[s + 1];
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.ceil(dist / 0.28);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const gx = x1 + (x2 - x1) * t;
        const gy = y1 + (y2 - y1) * t;
        // Ruído determinístico para variar largura e posição dos blobs.
        const wobble = Math.sin(gx * 12.9898 + gy * 78.233) * 0.18;
        const p = gridToScreen(gx, gy + wobble * 0.4);
        graphics.fillStyle(palette.path, 0.34);
        graphics.fillEllipse(p.x, p.y, (26 + wobble * 30) * p.scale, 13 * p.scale);
        graphics.fillStyle(palette.pathLight, 0.22);
        graphics.fillEllipse(p.x, p.y, 16 * p.scale, 8 * p.scale);
      }
    }
  }

  // Pedrinhas espalhadas pelas trilhas
  for (const path of paths) {
    for (const [px, py] of path) {
      const p = gridToScreen(px + 0.4, py + 0.5);
      graphics.fillStyle(0x9d8a63, 0.85);
      graphics.fillEllipse(p.x, p.y, 5 * p.scale, 3.4 * p.scale);
      graphics.fillEllipse(p.x + 9 * p.scale, p.y + 4 * p.scale, 3.6 * p.scale, 2.6 * p.scale);
    }
  }
}

function tileColor(gx: number, gy: number): number {
  const checker = (gx + gy) % 2 === 0;
  const centerX = gx + 0.5;

  if (centerX > RIVER_MIN_X && centerX < RIVER_MAX_X) {
    if (isBridgeRow(gy)) return checker ? palette.bridgeA : palette.bridgeB;
    return checker ? palette.riverA : palette.riverB;
  }
  const base = checker ? palette.grassA : palette.grassB;
  return darkenByDepth(base, gy);
}

function isBridgeRow(gy: number): boolean {
  const centerY = gy + 0.5;
  return BRIDGE_YS.some((by) => Math.abs(centerY - by) <= BRIDGE_HALF_HEIGHT);
}

/** Linhas distantes ficam levemente mais escuras para reforçar a profundidade. */
function darkenByDepth(color: number, gy: number): number {
  const t = gy / GRID_H;
  const factor = 0.82 + 0.18 * t;
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function fillTile(graphics: Phaser.GameObjects.Graphics, gx: number, gy: number): void {
  const p1 = gridToScreen(gx, gy);
  const p2 = gridToScreen(gx + 1, gy);
  const p3 = gridToScreen(gx + 1, gy + 1);
  const p4 = gridToScreen(gx, gy + 1);
  graphics.fillPoints(
    [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p2.y },
      { x: p3.x, y: p3.y },
      { x: p4.x, y: p4.y },
    ],
    true,
  );
}

/** Moldura escura em volta do trapézio da arena. */
function drawApron(graphics: Phaser.GameObjects.Graphics): void {
  const inflate = 0.35;
  const tl = gridToScreen(-inflate, -inflate);
  const tr = gridToScreen(GRID_W + inflate, -inflate);
  const br = gridToScreen(GRID_W + inflate, GRID_H + inflate);
  const bl = gridToScreen(-inflate, GRID_H + inflate);
  graphics.fillStyle(palette.edge);
  graphics.fillPoints(
    [
      { x: tl.x, y: tl.y },
      { x: tr.x, y: tr.y },
      { x: br.x, y: br.y },
      { x: bl.x, y: bl.y },
    ],
    true,
  );
}

/** Margens do rio (linha mais escura para dar contorno). */
function drawRiverEdges(graphics: Phaser.GameObjects.Graphics): void {
  graphics.lineStyle(3, 0x2d5f9e, 0.8);
  for (const edgeX of [RIVER_MIN_X, RIVER_MAX_X]) {
    graphics.beginPath();
    const start = gridToScreen(edgeX, 0);
    graphics.moveTo(start.x, start.y);
    for (let gy = 1; gy <= GRID_H; gy++) {
      const p = gridToScreen(edgeX, gy);
      graphics.lineTo(p.x, p.y);
    }
    graphics.strokePath();
  }
}

/** Sobreposição da zona de deploy (metade do próprio lado) durante o arrasto. */
export function drawDeployZone(
  graphics: Phaser.GameObjects.Graphics,
  side: 'left' | 'right',
): void {
  graphics.clear();
  graphics.fillStyle(0xffffff, 0.16);
  const [minX, maxX] = side === 'left' ? [0, RIVER_MIN_X] : [RIVER_MAX_X, GRID_W];
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = minX; gx < maxX; gx++) {
      fillTile(graphics, gx, gy);
    }
  }
}

/**
 * Tile destacado sob o ponteiro durante o arrasto (verde = válido,
 * vermelho = inválido), igual ao preview de deploy do Clash Royale.
 * Para feitiços, desenha também o círculo do raio de efeito.
 */
export function drawDropPreview(
  graphics: Phaser.GameObjects.Graphics,
  gx: number,
  gy: number,
  valid: boolean,
  spellRadius?: number,
): void {
  graphics.clear();
  const tileX = Math.min(GRID_W - 1, Math.max(0, Math.floor(gx)));
  const tileY = Math.min(GRID_H - 1, Math.max(0, Math.floor(gy)));

  const fill = valid ? 0x7dff5a : 0xff5a5a;
  const border = valid ? 0x2e7d32 : 0xb71c1c;

  graphics.fillStyle(fill, 0.5);
  fillTile(graphics, tileX, tileY);

  const p1 = gridToScreen(tileX, tileY);
  const p2 = gridToScreen(tileX + 1, tileY);
  const p3 = gridToScreen(tileX + 1, tileY + 1);
  const p4 = gridToScreen(tileX, tileY + 1);
  graphics.lineStyle(3, border, 0.95);
  graphics.strokePoints(
    [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p2.y },
      { x: p3.x, y: p3.y },
      { x: p4.x, y: p4.y },
    ],
    true,
    true,
  );

  if (spellRadius) {
    const c = gridToScreen(gx, gy);
    graphics.lineStyle(3, 0xffa726, 0.9);
    graphics.strokeEllipse(
      c.x, c.y,
      spellRadius * 2 * 38 * c.scale,
      spellRadius * 2 * 19 * c.scale,
    );
    graphics.fillStyle(0xffa726, 0.14);
    graphics.fillEllipse(
      c.x, c.y,
      spellRadius * 2 * 38 * c.scale,
      spellRadius * 2 * 19 * c.scale,
    );
  }
}
