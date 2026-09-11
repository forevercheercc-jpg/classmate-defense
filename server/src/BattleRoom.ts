import { Client, Room } from 'colyseus';
import {
  BOT_CADENCE, COUNTDOWN_SECONDS, ELIXIR_MAX, TICK_DT, createInitialState,
  decideBotAction, isValidDeck, playCard, sanitizeCardLevels, setPlayerDeck,
  stepSimulation, useAbility,
} from '@claude-royale/shared';
import type { BotDifficulty, Side, SimEntity, SimState } from '@claude-royale/shared';
import { BattleState, EntitySchema, PlayerSchema } from './schema';
import { generateRoomCode, registerRoomCode, unregisterRoomCode } from './roomRegistry';
import { recordMatchResult } from './leaderboard';
import { logMatch } from './telemetry';

interface PlayCardMessage {
  cardId: string;
  x: number;
  y: number;
}

const EMOTE_COOLDOWN_MS = 2000;
const ALLOWED_EMOTES = ['👍', '😂', '😭', '😡', '🏆', '💎', '🤖', '✨'];
const BOT_SIDE: Side = 'right';
const PLAY_CARD_MIN_INTERVAL_MS = 200;
const RECONNECT_GRACE_SECONDS = 30;
const MAX_SPECTATORS = 6;

const BOT_LABELS: Record<BotDifficulty, string> = {
  easy: '🤖 Bot (fácil)',
  medium: '🤖 Bot (médio)',
  hard: '🤖 Bot (difícil)',
};

interface JoinOptions {
  deck?: unknown;
  name?: unknown;
  spectate?: unknown;
  cardLevels?: unknown;
}

export class BattleRoom extends Room<BattleState> {
  maxClients = 2 + MAX_SPECTATORS;

  private sim: SimState = createInitialState();
  private sides = new Map<string, Side>();
  private spectators = new Set<string>();
  private vsBot = false;
  private botMatch = false;
  private partyMode = false;
  private botDifficulty: BotDifficulty = 'medium';
  private botCooldowns: Record<Side, number> = { left: 2, right: 2 };
  private lastEmoteAt = new Map<string, number>();
  private lastPlayCardAt = new Map<string, number>();
  private roomCode = '';
  private resultRecorded = false;
  private battleStartedAt = 0;
  private decks = new Map<string, string[]>();
  private cardPlays: Array<{ side: Side; cardId: string; t: number }> = [];

  onCreate(options?: {
    vsBot?: boolean; botMatch?: boolean; mode?: unknown;
    botDifficulty?: unknown; privateCode?: unknown;
  }): void {
    this.setState(new BattleState());
    this.vsBot = options?.vsBot === true;
    this.botMatch = options?.botMatch === true;
    this.partyMode = options?.mode === 'party';
    this.botDifficulty = sanitizeDifficulty(options?.botDifficulty);

    // 防守模式（M0）：跳过 PvP 设置，立刻进入刷怪循环
    if (options?.mode === 'defense') {
      this.sim = createInitialState({ defense: true });
      this.battleStartedAt = Date.now();
      void this.setPrivate(true);
    }
    if (this.vsBot || this.botMatch) {
      const bot = new PlayerSchema();
      bot.side = BOT_SIDE;
      bot.name = BOT_LABELS[this.botDifficulty];
      this.state.players.set('bot', bot);
    }
    if (this.botMatch) {
      const botLeft = new PlayerSchema();
      botLeft.side = 'left';
      botLeft.name = '🤖 Bot Azul';
      this.state.players.set('bot-left', botLeft);
      // Bot vs bot: a partida começa sozinha; humanos entram como espectadores.
      this.sim.phase = 'countdown';
      this.sim.timeRemaining = COUNTDOWN_SECONDS;
      void this.setPrivate(true);
    }

    // Código curto da sala: usado por salas privadas e para assistir partidas.
    const requested = sanitizeCode(options?.privateCode);
    this.roomCode = requested ?? generateRoomCode();
    registerRoomCode(this.roomCode, this.roomId);
    this.state.roomCode = this.roomCode;

    this.onMessage('playCard', (client, message: PlayCardMessage) => {
      this.handlePlayCard(client, message);
    });

    this.onMessage('useAbility', (client) => {
      const side = this.sides.get(client.sessionId);
      if (!side) return;
      const result = useAbility(this.sim, side);
      if (!result.ok) {
        client.send('playCardError', { error: result.error });
      }
    });

    this.onMessage('surrender', (client) => {
      const side = this.sides.get(client.sessionId);
      if (!side || this.sim.phase !== 'battle') return;
      this.sim.phase = 'ended';
      this.sim.winner = side === 'left' ? 'right' : 'left';
      this.sim.timeRemaining = 0;
    });

    this.onMessage('emote', (client, message: { emoji?: unknown }) => {
      const side = this.sides.get(client.sessionId);
      const emoji = message?.emoji;
      if (!side || typeof emoji !== 'string' || !ALLOWED_EMOTES.includes(emoji)) return;
      const now = Date.now();
      if (now - (this.lastEmoteAt.get(client.sessionId) ?? 0) < EMOTE_COOLDOWN_MS) return;
      this.lastEmoteAt.set(client.sessionId, now);
      this.broadcast('emote', { side, emoji });
    });

    this.setSimulationInterval(() => this.update(), TICK_DT * 1000);
  }

