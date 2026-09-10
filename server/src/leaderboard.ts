import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Ranking persistente simples (arquivo JSON) — sem dependências nativas.
 * Chaveado pelo nome do jogador; suficiente para o escopo de estudo.
 */
const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '../data/leaderboard.json');

const TROPHIES_WIN = 30;
const TROPHIES_LOSS = 20;

type Board = Record<string, number>;

function load(): Board {
  try {
    if (existsSync(DATA_PATH)) {
      return JSON.parse(readFileSync(DATA_PATH, 'utf8')) as Board;
    }
  } catch {
    // arquivo corrompido — recomeça
  }
  return {};
}

function save(board: Board): void {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(board, null, 2));
  } catch (err) {
    console.error('leaderboard: falha ao salvar', err);
  }
}

export function recordMatchResult(name: string, won: boolean): void {
  const board = load();
  const current = board[name] ?? 0;
  board[name] = Math.max(0, current + (won ? TROPHIES_WIN : -TROPHIES_LOSS));
  save(board);
}

export function topPlayers(limit = 10): Array<{ name: string; trophies: number }> {
  return Object.entries(load())
    .map(([name, trophies]) => ({ name, trophies }))
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, limit);
}
