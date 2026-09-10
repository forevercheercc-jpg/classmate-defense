import { useCallback, useRef, useState } from 'react';
import type { Room } from 'colyseus.js';
import {
  DEPLOY_MAX_X_LEFT, DEPLOY_MIN_X_RIGHT, GRID_H, GRID_W,
  VIEW_H, VIEW_W, getCard, screenToGrid,
} from '@claude-royale/shared';
import { sendPlayCard } from '../net/connection';
import { useI18n } from '../i18n';
import { bus } from '../game/bus';
import { sideColor, type SideColor } from '../game/assets';
import { CardArt } from './CardArt';

interface CardHandProps {
  hand: string[];
  nextCard: string;
  elixir: number;
  disabled: boolean;
  room: Room;
  mySide: 'left' | 'right';
}

interface DragState {
  cardId: string;
  x: number;
  y: number;
  /** Velocidade horizontal do arrasto → inclinação da carta */
  vx: number;
}

function uiSound(rate: number, volume: number): void {
  try {
    const audio = new Audio('/assets/audio/sfx_deploy.ogg');
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    audio.playbackRate = rate;
    audio.volume = volume;
    void audio.play().catch(() => undefined);
  } catch {
    // áudio indisponível
  }
}

export function CardHand({ hand, nextCard, elixir, disabled, room, mySide }: CardHandProps) {
  const { t } = useI18n();
  const myColor = sideColor(mySide);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const beginDrag = useCallback(
    (cardId: string, e: React.PointerEvent) => {
      if (disabled) return;
      const card = getCard(cardId);
      if (!card || elixir < card.cost) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const state = { cardId, x: e.clientX, y: e.clientY, vx: 0 };
      dragRef.current = state;
      setDrag(state);
      uiSound(1.8, 0.18); // "shlick" de pegar a carta
      bus.emit('dragStart', { cardId });
    },
    [disabled, elixir],
  );

  const moveDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const vx = e.clientX - dragRef.current.x;
      const state = {
        ...dragRef.current,
        x: e.clientX,
        y: e.clientY,
        vx: dragRef.current.vx * 0.7 + vx * 0.3,
      };
      dragRef.current = state;
      setDrag(state);

      const pos = clientToGrid(e.clientX, e.clientY);
      bus.emit(
        'dragMove',
        pos
          ? { cardId: state.cardId, ...pos, valid: isValidDrop(state.cardId, pos.gx, mySide) }
          : null,
      );
    },
    [mySide],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      bus.emit('dragEnd', undefined);
      if (!state) return;

      const drop = clientToGrid(e.clientX, e.clientY);
      if (drop && isValidDrop(state.cardId, drop.gx, mySide)) {
        uiSound(1.05, 0.3); // "thump" de soltar
        sendPlayCard(room, state.cardId, drop.gx, drop.gy);
      }
    },
    [room, mySide],
  );

  return (
    <>
      <div className="card-hand">
        <div className="next-card">
          <span className="next-label">{t('battle.nextCard')}</span>
          <MiniCard cardId={nextCard} color={myColor} />
        </div>
        {hand.map((cardId, i) => {
          const card = getCard(cardId);
          if (!card) return <div key={i} className="card empty" />;
          const affordable = !disabled && elixir >= card.cost;
          return (
            <div
              key={`${cardId}-${i}`}
              className={`card ${affordable ? '' : 'unaffordable'} ${drag?.cardId === cardId ? 'dragging' : ''}`}
              style={{ ['--card-color' as string]: card.color }}
              onPointerDown={(e) => beginDrag(cardId, e)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className="card-cost">{card.type === 'mirror' ? '+1' : card.cost}</span>
              <CardArt cardId={cardId} color={myColor} emoji={card.emoji} />
              <span className="card-name">{card.name}</span>
            </div>
          );
        })}
      </div>
      {drag && <DragGhost drag={drag} />}
    </>
  );
}

function MiniCard({ cardId, color }: { cardId: string; color: SideColor }) {
  const card = getCard(cardId);
  if (!card) return <div className="mini-card" />;
  return (
    <div className="mini-card" style={{ ['--card-color' as string]: card.color }}>
      <CardArt cardId={cardId} color={color} emoji={card.emoji} />
    </div>
  );
}

function DragGhost({ drag }: { drag: DragState }) {
  const card = getCard(drag.cardId);
  if (!card) return null;
  const tilt = Math.max(-16, Math.min(16, drag.vx * 1.4));
  return (
    <div
      className="drag-ghost"
      style={{
        left: drag.x,
        top: drag.y,
        transform: `translate(-50%, -50%) rotate(${tilt}deg) scale(1.2)`,
        ['--card-color' as string]: card.color,
      }}
    >
      {card.emoji}
    </div>
  );
}

/** Tropas só podem ser jogadas no próprio lado; feitiços em qualquer lugar da arena. */
function isValidDrop(cardId: string, gx: number, mySide: 'left' | 'right'): boolean {
  const card = getCard(cardId);
  if (!card) return false;
  if (gx < 0 || gx > GRID_W) return false;
  // Feitiços vão a qualquer lugar; Espelho depende da última carta (o servidor valida).
  if (card.type === 'spell' || card.type === 'mirror') return true;
  return mySide === 'left' ? gx <= DEPLOY_MAX_X_LEFT : gx >= DEPLOY_MIN_X_RIGHT;
}

/**
 * Converte a posição do ponteiro (viewport) em coordenadas do grid lógico,
 * compensando o letterbox do Phaser Scale.FIT (o canvas mantém 16:9).
 */
function clientToGrid(clientX: number, clientY: number): { gx: number; gy: number } | null {
  const canvas = document.querySelector<HTMLCanvasElement>('.game-host canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const sx = ((clientX - rect.left) / rect.width) * VIEW_W;
  const sy = ((clientY - rect.top) / rect.height) * VIEW_H;
  if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) return null;

  return screenToGrid(sx, sy);
}
