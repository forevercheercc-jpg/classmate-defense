import {
  BATTLE_SECONDS, BRIDGE_HALF_HEIGHT, BRIDGE_YS, CORE_DAMAGE, CORE_RANGE,
  DOUBLE_ELIXIR_LAST_SECONDS, ELIXIR_MAX, ELIXIR_PER_SECOND, GRID_H, KING_TOWER,
  LANE_COUNT, MOB_STATS, PRINCESS_TOWER, PROJECTILE_SPEED, RIVER_CENTER_X,
  RIVER_MAX_X, RIVER_MIN_X, SUDDEN_DEATH_ELIXIR_MULTIPLIER, SUDDEN_DEATH_SECONDS,
  TIEBREAKER_DRAIN_SECONDS, TOWER_RADIUS, UNIT_RADIUS, WAVES_M0, WAVE_BREAK_SECONDS,
} from '../constants';
import { getCard, levelMultiplier } from '../cards';
import type { AttackComponent, CardComponents, TargetingComponent } from '../engine/model';
import { applyDamage, spawnMob, spawnUnits } from './state';
import type { MobVariant, Side, SimEntity, SimState } from '../types';

const RAGE_FACTOR = 1.35;
const CHARGE_SPEED_FACTOR = 1.6;

function comp(entity: SimEntity): CardComponents | undefined {
  return entity.cardId ? getCard(entity.cardId)?.components : undefined;
}

/**
 * Avança a simulação em dt segundos. Chamado pelo servidor a cada tick.
 * NÃO limpa `state.events`: quem consome (servidor/testes) deve limpar após
 * ler — assim eventos gerados por playCard/useAbility entre ticks não se perdem.
 */
export function stepSimulation(state: SimState, dt: number): void {
  state.tick++;

  if (state.phase === 'waiting' || state.phase === 'ended') return;

  // 防守模式分叉：避开圣水/手牌/桥逻辑，走自己的步进
  if (state.defense) {
    stepDefense(state, dt);
    return;
  }

  if (state.phase === 'countdown') {
    state.timeRemaining -= dt;
    if (state.timeRemaining <= 0) {
      state.phase = 'battle';
      state.timeRemaining = BATTLE_SECONDS;
    }
    return;
  }

  state.time += dt;
  regenerateElixir(state, dt);
  resolvePendingHits(state);

  for (const entity of Object.values(state.entities)) {
    if (entity.kind === 'zone') {
      stepZone(state, entity, dt);
      continue;
    }
    stepPassives(state, entity, dt);
    if (isDisabled(state, entity)) {
      entity.action = 'idle';
      continue;
    }
    if (entity.kind === 'unit') stepUnit(state, entity, dt);
    else if (entity.kind === 'building') stepBuilding(state, entity, dt);
    else stepTower(state, entity, dt);
  }

  separateUnits(state);
  removeDeadEntities(state);
  updateClock(state, dt);
}

/** Congelado, atordoado ou ainda "nascendo": não age. */
function isDisabled(state: SimState, entity: SimEntity): boolean {
  return (
    (entity.frozenUntil !== undefined && entity.frozenUntil > state.time) ||
    (entity.stunnedUntil !== undefined && entity.stunnedUntil > state.time) ||
    (entity.deployingUntil !== undefined && entity.deployingUntil > state.time)
  );
}

/** Aplica o dano dos projéteis que chegaram ao destino neste tick. */
function resolvePendingHits(state: SimState): void {
  if (!state.pendingHits?.length) return;
  const due = state.pendingHits.filter((hit) => hit.at <= state.time);
  if (due.length === 0) return;
  state.pendingHits = state.pendingHits.filter((hit) => hit.at > state.time);

  for (const hit of due) {
    let dealt = 0;
    let kills = 0;
    if (hit.splashRadius && hit.splashRadius > 0) {
      for (const entity of Object.values(state.entities)) {
        if (entity.side === hit.side || entity.hp <= 0 || entity.kind === 'zone') continue;
        if (entity.flying && hit.targetsAir !== true) continue;
        const d = Math.hypot(entity.x - hit.x, entity.y - hit.y);
        if (d <= hit.splashRadius + UNIT_RADIUS) {
          dealt += applyDamage(state, entity, hit.damage);
          if (entity.hp <= 0) kills++;
          if (entity.kind === 'tower') state.events.push({ type: 'towerHit', x: entity.x, y: entity.y });
        }
      }
    } else if (hit.targetId) {
      const target = state.entities[hit.targetId];
      if (target && target.hp > 0) {
        dealt += applyDamage(state, target, hit.damage);
        if (target.hp <= 0) kills++;
        if (target.kind === 'tower') state.events.push({ type: 'towerHit', x: target.x, y: target.y });
      }
    }
    // Roubo de vida / cura por abate valem se o atacante ainda estiver vivo
    const attacker = hit.attackerId ? state.entities[hit.attackerId] : undefined;
    if (attacker && attacker.hp > 0) {
      const heal = dealt * (hit.lifestealPct ?? 0) + kills * (hit.healOnKill ?? 0);
      if (heal > 0) attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    }
  }
}

