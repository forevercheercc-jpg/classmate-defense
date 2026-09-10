import { useEffect, useRef, useState } from 'react';
import { getCard } from '@claude-royale/shared';
import type { HudSnapshot } from '../net/connection';
import { useI18n } from '../i18n';
import type { RivalRecord } from './profileStorage';

interface BattleOverlaysProps {
  hud: HudSnapshot;
  muted: boolean;
  isSpectator?: boolean;
  rival?: RivalRecord;
  /** Preview do deck e forma recente na fila de espera */
  deck?: string[];
  recentResults?: Array<'win' | 'loss' | 'draw'>;
  hasReplay: boolean;
  onWatchReplay: () => void;
  onExit: () => void;
  onRematch: () => void;
}

export function BattleOverlays({
  hud, muted, isSpectator, rival, deck, recentResults, hasReplay, onWatchReplay, onExit, onRematch,
}: BattleOverlaysProps) {
  const { t } = useI18n();
  const [fightFlash, setFightFlash] = useState(false);
  const [overtimeBanner, setOvertimeBanner] = useState(false);
  const [tiebreakerBanner, setTiebreakerBanner] = useState(false);
  const [doubleElixirBanner, setDoubleElixirBanner] = useState(false);
  const prevPhase = useRef(hud.phase);
  const prevSudden = useRef(hud.suddenDeath);
  const prevTiebreaker = useRef(hud.tiebreaker);
  const prevCount = useRef(-1);
  const doubleElixirShown = useRef(false);

  // Banner quando entra no último minuto (elixir em dobro)
  useEffect(() => {
    if (
      hud.phase === 'battle' &&
      !hud.suddenDeath &&
      hud.timeRemaining <= 60 &&
      hud.timeRemaining > 0 &&
      !doubleElixirShown.current
    ) {
      doubleElixirShown.current = true;
      setDoubleElixirBanner(true);
      setTimeout(() => setDoubleElixirBanner(false), 2200);
    }
  }, [hud.phase, hud.suddenDeath, hud.timeRemaining]);

  // Som de tick a cada número do countdown
  useEffect(() => {
    if (hud.phase !== 'countdown') return;
    const count = Math.ceil(hud.timeRemaining);
    if (count !== prevCount.current) {
      prevCount.current = count;
      if (!muted) {
        const tick = new Audio('/assets/audio/sfx_countdown.ogg');
        tick.volume = 0.4;
        void tick.play().catch(() => undefined);
      }
    }
  }, [hud.phase, hud.timeRemaining, muted]);

  // "LUTE!" quando o countdown vira batalha
  useEffect(() => {
    if (prevPhase.current === 'countdown' && hud.phase === 'battle') {
      setFightFlash(true);
      setTimeout(() => setFightFlash(false), 1000);
    }
    prevPhase.current = hud.phase;
  }, [hud.phase]);

  // Banner da morte súbita
  useEffect(() => {
    if (!prevSudden.current && hud.suddenDeath && hud.phase === 'battle') {
      setOvertimeBanner(true);
      setTimeout(() => setOvertimeBanner(false), 2400);
    }
    prevSudden.current = hud.suddenDeath;
  }, [hud.suddenDeath, hud.phase]);

  // Banner do desempate (drenagem das torres do rei)
  useEffect(() => {
    if (!prevTiebreaker.current && hud.tiebreaker && hud.phase === 'battle') {
      setTiebreakerBanner(true);
      setTimeout(() => setTiebreakerBanner(false), 2800);
    }
    prevTiebreaker.current = hud.tiebreaker;
  }, [hud.tiebreaker, hud.phase]);

  if (hud.phase === 'waiting' || hud.playerCount < 2) {
    return (
      <div className="overlay">
        <div className="overlay-card">
          <div className="spinner" />
          <h2>{isSpectator ? t('battle.waitingSpectator') : t('battle.searching')}</h2>
          {hud.roomCode && (
            <p className="room-code">
              {t('battle.roomCode')} <strong>{hud.roomCode}</strong>
            </p>
          )}
          {deck && deck.length > 0 && (
            <div className="queue-deck">
              {deck.map((cardId) => {
                const card = getCard(cardId);
                return (
                  <span key={cardId} className="queue-card" title={card?.name}>
                    {card?.emoji ?? '❓'}
                  </span>
                );
              })}
            </div>
          )}
          {recentResults && recentResults.length > 0 && (
            <p className="queue-form">
              {t('battle.recentForm')}{' '}
              {recentResults.map((r, i) => (
                <span key={i}>{r === 'win' ? '🟢' : r === 'loss' ? '🔴' : '⚪'}</span>
              ))}
            </p>
          )}
          <p>{t('battle.openOtherTab')}</p>
        </div>
      </div>
    );
  }

  if (hud.phase === 'countdown') {
    // Apresentação VS por ~3s, depois a contagem 3-2-1.
    // Os nomes seguem o lado do campo (azul = esquerda, vermelho = direita),
    // então cada jogador vê o próprio nome no seu lado real da arena.
    const totalMatches = rival ? rival.wins + rival.losses + rival.draws : 0;
    const leftName = hud.mySide === 'left' ? hud.myName : hud.oppName;
    const rightName = hud.mySide === 'right' ? hud.myName : hud.oppName;
    if (hud.timeRemaining > 3) {
      return (
        <div className="overlay">
          <div className="vs-panel">
            <div className="vs-player blue">
              <span className="vs-name">{leftName}</span>
            </div>
            <div className="vs-badge">VS</div>
            <div className="vs-player red">
              <span className="vs-name">{rightName}</span>
            </div>
            {totalMatches > 0 && rival && (
              <p className="vs-rivalry">
                {t('battle.rivalry', { n: totalMatches + 1, w: rival.wins, l: rival.losses })}
                {rival.draws > 0 ? t('battle.rivalryDraws', { d: rival.draws }) : ''}
              </p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="overlay transparent">
        <div className="countdown">{Math.ceil(hud.timeRemaining)}</div>
      </div>
    );
  }

  if (hud.phase === 'ended') {
    const won = hud.winner === hud.mySide;
    const draw = hud.winner === 'draw';
    if (isSpectator) {
      return (
        <div className="overlay">
          <div className="overlay-card result">
            <div className="result-emoji">🏁</div>
            <h2>{t('common.matchOver')}</h2>
            <p>
              {hud.myCrowns} 👑 × 👑 {hud.oppCrowns}
            </p>
            <button className="result-button" onClick={onExit}>
              {t('common.menu')}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="overlay">
        {won && <Confetti />}
        <div className="overlay-card result">
          <div className="result-emoji">{draw ? '🤝' : won ? '👑' : '💔'}</div>
          <h2>{draw ? t('common.drawTitle') : won ? t('common.victory') : t('common.defeat')}</h2>
          <p>
            {hud.myCrowns} 👑 × 👑 {hud.oppCrowns}
          </p>
          <div className="result-actions">
            <button className="result-button primary" onClick={onRematch}>
              {t('common.playAgain')}
            </button>
            {hasReplay && (
              <button className="result-button" onClick={onWatchReplay}>
                {t('common.watchReplay')}
              </button>
            )}
            <button className="result-button" onClick={onExit}>
              {t('common.menu')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {fightFlash && (
        <div className="overlay transparent">
          <div className="fight-flash">{t('battle.fight')}</div>
        </div>
      )}
      {overtimeBanner && (
        <div className="overlay transparent">
          <div className="overtime-banner">
            {t('battle.suddenDeath')}<span>{t('battle.suddenDeathSub')}</span>
          </div>
        </div>
      )}
      {tiebreakerBanner && (
        <div className="overlay transparent">
          <div className="overtime-banner tiebreaker">
            {t('battle.tiebreaker')}<span>{t('battle.tiebreakerSub')}</span>
          </div>
        </div>
      )}
      {hud.tiebreaker && hud.phase === 'battle' && (
        <div className="tiebreaker-tag">{t('battle.tiebreakerTag')}</div>
      )}
      {doubleElixirBanner && (
        <div className="overlay transparent">
          <div className="overtime-banner elixir-x2">
            {t('battle.doubleElixir')}<span>{t('battle.doubleElixirSub')}</span>
          </div>
        </div>
      )}
    </>
  );
}

/** Confete de vitória: emojis caindo com posições/delays aleatórios. */
function Confetti() {
  const pieces = useRef(
    Array.from({ length: 26 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 2.4 + Math.random() * 2,
      emoji: ['👑', '✨', '🎉', '⭐'][i % 4],
      size: 16 + Math.random() * 18,
    })),
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.current.map((piece, i) => (
        <span
          key={i}
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            fontSize: piece.size,
          }}
        >
          {piece.emoji}
        </span>
      ))}
    </div>
  );
}

/** Pede para deitar o aparelho quando em retrato (via CSS media query). */
export function OrientationOverlay() {
  const { t } = useI18n();
  return (
    <div className="orientation-overlay">
      <div className="rotate-phone">📱</div>
      <h2>{t('battle.rotateTitle')}</h2>
      <p>{t('battle.rotateBody')}</p>
    </div>
  );
}
