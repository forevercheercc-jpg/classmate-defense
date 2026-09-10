import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'colyseus.js';
import type Phaser from 'phaser';
import type { SimEvent } from '@claude-royale/shared';
import {
  joinBattle, reconnectBattle, snapshotHud, spectateBattle, flushPendingSubscribes,
  type HudSnapshot, type JoinBattleOptions,
} from './net/connection';
import { ReplayRecorder, type Replay } from './net/replay';
import { mountGame } from './game/mountGame';
import { bus } from './game/bus';
import { CardHand } from './ui/CardHand';
import { ElixirBar } from './ui/ElixirBar';
import { TopBar } from './ui/TopBar';
import { HomeScreen } from './ui/HomeScreen';
import { EmotePicker } from './ui/EmotePicker';
import { ReplayScreen } from './ui/ReplayScreen';
import { BattleOverlays, OrientationOverlay } from './ui/Overlays';
import { AbilityButton } from './ui/AbilityButton';
import { AdminScreen } from './ui/AdminScreen';
import { SplashScreen } from './ui/SplashScreen';
import { enterLandscapeFullscreen } from './ui/fullscreen';
import { loadDeck, saveDeck } from './ui/deckStorage';
import {
  applySeasonRollover, loadProfile, recordMatch, saveProfile, upgradeCard, type Profile,
} from './ui/profileStorage';
import { ARENAS, currentArena, evaluateAchievements } from './ui/achievements';
import { isArenaTheme, type ArenaTheme } from './game/arena';
import { ambient } from './game/ambient';
import { t } from './i18n';

function loadTheme(): ArenaTheme {
  try {
    const saved = localStorage.getItem('claude-royale:theme');
    if (isArenaTheme(saved)) return saved;
  } catch {
    // storage indisponível
  }
  return 'campo';
}

