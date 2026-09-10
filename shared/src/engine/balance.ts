import type { CardDef } from './model';

/**
 * Balanceamento versionado: os valores das cartas mudam por PATCHES de dados,
 * nunca editando o código da carta. Cada patch registra o antes/depois, a
 * classificação semântica (buff/nerf/rework…) e a justificativa — e o
 * histórico fica legível para o jogador na Coleção.
 */

export type ChangeKind = 'buff' | 'nerf' | 'rework' | 'correcao' | 'padronizacao';

export interface BalanceChange {
  cardId: string;
  /** normal | evolucao | heroi | habilidade | unidade-invocada (futuro) */
  form: string;
  /** Caminho do atributo dentro de components, ex.: "attack.damage" */
  attribute: string;
  oldValue: number;
  newValue: number;
  kind: ChangeKind;
  justification: string;
  expectedImpact: string;
  version: string;
  date: string; // ISO
}

/** Variação percentual (positiva = valor subiu). */
export function percentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : 100;
  return Math.round(((newValue - oldValue) / Math.abs(oldValue)) * 1000) / 10;
}

/**
 * Semântica por atributo: para a maioria, MAIOR é melhor (buff).
 * Para intervalos (hitSpeed, spawner.interval, custo…), MENOR é melhor.
 */
const LOWER_IS_BETTER = [
  'cost',
  'attack.hitSpeed',
  'spawner.interval',
  'resource.elixirInterval',
  'charge.distance',
  'spell.zone.pulseInterval',
];

/** Classifica automaticamente uma mudança simples pela semântica do atributo. */
export function classifyChange(attribute: string, oldValue: number, newValue: number): ChangeKind {
  if (oldValue === newValue) return 'padronizacao';
  const lowerIsBetter = LOWER_IS_BETTER.some((prefix) => attribute === prefix || attribute.endsWith(prefix));
  const increased = newValue > oldValue;
  return lowerIsBetter === increased ? 'nerf' : 'buff';
}

/** Lê um atributo por caminho ("attack.damage") dentro da carta. */
export function getAttribute(card: CardDef, attribute: string): number | undefined {
  if (attribute === 'cost') return card.cost;
  let node: any = card.components;
  const parts = attribute.split('.');
  for (const part of parts) {
    if (node === undefined || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'number' ? node : undefined;
}

/** Escreve um atributo por caminho. Retorna false se o caminho não existir. */
export function setAttribute(card: CardDef, attribute: string, value: number): boolean {
  if (attribute === 'cost') {
    card.cost = value;
    return true;
  }
  let node: any = card.components;
  const parts = attribute.split('.');
  for (const part of parts.slice(0, -1)) {
    if (node[part] === undefined || node[part] === null) return false;
    node = node[part];
  }
  const leaf = parts[parts.length - 1];
  if (typeof node[leaf] !== 'number') return false;
  node[leaf] = value;
  return true;
}

/**
 * Aplica os patches em ordem sobre as cartas (mutação intencional no load).
 * Retorna os patches que não puderam ser aplicados.
 */
export function applyBalancePatches(
  cards: Record<string, CardDef>,
  patches: BalanceChange[],
): BalanceChange[] {
  const failed: BalanceChange[] = [];
  for (const patch of patches) {
    const card = cards[patch.cardId];
    if (!card || !setAttribute(card, patch.attribute, patch.newValue)) {
      failed.push(patch);
    }
  }
  return failed;
}
