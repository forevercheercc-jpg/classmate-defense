import { useEffect, useState } from 'react';
import type { Room } from 'colyseus.js';
import { getCard } from '@claude-royale/shared';

interface AbilityButtonProps {
  room: Room;
  mySide: 'left' | 'right';
}

interface ChampionInfo {
  cardId: string;
  cooldown: number;
}

/**
 * Botão da habilidade do campeão: aparece quando o SEU campeão está em campo,
 * mostra a recarga e envia `useAbility` ao servidor.
 */
export function AbilityButton({ room, mySide }: AbilityButtonProps) {
  const [champion, setChampion] = useState<ChampionInfo | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const entities = (room.state as Record<string, any>).entities;
      let found: ChampionInfo | null = null;
      entities?.forEach((entity: any) => {
        if (entity.side !== mySide || entity.kind !== 'unit') return;
        if (getCard(entity.cardId)?.type === 'champion') {
          found = { cardId: entity.cardId, cooldown: entity.abilityCooldown ?? 0 };
        }
      });
      setChampion(found);
    }, 200);
    return () => clearInterval(interval);
  }, [room, mySide]);

  if (!champion) return null;
  const info: ChampionInfo = champion;
  const ability = getCard(info.cardId)?.components.ability;
  if (!ability) return null;
  const ready = info.cooldown <= 0;

  return (
    <button
      className={`ability-button ${ready ? 'ready' : ''}`}
      disabled={!ready}
      onClick={() => room.send('useAbility')}
      title={`${ability.name}: ${ability.description} (custo ${ability.cost})`}
    >
      <span className="ability-icon">✨</span>
      <span className="ability-label">
        {ready ? `${ability.name} (${ability.cost}💧)` : `${Math.ceil(info.cooldown)}s`}
      </span>
    </button>
  );
}