  onJoin(client: Client, options?: JoinOptions): void {
    // 防守模式（M0）：玩家/观察者一律 spectator，sim 已就绪
    if (this.sim.defense === true) {
      this.spectators.add(client.sessionId);
      return;
    }

    const taken = new Set(this.sides.values());
    if (this.vsBot) taken.add(BOT_SIDE);

    // Bot vs bot: todo humano assiste. Espectador explícito ou sala cheia idem.
    const bothSidesTaken = taken.has('left') && taken.has('right');
    if (this.botMatch || options?.spectate === true || bothSidesTaken) {
      this.spectators.add(client.sessionId);
      return;
    }

    // Primeiro lado livre (robusto a entra-e-sai durante a espera).
    const side: Side = taken.has('left') ? 'right' : 'left';
    this.sides.set(client.sessionId, side);

    if (isValidDeck(options?.deck)) {
      setPlayerDeck(this.sim, side, options.deck, sanitizeCardLevels(options?.cardLevels));
      this.decks.set(client.sessionId, options.deck);
    }

    const player = new PlayerSchema();
    player.side = side;
    player.name = sanitizeName(options?.name) ?? `Jogador ${this.sides.size}`;
    this.state.players.set(client.sessionId, player);

    const ready = this.vsBot ? this.sides.size === 1 : this.sides.size === 2;
    if (ready) {
      this.sim.phase = 'countdown';
      this.sim.timeRemaining = COUNTDOWN_SECONDS;
      this.battleStartedAt = Date.now();
      // setPrivate (não lock): sai do matchmaking, mas segue aceitando
      // joinById — necessário para espectadores e reconexão.
      void this.setPrivate(true);
    }
  }

  async onLeave(client: Client, consented?: boolean): Promise<void> {
    if (this.spectators.delete(client.sessionId)) return;

    const side = this.sides.get(client.sessionId);
    if (!side) return;

    const inBattle = this.sim.phase === 'battle' || this.sim.phase === 'countdown';

    // Queda de conexão durante a batalha: espera reconectar por 30s.
    if (inBattle && !consented) {
      try {
        await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
        return; // reconectou — mantém lado, deck e estado
      } catch {
        // não voltou a tempo — derrota por W.O.
      }
    }

    this.sides.delete(client.sessionId);
    this.state.players.delete(client.sessionId);

    if (this.sim.phase !== 'ended' && this.sim.phase !== 'waiting') {
      this.sim.phase = 'ended';
      this.sim.winner = side === 'left' ? 'right' : 'left';
      this.syncState();
    }
  }

