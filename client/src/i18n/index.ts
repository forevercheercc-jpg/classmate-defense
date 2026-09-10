// Sistema de i18n leve: inglês como padrão, PT-BR como tradução, extensível.
import { useSyncExternalStore } from 'react';
import { getCard } from '@claude-royale/shared';
import { en } from './en';
import { ptBR } from './pt-BR';

export type Locale = 'en' | 'pt-BR';
export type Dict = typeof en;

const DICTS: Record<Locale, Dict> = { en, 'pt-BR': ptBR };
const STORAGE_KEY = 'claude-royale:lang';
export const LOCALES: { id: Locale; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'pt-BR', label: 'Português', flag: '🇧🇷' },
];

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'pt-BR') return saved;
  } catch {
    // storage indisponível
  }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('pt') ? 'pt-BR' : 'en';
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignora
  }
  for (const l of listeners) l();
}

/** Resolve uma chave em "a.b.c" no dicionário atual, com fallback pro inglês. */
function resolve(dict: Dict, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/** Traduz uma chave; interpola {var} com params. Fallback: inglês, depois a própria chave. */
export function t(key: string, params?: Record<string, string | number>): string {
  const str = resolve(DICTS[current], key) ?? resolve(en, key) ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/**
 * Nome/descrição localizados de uma carta por id. O locale atual (ex.: PT-BR)
 * traduz; o padrão vem do próprio catálogo (nomes/descrições canônicos em inglês).
 */
export function cardName(id: string): string {
  return resolve(DICTS[current], `cards.${id}.name`) ?? getCard(id)?.name ?? id;
}
export function cardDesc(id: string): string {
  return resolve(DICTS[current], `cards.${id}.desc`) ?? getCard(id)?.description ?? '';
}

/** Hook: re-renderiza ao trocar de idioma. Retorna { t, locale, setLocale, cardName, cardDesc }. */
export function useI18n() {
  const locale = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
  return { t, locale, setLocale, cardName, cardDesc } as const;
}
