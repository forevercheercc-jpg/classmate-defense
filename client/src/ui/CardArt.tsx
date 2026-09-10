import { CARD_VISUALS, UNIT_ANIM_FRAMES, unitSheetUrl, type SideColor } from '../game/assets';

interface CardArtProps {
  cardId: string;
  color: SideColor;
  emoji: string;
}

/** Arte da carta: frame 0 do sprite (tropas), torre (construções) ou emoji (feitiços). */
export function CardArt({ cardId, color, emoji }: CardArtProps) {
  const visual = CARD_VISUALS[cardId];
  if (!visual) return <span className="card-emoji">{emoji}</span>; // feitiços/espelho

  if (visual.building) {
    return (
      <div className="card-art building">
        <img src={`/assets/tiny-swords/buildings/tower_${color}.png`} alt="" draggable={false} />
      </div>
    );
  }

  const unit = visual.unit ?? 'warrior';
  const frames = UNIT_ANIM_FRAMES[unit].idle;
  return (
    <div className="card-art">
      <img
        src={unitSheetUrl(unit, color, 'idle')}
        alt=""
        draggable={false}
        style={{
          width: `${frames * 230}%`,
          height: '230%',
          marginLeft: '-65%',
          marginTop: '-72%',
        }}
      />
    </div>
  );
}