  onDispose(): void {
    unregisterRoomCode(this.roomCode);
  }

  private handlePlayCard(client: Client, message: PlayCardMessage): void {
    const side = this.sides.get(client.sessionId);
    if (!side) return;
    if (
      typeof message?.cardId !== 'string' ||
      message.cardId.length > 32 ||
      !Number.isFinite(message?.x) ||
      !Number.isFinite(message?.y)
    ) {
      return;
    }
    // Rate-limit: cliente honesto não envia mais que ~2 cartas/segundo.
    const now = Date.now();
    if (now - (this.lastPlayCardAt.get(client.sessionId) ?? 0) < PLAY_CARD_MIN_INTERVAL_MS) {
      return;
    }
    this.lastPlayCardAt.set(client.sessionId, now);
    const result = playCard(this.sim, side, message.cardId, message.x, message.y);
    if (!result.ok) {
      client.send('playCardError', { error: result.error });
    } else {
      this.cardPlays.push({ side, cardId: message.cardId, t: Math.round(this.sim.time * 10) / 10 });
    }
  }

  private update(): void {
    if (this.sim.phase === 'waiting' || this.sim.phase === 'ended') {
      if (this.sim.phase === 'ended') this.recordResultOnce();
      this.syncState();
      this.flushEvents();
      return;
    }
    if (this.vsBot) this.updateBot(BOT_SIDE);
    if (this.botMatch) {
      this.updateBot('left');
      this.updateBot('right');
    }
    if (this.partyMode) {
      // Modo festa: elixir sempre cheio para os dois lados.
      this.sim.players.left.elixir = ELIXIR_MAX;
      this.sim.players.right.elixir = ELIXIR_MAX;
    }
    stepSimulation(this.sim, TICK_DT);
    this.syncState();
    this.flushEvents();
  }

  /** Envia e limpa os eventos acumulados (inclui os gerados entre ticks por playCard). */
  private flushEvents(): void {
    if (this.sim.events.length === 0) return;
    this.broadcast('events', this.sim.events);
    this.sim.events = [];
  }

  /** Registra resultado no ranking + telemetria (uma vez). */
  private recordResultOnce(): void {
    if (this.resultRecorded) return;
    this.resultRecorded = true;
    const winner = this.sim.winner;
    const durationSeconds = this.battleStartedAt > 0
      ? Math.round((Date.now() - this.battleStartedAt) / 1000)
      : 0;

    // Telemetria: toda partida com humanos (inclui vs bot; exclui bot vs bot)
    if (!this.botMatch && this.sides.size > 0) {
      logMatch({
        at: new Date().toISOString(),
        durationSeconds,
        vsBot: this.vsBot,
        winner: winner ?? 'draw',
        players: [...this.sides.entries()].map(([sessionId, side]) => ({
          name: this.state.players.get(sessionId)?.name ?? '?',
          side,
          deck: this.decks.get(sessionId) ?? [],
        })),
        cardPlays: this.cardPlays,
      });
    }

    // Ranking: só 1v1 humano, com duração mínima (anti-farm por desistência relâmpago)
    const MIN_RANKED_SECONDS = 45;
    if (this.vsBot || this.botMatch || !winner || winner === 'draw') return;
    if (durationSeconds < MIN_RANKED_SECONDS) return;
    for (const [sessionId, side] of this.sides) {
      const name = this.state.players.get(sessionId)?.name;
      if (name) recordMatchResult(name, side === winner);
    }
  }

  /** Decide e executa jogadas do bot no ritmo da dificuldade escolhida. */
  private updateBot(side: Side): void {
    this.botCooldowns[side] -= TICK_DT;
    if (this.botCooldowns[side] > 0) return;
    const action = decideBotAction(this.sim, side, this.botDifficulty);
    if (action) {
      playCard(this.sim, side, action.cardId, action.x, action.y);
      const [min, max] = BOT_CADENCE[this.botDifficulty];
      this.botCooldowns[side] = min + Math.random() * (max - min);
    } else {
      this.botCooldowns[side] = 0.4; // sem jogada boa agora; reavalia logo
    }
  }

