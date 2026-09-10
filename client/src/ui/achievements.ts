import type { MatchRecord, Profile } from './profileStorage';

/** Conquistas: avaliadas após cada partida a partir do perfil e do resultado. */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  emoji: string;
  check: (profile: Profile, record: MatchRecord) => boolean;
}

// Nome/descrição são padrão (inglês); a UI traduz por id via i18n (ach.<id>).
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'primeira-vitoria', name: 'First Win', emoji: '🎉',
    description: 'Win your first match.',
    check: (p) => p.stats.wins >= 1,
  },
  {
    id: 'veterano', name: 'Veteran', emoji: '🎖️',
    description: 'Win 10 matches.',
    check: (p) => p.stats.wins >= 10,
  },
  {
    id: 'maratonista', name: 'Marathoner', emoji: '🏃',
    description: 'Play 20 matches.',
    check: (p) => p.stats.matches >= 20,
  },
  {
    id: 'colecionador-de-coroas', name: 'Crown Collector', emoji: '👑',
    description: 'Collect 25 crowns.',
    check: (p) => p.stats.crowns >= 25,
  },
  {
    id: 'vitoria-perfeita', name: 'Flawless Victory', emoji: '💎',
    description: 'Win a match with 3 crowns.',
    check: (_, r) => r.result === 'win' && r.myCrowns >= 3,
  },
  {
    id: 'muralha', name: 'Ironwall', emoji: '🧱',
    description: 'Win without losing a tower.',
    check: (_, r) => r.result === 'win' && r.oppCrowns === 0,
  },
  {
    id: 'domador-de-maquinas', name: 'Machine Tamer', emoji: '🤖',
    description: 'Beat the bot on Hard.',
    check: (_, r) => r.result === 'win' && r.vsBot && r.botDifficulty === 'hard',
  },
  {
    id: 'toque-de-mestre', name: "Master's Touch", emoji: '✨',
    description: 'Use a champion ability in a match.',
    check: (_, r) => r.usedAbility === true,
  },
  {
    id: 'ascensao', name: 'Ascension', emoji: '📈',
    description: 'Reach 100 trophies.',
    check: (p) => p.trophies >= 100,
  },
  {
    id: 'lenda-da-arena', name: 'Arena Legend', emoji: '🌟',
    description: 'Reach 500 trophies.',
    check: (p) => p.trophies >= 500,
  },
];

/** Retorna as conquistas recém-desbloqueadas e grava as datas no perfil (mutação no objeto novo). */
export function evaluateAchievements(profile: Profile, record: MatchRecord): AchievementDef[] {
  const unlocked: AchievementDef[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (profile.achievements[achievement.id]) continue;
    if (achievement.check(profile, record)) {
      profile.achievements[achievement.id] = new Date().toISOString();
      unlocked.push(achievement);
    }
  }
  return unlocked;
}

/** Caminho dos Troféus: arenas por faixa. Nome é padrão (inglês); UI traduz por id. */
export interface Arena {
  id: string;
  name: string;
  emoji: string;
  minTrophies: number;
}

export const ARENAS: Arena[] = [
  { id: 'glade', name: 'Rookie Glade', emoji: '🌱', minTrophies: 0 },
  { id: 'bridge', name: 'Stone Bridge', emoji: '🌉', minTrophies: 100 },
  { id: 'dunes', name: 'Scorching Dunes', emoji: '🏜️', minTrophies: 200 },
  { id: 'peaks', name: 'Snowy Peaks', emoji: '🏔️', minTrophies: 300 },
  { id: 'vale', name: 'Nightfall Vale', emoji: '🌙', minTrophies: 450 },
  { id: 'colosseum', name: 'Royal Colosseum', emoji: '🏟️', minTrophies: 600 },
];

export function currentArena(trophies: number): Arena {
  return [...ARENAS].reverse().find((arena) => trophies >= arena.minTrophies) ?? ARENAS[0];
}

export function nextArena(trophies: number): Arena | null {
  return ARENAS.find((arena) => arena.minTrophies > trophies) ?? null;
}
