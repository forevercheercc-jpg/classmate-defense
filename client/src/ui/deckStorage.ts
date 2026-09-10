import { DEFAULT_DECK, isValidDeck } from '@claude-royale/shared';

const STORAGE_KEY = 'claude-royale:deck';

export function loadDeck(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidDeck(parsed)) return parsed;
    }
  } catch {
    // storage indisponível ou corrompido — usa o padrão
  }
  return [...DEFAULT_DECK];
}

export function saveDeck(deck: string[]): void {
  if (!isValidDeck(deck)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  } catch {
    // storage indisponível (modo privado etc.) — deck vale só para a sessão
  }
}
