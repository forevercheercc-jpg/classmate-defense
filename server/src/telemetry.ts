import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Telemetria de partidas reais: uma linha JSON por partida
 * (jogadores, decks, cartas jogadas, vencedor, duração).
 * Alimenta a aba de uso/winrate real do painel de balanceamento.
 */
const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '../data/matches.jsonl');

export interface MatchLog {
  at: string;
  durationSeconds: number;
  vsBot: boolean;
  winner: string;
  players: Array<{ name: string; side: string; deck: string[] }>;
  cardPlays: Array<{ side: string; cardId: string; t: number }>;
}

export function logMatch(match: MatchLog): void {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    appendFileSync(DATA_PATH, JSON.stringify(match) + '\n');
  } catch (err) {
    console.error('telemetria: falha ao gravar', err);
  }
}

export interface CardTelemetry {
  /** % de decks (partidas humanas) que incluem a carta */
  usagePct: number;
  /** winrate real quando presente no deck */
  winrate: number;
  decks: number;
}

/** Últimas partidas registradas (cru, mais recentes primeiro). */
export function recentMatches(limit = 200): MatchLog[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const rows = readFileSync(DATA_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l) as MatchLog; } catch { return null; } })
      .filter((m): m is MatchLog => m !== null);
    return rows.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

export function telemetrySummary(): {
  matches: number;
  cards: Record<string, CardTelemetry>;
} {
  const cards: Record<string, { decks: number; wins: number; draws: number }> = {};
  let matches = 0;
  let totalDecks = 0;
  try {
    if (!existsSync(DATA_PATH)) return { matches: 0, cards: {} };
    for (const line of readFileSync(DATA_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let match: MatchLog;
      try {
        match = JSON.parse(line) as MatchLog;
      } catch {
        continue;
      }
      matches++;
      for (const player of match.players) {
        totalDecks++;
        for (const cardId of player.deck) {
          cards[cardId] ??= { decks: 0, wins: 0, draws: 0 };
          cards[cardId].decks++;
          if (match.winner === 'draw') cards[cardId].draws++;
          else if (match.winner === player.side) cards[cardId].wins++;
        }
      }
    }
  } catch {
    return { matches: 0, cards: {} };
  }
  const out: Record<string, CardTelemetry> = {};
  for (const [id, s] of Object.entries(cards)) {
    const decided = s.decks - s.draws;
    out[id] = {
      usagePct: totalDecks > 0 ? Math.round((s.decks / totalDecks) * 1000) / 10 : 0,
      winrate: decided > 0 ? Math.round((s.wins / decided) * 1000) / 10 : 0,
      decks: s.decks,
    };
  }
  return { matches, cards: out };
}
