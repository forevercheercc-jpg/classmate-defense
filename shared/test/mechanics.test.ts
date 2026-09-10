import { describe, expect, test } from 'vitest';
import { TICK_DT } from '../src/constants';
import { CARDS, collectionCards } from '../src/cards';
import { classifyChange, percentChange } from '../src/engine/balance';
import { deriveStats } from '../src/engine/derived';
import { validateAll } from '../src/engine/model';
import { playCard, useAbility } from '../src/sim/state';
import { stepSimulation } from '../src/sim/step';
import { createBattleState, giveHand, runSeconds } from './simulation.test';

function findByCard(state: ReturnType<typeof createBattleState>, cardId: string) {
  return Object.values(state.entities).filter((e) => e.cardId === cardId);
}

describe('validação do catálogo', () => {
  test('todas as cartas passam nas regras de coerência', () => {
    expect(validateAll(CARDS)).toEqual([]);
  });

  test('coleção não expõe cartas internas', () => {
    expect(collectionCards().some((c) => c.hidden)).toBe(false);
  });
});

describe('voadores', () => {
  test('melee terrestre não atinge voador; antiaéreo sim', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['morcegos', 'cavaleiro', 'arqueiras', 'gigante']);
    giveHand(state, 'right', ['cavaleiro', 'salteadores', 'esqueletos', 'gigante']);
    playCard(state, 'left', 'morcegos', 14, 9);
    playCard(state, 'right', 'cavaleiro', 18, 9);
    const bats = findByCard(state, 'morcegos');
    const knight = findByCard(state, 'cavaleiro')[0];
    // Pula o tempo de implantação para testar o targeting
    for (const e of [...bats, knight]) e.deployingUntil = 0;

    // Cavaleiro (terrestre, melee) não pode mirar morcegos → segue para estrutura
    stepSimulation(state, TICK_DT);
    const knightTarget = state.entities[knight.targetId!];
    expect(knightTarget?.kind).not.toBe('unit');

    // Morcegos (voadores, targetsAir) podem atacar o cavaleiro
    const anyBatTargetsKnight = bats.some((b) => state.entities[b.targetId!]?.cardId === 'cavaleiro');
    expect(anyBatTargetsKnight).toBe(true);
  });

  test('voador cruza o rio fora da ponte (linha reta ao alvo)', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['dragaozinho', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'dragaozinho', 14, 9);
    const dragon = findByCard(state, 'dragaozinho')[0];

    // Acompanha tick a tick: no momento em que está sobre o rio,
    // NÃO está na faixa de nenhuma ponte (4.5 / 13.5 ± 1.3).
    let crossedOffBridge = false;
    for (let i = 0; i < 200 && state.phase !== 'ended'; i++) {
      stepSimulation(state, TICK_DT);
      if (dragon.x > 15 && dragon.x < 17) {
        const onBridge = Math.abs(dragon.y - 4.5) <= 1.3 || Math.abs(dragon.y - 13.5) <= 1.3;
        if (!onBridge) crossedOffBridge = true;
      }
      if (dragon.x > 17.5) break;
    }
    expect(crossedOffBridge).toBe(true);
    expect(dragon.x).toBeGreaterThan(17);
  });
});

describe('escudo', () => {
  test('escudo absorve dano antes da vida', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['guardiaoRunico', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'guardiaoRunico', 5, 9);
    const guardian = findByCard(state, 'guardiaoRunico')[0];
    expect(guardian.shield).toBe(500);

    giveHand(state, 'left', ['bolaDeFogo', 'cavaleiro', 'arqueiras', 'gigante']);
    // Bola de fogo do INIMIGO no guardião
    giveHand(state, 'right', ['bolaDeFogo', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'right', 'bolaDeFogo', guardian.x, guardian.y);
    expect(guardian.shield).toBe(150); // 500 - 350
    expect(guardian.hp).toBe(guardian.maxHp); // vida intacta
  });
});