  /** Espelha o estado da simulação (objetos puros) no schema do Colyseus. */
  private syncState(): void {
    const { sim, state } = this;

    state.phase = sim.phase;
    state.timeRemaining = sim.timeRemaining;
    state.suddenDeath = sim.suddenDeath;
    state.tiebreaker = sim.tiebreaker;
    state.winner = sim.winner ?? '';
    // Defense fields
    state.defense = sim.defense === true;
    state.wave = sim.wave ?? 1;
    state.waveCountdown = sim.waveCountdown ?? 0;
    state.coreHp = sim.coreHp ?? 0;
    state.coreMaxHp = sim.coreMaxHp ?? 0;
    state.roshanState = sim.roshanState ?? 0;
    // M1：肉山刷新倒计时用 sim.time 派生，避免再加一个 sim 字段
    state.teamBuffSeconds = Math.max(0, (sim.teamBuffUntil ?? 0) - sim.time);

    for (const [sessionId, playerSchema] of state.players) {
      const side = sessionId === 'bot' ? BOT_SIDE : this.sides.get(sessionId);
      if (!side) continue;
      const player = sim.players[side];
      playerSchema.elixir = player.elixir;
      playerSchema.crowns = player.crowns;
      playerSchema.nextCard = player.queue[0] ?? '';
      // ArraySchema não aceita splice que insere mais do que remove;
      // sincroniza a mão posição a posição.
      for (let i = 0; i < player.hand.length; i++) {
        if (playerSchema.hand[i] !== player.hand[i]) {
          playerSchema.hand[i] = player.hand[i];
        }
      }
      while (playerSchema.hand.length > player.hand.length) {
        playerSchema.hand.pop();
      }
    }

    for (const [id, entity] of Object.entries(sim.entities)) {
      let schema = state.entities.get(id);
      if (!schema) {
        schema = new EntitySchema();
        schema.id = id;
        schema.kind = entity.kind;
        schema.side = entity.side;
        schema.cardId = entity.cardId ?? '';
        schema.tower = entity.tower ?? '';
        schema.maxHp = entity.maxHp;
        state.entities.set(id, schema);
      }
      schema.x = entity.x;
      schema.y = entity.y;
      schema.hp = entity.hp;
      schema.action = entity.action;
      schema.facing = entity.facing;
      schema.dormant = entity.dormant === true;
      schema.shield = entity.shield ?? 0;
      schema.status = entityStatus(entity, sim.time);
      schema.evolved = entity.evolved === true;
      schema.abilityCooldown = entity.abilityCooldown ?? 0;
      // Defense fields
      schema.mobVariant = entity.mobVariant ?? '';
      schema.lane = entity.lane ?? -1;
      schema.pointIndex = entity.pointIndex ?? -1;
      schema.buff = entity.buff ?? 1;
      schema.campIndex = entity.campIndex ?? -1;
      schema.isRoshan = entity.isRoshan === true;
    }

    for (const id of [...state.entities.keys()]) {
      if (!sim.entities[id]) state.entities.delete(id);
    }
  }
}

function entityStatus(entity: SimEntity, time: number): string {
  if (entity.frozenUntil !== undefined && entity.frozenUntil > time) return 'frozen';
  if (entity.stunnedUntil !== undefined && entity.stunnedUntil > time) return 'stunned';
  if (entity.charging === true) return 'charging';
  if (entity.ragedUntil !== undefined && entity.ragedUntil > time) return 'raged';
  return '';
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeDifficulty(raw: unknown): BotDifficulty {
  return raw === 'easy' || raw === 'hard' ? raw : 'medium';
}

function sanitizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,6}$/.test(code) ? code : null;
}
