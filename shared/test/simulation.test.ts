import { describe, expect, test } from 'vitest';
import {
  BATTLE_SECONDS, COUNTDOWN_SECONDS, ELIXIR_MAX, ELIXIR_START, GRID_H, HAND_SIZE, TICK_DT,
} from '../src/constants';
import { CARDS } from '../src/cards';
import { createInitialState, playCard } from '../src/sim/state';
import { stepSimulation } from '../src/sim/step';
import type { SimState } from '../src/types';

export function createBattleState(): SimState {
  const state = createInitialState();
  state.phase = 'countdown';
  for (let i = 0; i <= COUNTDOWN_SECONDS / TICK_DT; i++) {
    stepSimulation(state, TICK_DT);
  }
  return state;
}

export function runSeconds(state: SimState, seconds: number): void {
  const ticks = Math.ceil(seconds / TICK_DT);
  for (let i = 0; i < ticks && state.phase !== 'ended'; i++) {
    stepSimulation(state, TICK_DT);
  }
}

export function giveHand(state: SimState, side: 'left' | 'right', hand: string[]): void {
  state.players[side].hand = [...hand];
  state.players[side].queue = ['mago', 'bruxa', 'colosso', 'furia'];
  state.players[side].elixir = 10;
}

describe('estado inicial', () => {
  test('cria 3 torres por lado e mão de 4 cartas', () => {
    const state = createInitialState();
    const towers = Object.values(state.entities).filter((e) => e.kind === 'tower');
    expect(towers.filter((t) => t.side === 'left')).toHaveLength(3);
    expect(towers.filter((t) => t.side === 'right')).toHaveLength(3);
    expect(state.players.left.hand).toHaveLength(HAND_SIZE);
  });
});

describe('elixir', () => {
  test('regenera com o tempo até o máximo', () => {
    const state = createBattleState();
    state.players.left.elixir = 0;
    runSeconds(state, 5.6);
    expect(state.players.left.elixir).toBeCloseTo(2, 1);
    runSeconds(state, 60);
    expect(state.players.left.elixir).toBe(ELIXIR_MAX);
  });

  test('dobra no último minuto do tempo normal', () => {
    const state = createBattleState();
    state.timeRemaining = 59;
    state.players.left.elixir = 0;
    runSeconds(state, 2.8);
    expect(state.players.left.elixir).toBeGreaterThan(1.8);
  });

  test('bloqueia carta sem elixir suficiente', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['gigante', 'cavaleiro', 'arqueiras', 'esqueletos']);
    state.players.left.elixir = 1;
    const result = playCard(state, 'left', 'gigante', 5, 9);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/elixir/);
  });
});

describe('playCard', () => {
  test('desconta elixir, invoca unidades e cicla a mão', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['salteadores', 'cavaleiro', 'arqueiras', 'gigante']);
    const result = playCard(state, 'left', 'salteadores', 5, 9);
    expect(result.ok).toBe(true);
    expect(state.players.left.elixir).toBe(10 - CARDS.salteadores.cost);
    const spawned = Object.values(state.entities).filter((e) => e.cardId === 'salteadores');
    expect(spawned).toHaveLength(CARDS.salteadores.deployCount!);
    expect(state.players.left.queue.at(-1)).toBe('salteadores');
  });

  test('rejeita deploy de tropa no lado inimigo', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['cavaleiro', 'salteadores', 'arqueiras', 'gigante']);
    const result = playCard(state, 'left', 'cavaleiro', 25, 9);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/deploy/);
  });

  test('bola de fogo causa dano em área inclusive em torres', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['bolaDeFogo', 'salteadores', 'arqueiras', 'gigante']);
    const princess = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'princess',
    )!;
    const hpBefore = princess.hp;
    playCard(state, 'left', 'bolaDeFogo', princess.x, princess.y);
    expect(princess.hp).toBe(hpBefore - CARDS.bolaDeFogo.components.spell!.damage!);
  });
});