/** Agenda o dano para o momento do impacto do projétil. */
function fireProjectile(
  state: SimState,
  attacker: SimEntity,
  target: SimEntity,
  damage: number,
  opts: { splashRadius?: number; targetsAir?: boolean; lifestealPct?: number; healOnKill?: number },
): void {
  const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
  state.events.push({
    type: 'projectile',
    fromX: attacker.x, fromY: attacker.y,
    toX: target.x, toY: target.y,
    kind: attacker.kind === 'unit' ? 'arrow' : 'bolt',
  });
  state.pendingHits ??= [];
  state.pendingHits.push({
    at: state.time + dist / PROJECTILE_SPEED,
    targetId: opts.splashRadius ? undefined : target.id,
    x: target.x,
    y: target.y,
    damage,
    splashRadius: opts.splashRadius,
    targetsAir: opts.targetsAir,
    side: attacker.side,
    attackerId: attacker.id,
    lifestealPct: opts.lifestealPct,
    healOnKill: opts.healOnKill,
  });
}

function isRaged(state: SimState, entity: SimEntity): boolean {
  return entity.ragedUntil !== undefined && entity.ragedUntil > state.time;
}

/** Elixir em dobro no último minuto do tempo normal e na morte súbita. */
export function isDoubleElixir(state: SimState): boolean {
  if (state.phase !== 'battle') return false;
  return state.suddenDeath || state.timeRemaining <= DOUBLE_ELIXIR_LAST_SECONDS;
}

function regenerateElixir(state: SimState, dt: number): void {
  const rate = ELIXIR_PER_SECOND * (isDoubleElixir(state) ? SUDDEN_DEATH_ELIXIR_MULTIPLIER : 1);
  for (const player of Object.values(state.players)) {
    player.elixir = Math.min(ELIXIR_MAX, player.elixir + rate * dt);
  }
}

/** Efeitos passivos que rodam mesmo congelado não... regen/aura rodam sempre que vivo. */
function stepPassives(state: SimState, entity: SimEntity, dt: number): void {
  const c = comp(entity);
  if (!c) return;
  // Regeneração própria
  if (c.health?.regenPerSecond && entity.hp > 0) {
    entity.hp = Math.min(entity.maxHp, entity.hp + c.health.regenPerSecond * dt);
  }
  // Aura de cura em aliados
  if (c.aura?.healPerSecond) {
    for (const ally of Object.values(state.entities)) {
      if (ally.side !== entity.side || ally.id === entity.id) continue;
      if (ally.kind !== 'unit' || ally.hp <= 0) continue;
      const d = Math.hypot(ally.x - entity.x, ally.y - entity.y);
      if (d <= c.aura.radius) {
        ally.hp = Math.min(ally.maxHp, ally.hp + c.aura.healPerSecond * dt);
      }
    }
  }
}

/** Zona persistente (veneno): pulsa dano em inimigos na área até expirar. */
function stepZone(state: SimState, zone: SimEntity, dt: number): void {
  const spellZone = comp(zone)?.spell?.zone;
  if (!spellZone) return;
  zone.lifetime = (zone.lifetime ?? spellZone.durationSeconds) - dt;
  if (zone.lifetime <= 0) {
    zone.hp = 0;
    return;
  }
  zone.pulseCooldown = (zone.pulseCooldown ?? spellZone.pulseInterval) - dt;
  if (zone.pulseCooldown > 0) return;
  zone.pulseCooldown = spellZone.pulseInterval;
  const radius = comp(zone)?.spell?.radius ?? 2;
  for (const entity of Object.values(state.entities)) {
    if (entity.side === zone.side || entity.hp <= 0 || entity.kind === 'zone') continue;
    const d = Math.hypot(entity.x - zone.x, entity.y - zone.y);
    if (d <= radius + UNIT_RADIUS) {
      applyDamage(state, entity, spellZone.pulseDamage);
    }
  }
}

// ===== Unidades =====

