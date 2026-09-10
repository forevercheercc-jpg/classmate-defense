/**
 * Motor de cartas por COMPOSIÇÃO DE COMPONENTES.
 *
 * Uma carta é: identidade + lista de componentes opcionais. Nenhuma hierarquia
 * rígida — qualquer combinação de componentes é válida (sujeita à validação).
 * Novas mecânicas = novos componentes/gatilhos, sem tocar no núcleo.
 *
 * Atributos-base ficam nos componentes; atributos DERIVADOS (DPS, vida efetiva,
 * eficiência por elixir…) são calculados em `derived.ts` e nunca armazenados.
 */

export type CardType = 'troop' | 'building' | 'spell' | 'mirror' | (string & {});
export type Subtype =
  | 'tanque' | 'suporte' | 'enxame' | 'assassino' | 'condicao-de-vitoria'
  | 'gerador' | 'defesa' | 'controle' | 'dano-em-area' | 'utilidade'
  | (string & {});
export type Rarity = 'comum' | 'rara' | 'epica' | (string & {});
export type Tag =
  | 'terrestre' | 'aerea' | 'corpo-a-corpo' | 'longo-alcance' | 'geradora'
  | 'carregadora' | 'explosiva' | 'voadora' | 'cura' | 'escudo' | 'veneno'
  | (string & {});

// ===== Componentes (atributos-base) =====

export interface HealthComponent {
  hp: number;
  /** Escudo: camada consumida antes da vida */
  shield?: number;
  /** Vida recuperada por segundo */
  regenPerSecond?: number;
}

export interface MovementComponent {
  /** Tiles por segundo */
  speed: number;
  flying?: boolean;
  /** Atravessa o rio em qualquer ponto */
  jumpsRiver?: boolean;
}

export interface TargetingComponent {
  targets: 'any' | 'buildings';
  targetsAir?: boolean;
  /** Raio em que abandona a rota para atacar inimigos */
  aggroRange: number;
}

export interface AttackComponent {
  damage: number;
  /** Segundos entre ataques (menor = mais rápido = buff) */
  hitSpeed: number;
  /** Tiles (0.8 = corpo a corpo) */
  range: number;
  /** Raio de dano em área (0/ausente = alvo único) */
  splashRadius?: number;
  /** Fração do dano causado convertida em cura (0–1) */
  lifestealPct?: number;
  /** Vida recuperada ao eliminar um inimigo */
  healOnKill?: number;
}

export interface ChargeComponent {
  /** Tiles andados para armar a carga */
  distance: number;
  /** Multiplicador do golpe carregado */
  multiplier: number;
}

export interface SpawnerComponent {
  cardId: string;
  count: number;
  /** Segundos entre levas (maior = mais lento = nerf) */
  interval: number;
}

export interface DeathEffectComponent {
  spawn?: { cardId: string; count: number };
  damage?: { radius: number; damage: number };
}

export interface DeployEffectComponent {
  /** Dano em área ao entrar na arena */
  damage: number;
  radius: number;
}

export interface ResourceComponent {
  /** Coletor: +1 elixir a cada X segundos */
  elixirInterval: number;
}

export interface LifetimeComponent {
  /** Construções ruem sozinhas após X segundos */
  seconds: number;
}

export interface AuraComponent {
  radius: number;
  /** Cura contínua em aliados dentro do raio */
  healPerSecond?: number;
}

export interface ZoneComponent {
  /** Área persistente (veneno etc.) */
  durationSeconds: number;
  pulseDamage: number;
  pulseInterval: number;
}

export interface SpellComponent {
  radius: number;
  damage?: number;
  stunSeconds?: number;
  freezeSeconds?: number;
  rageSeconds?: number;
  spawn?: { cardId: string; count: number };
  /** Atinge só os N inimigos de maior vida no raio */
  multiTargetCount?: number;
  /** Deixa uma zona persistente no chão */
  zone?: ZoneComponent;
}

export interface AbilityComponent {
  /** Habilidade ativa de campeão */
  name: string;
  description: string;
  /** Custo em elixir para ativar */
  cost: number;
  /** Segundos entre ativações */
  cooldownSeconds: number;
  effect: {
    /** Ganha escudo ao ativar */
    shieldGain?: number;
    /** Fúria em si mesmo por N segundos */
    rageSelfSeconds?: number;
    /** Cura instantânea em si mesmo */
    healSelf?: number;
    /** Dano em área ao redor do campeão */
    damage?: number;
    radius?: number;
  };
}

export interface EvolutionComponent {
  /** Usos da carta necessários para carregar a evolução (o próximo uso sai evoluído) */
  cyclesRequired: number;
  /** Multiplicadores sobre os atributos-base (rebalanceáveis separadamente) */
  multipliers?: { hp?: number; damage?: number };
  /** Escudo extra na forma evoluída */
  bonusShield?: number;
}

export interface CardComponents {
  health?: HealthComponent;
  movement?: MovementComponent;
  targeting?: TargetingComponent;
  attack?: AttackComponent;
  charge?: ChargeComponent;
  spawner?: SpawnerComponent;
  deathEffect?: DeathEffectComponent;
  deployEffect?: DeployEffectComponent;
  resource?: ResourceComponent;
  lifetime?: LifetimeComponent;
  aura?: AuraComponent;
  spell?: SpellComponent;
  ability?: AbilityComponent;
  evolution?: EvolutionComponent;
  /** Extensão livre para mecânicas futuras sem alterar o núcleo */
  [custom: string]: unknown;
}

