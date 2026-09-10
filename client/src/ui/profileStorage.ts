const STORAGE_KEY = 'claude-royale:profile';

export interface MatchRecord {
  result: 'win' | 'loss' | 'draw';
  myCrowns: number;
  oppCrowns: number;
  vsBot: boolean;
  botDifficulty?: string;
  usedAbility?: boolean;
  oppName?: string;
  at: string; // ISO
}

export interface RivalRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface Profile {
  name: string;
  registered: boolean;
  trophies: number;
  gold: number;
  history: MatchRecord[];
  /** id da conquista → data ISO do desbloqueio */
  achievements: Record<string, string>;
  /** níveis das cartas (1–3) */
  cardLevels: Record<string, number>;
  /** histórico contra cada oponente (rivalidade) */
  rivals: Record<string, RivalRecord>;
  /** Temporada corrente (AAAA-MM) — muda = rollover com recompensa */
  seasonId?: string;
  stats: {
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    crowns: number;
  };
}

const DEFAULT_PROFILE: Profile = {
  name: 'Jogador',
  registered: false,
  trophies: 0,
  gold: 0,
  history: [],
  achievements: {},
  cardLevels: {},
  rivals: {},
  stats: { matches: 0, wins: 0, losses: 0, draws: 0, crowns: 0 },
};

const TROPHIES_WIN = 30;
const TROPHIES_LOSS = 20;
const GOLD_WIN = 40;
const GOLD_LOSS = 15;
const GOLD_PERFECT_BONUS = 25;
const HISTORY_LIMIT = 10;

export const UPGRADE_COSTS: Record<number, number> = { 2: 100, 3: 250 };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === 'string') {
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          achievements: parsed.achievements ?? {},
          cardLevels: parsed.cardLevels ?? {},
          rivals: parsed.rivals ?? {},
          stats: { ...DEFAULT_PROFILE.stats, ...(parsed.stats ?? {}) },
          history: parsed.history ?? [],
        };
      }
    }
  } catch {
    // storage indisponível/corrompido — perfil padrão
  }
  return { ...DEFAULT_PROFILE };
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // modo privado etc. — perfil vale só para a sessão
  }
}

/** Registra uma partida: troféus (só 1v1), ouro e estatísticas. */
export function recordMatch(profile: Profile, record: MatchRecord): Profile {
  let trophies = profile.trophies;
  if (!record.vsBot) {
    if (record.result === 'win') trophies += TROPHIES_WIN;
    if (record.result === 'loss') trophies = Math.max(0, trophies - TROPHIES_LOSS);
  }
  const gold =
    profile.gold +
    (record.result === 'win' ? GOLD_WIN : GOLD_LOSS) +
    (record.result === 'win' && record.myCrowns >= 3 ? GOLD_PERFECT_BONUS : 0);

  // Rivalidade: placar acumulado contra este oponente (só 1v1 humano)
  const rivals = { ...profile.rivals };
  if (!record.vsBot && record.oppName) {
    const rival = rivals[record.oppName] ?? { wins: 0, losses: 0, draws: 0 };
    rivals[record.oppName] = {
      wins: rival.wins + (record.result === 'win' ? 1 : 0),
      losses: rival.losses + (record.result === 'loss' ? 1 : 0),
      draws: rival.draws + (record.result === 'draw' ? 1 : 0),
    };
  }

  const next: Profile = {
    ...profile,
    trophies,
    gold,
    rivals,
    history: [record, ...profile.history].slice(0, HISTORY_LIMIT),
    stats: {
      matches: profile.stats.matches + 1,
      wins: profile.stats.wins + (record.result === 'win' ? 1 : 0),
      losses: profile.stats.losses + (record.result === 'loss' ? 1 : 0),
      draws: profile.stats.draws + (record.result === 'draw' ? 1 : 0),
      crowns: profile.stats.crowns + record.myCrowns,
    },
  };
  saveProfile(next);
  return next;
}

/**
 * Temporadas mensais: na virada, troféus acima de 100 são reduzidos pela
 * metade (soft reset) e o jogador recebe ouro pela arena final alcançada.
 * Retorna null se não houve virada.
 */
export function applySeasonRollover(
  profile: Profile,
  arenaIndex: number,
): { profile: Profile; reward: number } | null {
  const currentSeason = new Date().toISOString().slice(0, 7); // AAAA-MM
  if (profile.seasonId === currentSeason) return null;
  const isFirstRun = profile.seasonId === undefined;
  const reward = isFirstRun ? 0 : (arenaIndex + 1) * 50;
  const trophies = isFirstRun
    ? profile.trophies
    : profile.trophies > 100
      ? Math.round(100 + (profile.trophies - 100) / 2)
      : profile.trophies;
  const next: Profile = {
    ...profile,
    seasonId: currentSeason,
    trophies,
    gold: profile.gold + reward,
  };
  saveProfile(next);
  return { profile: next, reward };
}

/** Tenta melhorar uma carta com ouro. Retorna o perfil novo ou null se não puder. */
export function upgradeCard(profile: Profile, cardId: string): Profile | null {
  const current = profile.cardLevels[cardId] ?? 1;
  const targetLevel = current + 1;
  const cost = UPGRADE_COSTS[targetLevel];
  if (!cost || profile.gold < cost) return null;
  const next: Profile = {
    ...profile,
    gold: profile.gold - cost,
    cardLevels: { ...profile.cardLevels, [cardId]: targetLevel },
  };
  saveProfile(next);
  return next;
}