describe('combate e vitória', () => {
  test('gigante cruza a ponte e derruba a torre da princesa', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['gigante', 'salteadores', 'arqueiras', 'cavaleiro']);
    playCard(state, 'left', 'gigante', 14, 4.5);
    runSeconds(state, 90);
    const rightPrincessTop = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'princess' && e.y < GRID_H / 2,
    );
    expect(rightPrincessTop).toBeUndefined();
    expect(state.players.left.crowns).toBeGreaterThanOrEqual(1);
  });

  test('derrubou a princesa da lane → alvo passa a ser o REI, não a outra princesa', () => {
    const state = createBattleState();
    const topPrincess = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'princess' && e.y < GRID_H / 2,
    )!;
    delete state.entities[topPrincess.id];
    giveHand(state, 'left', ['cavaleiro', 'salteadores', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'cavaleiro', 14, 4.5);
    const knight = Object.values(state.entities).find((e) => e.cardId === 'cavaleiro')!;
    knight.x = 24;
    knight.y = 4.5;
    knight.deployingUntil = 0; // pula o tempo de implantação
    stepSimulation(state, TICK_DT);
    const target = state.entities[knight.targetId!];
    expect(target?.tower).toBe('king');
  });

  test('rei destruído encerra a partida com 3 coroas', () => {
    const state = createBattleState();
    const king = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'king',
    )!;
    king.hp = 0;
    stepSimulation(state, TICK_DT);
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('left');
    expect(state.players.left.crowns).toBe(3);
  });

  test('empate leva à morte súbita e depois ao desempate por drenagem', () => {
    const state = createBattleState();
    state.timeRemaining = 0.05;
    runSeconds(state, 0.2);
    expect(state.suddenDeath).toBe(true);
    // Fim da morte súbita ainda empatado: entra no desempate (drenagem), não em empate.
    state.timeRemaining = 0.05;
    runSeconds(state, 0.2);
    expect(state.tiebreaker).toBe(true);
    expect(state.phase).toBe('battle');
  });

  test('desempate: qualquer torre com menor % cai primeiro e faz o time perder', () => {
    const state = createBattleState();
    state.suddenDeath = true;
    state.tiebreaker = true;
    state.timeRemaining = 0;
    // Uma princesa da direita está bem fraca: cai primeiro → direita perde.
    const rightPrincess = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'princess',
    )!;
    rightPrincess.hp = 80;
    runSeconds(state, 6);
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('left');
  });

  test('desempate rápido: uma torre cheia esvazia em ~5s', () => {
    const state = createBattleState();
    state.suddenDeath = true;
    state.tiebreaker = true;
    state.timeRemaining = 0;
    // Direita com uma princesa levemente mais fraca decide, mas a partida
    // não pode passar de ~5s (todas as torres cheias esvaziam nesse tempo).
    const rp = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'princess',
    )!;
    rp.hp = rp.maxHp - 1;
    runSeconds(state, 5.2);
    expect(state.phase).toBe('ended');
  });

  test('desempate: empate quando os dois lados perdem torre no mesmo tick com vidas iguais', () => {
    const state = createBattleState();
    state.suddenDeath = true;
    state.tiebreaker = true;
    state.timeRemaining = 0;
    // Torres perfeitamente simétricas: caem juntas com vida total igual → empate.
    runSeconds(state, 6);
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('draw');
  });
});

describe('rei adormecido', () => {
  test('não ataca antes de tomar dano; acorda e revida', () => {
    const state = createBattleState();
    const king = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'king',
    )!;
    expect(king.dormant).toBe(true);
    giveHand(state, 'left', ['cavaleiro', 'salteadores', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'cavaleiro', 14, 9);
    const knight = Object.values(state.entities).find((e) => e.cardId === 'cavaleiro')!;
    knight.x = king.x + 1;
    knight.y = king.y - 0.5;
    stepSimulation(state, TICK_DT);
    expect(knight.hp).toBe(knight.maxHp);
    runSeconds(state, 2);
    expect(king.dormant).toBe(false);
    expect(knight.hp).toBeLessThan(knight.maxHp);
  });

  test('perder a princesa acorda o rei', () => {
    const state = createBattleState();
    const princess = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'princess',
    )!;
    const king = Object.values(state.entities).find(
      (e) => e.side === 'right' && e.tower === 'king',
    )!;
    princess.hp = 0;
    stepSimulation(state, TICK_DT);
    expect(king.dormant).toBe(false);
  });
});

describe('cronômetro', () => {
  test('countdown vira batalha com o tempo cheio', () => {
    const state = createInitialState();
    state.phase = 'countdown';
    runSeconds(state, COUNTDOWN_SECONDS + 0.5);
    expect(state.phase).toBe('battle');
    expect(state.timeRemaining).toBeLessThanOrEqual(BATTLE_SECONDS);
    expect(state.timeRemaining).toBeGreaterThan(BATTLE_SECONDS - 2);
  });
});
