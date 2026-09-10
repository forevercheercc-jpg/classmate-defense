import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Sincronização de perfil entre aparelhos: o cliente gera um token secreto e
 * salva/carrega o perfil pelo token. Sem senha — escopo de estudo.
 */
const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '../data/profiles.json');

type Store = Record<string, { updatedAt: string; profile: unknown }>;

function load(): Store {
  try {
    if (existsSync(DATA_PATH)) return JSON.parse(readFileSync(DATA_PATH, 'utf8')) as Store;
  } catch {
    // corrompido — recomeça
  }
  return {};
}

function persist(store: Store): void {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(store));
  } catch (err) {
    console.error('profileStore: falha ao salvar', err);
  }
}

const TOKEN_RE = /^[a-zA-Z0-9-]{8,64}$/;

export function saveRemoteProfile(token: string, profile: unknown): boolean {
  if (!TOKEN_RE.test(token)) return false;
  const store = load();
  store[token] = { updatedAt: new Date().toISOString(), profile };
  persist(store);
  return true;
}

export function loadRemoteProfile(token: string): { updatedAt: string; profile: unknown } | null {
  if (!TOKEN_RE.test(token)) return null;
  return load()[token] ?? null;
}
