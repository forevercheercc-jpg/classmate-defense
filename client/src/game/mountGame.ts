import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { VIEW_H, VIEW_W } from '@claude-royale/shared';
import { BattleScene } from './BattleScene';
import type { ArenaTheme } from './arena';

/** Cria o jogo Phaser dentro do elemento pai, com letterbox (Scale.FIT). */
export function mountGame(
  parent: HTMLElement,
  room: Room,
  mySide: 'left' | 'right',
  theme: ArenaTheme = 'campo',
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#1e2b1c',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
  // 防守模式（M0 同学局版）：从 schema 推断后传给 BattleScene.init
  const defense = (room.state as Record<string, unknown>).defense === true;
  game.scene.add('battle', BattleScene, true, { room, mySide, theme, defense });
  return game;
}