// ===== Carta =====

export interface CardDef {
  id: string;
  name: string;
  description: string;
  type: CardType;
  subtype: Subtype;
  rarity: Rarity;
  /** Custo em elixir (menor = buff) */
  cost: number;
  /** Condição de desbloqueio (arena/nível); null = disponível desde o início */
  unlock?: string;
  tags: Tag[];
  /** Unidades colocadas por uso */
  deployCount?: number;
  /** Cartas internas (invocadas por outras) fora da coleção/deck */
  hidden?: boolean;
  emoji: string;
  color: string;
  components: CardComponents;
  /** Propriedades exclusivas de cartas futuras */
  extras?: Record<string, unknown>;
}

// ===== Gatilhos =====

/**
 * Gatilhos disparados pela simulação. Handlers são registrados por componente;
 * novos gatilhos podem ser adicionados sem alterar os existentes.
 */
export type TriggerType =
  | 'onDeploy'
  | 'onTargetFound'
  | 'onAttack'
  | 'onDealDamage'
  | 'onTakeDamage'
  | 'onShieldBroken'
  | 'onKill'
  | 'onSpawnUnit'
  | 'onDeath'
  | 'onInterval'
  | 'onHpThreshold';

// ===== Validação =====

export interface ValidationIssue {
  cardId: string;
  field: string;
  message: string;
}

/** Regras de coerência: impedem valores sem sentido chegarem à simulação. */
export function validateCard(card: CardDef): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bad = (field: string, message: string) => issues.push({ cardId: card.id, field, message });
  const c = card.components;

  if (!card.id) bad('id', 'id vazio');
  if (card.cost < 0 || card.cost > 10) bad('cost', 'custo fora de 0–10');
  if (card.type === 'troop' || card.type === 'building') {
    if (!c.health || c.health.hp <= 0) bad('health.hp', 'tropa/construção precisa de vida > 0');
  }
  if (card.type === 'troop') {
    if (!c.movement || c.movement.speed <= 0) bad('movement.speed', 'tropa precisa de velocidade > 0');
    if (!c.targeting) bad('targeting', 'tropa precisa de targeting');
    if ((card.deployCount ?? 1) < 1) bad('deployCount', 'deployCount >= 1');
  }
  if (card.type === 'building' && !c.lifetime) bad('lifetime', 'construção precisa de lifetime');
  if (card.type === 'spell' && !c.spell) bad('spell', 'feitiço precisa do componente spell');
  if (card.type === 'champion') {
    if (!c.ability) bad('ability', 'campeão precisa de habilidade ativa');
    if (!c.health || !c.movement || !c.targeting) bad('components', 'campeão é uma tropa com habilidade');
    if ((card.deployCount ?? 1) !== 1) bad('deployCount', 'campeão é único');
  }
  if (c.ability) {
    if (c.ability.cost < 0 || c.ability.cost > 10) bad('ability.cost', 'custo da habilidade fora de 0–10');
    if (c.ability.cooldownSeconds <= 0) bad('ability.cooldownSeconds', 'recarga deve ser > 0');
  }
  if (c.evolution && c.evolution.cyclesRequired < 1) {
    bad('evolution.cyclesRequired', 'ciclos devem ser >= 1');
  }
  if (c.attack) {
    if (c.attack.damage < 0) bad('attack.damage', 'dano negativo');
    if (c.attack.hitSpeed <= 0) bad('attack.hitSpeed', 'hitSpeed deve ser > 0');
    if (c.attack.range <= 0) bad('attack.range', 'alcance deve ser > 0');
    if (c.attack.lifestealPct !== undefined && (c.attack.lifestealPct < 0 || c.attack.lifestealPct > 1)) {
      bad('attack.lifestealPct', 'roubo de vida fora de 0–1');
    }
  }
  if (c.spawner && c.spawner.interval <= 0) bad('spawner.interval', 'intervalo deve ser > 0');
  if (c.resource && c.resource.elixirInterval <= 0) bad('resource.elixirInterval', 'intervalo deve ser > 0');
  if (c.spell) {
    if (c.spell.radius <= 0) bad('spell.radius', 'raio deve ser > 0');
    if (c.spell.zone && c.spell.zone.pulseInterval <= 0) bad('spell.zone.pulseInterval', 'pulso deve ser > 0');
  }
  return issues;
}

export function validateAll(cards: Record<string, CardDef>): ValidationIssue[] {
  const issues = Object.values(cards).flatMap(validateCard);
  // Referências de invocação precisam existir
  for (const card of Object.values(cards)) {
    for (const ref of [
      card.components.spawner?.cardId,
      card.components.deathEffect?.spawn?.cardId,
      card.components.spell?.spawn?.cardId,
    ]) {
      if (ref && !cards[ref]) {
        issues.push({ cardId: card.id, field: 'spawn.cardId', message: `carta invocada "${ref}" não existe` });
      }
    }
  }
  return issues;
}