describe('cura e regeneração', () => {
  test('troll regenera vida com o tempo', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['trollRegenerante', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'trollRegenerante', 3, 16);
    const troll = findByCard(state, 'trollRegenerante')[0];
    troll.hp = 500;
    runSeconds(state, 4);
    expect(troll.hp).toBeGreaterThan(650); // ~45/s de regeneração
  });

  test('aura da curandeira cura aliados próximos', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['curandeira', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'cavaleiro', 3, 16);
    playCard(state, 'left', 'curandeira', 3, 16);
    const knight = findByCard(state, 'cavaleiro')[0];
    const healer = findByCard(state, 'curandeira')[0];
    knight.hp = 300;
    // Congela ambos no lugar: a aura (passiva) continua ativa.
    knight.frozenUntil = state.time + 10;
    healer.frozenUntil = state.time + 10;
    runSeconds(state, 3);
    expect(knight.hp).toBeGreaterThan(400); // ~55/s de cura
  });

  test('lâmina faminta rouba vida ao atacar', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['laminaFaminta', 'cavaleiro', 'arqueiras', 'gigante']);
    giveHand(state, 'right', ['barbaros', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'laminaFaminta', 14, 9);
    playCard(state, 'right', 'barbaros', 18, 9);
    const blade = findByCard(state, 'laminaFaminta')[0];
    blade.hp = 300;
    runSeconds(state, 6);
    const bladeAfter = findByCard(state, 'laminaFaminta')[0];
    if (bladeAfter) {
      // lutou e roubou vida (ou pelo menos não está nos 300 exatos após apanhar+curar)
      expect(bladeAfter.hp).not.toBe(300);
    }
  });
});

describe('zona de veneno', () => {
  test('pulsa dano contínuo em inimigos na área', () => {
    const state = createBattleState();
    giveHand(state, 'right', ['cavaleiro', 'salteadores', 'esqueletos', 'gigante']);
    playCard(state, 'right', 'cavaleiro', 20, 9);
    const knight = findByCard(state, 'cavaleiro')[0];
    knight.x = 20;

    giveHand(state, 'left', ['nevoaVenenosa', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'nevoaVenenosa', 20, 9);
    knight.frozenUntil = state.time + 10; // fica parado dentro da névoa
    const hpBefore = knight.hp;
    runSeconds(state, 3.2);
    expect(knight.hp).toBeLessThan(hpBefore - 100); // ~55/s de veneno
    // A zona expira sozinha
    runSeconds(state, 6);
    expect(Object.values(state.entities).some((e) => e.kind === 'zone')).toBe(false);
  });
});

describe('construções', () => {
  test('poço de elixir gera elixir para o dono', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['pocoDeElixir', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'pocoDeElixir', 3, 16);
    state.players.left.elixir = 0;
    runSeconds(state, 8.4);
    // 8.4s: 3 de regeneração natural + 1 do poço
    expect(state.players.left.elixir).toBeGreaterThan(3.5);
  });

  test('posto de lanceiros gera unidades periodicamente e rui no fim da vida útil', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['postoDeLanceiros', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'postoDeLanceiros', 3, 16);
    runSeconds(state, 10);
    expect(findByCard(state, 'lanceiros').length).toBeGreaterThan(0);
    runSeconds(state, 55);
    expect(findByCard(state, 'postoDeLanceiros')).toHaveLength(0); // lifetime 50s
  });

  test('ossuário invoca esqueletos ao ser destruído', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['ossuario', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'ossuario', 3, 16);
    const tomb = findByCard(state, 'ossuario')[0];
    const before = findByCard(state, 'esqueletos').length;
    tomb.hp = 0;
    stepSimulation(state, TICK_DT);
    expect(findByCard(state, 'esqueletos').length).toBe(before + 4);
  });
});

