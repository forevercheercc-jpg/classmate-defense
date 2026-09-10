import { useState } from 'react';
import {
  BALANCE_HISTORY, collectionCards, deriveStats, getCard, percentChange,
  type CardDef,
} from '@claude-royale/shared';
import { CardArt } from './CardArt';
import { useI18n, cardName, cardDesc } from '../i18n';
import { UPGRADE_COSTS, type Profile } from './profileStorage';

interface CollectionScreenProps {
  profile: Profile;
  onUpgradeCard: (cardId: string) => void;
}

export function CollectionScreen({ profile, onUpgradeCard }: CollectionScreenProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const cards = collectionCards();
  const selectedCard = selected ? getCard(selected) : undefined;

  return (
    <div className="collection-screen">
      <div className="deck-header">
        <h2 className="screen-title">{t('col.title', { n: cards.length })}</h2>
        <button className="text-button" onClick={() => setShowHistory(true)}>
          {t('col.history')}
        </button>
      </div>
      <div className="card-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            className={`grid-card rarity-${card.rarity}`}
            style={{ ['--card-color' as string]: card.color }}
            onClick={() => setSelected(card.id)}
          >
            <span className="card-cost">{card.type === 'mirror' ? '?' : card.cost}</span>
            {(profile.cardLevels[card.id] ?? 1) > 1 && (
              <span className="card-level">{t('col.lvl', { n: profile.cardLevels[card.id] })}</span>
            )}
            <CardArt cardId={card.id} color="blue" emoji={card.emoji} />
            <span className="grid-card-name">{cardName(card.id)}</span>
          </button>
        ))}
      </div>

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          profile={profile}
          onUpgradeCard={onUpgradeCard}
          onClose={() => setSelected(null)}
        />
      )}
      {showHistory && <BalanceHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function CardDetailModal({
  card, profile, onUpgradeCard, onClose,
}: {
  card: CardDef;
  profile: Profile;
  onUpgradeCard: (cardId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const c = card.components;
  const derived = deriveStats(card);
  const level = profile.cardLevels[card.id] ?? 1;
  const nextCost = UPGRADE_COSTS[level + 1];
  const canUpgrade = card.type !== 'mirror' && nextCost !== undefined;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-art" style={{ ['--card-color' as string]: card.color }}>
            <span className="card-cost">{card.type === 'mirror' ? '?' : card.cost}</span>
            <CardArt cardId={card.id} color="blue" emoji={card.emoji} />
          </div>
          <div>
            <h3>{cardName(card.id)}</h3>
            <p className="modal-type">
              {t(`col.type.${card.type}`)} · {t(`col.rarity.${card.rarity}`)} · {card.subtype}
            </p>
            {card.tags.length > 0 && (
              <p className="modal-tags">{card.tags.map((tag) => `#${tag}`).join(' ')}</p>
            )}
          </div>
          <button className="icon-button modal-close" onClick={onClose} aria-label={t('col.close')}>
            ✕
          </button>
        </div>

        <p className="modal-description">{cardDesc(card.id)}</p>

        <div className="stat-rows">
          {(card.deployCount ?? 1) > 1 && <StatRow icon="👥" label={t('col.count')} value={`x${card.deployCount}`} />}
          {c.health && <StatRow icon="❤️" label={t('col.hp')} value={c.health.hp} />}
          {c.health?.shield !== undefined && <StatRow icon="🛡️" label={t('col.shield')} value={c.health.shield} />}
          {c.health?.regenPerSecond !== undefined && (
            <StatRow icon="💞" label={t('col.regen')} value={`${c.health.regenPerSecond}/s`} />
          )}
          {c.attack && (
            <>
              <StatRow icon="⚔️" label={t('col.damage')} value={c.attack.damage} />
              <StatRow icon="⏱️" label={t('col.hitSpeed')} value={`${c.attack.hitSpeed}s`} />
              <StatRow icon="🎯" label={t('col.range')} value={c.attack.range <= 1.2 ? t('col.melee') : c.attack.range} />
              {c.attack.splashRadius ? <StatRow icon="💥" label={t('col.splash')} value={`${t('col.radius')} ${c.attack.splashRadius}`} /> : null}
              {c.attack.lifestealPct ? <StatRow icon="🩸" label={t('col.lifesteal')} value={`${Math.round(c.attack.lifestealPct * 100)}%`} /> : null}
              {c.attack.healOnKill ? <StatRow icon="🍖" label={t('col.healOnKill')} value={c.attack.healOnKill} /> : null}
            </>
          )}
          {c.movement && (
            <StatRow icon="👟" label={t('col.speed')} value={c.movement.speed >= 2.2 ? t('col.fast') : c.movement.speed >= 1.5 ? t('col.mediumSpeed') : t('col.slow')} />
          )}
          {c.movement?.flying && <StatRow icon="🕊️" label={t('col.movement')} value={t('col.flying')} />}
          {c.movement?.jumpsRiver && <StatRow icon="🌉" label={t('col.crossing')} value={t('col.jumpsRiver')} />}
          {c.targeting && (
            <StatRow icon="🏰" label={t('col.targets')} value={c.targeting.targets === 'buildings' ? t('col.buildingsOnly') : c.targeting.targetsAir ? t('col.airGround') : t('col.groundOnly')} />
          )}
          {c.charge && <StatRow icon="🐎" label={t('col.charge')} value={t('col.chargeVal', { m: c.charge.multiplier, d: c.charge.distance })} />}
          {c.spawner && <StatRow icon="🧬" label={t('col.spawn')} value={t('col.spawnVal', { c: c.spawner.count, i: c.spawner.interval })} />}
          {c.deathEffect?.damage && <StatRow icon="💣" label={t('col.deathDmg')} value={`${c.deathEffect.damage.damage} (${t('col.radius')} ${c.deathEffect.damage.radius})`} />}
          {c.deathEffect?.spawn && <StatRow icon="⚰️" label={t('col.deathSpawn')} value={`${c.deathEffect.spawn.count}x ${cardName(c.deathEffect.spawn.cardId)}`} />}
          {c.aura?.healPerSecond && <StatRow icon="💚" label={t('col.healAura')} value={`${c.aura.healPerSecond}/s (${t('col.radius')} ${c.aura.radius})`} />}
          {c.lifetime && <StatRow icon="⏳" label={t('col.lifetime')} value={`${c.lifetime.seconds}s`} />}
          {c.resource && <StatRow icon="💧" label={t('col.production')} value={t('col.productionVal', { i: c.resource.elixirInterval })} />}
          {c.spell && (
            <>
              {c.spell.damage ? <StatRow icon="💥" label={t('col.damage')} value={c.spell.damage} /> : null}
              <StatRow icon="⭕" label={t('col.radius')} value={c.spell.radius} />
              {c.spell.stunSeconds ? <StatRow icon="💫" label={t('col.stun')} value={`${c.spell.stunSeconds}s`} /> : null}
              {c.spell.freezeSeconds ? <StatRow icon="❄️" label={t('col.freeze')} value={`${c.spell.freezeSeconds}s`} /> : null}
              {c.spell.rageSeconds ? <StatRow icon="😈" label={t('col.rage')} value={`${c.spell.rageSeconds}s`} /> : null}
              {c.spell.multiTargetCount ? <StatRow icon="🎯" label={t('col.targets')} value={t('col.highestHp', { n: c.spell.multiTargetCount })} /> : null}
              {c.spell.zone ? <StatRow icon="☠️" label={t('col.zone')} value={`${c.spell.zone.pulseDamage}/s · ${c.spell.zone.durationSeconds}s`} /> : null}
            </>
          )}
          <StatRow icon="💧" label={t('col.elixirCost')} value={card.type === 'mirror' ? t('col.mirrorCost') : card.cost} />
          <StatRow icon="🎚️" label={t('col.level')} value={t('col.levelVal', { lvl: level, pct: (level - 1) * 8 })} />
        </div>

        {canUpgrade && (
          <button
            className="play-button secondary upgrade-button"
            disabled={profile.gold < nextCost}
            onClick={() => onUpgradeCard(card.id)}
          >
            {t('col.upgrade', { n: level + 1, cost: nextCost })}
            {profile.gold < nextCost ? t('col.notEnoughGold') : ''}
          </button>
        )}
        {!nextCost && card.type !== 'mirror' && (
          <p className="deck-hint">{t('col.maxLevel')}</p>
        )}

        <h4 className="derived-title">{t('col.derived')}</h4>
        <div className="stat-rows derived">
          {derived.dps !== undefined && <StatRow icon="⚡" label={t('col.dps')} value={derived.dps} />}
          {derived.effectiveHp !== undefined && <StatRow icon="🧱" label={t('col.effectiveHp')} value={derived.effectiveHp} />}
          {derived.dpsPerElixir !== undefined && <StatRow icon="📈" label={t('col.dpsPerElixir')} value={derived.dpsPerElixir} />}
          {derived.hpPerElixir !== undefined && <StatRow icon="📊" label={t('col.hpPerElixir')} value={derived.hpPerElixir} />}
          {derived.spellTotalDamage !== undefined && <StatRow icon="Σ" label={t('col.spellTotal')} value={derived.spellTotalDamage} />}
          {derived.totalSpawned !== undefined && <StatRow icon="🧬" label={t('col.totalSpawned')} value={derived.totalSpawned} />}
          {derived.totalElixirProduced !== undefined && <StatRow icon="💰" label={t('col.totalElixir')} value={derived.totalElixirProduced} />}
        </div>

        <CardBalanceHistory cardId={card.id} />
      </div>
    </div>
  );
}

function CardBalanceHistory({ cardId }: { cardId: string }) {
  const { t } = useI18n();
  const changes = BALANCE_HISTORY.filter((change) => change.cardId === cardId);
  if (changes.length === 0) return null;
  return (
    <>
      <h4 className="derived-title">{t('col.balanceChanges')}</h4>
      <div className="stat-rows derived">
        {changes.map((change, i) => (
          <div key={i} className="stat-row balance-row">
            <span className="stat-icon">{t(`col.kind.${change.kind}`).slice(0, 2)}</span>
            <span className="stat-label">
              v{change.version} — {change.attribute}: {change.oldValue} → {change.newValue} (
              {percentChange(change.oldValue, change.newValue)}%)
              <br />
              <em>{change.justification}</em>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function BalanceHistoryModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('col.history')}</h3>
          <button className="icon-button modal-close" onClick={onClose} aria-label={t('col.close')}>
            ✕
          </button>
        </div>
        <div className="stat-rows">
          {[...BALANCE_HISTORY].reverse().map((change, i) => (
            <div key={i} className="stat-row balance-row">
              <span className="stat-icon">{t(`col.kind.${change.kind}`).slice(0, 2)}</span>
              <span className="stat-label">
                <strong>{cardName(change.cardId)}</strong> — {t(`col.kind.${change.kind}`)}
                <br />
                {change.attribute}: {change.oldValue} → {change.newValue} (
                {percentChange(change.oldValue, change.newValue)}%) · v{change.version} · {change.date}
                <br />
                <em>{change.justification}</em>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
