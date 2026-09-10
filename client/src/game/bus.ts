/**
 * Canal de eventos mínimo entre a UI React e a cena Phaser
 * (ex.: começar/terminar o arrasto de uma carta para mostrar a zona de deploy).
 */
type Handler<T> = (payload: T) => void;

import type { SimEvent } from '@claude-royale/shared';

export interface BusEvents {
  dragStart: { cardId: string };
  /** Ponteiro se movendo sobre a arena durante o arrasto (null = fora do canvas) */
  dragMove: { cardId: string; gx: number; gy: number; valid: boolean } | null;
  dragEnd: void;
  /** Eventos da simulação vindos do servidor (ou do replay) */
  simEvents: SimEvent[];
  emote: { side: string; emoji: string };
  /** Intensidade do combate 0..1 (mixagem da música) */
  intensity: number;
}

const handlers: { [K in keyof BusEvents]: Set<Handler<BusEvents[K]>> } = {
  dragStart: new Set(),
  dragMove: new Set(),
  dragEnd: new Set(),
  simEvents: new Set(),
  emote: new Set(),
  intensity: new Set(),
};

export const bus = {
  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): () => void {
    handlers[event].add(handler);
    return () => handlers[event].delete(handler);
  },
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    handlers[event].forEach((h) => h(payload));
  },
};