function stepUnit(state: SimState, unit: SimEntity, dt: number): void {
  const c = comp(unit);
  if (!c?.movement || !c.targeting) return;

  const raged = isRaged(state, unit);
  unit.attackCooldown = Math.max(0, unit.attackCooldown - dt * (raged ? RAGE_FACTOR : 1));
  if (unit.abilityCooldown !== undefined) {
    unit.abilityCooldown = Math.max(0, unit.abilityCooldown - dt);
  }

  runSpawner(state, unit, c.spawner, dt);

  // Suportes sem ataque (Curandeira) apenas seguem o objetivo.
  const target = acquireTarget(state, unit, c.targeting, c.attack);
  if (!target) {
    unit.action = 'idle';
    return;
  }
  unit.targetId = target.id;

  const targetRadius = target.kind === 'tower' ? TOWER_RADIUS : UNIT_RADIUS;
  const dist = Math.hypot(target.x - unit.x, target.y - unit.y) - targetRadius;

  if (c.attack && dist <= c.attack.range) {
    unit.action = 'attack';
    unit.facing = target.x >= unit.x ? 1 : -1;
    if (unit.attackCooldown === 0) {
      const isRanged = c.attack.range > 2;
      if (isRanged) {
        // Dano viaja com o projétil e acontece no impacto.
        const damage = Math.round(
          c.attack.damage *
            levelMultiplier(unit.level) *
            (unit.evolved && c.evolution?.multipliers?.damage ? c.evolution.multipliers.damage : 1),
        );
        fireProjectile(state, unit, target, damage, {
          splashRadius: c.attack.splashRadius,
          targetsAir: c.targeting?.targetsAir,
          lifestealPct: c.attack.lifestealPct,
          healOnKill: c.attack.healOnKill,
        });
      } else {
        dealAttack(state, unit, target, c, false);
      }
      unit.attackCooldown = c.attack.hitSpeed;
    }
    return;
  }

  const followDistance = c.attack ? 0 : 2.5; // curandeira segue de perto, sem grudar
  if (!c.attack && dist <= followDistance) {
    unit.action = 'idle';
    return;
  }

  let speed = c.movement.speed * (raged ? RAGE_FACTOR : 1);
  if (c.charge && unit.charging) speed *= CHARGE_SPEED_FACTOR;
  moveToward(unit, target, speed * dt, c);

  // Carga: acumula distância andada; arma após `distance` tiles.
  if (c.charge) {
    unit.walked = (unit.walked ?? 0) + speed * dt;
    if (!unit.charging && unit.walked >= c.charge.distance) {
      unit.charging = true;
    }
  }
}

function dealAttack(
  state: SimState,
  attacker: SimEntity,
  target: SimEntity,
  c: CardComponents,
  _ranged: boolean,
): void {
  const attack = c.attack!;
  let damage = attack.damage * levelMultiplier(attacker.level);
  // Forma evoluída: multiplicador de dano próprio.
  if (attacker.evolved && c.evolution?.multipliers?.damage) {
    damage *= c.evolution.multipliers.damage;
  }
  // Golpe de carga: dano multiplicado e reinicia a carga.
  if (c.charge && attacker.charging) {
    damage *= c.charge.multiplier;
    attacker.charging = false;
  }
  if (c.charge) attacker.walked = 0;

  const victims: SimEntity[] = [];
  if (attack.splashRadius && attack.splashRadius > 0) {
    for (const entity of Object.values(state.entities)) {
      if (entity.side === attacker.side || entity.kind === 'zone') continue;
      if (entity.flying && c.targeting?.targetsAir !== true) continue;
      const d = Math.hypot(entity.x - target.x, entity.y - target.y);
      if (d <= attack.splashRadius + UNIT_RADIUS) victims.push(entity);
    }
  } else {
    victims.push(target);
  }

  let dealt = 0;
  let kills = 0;
  for (const victim of victims) {
    dealt += applyDamage(state, victim, damage);
    if (victim.hp <= 0) kills++;
    if (victim.kind === 'tower') {
      state.events.push({ type: 'towerHit', x: victim.x, y: victim.y });
    }
    // Knockback: golpes corpo a corpo empurram o alvo (peso do impacto)
    if (victim.kind === 'unit') {
      const dx = victim.x - attacker.x;
      const dy = victim.y - attacker.y;
      const len = Math.hypot(dx, dy) || 1;
      const push = Math.min(0.45, damage / 400);
      applyPush(victim, (dx / len) * push, (dy / len) * push);
    }
  }

  // Roubo de vida e cura por eliminação (gatilhos onDealDamage / onKill)
  const heal = dealt * (attack.lifestealPct ?? 0) + kills * (attack.healOnKill ?? 0);
  if (heal > 0) {
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
  }
}

/** O atacante consegue atingir este alvo? (regra ar/terra) */
function canHit(targeting: TargetingComponent, target: SimEntity): boolean {
  if (!target.flying) return true;
  return targeting.targetsAir === true;
}

