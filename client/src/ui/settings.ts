/** Configurações do jogador: acessibilidade e idioma. */
export interface Settings {
  /** Desliga clima, luzes e rastros (fotossensibilidade / aparelho fraco) */
  reduceEffects: boolean;
  /** Marcadores de forma (▲/●) além da cor dos times */
  colorblind: boolean;
  /** Multiplicador de fonte da UI (1 | 1.15 | 1.3) */
  fontScale: number;
  /** pt | en | es */
  lang: string;
}

const KEY = 'claude-royale:settings';
const DEFAULTS: Settings = { reduceEffects: false, colorblind: false, fontScale: 1, lang: 'pt' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // padrão
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // sessão apenas
  }
  document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
}