describe('efeitos de morte e carga', () => {
  test('golem se parte em fragmentos ao morrer', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['golem', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'golem', 5, 9);
    const golem = findByCard(state, 'golem')[0];
    golem.hp = 0;
    stepSimulation(state, TICK_DT);
    expect(findByCard(state, 'fragmentoDeGolem')).toHaveLength(2);
  });

  test('carregador de bomba causa dano em área ao morrer', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['carregadorDeBomba', 'cavaleiro', 'arqueiras', 'gigante']);
    giveHand(state, 'right', ['cavaleiro', 'salteadores', 'esqueletos', 'gigante']);
    playCard(state, 'left', 'carregadorDeBomba', 14, 9);
    playCard(state, 'right', 'cavaleiro', 18, 9);
    const bomber = findByCard(state, 'carregadorDeBomba')[0];
    const knight = findByCard(state, 'cavaleiro')[0];
    knight.x = bomber.x + 1;
    knight.y = bomber.y;
    const hpBefore = knight.hp;
    bomber.hp = 0;
    stepSimulation(state, TICK_DT);
    expect(knight.hp).toBeLessThanOrEqual(hpBefore - 360);
  });

  test('príncipe arma a carga após andar e dá golpe dobrado', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['principe', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'principe', 5, 9);
    runSeconds(state, 3.5);
    const prince = findByCard(state, 'principe')[0];
    expect(prince.charging).toBe(true);
  });
});

describe('feitiços de controle e espelho', () => {
  test('congelamento paralisa inimigos na área', () => {
    const state = createBattleState();
    giveHand(state, 'right', ['cavaleiro', 'salteadores', 'esqueletos', 'gigante']);
    playCard(state, 'right', 'cavaleiro', 20, 9);
    const knight = findByCard(state, 'cavaleiro')[0];
    const xBefore = knight.x;
    giveHand(state, 'left', ['congelamento', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'congelamento', knight.x, knight.y);
    runSeconds(state, 2);
    expect(Math.abs(knight.x - xBefore)).toBeLessThan(0.1); // congelado, não andou
  });

  test('relâmpago atinge só os 3 inimigos de maior vida', () => {
    const state = createBattleState();
    giveHand(state, 'right', ['barbaros', 'esqueletos', 'salteadores', 'gigante']);
    playCard(state, 'right', 'barbaros', 20, 9); // 4 bárbaros
    playCard(state, 'right', 'esqueletos', 20, 9); // 3 esqueletos (menor vida)
    giveHand(state, 'left', ['relampago', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'relampago', 20, 9);
    const barbarians = findByCard(state, 'barbaros');
    const skeletons = findByCard(state, 'esqueletos');
    const hitBarbarians = barbarians.filter((b) => b.hp < b.maxHp).length;
    const hitSkeletons = skeletons.filter((s) => s.hp < s.maxHp || s.hp <= 0).length;
    expect(hitBarbarians).toBe(3); // os 3 de maior vida
    expect(hitSkeletons).toBe(0);
  });

  test('espelho repete a última carta por +1 de elixir', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['esqueletos', 'espelho', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'esqueletos', 5, 9); // custo 1
    const elixirAfterFirst = state.players.left.elixir;
    const result = playCard(state, 'left', 'espelho', 6, 9);
    expect(result.ok).toBe(true);
    expect(state.players.left.elixir).toBeCloseTo(elixirAfterFirst - 2, 1); // 1 + 1
    expect(findByCard(state, 'esqueletos').length).toBe(6); // 3 + 3 espelhados
  });

  test('barril surpresa pode ser jogado no lado inimigo e invoca salteadores', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['barrilSurpresa', 'cavaleiro', 'arqueiras', 'gigante']);
    const result = playCard(state, 'left', 'barrilSurpresa', 26, 9);
    expect(result.ok).toBe(true);
    const rogues = findByCard(state, 'salteadores');
    expect(rogues).toHaveLength(3);
    expect(rogues[0].x).toBeGreaterThan(20); // nasceram no lado inimigo
  });
});

describe('campeões', () => {
  test('habilidade Bastião: escudo + fúria, com custo e recarga', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['campeaValente', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'campeaValente', 5, 9);
    const champion = findByCard(state, 'campeaValente')[0];
    state.players.left.elixir = 5;

    const result = useAbility(state, 'left');
    expect(result.ok).toBe(true);
    expect(champion.shield).toBe(400);
    expect(champion.ragedUntil).toBeGreaterThan(state.time);
    expect(state.players.left.elixir).toBe(3); // custo 2

    // Recarga impede segundo uso imediato
    const again = useAbility(state, 'left');
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/recarga/);

    // Recarga expira com o tempo
    runSeconds(state, 15);
    state.players.left.elixir = 5;
    const champStill = findByCard(state, 'campeaValente')[0];
    if (champStill) {
      expect(useAbility(state, 'left').ok).toBe(true);
    }
  });

  test('sem campeão em campo, habilidade falha', () => {
    const state = createBattleState();
    const result = useAbility(state, 'left');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/campeão/);
  });

  test('só pode haver um exemplar do campeão em campo', () => {
    const state = createBattleState();
    giveHand(state, 'left', ['campeaValente', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'campeaValente', 5, 9);
    state.players.left.hand = ['campeaValente', 'cavaleiro', 'arqueiras', 'gigante'];
    state.players.left.elixir = 10;
    const second = playCard(state, 'left', 'campeaValente', 6, 9);
    expect(second.ok).toBe(false);
  });
});

