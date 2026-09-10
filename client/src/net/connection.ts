import { Client, Room } from 'colyseus.js';
import type { BotDifficulty, SimEvent } from '@claude-royale/shared';

export interface HudSnapshot {
  phase: string;
  timeRemaining: number;
  suddenDeath: boolean;
  tiebreaker: boolean;
  winner: string;
  mySide: 'left' | 'right';
  elixir: number;
  hand: string[];
  nextCard: string;
  myCrowns: number;
  oppCrowns: number;
  playerCount: number;
  myName: string;
  oppName: string;
  roomCode: string;
  /** 防守模式（M0 同学局版）字段 */
  defense: boolean;
  wave: number;
  waveCountdown: number;
  coreHp: number;
  coreMaxHp: number;
}

type EventsHandler = (events: SimEvent[]) => void;

const SERVER_PORT = 2567;

/** URL do servidor: em produção vem de VITE_SERVER_URL (ex.: wss://meujogo.fly.dev). */
function serverWsUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.hostname}:${SERVER_PORT}`;
}

function serverHttpUrl(): string {
  return serverWsUrl().replace(/^ws/, 'http');
}

export interface JoinBattleOptions {
  deck: string[];
  name: string;
  /** Níveis das cartas (1–3); o servidor sanitiza */
  cardLevels?: Record<string, number>;
  vsBot?: boolean;
  /** Bot vs bot: você entra como espectador */
  botMatch?: boolean;
  /** 'party' = elixir infinito；'defense' = 3 路波次防守（同学局改造 M0） */
  mode?: 'party' | 'defense' | '';
  botDifficulty?: BotDifficulty;
  /** Código de sala privada (jogar com amigo). Vazio = matchmaking público. */
  privateCode?: string;
}

export async function joinBattle(opts: JoinBattleOptions): Promise<Room> {
  const client = new Client(serverWsUrl());
  const options = {
    deck: opts.deck,
    name: opts.name,
    cardLevels: opts.cardLevels ?? {},
    vsBot: opts.vsBot === true,
    botMatch: opts.botMatch === true,
    mode: opts.mode ?? '',
    botDifficulty: opts.botDifficulty ?? 'medium',
    privateCode: opts.privateCode ?? '',
  };
  // Salas com bots são sempre novas; PvP (público ou com código) usa matchmaking.
  return opts.vsBot || opts.botMatch
    ? client.create('battle', options)
    : client.joinOrCreate('battle', options);
}

export async function fetchLeaderboard(): Promise<Array<{ name: string; trophies: number }>> {
  const response = await fetch(`${serverHttpUrl()}/leaderboard`);
  if (!response.ok) return [];
  return (await response.json()) as Array<{ name: string; trophies: number }>;
}

/** Entra numa partida em andamento apenas para assistir, pelo código da sala. */
export async function spectateBattle(code: string): Promise<Room> {
  const response = await fetch(`${serverHttpUrl()}/room-by-code/${encodeURIComponent(code)}`);
  if (!response.ok) throw new Error('Sala não encontrada');
  const { roomId } = (await response.json()) as { roomId: string };
  const client = new Client(serverWsUrl());
  return client.joinById(roomId, { spectate: true });
}

/** Tenta voltar para uma partida após queda/reload usando o token salvo. */
export async function reconnectBattle(token: string): Promise<Room> {
  const client = new Client(serverWsUrl());
  return client.reconnect(token);
}

/** Extrai um snapshot plano do estado Colyseus para renderizar a HUD em React. */
export function snapshotHud(room: Room): HudSnapshot {
  const state = room.state as Record<string, any>;
  const me = state.players?.get(room.sessionId);
  const mySide = (me?.side ?? 'left') as 'left' | 'right';

  let oppCrowns = 0;
  let playerCount = 0;
  let oppName = 'Oponente';
  state.players?.forEach((player: any, sessionId: string) => {
    playerCount++;
    if (sessionId !== room.sessionId) {
      oppCrowns = player.crowns;
      oppName = player.name || 'Oponente';
    }
  });

  return {
    phase: state.phase ?? 'waiting',
    timeRemaining: state.timeRemaining ?? 0,
    suddenDeath: state.suddenDeath ?? false,
    tiebreaker: state.tiebreaker ?? false,
    winner: state.winner ?? '',
    mySide,
    elixir: me?.elixir ?? 0,
    hand: me ? [...me.hand] : [],
    nextCard: me?.nextCard ?? '',
    myCrowns: me?.crowns ?? 0,
    oppCrowns,
    playerCount,
    myName: me?.name || 'Você',
    oppName,
    roomCode: state.roomCode ?? '',
    defense: state.defense === true,
    wave: state.wave ?? 1,
    waveCountdown: state.waveCountdown ?? 0,
    coreHp: state.coreHp ?? 0,
    coreMaxHp: state.coreMaxHp ?? 0,
  };
}

/** Cadastra um e-mail para updates. Retorna 'ok' | 'exists' | 'invalid' | 'error'. */
export async function subscribeEmail(
  email: string,
  source: string,
  name?: string,
  wantsUpdates = true,
): Promise<'ok' | 'exists' | 'invalid' | 'error'> {
  try {
    const res = await fetch(`${serverHttpUrl()}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source, name, wantsUpdates }),
    });
    const data = await res.json().catch(() => ({}));
    return (data.result as 'ok' | 'exists' | 'invalid') ?? 'error';
  } catch {
    return 'error';
  }
}

const PENDING_KEY = 'claude-royale:pending-subs';
type PendingSub = { email: string; source: string; name?: string; wantsUpdates: boolean };

function loadPending(): PendingSub[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]'); } catch { return []; }
}
function savePending(list: PendingSub[]): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* ignora */ }
}

/**
 * Cadastra e-mail garantindo captura: aguarda o envio; se a rede falhar,
 * guarda localmente para reenviar depois. Retorna o resultado do envio.
 */
export async function subscribeEmailReliable(
  email: string, source: string, name: string, wantsUpdates: boolean,
): Promise<'ok' | 'exists' | 'invalid' | 'error'> {
  const r = await subscribeEmail(email, source, name, wantsUpdates);
  if (r === 'error') {
    const pending = loadPending();
    pending.push({ email, source, name, wantsUpdates });
    savePending(pending);
  }
  return r;
}

/** Reenvia cadastros que ficaram pendentes por falha de rede. */
export async function flushPendingSubscribes(): Promise<void> {
  const pending = loadPending();
  if (pending.length === 0) return;
  const remaining: PendingSub[] = [];
  for (const p of pending) {
    const r = await subscribeEmail(p.email, p.source, p.name, p.wantsUpdates);
    if (r === 'error') remaining.push(p); // ainda offline — mantém na fila
  }
  savePending(remaining);
}

/** Admin: lista de e-mails cadastrados (requer chave). */
export async function fetchSubscribers(adminKey: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${serverHttpUrl()}/admin/subscribers`, { headers: { 'x-admin-key': adminKey } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Admin: telemetria das últimas partidas (requer chave). */
export async function fetchMatches(adminKey: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${serverHttpUrl()}/admin/matches`, { headers: { 'x-admin-key': adminKey } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function sendPlayCard(room: Room, cardId: string, x: number, y: number): void {
  room.send('playCard', { cardId, x, y });
}

export function onSimEvents(room: Room, handler: EventsHandler): void {
  room.onMessage('events', handler);
}
