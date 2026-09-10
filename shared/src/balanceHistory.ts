import type { BalanceChange } from './engine/balance';

/**
 * HISTÓRICO DE BALANCEAMENTO — fonte de dados, não código.
 * Cada entrada altera um atributo de carta sem tocar na definição da carta;
 * os patches são aplicados em ordem no carregamento do catálogo e o histórico
 * completo é exibido ao jogador na Coleção.
 *
 * Semântica: intervalos menores (hitSpeed, spawner.interval, cost) = buff.
 */
export const BALANCE_HISTORY: BalanceChange[] = [
  {
    cardId: 'gigante',
    form: 'normal',
    attribute: 'attack.damage',
    oldValue: 210,
    newValue: 225,
    kind: 'buff',
    justification: 'Winrate de 39% em 600 partidas simuladas — pior carta do catálogo.',
    expectedImpact: 'Pushes de Gigante ameaçam mais quando chegam à torre.',
    version: '1.1.0',
    date: '2026-07-14',
  },
  {
    cardId: 'cavaleiro',
    form: 'normal',
    attribute: 'health.hp',
    oldValue: 790,
    newValue: 760,
    kind: 'nerf',
    justification: 'Winrate de 57% em 600 partidas simuladas — presença excessiva.',
    expectedImpact: 'Perde trocas justas contra Executor e Valquíria.',
    version: '1.1.0',
    date: '2026-07-14',
  },
  {
    cardId: 'javali',
    form: 'normal',
    attribute: 'attack.hitSpeed',
    oldValue: 1.5,
    newValue: 1.6,
    kind: 'rework',
    justification: 'Com o salto sobre o rio, conectava golpes demais; em troca ganhou vida (ver entrada seguinte). Vantagem e desvantagem simultâneas.',
    expectedImpact: 'Menos dano por visita à torre, porém mais difícil de remover.',
    version: '1.1.0',
    date: '2026-07-14',
  },
  {
    cardId: 'javali',
    form: 'normal',
    attribute: 'health.hp',
    oldValue: 900,
    newValue: 980,
    kind: 'rework',
    justification: 'Parte 2 do rework do Javali de Guerra.',
    expectedImpact: 'Sobrevive a uma Bola de Fogo + um golpe de torre.',
    version: '1.1.0',
    date: '2026-07-14',
  },
  {
    "cardId": "canhao",
    "form": "normal",
    "attribute": "attack.damage",
    "oldValue": 110,
    "newValue": 118,
    "kind": "buff",
    "justification": "teste da ferramenta admin",
    "expectedImpact": "a validar em simulação (pnpm --filter @claude-royale/server balance)",
    "version": "1.1.x",
    "date": "2026-07-15"
  },
];
