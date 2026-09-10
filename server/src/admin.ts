import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  BALANCE_HISTORY, CARDS, classifyChange, getAttribute, percentChange, setAttribute,
} from '@claude-royale/shared';
import { runSimulation } from './simCore';
import { recentMatches, telemetrySummary } from './telemetry';
import { listSubscribers } from './subscribers';

/**
 * API do painel de balanceamento. Protegida por chave simples:
 * defina ADMIN_KEY no ambiente (padrão de desenvolvimento: "royale-admin").
 */
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'royale-admin';
const here = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = resolve(here, '../../shared/src/balanceHistory.ts');

function json(res: ServerResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

/** Aplica um patch em memória, roda a simulação e restaura o valor original. */
function simulateWithPatch(
  cardId: string,
  attribute: string,
  newValue: number,
  matches: number,
) {
  const card = CARDS[cardId];
  if (!card) throw new Error(`carta "${cardId}" não existe`);
  const oldValue = getAttribute(card, attribute);
  if (oldValue === undefined) throw new Error(`atributo "${attribute}" inválido`);
  setAttribute(card, attribute, newValue);
  try {
    return { oldValue, result: runSimulation(matches) };
  } finally {
    setAttribute(card, attribute, oldValue);
  }
}

/** Grava o patch no balanceHistory.ts e aplica no catálogo vivo. */
function applyPatch(entry: {
  cardId: string; attribute: string; newValue: number;
  justification: string; kind?: string; expectedImpact?: string;
}) {
  const card = CARDS[entry.cardId];
  if (!card) throw new Error(`carta "${entry.cardId}" não existe`);
  const oldValue = getAttribute(card, entry.attribute);
  if (oldValue === undefined) throw new Error(`atributo "${entry.attribute}" inválido`);

  const record = {
    cardId: entry.cardId,
    form: 'normal',
    attribute: entry.attribute,
    oldValue,
    newValue: entry.newValue,
    kind: entry.kind ?? classifyChange(entry.attribute, oldValue, entry.newValue),
    justification: entry.justification || 'ajuste via painel de balanceamento',
    expectedImpact: entry.expectedImpact ?? 'validado em simulação prévia no painel',
    version: '1.2.x',
    date: new Date().toISOString().slice(0, 10),
  };

  const source = readFileSync(HISTORY_PATH, 'utf8');
  const insertAt = source.lastIndexOf('];');
  if (insertAt === -1) throw new Error('balanceHistory.ts em formato inesperado');
  const serialized = `  ${JSON.stringify(record, null, 2).replace(/\n/g, '\n  ')},\n`;
  writeFileSync(HISTORY_PATH, source.slice(0, insertAt) + serialized + source.slice(insertAt));

  setAttribute(card, entry.attribute, entry.newValue); // vale já, sem reiniciar
  BALANCE_HISTORY.push(record as never);
  return { ...record, percent: percentChange(oldValue, entry.newValue) };
}

/** Roteia /admin/*. Retorna true se a rota foi tratada. */
export async function handleAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!req.url?.startsWith('/admin/')) return false;

  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    json(res, 401, { error: 'chave admin inválida' });
    return true;
  }

  try {
    if (req.method === 'GET' && req.url === '/admin/cards') {
      json(res, 200, Object.values(CARDS).filter((c) => !c.hidden));
    } else if (req.method === 'GET' && req.url === '/admin/telemetry') {
      json(res, 200, telemetrySummary());
    } else if (req.method === 'GET' && req.url === '/admin/subscribers') {
      json(res, 200, listSubscribers());
    } else if (req.method === 'GET' && req.url === '/admin/matches') {
      json(res, 200, recentMatches());
    } else if (req.method === 'GET' && req.url === '/admin/history') {
      json(res, 200, BALANCE_HISTORY);
    } else if (req.method === 'POST' && req.url === '/admin/simulate') {
      const body = await readBody(req);
      const matches = Math.min(2000, Math.max(20, Number(body.matches) || 200));
      json(res, 200, runSimulation(matches));
    } else if (req.method === 'POST' && req.url === '/admin/simulate-patch') {
      const body = await readBody(req);
      const matches = Math.min(1000, Math.max(20, Number(body.matches) || 200));
      json(res, 200, simulateWithPatch(body.cardId, body.attribute, Number(body.newValue), matches));
    } else if (req.method === 'POST' && req.url === '/admin/apply-patch') {
      const body = await readBody(req);
      json(res, 200, applyPatch(body));
    } else {
      json(res, 404, { error: 'rota admin desconhecida' });
    }
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'erro' });
  }
  return true;
}
