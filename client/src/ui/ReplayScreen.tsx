import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { ReplayRoom, type Replay } from '../net/replay';
import { mountGame } from '../game/mountGame';
import { bus } from '../game/bus';
import { TopBar } from './TopBar';
import type { HudSnapshot } from '../net/connection';

interface ReplayScreenProps {
  replay: Replay;
  onExit: () => void;
}

/** Reproduz a última partida alimentando a cena com os frames gravados. */
export function ReplayScreen({ replay, onExit }: ReplayScreenProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roomRef = useRef(new ReplayRoom());
  const [hud, setHud] = useState<HudSnapshot>(replay.frames[0].hud);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [highlights, setHighlights] = useState(false);
  const clockRef = useRef({ time: 0, frame: 0, event: 0, last: 0, moment: 0 });

  /** Melhores momentos: pula para 5s antes de cada queda de torre. */
  const seekTo = (ms: number) => {
    const clock = clockRef.current;
    clock.time = Math.max(0, ms);
    clock.frame = replay.frames.findIndex((f) => f.t >= clock.time);
    if (clock.frame < 0) clock.frame = replay.frames.length - 1;
    clock.event = replay.events.findIndex((e) => e.t >= clock.time);
    if (clock.event < 0) clock.event = replay.events.length;
  };

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    gameRef.current = mountGame(hostRef.current, roomRef.current as never, replay.mySide);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [replay.mySide]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    clockRef.current.last = performance.now();

    const tick = (now: number) => {
      const clock = clockRef.current;
      clock.time += (now - clock.last) * speed;
      clock.last = now;

      while (
        clock.frame < replay.frames.length - 1 &&
        replay.frames[clock.frame + 1].t <= clock.time
      ) {
        clock.frame++;
      }
      const frame = replay.frames[clock.frame];
      roomRef.current.applyFrame(frame);
      setHud(frame.hud);
      setProgress(Math.min(1, clock.time / replay.durationMs));

      while (clock.event < replay.events.length && replay.events[clock.event].t <= clock.time) {
        bus.emit('simEvents', replay.events[clock.event].events);
        clock.event++;
      }

      // Modo melhores momentos: salta entre janelas [queda-5s, queda+2s]
      if (highlights && replay.moments.length > 0) {
        const current = replay.moments[clock.moment];
        if (current !== undefined && clock.time > current + 2000) {
          clock.moment++;
          const next = replay.moments[clock.moment];
          if (next !== undefined) seekTo(next - 5000);
          else {
            setPlaying(false);
            return;
          }
        }
      }

      if (clock.time < replay.durationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, replay, highlights]);

  const restart = () => {
    clockRef.current = { time: 0, frame: 0, event: 0, last: performance.now(), moment: 0 };
    setProgress(0);
    setPlaying(true);
  };

  const toggleHighlights = () => {
    const next = !highlights;
    setHighlights(next);
    if (next && replay.moments.length > 0) {
      clockRef.current.moment = 0;
      seekTo(replay.moments[0] - 5000);
      setPlaying(true);
    }
  };

  return (
    <div className="battle-root replay-root">
      <div ref={hostRef} className="game-host" />
      <TopBar hud={hud} muted onToggleMute={() => undefined} />
      <div className="replay-badge">📺 REPLAY</div>
      <div className="replay-controls">
        <button className="icon-button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '⏸' : '▶️'}
        </button>
        <button className="icon-button" onClick={restart} aria-label="Reiniciar">
          ⏮
        </button>
        <button
          className={`icon-button speed ${speed === 2 ? 'active' : ''}`}
          onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
        >
          {speed}x
        </button>
        {replay.moments.length > 0 && (
          <button
            className={`icon-button speed ${highlights ? 'active' : ''}`}
            onClick={toggleHighlights}
            title="Melhores momentos (quedas de torre)"
          >
            ⭐
          </button>
        )}
        <div className="replay-progress">
          <div className="replay-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <button className="icon-button" onClick={onExit} aria-label="Sair do replay">
          ✕
        </button>
      </div>
    </div>
  );
}