/** Alvo atual: inimigo válido mais próximo dentro do aggro, senão a torre/construção objetivo. */
function acquireTarget(
  state: SimState,
  unit: SimEntity,
  targeting: TargetingComponent,
  attack: AttackComponent | undefined,
): SimEntity | undefined {
  let best: SimEntity | undefined;
  let bestDist = Infinity;
  const unitLaneTop = unit.y < GRID_H / 2;

  // Suporte sem ataque: segue o aliado mais avançado, senão a torre inimiga.
  if (!attack) {
    for (const entity of Object.values(state.entities)) {
      if (entity.side !== unit.side || entity.kind !== 'unit' || entity.id === unit.id) continue;
      const dist = Math.hypot(entity.x - unit.x, entity.y - unit.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = entity;
      }
    }
    if (best) return best;
  }

  bestDist = Infinity;
  for (const entity of Object.values(state.entities)) {
    if (entity.side === unit.side || entity.hp <= 0 || entity.kind === 'zone') continue;
    const isStructure = entity.kind !== 'unit';
    if (targeting.targets === 'buildings' && !isStructure) continue;
    if (!canHit(targeting, entity)) continue;
    // Princesa da OUTRA lane não é objetivo: derrubou a da sua lane → vai pro rei.
    if (entity.tower === 'princess' && (entity.y < GRID_H / 2) !== unitLaneTop) continue;
    const dist = Math.hypot(entity.x - unit.x, entity.y - unit.y);
    // Estruturas são sempre objetivos; unidades só dentro do raio de aggro.
    if (!isStructure && dist > targeting.aggroRange) continue;
    // Unidades próximas têm prioridade sobre estruturas distantes.
    const weighted = isStructure ? dist + 4 : dist;
    if (weighted < bestDist) {
      bestDist = weighted;
      best = entity;
    }
  }
  return best;
}

/** Move em direção ao alvo. Voadores e quem salta o rio ignoram as pontes. */
function moveToward(unit: SimEntity, target: SimEntity, stepDist: number, c: CardComponents): void {
  let dest = { x: target.x, y: target.y };
  const ignoresRiver = unit.flying === true || c.movement?.jumpsRiver === true;

  if (!ignoresRiver) {
    if (isInRiverBand(unit.x) && !isOnAnyBridge(unit.y)) {
      // Caiu na água fora da ponte (não deveria acontecer): sai pela margem mais próxima.
      const exitX = unit.x >= RIVER_CENTER_X ? RIVER_MAX_X + 0.4 : RIVER_MIN_X - 0.4;
      dest = { x: exitX, y: unit.y };
    } else if (needsBridge(unit, target)) {
      const bridgeY = nearestBridgeY(unit.y);
      if (!isOnBridgeBand(unit.y, bridgeY) || !isInRiverBand(unit.x)) {
        // Caminha até a entrada da ponte no próprio lado antes de cruzar.
        const entranceX = unit.side === 'left' ? RIVER_MIN_X - 0.3 : RIVER_MAX_X + 0.3;
        dest = isOnBridgeBand(unit.y, bridgeY)
          ? { x: RIVER_CENTER_X, y: bridgeY }
          : { x: hasCrossedRiver(unit) ? dest.x : entranceX, y: bridgeY };
      }
    }
  }

  const dx = dest.x - unit.x;
  const dy = dest.y - unit.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const move = Math.min(stepDist, len);
  const prevX = unit.x;
  unit.x += (dx / len) * move;
  unit.y += (dy / len) * move;
  // Nunca entra na água fora da ponte: desliza ao longo da margem (só Y).
  if (!ignoresRiver && isInRiverBand(unit.x) && !isOnAnyBridge(unit.y) && !isInRiverBand(prevX)) {
    unit.x = prevX;
  }
  unit.action = 'walk';
  unit.facing = dx >= 0 ? 1 : -1;
}

function isOnAnyBridge(y: number): boolean {
  return BRIDGE_YS.some((bridgeY) => Math.abs(y - bridgeY) <= BRIDGE_HALF_HEIGHT);
}

function needsBridge(unit: SimEntity, target: SimEntity): boolean {
  const crossesRiver =
    (unit.x < RIVER_MIN_X && target.x > RIVER_MAX_X) ||
    (unit.x > RIVER_MAX_X && target.x < RIVER_MIN_X) ||
    isInRiverBand(unit.x);
  return crossesRiver;
}

function hasCrossedRiver(unit: SimEntity): boolean {
  return unit.side === 'left' ? unit.x > RIVER_MAX_X : unit.x < RIVER_MIN_X;
}

function isInRiverBand(x: number): boolean {
  return x >= RIVER_MIN_X && x <= RIVER_MAX_X;
}

