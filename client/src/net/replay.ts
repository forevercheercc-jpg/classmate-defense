import type { Room } from 'colyseus.js';
import type { SimEvent } from '@claude-royale/shared';
import { snapshotHud, type HudSnapshot } from './connection';

export interface ReplayFrame {
  /** ms desde o início da gravação */
  t: number;
  entities: Record<string, any>;
  hud: HudSnapshot;
}

export interface ReplayEvents {
  t: number;
  events: SimEvent[];
}

export interface Replay {
  mySide: 'left' | 'right';
  frames: ReplayFrame[];
  events: ReplayEvents[];
  durationMs: number;
  /** Instantes (ms) das quedas de torre — para o modo "melhores momentos" */
  moments: number[];
}

/** Grava os patches de estado e eventos de uma partida para replay local. */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private events: ReplayEvents[] = [];
  private startedAt = performance.now();
  private mySide: 'left' | 'right' = 'left';

  onStateChange(room: Room): void {
    const state = room.state as Record<string, any>;
    if (state.phase === 'waiting') {
      // Zera o relógio até a partida existir de fato.
      this.startedAt = performance.now();
      return;
    }
    const hud = snapshotHud(room);
    this.mySide = hud.mySide;
    const entities: Record<string, any> = {};
    state.entities?.forEach((entity: any, id: string) => {
      entities[id] = {
        x: entity.x, y: entity.y, hp: entity.hp, maxHp: entity.maxHp,
        kind: entity.kind, side: entity.side, cardId: entity.cardId,
        tower: entity.tower, action: entity.action, facing: entity.facing,
      };
    });
    this.frames.push({ t: performance.now() - this.startedAt, entities, hud });
  }

  private moments: number[] = [];

  onEvents(events: SimEvent[]): void {
    const t = performance.now() - this.startedAt;
    this.events.push({ t, events });
    // Indexa os grandes momentos: quedas de torre
    if (events.some((e) => e.type === 'death' && e.kind === 'tower')) {
      this.moments.push(t);
    }
  }

  finish(): Replay | null {
    if (this.frames.length < 10) return null;
    return {
      mySide: this.mySide,
      frames: this.frames,
      events: this.events,
      durationMs: this.frames[this.frames.length - 1].t,
      moments: this.moments,
    };
  }
}

/**
 * "Sala" fake que alimenta a BattleScene durante o replay: expõe o mesmo
 * shape mínimo que a cena usa (state.entities como Map com forEach).
 */
export class ReplayRoom {
  state: { entities: Map<string, any> } = { entities: new Map() };

  applyFrame(frame: ReplayFrame): void {
    this.state.entities = new Map(Object.entries(frame.entities));
  }

  // A cena não envia mensagens durante replay.
  send(): void {}
  onMessage(): void {}
}