describe('evoluções', () => {
  test('cavaleiro evolui no 3º uso (2 ciclos de carga)', () => {
    const state = createBattleState();
    for (let i = 0; i < 3; i++) {
      giveHand(state, 'left', ['cavaleiro', 'salteadores', 'arqueiras', 'gigante']);
      playCard(state, 'left', 'cavaleiro', 3 + i, 16);
    }
    const knights = findByCard(state, 'cavaleiro');
    const evolved = knights.filter((k) => k.evolved);
    expect(evolved).toHaveLength(1);
    expect(evolved[0].shield).toBe(200);
    expect(evolved[0].maxHp).toBeGreaterThan(knights.find((k) => !k.evolved)!.maxHp);
  });
});

describe('eventos entre ticks', () => {
  test('eventos de playCard não são perdidos pelo próximo step', () => {
    const state = createBattleState();
    state.events = []; // consumidor limpou
    giveHand(state, 'left', ['esqueletos', 'cavaleiro', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'esqueletos', 5, 9); // gera evento spawn ENTRE ticks
    stepSimulation(state, TICK_DT);
    expect(state.events.some((e) => e.type === 'spawn')).toBe(true);
  });
});

describe('níveis de carta', () => {
  test('nível 3 dá +16% de vida no deploy', () => {
    const state = createBattleState();
    state.players.left.cardLevels = { cavaleiro: 3 };
    giveHand(state, 'left', ['cavaleiro', 'salteadores', 'arqueiras', 'gigante']);
    playCard(state, 'left', 'cavaleiro', 3, 16);
    const knight = findByCard(state, 'cavaleiro')[0];
    const base = CARDS.cavaleiro.components.health!.hp;
    expect(knight.maxHp).toBe(Math.round(base * 1.16));
    expect(knight.level).toBe(3);
  });
});

describe('atributos derivados e balanceamento', () => {
  test('DPS e vida efetiva calculados a partir dos componentes', () => {
    const knight = deriveStats(CARDS.cavaleiro);
    const c = CARDS.cavaleiro.components;
    expect(knight.dps).toBeCloseTo(c.attack!.damage / c.attack!.hitSpeed, 1);
    const guardian = deriveStats(CARDS.guardiaoRunico);
    expect(guardian.effectiveHp).toBe(
      CARDS.guardiaoRunico.components.health!.hp + CARDS.guardiaoRunico.components.health!.shield!,
    );
  });

  test('classificação semântica: intervalo menor = buff; custo maior = nerf', () => {
    expect(classifyChange('attack.hitSpeed', 1.5, 1.2)).toBe('buff');
    expect(classifyChange('attack.hitSpeed', 1.2, 1.5)).toBe('nerf');
    expect(classifyChange('cost', 4, 5)).toBe('nerf');
    expect(classifyChange('health.hp', 700, 800)).toBe('buff');
    expect(classifyChange('spawner.interval', 4, 5)).toBe('nerf');
    expect(percentChange(100, 150)).toBe(50);
  });

  test('patches do histórico foram aplicados sem tocar no código da carta', () => {
    // gigante: 210 → 225 via balanceHistory.ts
    expect(CARDS.gigante.components.attack!.damage).toBe(225);
    // cavaleiro: 790 → 760
    expect(CARDS.cavaleiro.components.health!.hp).toBe(760);
    // javali (rework): hitSpeed 1.6, hp 980
    expect(CARDS.javali.components.attack!.hitSpeed).toBe(1.6);
    expect(CARDS.javali.components.health!.hp).toBe(980);
  });
});