function isOnBridgeBand(y: number, bridgeY: number): boolean {
  return Math.abs(y - bridgeY) <= BRIDGE_HALF_HEIGHT;
}

function nearestBridgeY(y: number): number {
  return Math.abs(y - BRIDGE_YS[0]) <= Math.abs(y - BRIDGE_YS[1]) ? BRIDGE_YS[0] : BRIDGE_YS[1];
}

// ===== Construções =====

function stepBuilding(state: SimState, building: SimEntity, dt: number): void {
  const c = comp(building);
  if (!c?.lifetime) return;

  // Decaimento: rui sozinha ao fim da vida útil.
  building.lifetime = (building.lifetime ?? c.lifetime.seconds) - dt;
  if (building.lifetime <= 0) {
    building.hp = 0;
    return;
  }

  runSpawner(state, building, c.spawner, dt);

  // Produção de elixir
  if (c.resource) {
    building.elixirCooldown = (building.elixirCooldown ?? c.resource.elixirInterval) - dt;
    if (building.elixirCooldown <= 0) {
      building.elixirCooldown = c.resource.elixirInterval;
      const player = state.players[building.side];
      player.elixir = Math.min(ELIXIR_MAX, player.elixir + 1);
    }
  }

  // Construções que atacam
  if (!c.attack || !c.targeting) {
    building.action = 'idle';
    return;
  }
  building.attackCooldown = Math.max(0, building.attackCooldown - dt);
  const target = nearestEnemyUnit(state, building, c.attack.range, c.targeting.targetsAir === true);
  if (!target) {
    building.action = 'idle';
    return;
  }
  building.action = 'attack';
  building.facing = target.x >= building.x ? 1 : -1;
  if (building.attackCooldown === 0) {
    const damage = Math.round(c.attack.damage * levelMultiplier(building.level));
    fireProjectile(state, building, target, damage, {
      splashRadius: c.attack.splashRadius,
      targetsAir: c.targeting.targetsAir,
    });
    building.attackCooldown = c.attack.hitSpeed;
  }
}

/** Spawner periódico (Bruxa, cabanas, Ossuário). */
function runSpawner(
  state: SimState,
  owner: SimEntity,
  spawner: { cardId: string; count: number; interval: number } | undefined,
  dt: number,
): void {
  if (!spawner) return;
  owner.spawnCooldown = (owner.spawnCooldown ?? spawner.interval) - dt;
  if (owner.spawnCooldown > 0) return;
  owner.spawnCooldown = spawner.interval;
  // Invoca à frente da estrutura, na direção do inimigo.
  const forward = owner.side === 'left' ? 1.2 : -1.2;
  spawnUnits(state, owner.side, spawner.cardId, owner.x + forward, owner.y, spawner.count);
}

function nearestEnemyUnit(
  state: SimState,
  from: SimEntity,
  range: number,
  targetsAir: boolean,
): SimEntity | undefined {
  let best: SimEntity | undefined;
  let bestDist = Infinity;
  for (const entity of Object.values(state.entities)) {
    if (entity.side === from.side || entity.kind !== 'unit' || entity.hp <= 0) continue;
    if (entity.flying && !targetsAir) continue;
    const dist = Math.hypot(entity.x - from.x, entity.y - from.y);
    if (dist <= range && dist < bestDist) {
      bestDist = dist;
      best = entity;
    }
  }
  return best;
}

// ===== Torres =====

function stepTower(state: SimState, tower: SimEntity, dt: number): void {
  // Rei acorda ao tomar o primeiro dano (perder princesa também acorda, em removeDeadEntities).
  if (tower.dormant) {
    if (tower.hp < tower.maxHp) {
      tower.dormant = false;
    } else {
      tower.action = 'idle';
      return;
    }
  }

  // 防守模式：核心（king 且 side='left'）走 CORE stats；点位沿用 princess；原 CR 路径不变
  const isCore = state.defense === true
    && tower.tower === 'king'
    && tower.side === 'left';
  const base = isCore
    ? { damage: CORE_DAMAGE, range: CORE_RANGE, hitSpeed: 1.0 }
    : (tower.tower === 'king' ? KING_TOWER : PRINCESS_TOWER);

  tower.attackCooldown = Math.max(0, tower.attackCooldown - dt);

  const best = nearestEnemyUnit(state, tower, base.range, true);
  if (!best) {
    tower.action = 'idle';
    return;
  }
  tower.action = 'attack';
  if (tower.attackCooldown === 0) {
    fireProjectile(state, tower, best, base.damage, {});
    tower.attackCooldown = base.hitSpeed;
  }
}

// ===== Colisão =====

