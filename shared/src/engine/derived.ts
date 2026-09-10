import type { CardDef } from './model';

/**
 * Atributos DERIVADOS — sempre calculados, nunca armazenados como fonte.
 * Base: componentes da carta. Resultado: leitura para UI e balanceamento.
 */
export interface DerivedStats {
  /** Dano por segundo de uma unidade (dano/hitSpeed) x quantidade */
  dps?: number;
  /** Vida efetiva: vida + escudo, x quantidade */
  effectiveHp?: number;
  /** Eficiência ofensiva: DPS por elixir */
  dpsPerElixir?: number;
  /** Eficiência defensiva: vida efetiva por elixir */
  hpPerElixir?: number;
  /** Dano total de um feitiço (dano direto + pulsos da zona) x alvos estimados */
  spellTotalDamage?: number;
  /** Unidades geradas ao longo da vida útil (spawners com lifetime) */
  totalSpawned?: number;
  /** Elixir total produzido durante a vida útil */
  totalElixirProduced?: number;
}

export function deriveStats(card: CardDef): DerivedStats {
  const c = card.components;
  const out: DerivedStats = {};
  const count = card.deployCount ?? 1;

  if (c.attack) {
    out.dps = round1((c.attack.damage / c.attack.hitSpeed) * count);
    if (card.cost > 0) out.dpsPerElixir = round1(out.dps / card.cost);
  }
  if (c.health) {
    out.effectiveHp = (c.health.hp + (c.health.shield ?? 0)) * count;
    if (card.cost > 0) out.hpPerElixir = round1(out.effectiveHp / card.cost);
  }
  if (c.spell) {
    const direct = c.spell.damage ?? 0;
    const zone = c.spell.zone
      ? c.spell.zone.pulseDamage * Math.floor(c.spell.zone.durationSeconds / c.spell.zone.pulseInterval)
      : 0;
    out.spellTotalDamage = direct + zone;
  }
  if (c.spawner && c.lifetime) {
    out.totalSpawned = Math.floor(c.lifetime.seconds / c.spawner.interval) * c.spawner.count;
  }
  if (c.resource && c.lifetime) {
    out.totalElixirProduced = Math.floor(c.lifetime.seconds / c.resource.elixirInterval);
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
