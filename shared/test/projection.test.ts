import { describe, expect, test } from 'vitest';
import { GRID_H, GRID_W } from '../src/constants';
import { depthScale, gridToScreen, screenToGrid, VIEW_H, VIEW_W } from '../src/projection';

describe('projeção 2.5D', () => {
  test('linhas distantes (topo) são menores que as próximas (base)', () => {
    expect(depthScale(0)).toBeLessThan(depthScale(GRID_H));
  });

  test('o centro do grid projeta no centro horizontal da tela', () => {
    const p = gridToScreen(GRID_W / 2, GRID_H / 2);
    expect(p.x).toBeCloseTo(VIEW_W / 2, 5);
  });

  test('projeção fica dentro da viewport 1280x720', () => {
    for (const [gx, gy] of [[0, 0], [GRID_W, 0], [0, GRID_H], [GRID_W, GRID_H]] as const) {
      const p = gridToScreen(gx, gy);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VIEW_W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VIEW_H);
    }
  });

  test('screenToGrid é a inversa de gridToScreen', () => {
    for (const [gx, gy] of [[3, 2], [16, 9], [28, 16], [1, 17]] as const) {
      const p = gridToScreen(gx, gy);
      const back = screenToGrid(p.x, p.y);
      expect(back.gx).toBeCloseTo(gx, 4);
      expect(back.gy).toBeCloseTo(gy, 4);
    }
  });
});