/** Impede unidades de se empilharem: empurra pares sobrepostos para longe. */
function separateUnits(state: SimState): void {
  const units = Object.values(state.entities).filter((e) => e.kind === 'unit');
  const minDist = UNIT_RADIUS * 1.8;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      // Voador e terrestre não colidem entre si (alturas diferentes).
      if ((a.flying === true) !== (b.flying === true)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDist) continue;
      // Par exatamente sobreposto: separa num eixo determinístico.
      const nx = dist < 1e-6 ? 1 : dx / dist;
      const ny = dist < 1e-6 ? 0 : dy / dist;
      const push = (minDist - dist) / 2;
      applyPush(a, -nx * push, -ny * push);
      applyPush(b, nx * push, ny * push);
    }
  }
}

/** Aplica o empurrão da separação sem jogar a unidade na água. */
function applyPush(unit: SimEntity, dx: number, dy: number): void {
  const newX = clampX(unit.x + dx);
  const newY = clampY(unit.y + dy);
  if (unit.flying) {
    unit.x = newX;
    unit.y = newY;
    return;
  }
  const wouldDrown = isInRiverBand(newX) && !isOnAnyBridge(newY);
  if (!wouldDrown) {
    unit.x = newX;
    unit.y = newY;
    return;
  }
  // Tenta cada eixo separadamente; descarta o que afogaria.
  if (!(isInRiverBand(newX) && !isOnAnyBridge(unit.y))) unit.x = newX;
  else if (!(isInRiverBand(unit.x) && !isOnAnyBridge(newY))) unit.y = newY;
}

function clampX(x: number): number {
  return Math.min(31.5, Math.max(0.5, x));
}

function clampY(y: number): number {
  return Math.min(17.5, Math.max(0.5, y));
}

// ===== Morte e fim de jogo =====

function removeDeadEntities(state: SimState): void {
  for (const entity of Object.values(state.entities)) {
    if (entity.hp > 0) continue;

    // Gatilhos onDeath: bomba e/ou invocação
    const c = entity.cardId ? getCard(entity.cardId)?.components : undefined;
    const deathEffect = c?.deathEffect;
    if (deathEffect?.damage && entity.kind !== 'zone') {
      const { radius, damage } = deathEffect.damage;
      state.events.push({ type: 'areaDamage', x: entity.x, y: entity.y, radius });
      for (const other of Object.values(state.entities)) {
        if (other.side === entity.side || other.hp <= 0 || other.kind === 'zone') continue;
        const d = Math.hypot(other.x - entity.x, other.y - entity.y);
        if (d <= radius + UNIT_RADIUS) {
          applyDamage(state, other, damage);
        }
      }
    }
    if (deathEffect?.spawn && entity.kind !== 'zone') {
      spawnUnits(state, entity.side, deathEffect.spawn.cardId, entity.x, entity.y, deathEffect.spawn.count);
    }

    delete state.entities[entity.id];
    if (entity.kind !== 'zone') {
      state.events.push({ type: 'death', x: entity.x, y: entity.y, kind: entity.kind });
    }

    if (entity.kind === 'tower') {
      const opponent: Side = entity.side === 'left' ? 'right' : 'left';
      state.players[opponent].crowns += entity.tower === 'king' ? 3 : 1;
      // Perder uma princesa acorda o rei do mesmo lado.
      if (entity.tower === 'princess') {
        const king = Object.values(state.entities).find(
          (e) => e.side === entity.side && e.tower === 'king',
        );
        if (king) king.dormant = false;
      }
      if (entity.tower === 'king') {
        endBattle(state, opponent);
        return;
      }
      if (state.suddenDeath) {
        endBattle(state, opponent);
        return;
      }
    }
  }
}

function updateClock(state: SimState, dt: number): void {
  if (state.phase !== 'battle') return;

  // Desempate final: TODAS as torres drenam vida rápido; a primeira a cair
  // faz o time dono perder.
  if (state.tiebreaker) {
    drainAllTowers(state, dt);
    return;
  }

  state.timeRemaining -= dt;
  if (state.timeRemaining > 0) return;

  const { left, right } = state.players;
  if (left.crowns !== right.crowns) {
    endBattle(state, left.crowns > right.crowns ? 'left' : 'right');
  } else if (!state.suddenDeath) {
    state.suddenDeath = true;
    state.timeRemaining = SUDDEN_DEATH_SECONDS;
  } else {
    // Nem a morte súbita desempatou: começa a drenagem das torres do rei.
    state.tiebreaker = true;
    state.timeRemaining = 0;
  }
}

/**
 * Desempate: TODAS as torres (rei + princesas) drenam vida proporcionalmente —
 * cada torre cheia esvazia em TIEBREAKER_DRAIN_SECONDS (~5s), então a torre com
 * MENOR % de vida cai primeiro e faz o time dono perder. Empate só se torres dos
 * dois lados zerarem no mesmo tick com a mesma vida total restante.
 */
