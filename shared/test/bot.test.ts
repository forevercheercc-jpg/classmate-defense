import { describe, expect, test } from 'vitest';
import { DEPLOY_MIN_X_RIGHT, RIVER_MIN_X, TICK_DT } from '../src/constants';
import { decideBotAction } from '../src/sim/bot';
import { createInitialState, playCard } from '../src/sim/state';
import { stepSimulation } from '../src/sim/step';
import type { SimState } from '../src/types';

function createBattleState(): SimState {
  const state = createInitialState();
  state.phase = 'battle';
  state.timeRemaining = 180;
  return state;
}

describe('bot de treino', () => {
  test('economiza elixir sem ameaças e com elixir baixo', () => {
    // Arrange
    const state = createBattleState();
    state.players.right.elixir = 4;

    // Act / Assert
    expect(decideBotAction(state, 'right')).toBeNull();
  });

  test('ataca a lane quando o elixir está alto', () => {
    // Arrange
    const state = createBattleState();
    state.players.right.elixir = 10;

    // Act
    const action = decideBotAction(state, 'right');

    // Assert — joga tropa no próprio campo, perto do rio
    expect(action).not.toBeNull();
    expect(action!.x).toBeGreaterThanOrEqual(DEPLOY_MIN_X_RIGHT);
  });

  test('defende jogando perto do invasor', () => {
    // Arrange
    const state = createBattleState();
    state.players.right.elixir = 5;
    state.players.left.elixir = 10;
    state.players.left.hand = ['cavaleiro', 'salteadores', 'arqueiras', 'gigante'];
    playCard(state, 'left', 'cavaleiro', 14, 4.5);
    // Move o cavaleiro para dentro do campo do bot
    const knight = Object.values(state.entities).find((e) => e.cardId === 'cavaleiro')!;
    knight.x = 22;

    // Act
    const action = decideBotAction(state, 'right');

    // Assert — resposta na mesma lane do invasor
    expect(action).not.toBeNull();
    expect(Math.abs(action!.y - knight.y)).toBeLessThan(3);
    expect(action!.x).toBeGreaterThanOrEqual(DEPLOY_MIN_X_RIGHT);
  });

  test('partida completa vs bot termina sem erros', () => {
    // Arrange — simula o loop do servidor com o bot jogando
    const state = createBattleState();
    let botCooldown = 0;

    // Act — 4 minutos de jogo acelerado
    for (let i = 0; i < (240 / TICK_DT) && state.phase !== 'ended'; i++) {
      botCooldown -= TICK_DT;
      if (botCooldown <= 0) {
        const action = decideBotAction(state, 'right');
        if (action) {
          playCard(state, 'right', action.cardId, action.x, action.y);
          botCooldown = 1.5;
        } else {
          botCooldown = 0.4;
        }
      }
      stepSimulation(state, TICK_DT);
    }

    // Assert — o bot causou dano real no lado esquerdo (torres perderam vida)
    const leftTowers = Object.values(state.entities).filter(
      (e) => e.side === 'left' && e.kind === 'tower',
    );
    const totalLeftHp = leftTowers.reduce((sum, t) => sum + t.hp, 0);
    const fullLeftHp = leftTowers.reduce((sum, t) => sum + t.maxHp, 0);
    expect(leftTowers.length === 0 || totalLeftHp < fullLeftHp).toBe(true);
  });

  test('nunca joga tropa fora da própria zona de deploy', () => {
    // Arrange
    const state = createBattleState();
    state.players.right.elixir = 10;

    // Act — várias decisões (cartas aleatórias)
    for (let i = 0; i < 20; i++) {
      const action = decideBotAction(state, 'right');
      if (!action) continue;
      // Assert
      expect(action.x).toBeGreaterThanOrEqual(RIVER_MIN_X);
    }
  });
});