type Screen = 'menu' | 'connecting' | 'battle' | 'replay';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState(false);
  const [handSide, setHandSide] = useState<'left' | 'right'>(() => {
    try { return localStorage.getItem('claude-royale:hand-side') === 'right' ? 'right' : 'left'; } catch { return 'left'; }
  });
  const toggleHandSide = useCallback(() => {
    setHandSide((s) => {
      const next = s === 'left' ? 'right' : 'left';
      try { localStorage.setItem('claude-royale:hand-side', next); } catch { /* ignora */ }
      return next;
    });
  }, []);
  const [deck, setDeck] = useState<string[]>(loadDeck);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [theme, setTheme] = useState<ArenaTheme>(loadTheme);
  const [showSplash, setShowSplash] = useState(true);
  const [adminMode, setAdminMode] = useState(() => location.hash === '#admin');
  const abilityUsedRef = useRef(false);

  useEffect(() => {
    const onHash = () => setAdminMode(location.hash === '#admin');
    window.addEventListener('hashchange', onHash);
    void flushPendingSubscribes(); // reenvia cadastros que falharam offline
    window.addEventListener('online', flushPendingSubscribes);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', flushPendingSubscribes);
    };
  }, []);
  const botDifficultyRef = useRef<string | undefined>(undefined);

  // Splash de abertura + virada de temporada
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2200);
    setProfile((current) => {
      const arenaIndex = ARENAS.findIndex((a) => a.name === currentArena(current.trophies).name);
      const rollover = applySeasonRollover(current, Math.max(0, arenaIndex));
      if (!rollover) return current;
      if (rollover.reward > 0) {
        setToast(t('app.newSeason', { reward: rollover.reward }));
        setTimeout(() => setToast(''), 4000);
      }
      return rollover.profile;
    });
    return () => clearTimeout(timer);
  }, []);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const endedRef = useRef(false);
  const vsBotRef = useRef(false);
  const lastPlayOptsRef = useRef<Omit<JoinBattleOptions, 'deck' | 'name'>>({});
  const recorderRef = useRef<ReplayRecorder | null>(null);

  // Música de fundo; jingle + registro de partida no fim.
  useEffect(() => {
    if (screen !== 'battle' || !hud) return;

    if (hud.phase === 'ended' && !endedRef.current) {
      endedRef.current = true;
      musicRef.current?.pause();
      const won = hud.winner === hud.mySide;
      const draw = hud.winner === 'draw';
      setReplay(recorderRef.current?.finish() ?? null);
      setProfile((current) => {
        const record = {
          result: (draw ? 'draw' : won ? 'win' : 'loss') as 'win' | 'loss' | 'draw',
          myCrowns: hud.myCrowns,
          oppCrowns: hud.oppCrowns,
          vsBot: vsBotRef.current,
          botDifficulty: botDifficultyRef.current,
          usedAbility: abilityUsedRef.current,
          oppName: hud.oppName,
          at: new Date().toISOString(),
        };
        const next = recordMatch(current, record);
        const unlocked = evaluateAchievements(next, record);
        if (unlocked.length > 0) {
          saveProfile(next);
          setToast(t('app.achievement', { list: unlocked.map((a) => `${a.emoji} ${t(`ach.${a.id}.name`)}`).join(' · ') }));
          setTimeout(() => setToast(''), 3500);
        }
        return next;
      });
      abilityUsedRef.current = false;
      if (!muted) {
        const jingle = new Audio(`/assets/audio/${won ? 'sfx_victory' : 'sfx_defeat'}.ogg`);
        jingle.volume = 0.6;
        void jingle.play().catch(() => undefined);
      }
      if (won) navigator.vibrate?.([80, 40, 80]); // comemoração tátil no celular
      return;
    }

    if (hud.phase !== 'ended' && !musicRef.current) {
      const music = new Audio('/assets/audio/music_battle.mp3');
      music.loop = true;
      music.volume = 0.32;
      musicRef.current = music;
      void music.play().catch(() => undefined);
      ambient.start(theme); // cama sonora procedural do tema
    }

    // Morte súbita: música acelera
    if (musicRef.current) {
      musicRef.current.playbackRate = hud.suddenDeath ? 1.15 : 1;
    }
  }, [screen, hud, muted]);

  // Mute controla música, SFX do Phaser e ambiente procedural.
  useEffect(() => {
    if (musicRef.current) musicRef.current.muted = muted;
    if (gameRef.current) gameRef.current.sound.mute = muted;
    ambient.setMuted(muted);
  }, [muted]);

  const stopMusic = useCallback(() => {
    musicRef.current?.pause();
    musicRef.current = null;
    endedRef.current = false;
    ambient.stop();
  }, []);

  // Sai da batalha para o menu de forma explícita (não depende do onLeave, que
  // preserva o overlay de resultado). Usado pelo botão "Jogar novamente".
  const leaveToMenu = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    room?.leave();
    gameRef.current?.destroy(true);
    gameRef.current = null;
    stopMusic();
    setHud(null);
    setIsSpectator(false);
    setScreen('menu');
  }, [stopMusic]);

  // Mixagem por intensidade: combate pesado abaixa a música
  useEffect(() => {
    return bus.on('intensity', (v) => {
      if (musicRef.current) musicRef.current.volume = 0.32 * (1 - 0.45 * v);
    });
  }, []);

  const handleDeckChange = useCallback((next: string[]) => {
    setDeck(next);
    saveDeck(next);
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setProfile((current) => {
      const next = { ...current, name };
      saveProfile(next);
      return next;
    });
  }, []);

  const setupRoom = useCallback(
    (room: Room, spectator: boolean) => {
      roomRef.current = room;
      endedRef.current = false; // nova partida: zera o estado de "terminou"
      (window as Record<string, any>).__room = room;
      recorderRef.current = spectator ? null : new ReplayRecorder();
      setIsSpectator(spectator);
      if (!spectator) {
        try {
          sessionStorage.setItem('claude-royale:reconnect', room.reconnectionToken);
        } catch {
          // storage indisponível — sem reconexão pós-reload
        }
      }

      room.onStateChange(() => {
        recorderRef.current?.onStateChange(room);
        setHud(snapshotHud(room));
      });
      room.onMessage('events', (events: SimEvent[]) => {
        recorderRef.current?.onEvents(events);
        // Rastreia uso de habilidade do próprio campeão (conquista)
        const state = room.state as Record<string, any>;
        const mySide = state.players?.get(room.sessionId)?.side;
        if (events.some((e) => e.type === 'ability' && e.side === mySide)) {
          abilityUsedRef.current = true;
        }
        bus.emit('simEvents', events);
      });
      room.onMessage('emote', (payload: { side: string; emoji: string }) => {
        bus.emit('emote', payload);
      });
      room.onMessage('playCardError', ({ error }: { error: string }) => {
        setToast(error);
        setTimeout(() => setToast(''), 1600);
      });
      room.onLeave(() => {
        try {
          sessionStorage.removeItem('claude-royale:reconnect');
        } catch {
          // ignora
        }
        roomRef.current = null;
        // Se a partida já terminou, mantém o resultado na tela: "Jogar novamente"
        // e "Ver replay" seguem funcionando sem a sala. Assim o overlay não some
        // quando o oponente sai, a sala é destruída ou o servidor reinicia.
        if (endedRef.current) return;
        stopMusic();
        gameRef.current?.destroy(true);
        gameRef.current = null;
        setHud(null);
        setIsSpectator(false);
        setScreen((current) => (current === 'replay' ? current : 'menu'));
      });

      setScreen('battle');
    },
    [stopMusic],
  );

  const handlePlay = useCallback(
    async (opts: Omit<JoinBattleOptions, 'deck' | 'name'>) => {
      setScreen('connecting');
      vsBotRef.current = opts.vsBot === true || opts.botMatch === true;
      botDifficultyRef.current = opts.vsBot ? opts.botDifficulty : undefined;
      lastPlayOptsRef.current = opts;
      abilityUsedRef.current = false;
      await enterLandscapeFullscreen();
      try {
        const room = await joinBattle({
          ...opts, deck, name: profile.name, cardLevels: profile.cardLevels,
        });
        setupRoom(room, opts.botMatch === true); // bot vs bot: você é espectador
      } catch (err) {
        console.error('Falha ao conectar no servidor', err);
        setToast(t('app.connectFail'));
        setTimeout(() => setToast(''), 3200);
        setScreen('menu');
      }
    },
    [deck, profile.name, setupRoom],
  );

  const handleSpectate = useCallback(
    async (code: string) => {
      setScreen('connecting');
      await enterLandscapeFullscreen();
      try {
        const room = await spectateBattle(code);
        setupRoom(room, true);
      } catch {
        setToast(t('app.roomNotFound'));
        setTimeout(() => setToast(''), 2600);
        setScreen('menu');
      }
    },
    [setupRoom],
  );

  // Reconexão automática após reload/queda: token guardado na sessão.
  const reconnectAttemptedRef = useRef(false);
  useEffect(() => {
    // StrictMode roda effects 2x em dev; a reserva só pode ser consumida uma vez.
    if (reconnectAttemptedRef.current) return;
    reconnectAttemptedRef.current = true;

    let token: string | null = null;
    try {
      token = sessionStorage.getItem('claude-royale:reconnect');
    } catch {
      return;
    }
    if (!token) return;
    setScreen('connecting');
    reconnectBattle(token)
      .then((room) => setupRoom(room, false))
      .catch((err) => {
        console.error('Reconexão falhou:', err);
        try {
          sessionStorage.removeItem('claude-royale:reconnect');
        } catch {
          // ignora
        }
        setScreen('menu');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Monta o Phaser quando a tela de batalha renderiza e o lado do jogador é conhecido.
  useEffect(() => {
    if (screen !== 'battle' || !hud || !roomRef.current || !gameHostRef.current) return;
    if (gameRef.current) return;
    gameRef.current = mountGame(gameHostRef.current, roomRef.current, hud.mySide, theme);
  }, [screen, hud, theme]);

  useEffect(() => () => gameRef.current?.destroy(true), []);

  if (screen === 'replay' && replay) {
    return (
      <ReplayScreen
        replay={replay}
        onExit={() => {
          gameRef.current?.destroy(true);
          gameRef.current = null;
          setScreen('menu');
        }}
      />
    );
  }

  if (showSplash) {
    return <SplashScreen />;
  }

  // Painel de balanceamento: acesso via http://…/#admin
  if (adminMode) {
    return (
      <AdminScreen
        onExit={() => {
          location.hash = '';
          setAdminMode(false);
        }}
      />
    );
  }

  if (screen !== 'battle') {
    return (
      <>
        <HomeScreen
          connecting={screen === 'connecting'}
          deck={deck}
          profile={profile}
          theme={theme}
          onThemeChange={(next) => {
            setTheme(next);
            try {
              localStorage.setItem('claude-royale:theme', next);
            } catch {
              // storage indisponível
            }
          }}
          onNameChange={handleNameChange}
          onDeckChange={handleDeckChange}
          onUpgradeCard={(cardId) => {
            setProfile((current) => {
              const next = upgradeCard(current, cardId);
              if (!next) {
                setToast('Ouro insuficiente');
                setTimeout(() => setToast(''), 1600);
                return current;
              }
              setToast(`⬆️ Carta melhorada para Nv.${next.cardLevels[cardId]}!`);
              setTimeout(() => setToast(''), 2000);
              return next;
            });
          }}
          onRegister={(name) => {
            setProfile((current) => {
              const next = { ...current, name, registered: true };
              saveProfile(next);
              return next;
            });
          }}
          onPlay={handlePlay}
          onSpectate={handleSpectate}
        />
        {toast && <div className="toast">{toast}</div>}
        <OrientationOverlay />
      </>
    );
  }

  return (
    <div className={`battle-root hand-${handSide} ${hud?.suddenDeath && hud.phase === 'battle' ? 'overtime' : ''} ${hud?.tiebreaker && hud.phase === 'battle' ? 'tiebreaker' : ''}`}>
      <div ref={gameHostRef} className="game-host" />
      {hud && (
        <>
          <TopBar
            hud={hud}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onSurrender={isSpectator ? undefined : () => roomRef.current?.send('surrender')}
            onToggleHandSide={toggleHandSide}
          />
          {!isSpectator && (
            <div className="bottom-hud">
              <ElixirBar
                elixir={hud.elixir}
                boosted={hud.phase === 'battle' && (hud.suddenDeath || hud.timeRemaining <= 60)}
              />
              <CardHand
                hand={hud.hand}
                nextCard={hud.nextCard}
                elixir={hud.elixir}
                disabled={hud.phase !== 'battle'}
                room={roomRef.current!}
                mySide={hud.mySide}
              />
            </div>
          )}
          {!isSpectator && (
            <EmotePicker room={roomRef.current!} unlockedAchievements={profile.achievements} />
          )}
          {!isSpectator && <AbilityButton room={roomRef.current!} mySide={hud.mySide} />}
          {isSpectator && <div className="spectator-badge">👁 ESPECTADOR</div>}
          <BattleOverlays
            hud={hud}
            muted={muted}
            isSpectator={isSpectator}
            rival={hud.oppName ? profile.rivals[hud.oppName] : undefined}
            deck={deck}
            recentResults={profile.history.slice(0, 5).map((m) => m.result)}
            hasReplay={!isSpectator && endedRef.current && recorderRef.current !== null}
            onWatchReplay={() => {
              roomRef.current?.leave();
              roomRef.current = null;
              gameRef.current?.destroy(true);
              gameRef.current = null;
              setScreen('replay');
            }}
            onExit={leaveToMenu}
            onRematch={() => {
              leaveToMenu();
              void handlePlay(lastPlayOptsRef.current);
            }}
          />
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
      <OrientationOverlay />
    </div>
  );
}