function drainAllTowers(state: SimState, dt: number): void {
  const towers = Object.values(state.entities).filter(
    (e) => e.kind === 'tower' && e.hp > 0,
  );
  if (towers.length === 0) return;

  for (const t of towers) {
    t.hp -= (t.maxHp / TIEBREAKER_DRAIN_SECONDS) * dt;
  }

  const downed = towers.filter((t) => t.hp <= 0);
  if (downed.length === 0) return; // ainda drenando — todas as barras baixam

  // Explosão visual das torres que caíram neste tick.
  for (const t of downed) {
    t.hp = 0;
    state.events.push({ type: 'death', x: t.x, y: t.y, kind: 'tower' });
  }

  const leftDown = downed.some((t) => t.side === 'left');
  const rightDown = downed.some((t) => t.side === 'right');
  if (leftDown !== rightDown) {
    // Só um lado perdeu torre: esse time perde.
    endBattle(state, leftDown ? 'right' : 'left');
    return;
  }
  // Empate no mesmo tick: decide pela vida total restante das torres.
  const totalHp = (side: Side) =>
    towers.filter((t) => t.side === side).reduce((s, t) => s + Math.max(0, t.hp), 0);
  const l = totalHp('left');
  const r = totalHp('right');
  endBattle(state, l === r ? 'draw' : l > r ? 'left' : 'right');
}

function endBattle(state: SimState, winner: Side | 'draw'): void {
  state.phase = 'ended';
  state.winner = winner;
  state.timeRemaining = 0;
}

// ============================================================
// 防守模式（M0 简化版）
// 复用现有塔战斗模型（tower.kind 仍是 'tower'，但语义是点位/核心）；
// 怪物走自己的 stepMob（不依赖 cards.ts 的 comp()）。
// 波次逻辑全部在 stepWave：波间倒计时 → spawnInterval 刷怪 → 刷完进入下一波。
// 失败 = 核心 HP 归零；胜利 = 8 波全清空。
// ============================================================

function stepDefense(state: SimState, dt: number): void {
  if (state.phase !== 'battle') return;
  state.time += dt;
  stepWave(state, dt);

  for (const entity of Object.values(state.entities)) {
    if (entity.kind === 'zone') {
      stepZone(state, entity, dt);
      continue;
    }
    if (entity.kind === 'unit') {
      if (entity.mobVariant) {
        stepMob(state, entity, dt);
      } else {
        stepUnit(state, entity, dt); // 玩家英雄（M3 接 cards 体系时复用）
      }
      continue;
    }
    if (entity.kind === 'building') {
      stepBuilding(state, entity, dt);
      continue;
    }
    // tower：点位 + 核心都走 stepTower（防御模式的"king"会用 CORE_DAMAGE/RANGE）
    stepTower(state, entity, dt);
  }

  separateUnits(state);
  removeDeadEntitiesDefense(state);
  updateClockDefense(state, dt);
}

/**
 * 怪物步进（M0）：
 * - 目标 = 最近 side='left' 的塔（点位或核心，复用同一种行为）
 * - 没有 cardId，跳过 cards.components 体系，直接用 MOB_STATS
 * - 近战：贴身后直接扣血（非弹道），符合"涌到墙根砍"直觉
 * - 寻路：无视河桥，y 方向单向压向核心（怪物在防守模式只走"从远方到核心"一条路）
 */
function stepMob(state: SimState, mob: SimEntity, dt: number): void {
  const variant: MobVariant | undefined = mob.mobVariant;
  if (!variant) return;
  const stats = MOB_STATS[variant];

  mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);

  const target = acquireMobTarget(state, mob);
  if (!target) {
    mob.action = 'idle';
    return;
  }

  const targetR = TOWER_RADIUS; // 所有可攻击目标都是塔（点位/核心）
  const dx = target.x - mob.x;
  const dy = target.y - mob.y;
  const dist = Math.hypot(dx, dy) - targetR;

  if (dist <= stats.range) {
    // 已经贴上了：开砍
    mob.action = 'attack';
    mob.facing = dy >= 0 ? 1 : -1;
    if (mob.attackCooldown === 0) {
      target.hp -= stats.damage;
      if (target.hp < 0) target.hp = 0;
      mob.attackCooldown = stats.hitSpeed;
      state.events.push({ type: 'hit', x: target.x, y: target.y, ranged: false, amount: stats.damage });
      state.events.push({ type: 'towerHit', x: target.x, y: target.y });
    }
    return;
  }

  // 走直线（y 方向为主）
  const speed = stats.speed;
  const len = Math.hypot(dx, dy) || 1;
  const move = Math.min(speed * dt, len);
  mob.x += (dx / len) * move;
  mob.y += (dy / len) * move;
  mob.action = 'walk';
  mob.facing = dy >= 0 ? 1 : -1;
}

