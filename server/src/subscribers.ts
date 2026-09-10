import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Lista de e-mails para updates (append-only, dedup). Um JSON por linha. */
const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '../data/subscribers.jsonl');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function existing(): Set<string> {
  const set = new Set<string>();
  try {
    if (existsSync(DATA_PATH)) {
      for (const line of readFileSync(DATA_PATH, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const email = JSON.parse(line).email;
          if (typeof email === 'string') set.add(email.toLowerCase());
        } catch {
          // linha corrompida — ignora
        }
      }
    }
  } catch {
    // ilegível — trata como vazio
  }
  return set;
}

/** Lista os e-mails cadastrados (mais recentes primeiro). */
export function listSubscribers(limit = 500): Array<Record<string, unknown>> {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const rows = readFileSync(DATA_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r): r is Record<string, unknown> => r !== null);
    return rows.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

/** Registra um e-mail. Retorna 'ok' | 'exists' | 'invalid'. */
export function addSubscriber(
  rawEmail: unknown,
  source: string,
  name?: string,
  wantsUpdates = true,
): 'ok' | 'exists' | 'invalid' {
  if (typeof rawEmail !== 'string') return 'invalid';
  const email = rawEmail.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'invalid';
  if (existing().has(email)) return 'exists';
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    appendFileSync(
      DATA_PATH,
      JSON.stringify({
        email,
        name: typeof name === 'string' ? name.slice(0, 32) : undefined,
        wantsUpdates: wantsUpdates !== false,
        source,
        at: new Date().toISOString(),
      }) + '\n',
    );
    return 'ok';
  } catch (err) {
    console.error('subscribers: falha ao salvar', err);
    return 'invalid';
  }
}
