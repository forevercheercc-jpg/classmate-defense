import type { HudSnapshot } from '../net/connection';
import { toggleFullscreen } from './fullscreen';
import { useI18n } from '../i18n';

interface TopBarProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onSurrender?: () => void;
  onToggleHandSide?: () => void;
}

export function TopBar({ hud, muted, onToggleMute, onSurrender, onToggleHandSide }: TopBarProps) {
  const { t } = useI18n();
  const minutes = Math.floor(Math.max(0, hud.timeRemaining) / 60);
  const seconds = Math.floor(Math.max(0, hud.timeRemaining) % 60);

  return (
    <div className="top-bar">
      <div className={`player-plate ${hud.mySide === 'left' ? 'blue' : 'red'}`}>
        <span className="plate-name">{hud.myName}</span>
        <span className="plate-crowns">👑 {hud.myCrowns}</span>
      </div>

      <div className={`timer-plate ${hud.suddenDeath ? 'sudden-death' : ''}`}>
        <span className="timer-label">{hud.suddenDeath ? t('battle.suddenDeathShort') : t('battle.timeLeft')}</span>
        <span className="timer-value">
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
      </div>

      <div className={`player-plate ${hud.mySide === 'left' ? 'red' : 'blue'}`}>
        <span className="plate-name">{hud.oppName}</span>
        <span className="plate-crowns">👑 {hud.oppCrowns}</span>
      </div>

      <div className="top-actions">
        {onSurrender && hud.phase === 'battle' && (
          <button className="icon-button" onClick={onSurrender} aria-label={t('battle.surrender')}>
            🏳️
          </button>
        )}
        {onToggleHandSide && (
          <button className="icon-button" onClick={onToggleHandSide} aria-label={t('battle.handSide')}>
            ⇄
          </button>
        )}
        <button className="icon-button" onClick={onToggleMute} aria-label={t('battle.sound')}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label={t('battle.fullscreen')}>
          ⛶
        </button>
      </div>
    </div>
  );
}