/** 怪物选目标：最近 side='left' 的塔（点位或核心），无视河桥 */
function acquireMobTarget(state: SimState, mob: SimEntity): SimEntity | undefined {
  let best: SimEntity | undefined;
  let bestDist = Infinity;
  for (const e of Object.values(state.entities)) {
    if (e.side === 'right' || e.hp <= 0 || e.kind !== 'tower') continue;
    const d = Math.hypot(e.x - mob.x, e.y - mob.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/**
 * 波次调度（M0）：
 * - 8 波刷完后进入 victory 倒计时（立即胜利，跳过倒计时）
 * - waveCountdown > 0：呼吸时间，不刷
 * - 计时归零后按 spawnInterval 刷怪（轮转 0,1,2,0,1,2... 三路）
 * - 该波 count 刷满后进入下波呼吸
 */
function stepWave(state: SimState, dt: number): void {
  const wave = state.wave ?? 1;
  const def = WAVES_M0[wave - 1];

  // 已经超过最后一波 → 玩家撑住 = 赢
  if (!def) {
    state.phase = 'ended';
    state.winner = 'left';
    return;
  }

  // 波间呼吸
  if ((state.waveCountdown ?? 0) > 0) {
    state.waveCountdown! -= dt;
    if (state.waveCountdown! < 0) state.waveCountdown = 0;
    return;
  }

  // 该波还没刷完：计时器驱动
  if ((state.waveSpawned ?? 0) < def.count) {
    state.waveSpawnTimer ??= def.spawnInterval;
    state.waveSpawnTimer -= dt;
    while (
      state.waveSpawnTimer <= 0 &&
      (state.waveSpawned ?? 0) < def.count
    ) {
      const lane = (state.waveSpawned ?? 0) % LANE_COUNT;
      spawnMob(state, lane, def.variant, def.hpScale, def.damageScale);
      state.waveSpawned = (state.waveSpawned ?? 0) + 1;
      state.waveSpawnTimer! += def.spawnInterval;
    }
    return;
  }

  // 本波已刷完 → 进入下一波呼吸
  state.wave = wave + 1;
  state.waveSpawned = 0;
  state.waveCountdown = WAVE_BREAK_SECONDS;
  state.waveSpawnTimer = undefined;
}

/** 防守模式死亡处理：mob 死亡+清掉，点位失守+清掉（M0 简化：删除实体无退守），核心死→玩家输 */
function removeDeadEntitiesDefense(state: SimState): void {
  const toRemove: string[] = [];
  let coreDied = false;
  for (const entity of Object.values(state.entities)) {
    if (entity.hp > 0) continue;
    if (entity.kind === 'zone') {
      toRemove.push(entity.id);
      continue;
    }
    // 怪物死亡 → 删除 + 死亡事件（供客户端掉血字/动画用）
    if (entity.mobVariant) {
      toRemove.push(entity.id);
      state.events.push({ type: 'death', x: entity.x, y: entity.y, kind: 'unit' });
      continue;
    }
    // 核心死亡 → 玩家输
    if (entity.kind === 'tower' && entity.tower === 'king' && entity.side === 'left') {
      toRemove.push(entity.id);
      coreDied = true;
      state.events.push({ type: 'death', x: entity.x, y: entity.y, kind: 'tower' });
      continue;
    }
    // 点位失守（M0 简化：直接删 entity，没有退守机制）
    if (entity.kind === 'tower' && entity.tower === 'princess' && entity.side === 'left') {
      toRemove.push(entity.id);
      state.events.push({ type: 'death', x: entity.x, y: entity.y, kind: 'tower' });
      continue;
    }
    // 其他（理论上不会有）兜底
    toRemove.push(entity.id);
    state.events.push({ type: 'death', x: entity.x, y: entity.y, kind: entity.kind });
  }
  for (const id of toRemove) delete state.entities[id];
  if (coreDied) {
    state.phase = 'ended';
    state.winner = 'right';
    state.timeRemaining = 0;
  }
}

/** 把当前核心血同步到 state.coreHp，便于客户端读 */
function updateClockDefense(state: SimState, dt: number): void {
  const core = Object.values(state.entities).find(
    (e) => e.kind === 'tower' && e.tower === 'king' && e.side === 'left',
  );
  state.coreHp = core?.hp ?? 0;
  state.coreMaxHp = core?.maxHp ?? state.coreMaxHp ?? 0;
  state.timeRemaining = Math.max(0, state.timeRemaining - dt);
}
