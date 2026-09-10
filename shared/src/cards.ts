import { applyBalancePatches, type BalanceChange } from './engine/balance';
import { validateAll, type CardDef } from './engine/model';
import { BALANCE_HISTORY } from './balanceHistory';

const MELEE = 0.8;
const AGGRO = 5.5;

/**
 * Catálogo de cartas — composição de componentes (ver engine/model.ts).
 * Nomes, valores e descrições são originais deste projeto.
 */
const RAW_CARDS: Record<string, CardDef> = {
  // ================= COMUNS =================
  flechas: {
    id: 'flechas', name: 'Volley', rarity: 'comum', type: 'spell', subtype: 'dano-em-area',
    cost: 3, emoji: '🏹', color: '#8d6e63', tags: ['explosiva'],
    description: 'A wide salvo of arrows peppers a large area for light damage.',
    components: { spell: { radius: 2.5, damage: 145 } },
  },
  bombardeiro: {
    id: 'bombardeiro', name: 'Grenadier', rarity: 'comum', type: 'troop', subtype: 'dano-em-area',
    cost: 2, emoji: '💣', color: '#607d8b', tags: ['terrestre', 'longo-alcance', 'explosiva'],
    description: 'Lobs bombs that burst in an area. Can\'t hit air.',
    components: {
      health: { hp: 190 },
      movement: { speed: 1.6 },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: false },
      attack: { damage: 120, hitSpeed: 1.7, range: 4.5, splashRadius: 1.5 },
    },
  },
  arqueiras: {
    id: 'arqueiras', name: 'Bowmaidens', rarity: 'comum', type: 'troop', subtype: 'suporte',
    cost: 3, emoji: '🏹', color: '#e91e8c', tags: ['terrestre', 'longo-alcance'], deployCount: 2,
    description: 'A versatile pair of shooters that hit air and ground.',
    components: {
      health: { hp: 180 },
      movement: { speed: 1.8 },
      targeting: { targets: 'any', aggroRange: 6, targetsAir: true },
      attack: { damage: 60, hitSpeed: 1.2, range: 4.5 },
    },
  },
  cavaleiro: {
    id: 'cavaleiro', name: 'Sentinel', rarity: 'comum', type: 'troop', subtype: 'tanque',
    cost: 3, emoji: '🛡️', color: '#e0a13e', tags: ['terrestre', 'corpo-a-corpo'],
    description: 'A tough, cheap warrior. Every 2 plays the next comes EVOLVED (shield + extra HP).',
    components: {
      health: { hp: 790 },
      movement: { speed: 1.6 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 105, hitSpeed: 1.2, range: MELEE },
      evolution: { cyclesRequired: 2, multipliers: { hp: 1.2 }, bonusShield: 200 },
    },
  },
  lanceiros: {
    id: 'lanceiros', name: 'Pikers', rarity: 'comum', type: 'troop', subtype: 'enxame',
    cost: 2, emoji: '🔱', color: '#66bb6a', tags: ['terrestre', 'longo-alcance'], deployCount: 3,
    description: 'A fragile trio that throws spears at air and ground.',
    components: {
      health: { hp: 110 },
      movement: { speed: 2.2 },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: true },
      attack: { damage: 35, hitSpeed: 1.7, range: 4 },
    },
  },
  salteadores: {
    id: 'salteadores', name: 'Cutthroats', rarity: 'comum', type: 'troop', subtype: 'enxame',
    cost: 2, emoji: '🔪', color: '#4caf50', tags: ['terrestre', 'corpo-a-corpo'], deployCount: 3,
    description: 'Three fast rogues with sharp daggers.',
    components: {
      health: { hp: 130 },
      movement: { speed: 2.6 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 55, hitSpeed: 1.1, range: MELEE },
    },
  },
  esqueletos: {
    id: 'esqueletos', name: 'Bonekin', rarity: 'comum', type: 'troop', subtype: 'enxame',
    cost: 1, emoji: '💀', color: '#8b7fd4', tags: ['terrestre', 'corpo-a-corpo'], deployCount: 3,
    description: 'Cheap, fragile and great for distraction.',
    components: {
      health: { hp: 80 },
      movement: { speed: 2.2 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 40, hitSpeed: 1.0, range: MELEE },
    },
  },
  morcegos: {
    id: 'morcegos', name: 'Nightwings', rarity: 'comum', type: 'troop', subtype: 'enxame',
    cost: 3, emoji: '🦇', color: '#7e57c2', tags: ['aerea', 'voadora', 'corpo-a-corpo'], deployCount: 3,
    description: 'A fast flying trio that bites anything.',
    components: {
      health: { hp: 120 },
      movement: { speed: 2.4, flying: true },
      targeting: { targets: 'any', aggroRange: AGGRO, targetsAir: true },
      attack: { damage: 50, hitSpeed: 1.1, range: 1.2 },
    },
  },
  canhao: {
    id: 'canhao', name: 'Bombard', rarity: 'comum', type: 'building', subtype: 'defesa',
    cost: 3, emoji: '🔫', color: '#795548', tags: ['terrestre'],
    description: 'Cheap defense that fires on ground targets.',
    components: {
      health: { hp: 700 },
      lifetime: { seconds: 30 },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: false },
      attack: { damage: 110, hitSpeed: 1.0, range: 5.5 },
    },
  },
  barbaros: {
    id: 'barbaros', name: 'Raiders', rarity: 'comum', type: 'troop', subtype: 'enxame',
    cost: 5, emoji: '⚔️', color: '#ff8f00', tags: ['terrestre', 'corpo-a-corpo'], deployCount: 4,
    description: 'A tough axe-wielding quartet. Hard to clear without splash.',
    components: {
      health: { hp: 380 },
      movement: { speed: 1.6 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 75, hitSpeed: 1.4, range: MELEE },
    },
  },
  bobina: {
    id: 'bobina', name: 'Arc Coil', rarity: 'comum', type: 'building', subtype: 'defesa',
    cost: 4, emoji: '⚡', color: '#26c6da', tags: ['terrestre'],
    description: 'An electric tower that zaps air and ground.',
    components: {
      health: { hp: 750 },
      lifetime: { seconds: 35 },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: true },
      attack: { damage: 95, hitSpeed: 1.1, range: 5.5 },
    },
  },
  nuvemDeMorcegos: {
    id: 'nuvemDeMorcegos', name: 'Nightswarm', rarity: 'comum', type: 'troop', subtype: 'enxame',
    cost: 5, emoji: '🦇', color: '#5e35b1', tags: ['aerea', 'voadora', 'corpo-a-corpo'], deployCount: 6,
    description: 'Half a dozen hungry bats darken the sky.',
    components: {
      health: { hp: 120 },
      movement: { speed: 2.4, flying: true },
      targeting: { targets: 'any', aggroRange: AGGRO, targetsAir: true },
      attack: { damage: 50, hitSpeed: 1.1, range: 1.2 },
    },
  },
  choque: {
    id: 'choque', name: 'Jolt', rarity: 'comum', type: 'spell', subtype: 'controle',
    cost: 2, emoji: '⚡', color: '#00bcd4', tags: ['explosiva'],
    description: 'An instant discharge for light damage and a half-second stun.',
    components: { spell: { radius: 2.5, damage: 75, stunSeconds: 0.5 } },
  },
  morteiro: {
    id: 'morteiro', name: 'Longshot', rarity: 'comum', type: 'building', subtype: 'condicao-de-vitoria',
    cost: 4, emoji: '🎯', color: '#546e7a', tags: ['terrestre', 'longo-alcance', 'explosiva'],
    description: 'Very long-range artillery with a slow cadence.',
    components: {
      health: { hp: 800 },
      lifetime: { seconds: 30 },
      targeting: { targets: 'any', aggroRange: 9, targetsAir: false },
      attack: { damage: 120, hitSpeed: 4.5, range: 9, splashRadius: 1.5 },
    },
  },

  // ================= RARAS =================
  bolaDeFogo: {
    id: 'bolaDeFogo', name: 'Meteor', rarity: 'rara', type: 'spell', subtype: 'dano-em-area',
    cost: 4, emoji: '🔥', color: '#f4511e', tags: ['explosiva'],
    description: 'A flaming projectile with heavy damage in a medium area.',
    components: { spell: { radius: 2, damage: 350 } },
  },
  executor: {
    id: 'executor', name: 'Reaver', rarity: 'rara', type: 'troop', subtype: 'assassino',
    cost: 4, emoji: '🤖', color: '#455a64', tags: ['terrestre', 'corpo-a-corpo'],
    description: 'Devastating blows to a single target. Fragile for the cost.',
    components: {
      health: { hp: 680 },
      movement: { speed: 1.8 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 340, hitSpeed: 1.7, range: MELEE },
    },
  },
  mosqueteira: {
    id: 'mosqueteira', name: 'Sharpshooter', rarity: 'rara', type: 'troop', subtype: 'suporte',
    cost: 4, emoji: '🎯', color: '#7e57c2', tags: ['terrestre', 'longo-alcance'],
    description: 'A precise long-range shot against air and ground.',
    components: {
      health: { hp: 400 },
      movement: { speed: 1.6 },
      targeting: { targets: 'any', aggroRange: 6.5, targetsAir: true },
      attack: { damage: 130, hitSpeed: 1.1, range: 5.5 },
    },
  },
  gigante: {
    id: 'gigante', name: 'Juggernaut', rarity: 'rara', type: 'troop', subtype: 'condicao-de-vitoria',
    cost: 5, emoji: '🗿', color: '#a1887f', tags: ['terrestre', 'corpo-a-corpo'],
    description: 'A walking mountain that ignores troops and smashes buildings.',
    components: {
      health: { hp: 3100 },
      movement: { speed: 1.25 },
      targeting: { targets: 'buildings', aggroRange: 99 },
      attack: { damage: 210, hitSpeed: 1.5, range: 1.2 },
    },
  },
  postoDeLanceiros: {
    id: 'postoDeLanceiros', name: 'Pike Outpost', rarity: 'rara', type: 'building', subtype: 'gerador',
    cost: 5, emoji: '🛖', color: '#8bc34a', tags: ['geradora'],
    description: 'Recruits a piker now and then while it lasts.',
    components: {
      health: { hp: 900 },
      lifetime: { seconds: 50 },
      spawner: { cardId: 'lanceiros', count: 1, interval: 4.5 },
    },
  },
  valquiria: {
    id: 'valquiria', name: 'Shieldmaiden', rarity: 'rara', type: 'troop', subtype: 'dano-em-area',
    cost: 4, emoji: '🪓', color: '#ef6c00', tags: ['terrestre', 'corpo-a-corpo', 'explosiva'],
    description: 'A spinning axe that hits everything around her.',
    components: {
      health: { hp: 780 },
      movement: { speed: 1.5 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 100, hitSpeed: 1.4, range: MELEE, splashRadius: 1.3 },
    },
  },
  ossuario: {
    id: 'ossuario', name: 'Bonepit', rarity: 'rara', type: 'building', subtype: 'gerador',
    cost: 3, emoji: '🪦', color: '#9575cd', tags: ['geradora'],
    description: 'Raises skeletons periodically; releases a final wave when it crumbles.',
    components: {
      health: { hp: 350 },
      lifetime: { seconds: 30 },
      spawner: { cardId: 'esqueletos', count: 1, interval: 3.5 },
      deathEffect: { spawn: { cardId: 'esqueletos', count: 4 } },
    },
  },
  torreBombas: {
    id: 'torreBombas', name: 'Blast Keep', rarity: 'rara', type: 'building', subtype: 'defesa',
    cost: 4, emoji: '💣', color: '#6d4c41', tags: ['terrestre', 'explosiva'],
    description: 'A sturdy defense that lobs area bombs at ground troops.',
    components: {
      health: { hp: 850 },
      lifetime: { seconds: 35 },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: false },
      attack: { damage: 100, hitSpeed: 1.6, range: 5.5, splashRadius: 1.5 },
    },
  },
  foguete: {
    id: 'foguete', name: 'Barrage', rarity: 'rara', type: 'spell', subtype: 'dano-em-area',
    cost: 6, emoji: '🚀', color: '#d84315', tags: ['explosiva'],
    description: 'Brutal damage in a small area. Aim well before spending.',
    components: { spell: { radius: 1.5, damage: 700 } },
  },
  acampamento: {
    id: 'acampamento', name: 'War Camp', rarity: 'rara', type: 'building', subtype: 'gerador',
    cost: 6, emoji: '⛺', color: '#ff7043', tags: ['geradora'],
    description: 'Trains a pair of raiders each wave.',
    components: {
      health: { hp: 1100 },
      lifetime: { seconds: 50 },
      spawner: { cardId: 'barbaros', count: 2, interval: 13 },
    },
  },
  torreDeChamas: {
    id: 'torreDeChamas', name: 'Pyre Tower', rarity: 'rara', type: 'building', subtype: 'defesa',
    cost: 5, emoji: '🌋', color: '#e53935', tags: ['terrestre'],
    description: 'A continuous jet that melts tanks with rapid-fire bursts.',
    components: {
      health: { hp: 900 },
      lifetime: { seconds: 35 },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: true },
      attack: { damage: 42, hitSpeed: 0.35, range: 5.5 },
    },
  },
  javali: {
    id: 'javali', name: 'Charger', rarity: 'rara', type: 'troop', subtype: 'condicao-de-vitoria',
    cost: 4, emoji: '🐗', color: '#8d6e63', tags: ['terrestre', 'corpo-a-corpo'],
    description: 'Gallops straight to buildings and leaps the river anywhere.',
    components: {
      health: { hp: 900 },
      movement: { speed: 2.6, jumpsRiver: true },
      targeting: { targets: 'buildings', aggroRange: 99 },
      attack: { damage: 150, hitSpeed: 1.5, range: MELEE },
    },
  },
  mago: {
    id: 'mago', name: 'Arcanist', rarity: 'rara', type: 'troop', subtype: 'dano-em-area',
    cost: 5, emoji: '🧙', color: '#42a5f5', tags: ['terrestre', 'longo-alcance', 'explosiva'],
    description: 'Area fireballs against any target.',
    components: {
      health: { hp: 380 },
      movement: { speed: 1.5 },
      targeting: { targets: 'any', aggroRange: 6, targetsAir: true },
      attack: { damage: 160, hitSpeed: 1.4, range: 5, splashRadius: 1.2 },
    },
  },
  pocoDeElixir: {
    id: 'pocoDeElixir', name: 'Mana Well', rarity: 'rara', type: 'building', subtype: 'gerador',
    cost: 6, emoji: '💧', color: '#d94fd4', tags: ['geradora'],
    description: 'An investment: produces extra elixir while it survives.',
    components: {
      health: { hp: 750 },
      lifetime: { seconds: 60 },
      resource: { elixirInterval: 8 },
    },
  },
  curandeira: {
    id: 'curandeira', name: 'Mender', rarity: 'rara', type: 'troop', subtype: 'suporte',
    cost: 4, emoji: '💚', color: '#26a69a', tags: ['terrestre', 'cura'],
    description: 'Doesn\'t attack: emits an aura that continuously heals nearby allies.',
    components: {
      health: { hp: 550 },
      movement: { speed: 1.5 },
      targeting: { targets: 'any', aggroRange: 0 },
      aura: { radius: 3, healPerSecond: 55 },
    },
  },

  // ================= ÉPICAS =================
  principe: {
    id: 'principe', name: 'Vanguard', rarity: 'epica', type: 'troop', subtype: 'assassino',
    cost: 5, emoji: '🐴', color: '#ffb300', tags: ['terrestre', 'corpo-a-corpo', 'carregadora'],
    description: 'After charging a distance, the next hit deals double damage.',
    components: {
      health: { hp: 1050 },
      movement: { speed: 1.6 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 190, hitSpeed: 1.4, range: 1.0 },
      charge: { distance: 3, multiplier: 2 },
    },
  },
  dragaozinho: {
    id: 'dragaozinho', name: 'Wyrmling', rarity: 'epica', type: 'troop', subtype: 'dano-em-area',
    cost: 4, emoji: '🐉', color: '#66bb6a', tags: ['aerea', 'voadora', 'explosiva'],
    description: 'Flies and breathes area fire. Balanced and hard to punish.',
    components: {
      health: { hp: 720 },
      movement: { speed: 1.8, flying: true },
      targeting: { targets: 'any', aggroRange: 5.5, targetsAir: true },
      attack: { damage: 100, hitSpeed: 1.5, range: 3.5, splashRadius: 1.2 },
    },
  },
  legiaoDeOssos: {
    id: 'legiaoDeOssos', name: 'Bone Legion', rarity: 'epica', type: 'troop', subtype: 'enxame',
    cost: 3, emoji: '☠️', color: '#673ab7', tags: ['terrestre', 'corpo-a-corpo'], deployCount: 10,
    description: 'Ten skeletons at once. Drowns any single target.',
    components: {
      health: { hp: 80 },
      movement: { speed: 2.2 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 40, hitSpeed: 1.0, range: MELEE },
    },
  },
  bruxa: {
    id: 'bruxa', name: 'Bonecaller', rarity: 'epica', type: 'troop', subtype: 'gerador',
    cost: 5, emoji: '🧹', color: '#ab47bc', tags: ['terrestre', 'longo-alcance', 'geradora'],
    description: 'Light area attack that raises skeletons as it advances.',
    components: {
      health: { hp: 520 },
      movement: { speed: 1.5 },
      targeting: { targets: 'any', aggroRange: 6, targetsAir: true },
      attack: { damage: 90, hitSpeed: 1.1, range: 5, splashRadius: 1 },
      spawner: { cardId: 'esqueletos', count: 3, interval: 7 },
    },
  },
  relampago: {
    id: 'relampago', name: 'Thunderstrike', rarity: 'epica', type: 'spell', subtype: 'controle',
    cost: 6, emoji: '🌩️', color: '#fdd835', tags: ['explosiva'],
    description: 'Three bolts strike the HIGHEST-HP enemies in the area, with a stun.',
    components: { spell: { radius: 3.5, damage: 560, stunSeconds: 0.5, multiTargetCount: 3 } },
  },
  barrilSurpresa: {
    id: 'barrilSurpresa', name: 'Ambush Barrel', rarity: 'epica', type: 'spell', subtype: 'utilidade',
    cost: 3, emoji: '🛢️', color: '#7cb342', tags: ['geradora'],
    description: 'Throws a barrel ANYWHERE in the arena; cutthroats spill out.',
    components: { spell: { radius: 1.5, spawn: { cardId: 'salteadores', count: 3 } } },
  },
  carregadorDeBomba: {
    id: 'carregadorDeBomba', name: 'Bombhauler', rarity: 'epica', type: 'troop', subtype: 'tanque',
    cost: 6, emoji: '💀', color: '#78909c', tags: ['terrestre', 'corpo-a-corpo', 'explosiva'],
    description: 'Targets buildings and drops a huge bomb on death.',
    components: {
      health: { hp: 1400 },
      movement: { speed: 1.4 },
      targeting: { targets: 'buildings', aggroRange: 99 },
      attack: { damage: 140, hitSpeed: 1.5, range: 1.2 },
      deathEffect: { damage: { radius: 2, damage: 360 } },
    },
  },
  dirigivel: {
    id: 'dirigivel', name: 'Zeppelin', rarity: 'epica', type: 'troop', subtype: 'condicao-de-vitoria',
    cost: 5, emoji: '🎈', color: '#ef5350', tags: ['aerea', 'voadora', 'explosiva'],
    description: 'Flies over everything toward the towers; drops a bomb when it falls.',
    components: {
      health: { hp: 750 },
      movement: { speed: 1.5, flying: true },
      targeting: { targets: 'buildings', aggroRange: 99 },
      attack: { damage: 400, hitSpeed: 2, range: MELEE },
      deathEffect: { damage: { radius: 1.5, damage: 200 } },
    },
  },
  furia: {
    id: 'furia', name: 'Frenzy', rarity: 'epica', type: 'spell', subtype: 'utilidade',
    cost: 2, emoji: '😈', color: '#ec407a', tags: [],
    description: 'Enrages allies in the area: faster movement and attack.',
    components: { spell: { radius: 3.5, rageSeconds: 6 } },
  },
  balestra: {
    id: 'balestra', name: 'Ballista', rarity: 'epica', type: 'building', subtype: 'condicao-de-vitoria',
    cost: 6, emoji: '🏹', color: '#5d4037', tags: ['terrestre', 'longo-alcance'],
    description: 'A giant crossbow with absurd range and very high cadence.',
    components: {
      health: { hp: 900 },
      lifetime: { seconds: 35 },
      targeting: { targets: 'any', aggroRange: 10, targetsAir: false },
      attack: { damage: 30, hitSpeed: 0.3, range: 10 },
    },
  },
  congelamento: {
    id: 'congelamento', name: 'Frostbind', rarity: 'epica', type: 'spell', subtype: 'controle',
    cost: 4, emoji: '❄️', color: '#4fc3f7', tags: [],
    description: 'Freezes enemies in the area for a few seconds. Deals no damage.',
    components: { spell: { radius: 3, freezeSeconds: 4 } },
  },
  colosso: {
    id: 'colosso', name: 'Warbreaker', rarity: 'epica', type: 'troop', subtype: 'tanque',
    cost: 7, emoji: '🦾', color: '#37474f', tags: ['terrestre', 'corpo-a-corpo'],
    description: 'Slow, costly and absolutely devastating blow by blow.',
    components: {
      health: { hp: 2500 },
      movement: { speed: 1.2 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 510, hitSpeed: 1.8, range: MELEE },
    },
  },
  espelho: {
    id: 'espelho', name: 'Echo', rarity: 'epica', type: 'mirror', subtype: 'utilidade',
    cost: 0, emoji: '🪞', color: '#b39ddb', tags: [],
    description: 'Repeats the last card you played, for +1 elixir.',
    components: {},
  },
  golem: {
    id: 'golem', name: 'Monolith', rarity: 'epica', type: 'troop', subtype: 'condicao-de-vitoria',
    cost: 8, emoji: '🪨', color: '#6d4c41', tags: ['terrestre', 'corpo-a-corpo', 'explosiva'],
    description: 'A stone colossus that splits into two shards on death.',
    components: {
      health: { hp: 3400 },
      movement: { speed: 1.1 },
      targeting: { targets: 'buildings', aggroRange: 99 },
      attack: { damage: 195, hitSpeed: 1.5, range: 1.2 },
      deathEffect: { spawn: { cardId: 'fragmentoDeGolem', count: 2 } },
    },
  },
  guardiaoRunico: {
    id: 'guardiaoRunico', name: 'Runeguard', rarity: 'epica', type: 'troop', subtype: 'tanque',
    cost: 4, emoji: '🔰', color: '#3f51b5', tags: ['terrestre', 'corpo-a-corpo', 'escudo'],
    description: 'A runic shield absorbs damage before HP. Break it first.',
    components: {
      health: { hp: 600, shield: 500 },
      movement: { speed: 1.5 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 110, hitSpeed: 1.3, range: MELEE },
    },
  },
  laminaFaminta: {
    id: 'laminaFaminta', name: 'Bloodblade', rarity: 'epica', type: 'troop', subtype: 'assassino',
    cost: 4, emoji: '🗡️', color: '#c62828', tags: ['terrestre', 'corpo-a-corpo'],
    description: 'Steals HP on every hit and restores itself on kills.',
    components: {
      health: { hp: 620 },
      movement: { speed: 2.0 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 160, hitSpeed: 1.2, range: MELEE, lifestealPct: 0.4, healOnKill: 120 },
    },
  },
  nevoaVenenosa: {
    id: 'nevoaVenenosa', name: 'Venom Cloud', rarity: 'epica', type: 'spell', subtype: 'dano-em-area',
    cost: 4, emoji: '☠️', color: '#7cb342', tags: ['veneno'],
    description: 'Leaves a toxic cloud that corrodes everything in the area for 8 seconds.',
    components: {
      spell: {
        radius: 2.5,
        damage: 0,
        zone: { durationSeconds: 8, pulseDamage: 55, pulseInterval: 1 },
      },
    },
  },
  trollRegenerante: {
    id: 'trollRegenerante', name: 'Everliving Troll', rarity: 'epica', type: 'troop', subtype: 'tanque',
    cost: 5, emoji: '🧌', color: '#558b2f', tags: ['terrestre', 'corpo-a-corpo', 'cura'],
    description: 'Regenerates HP nonstop. Kill it fast or never.',
    components: {
      health: { hp: 1600, regenPerSecond: 45 },
      movement: { speed: 1.3 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 130, hitSpeed: 1.5, range: MELEE },
    },
  },

  // ================= CAMPEÕES =================
  campeaValente: {
    id: 'campeaValente', name: 'Dawnblade', rarity: 'epica', type: 'champion', subtype: 'tanque',
    cost: 4, emoji: '⚜️', color: '#ffd700', tags: ['terrestre', 'corpo-a-corpo', 'escudo'],
    description: 'Champion with an active ability: Bulwark raises a shield and enrages her for a few seconds. Max 1 champion per deck.',
    components: {
      health: { hp: 1200 },
      movement: { speed: 1.6 },
      targeting: { targets: 'any', aggroRange: AGGRO },
      attack: { damage: 140, hitSpeed: 1.2, range: MELEE },
      ability: {
        name: 'Bulwark',
        description: 'Gains 400 shield and rage for 3s.',
        cost: 2,
        cooldownSeconds: 14,
        effect: { shieldGain: 400, rageSelfSeconds: 3 },
      },
    },
  },
  mestreDasTempestades: {
    id: 'mestreDasTempestades', name: 'Storm Warden', rarity: 'epica', type: 'champion', subtype: 'dano-em-area',
    cost: 5, emoji: '🌪️', color: '#4dd0e1', tags: ['terrestre', 'longo-alcance', 'explosiva'],
    description: 'Ranged champion. Ability: Tempest deals area damage around him and heals him. Max 1 champion per deck.',
    components: {
      health: { hp: 620 },
      movement: { speed: 1.5 },
      targeting: { targets: 'any', aggroRange: 6, targetsAir: true },
      attack: { damage: 150, hitSpeed: 1.3, range: 5 },
      ability: {
        name: 'Tempest',
        description: 'Deals 260 damage in a 2.5 radius and heals 200.',
        cost: 3,
        cooldownSeconds: 16,
        effect: { damage: 260, radius: 2.5, healSelf: 200 },
      },
    },
  },

  // ================= INTERNAS =================
  fragmentoDeGolem: {
    id: 'fragmentoDeGolem', name: 'Stone Shard', rarity: 'epica', type: 'troop', subtype: 'tanque',
    cost: 0, emoji: '🪨', color: '#8d6e63', tags: ['terrestre', 'corpo-a-corpo'], hidden: true,
    description: 'A living piece of a destroyed golem.',
    components: {
      health: { hp: 700 },
      movement: { speed: 1.1 },
      targeting: { targets: 'buildings', aggroRange: 99 },
      attack: { damage: 60, hitSpeed: 1.5, range: 1.0 },
      deathEffect: { damage: { radius: 1.2, damage: 80 } },
    },
  },
};

// Aplica o histórico de balanceamento (dados, não código) e valida tudo.
const failedPatches: BalanceChange[] = applyBalancePatches(RAW_CARDS, BALANCE_HISTORY);
if (failedPatches.length > 0) {
  throw new Error(`Patches de balanceamento inválidos: ${failedPatches.map((p) => `${p.cardId}.${p.attribute}`).join(', ')}`);
}
const issues = validateAll(RAW_CARDS);
if (issues.length > 0) {
  throw new Error(`Cartas inválidas: ${issues.map((i) => `${i.cardId}.${i.field} (${i.message})`).join('; ')}`);
}

export const CARDS: Record<string, CardDef> = RAW_CARDS;

/** Deck inicial. */
export const DEFAULT_DECK: string[] = [
  'cavaleiro',
  'arqueiras',
  'salteadores',
  'esqueletos',
  'flechas',
  'bolaDeFogo',
  'canhao',
  'mosqueteira',
];

export function getCard(cardId: string): CardDef | undefined {
  return CARDS[cardId];
}

/** Cartas visíveis na coleção e válidas em decks. */
export function collectionCards(): CardDef[] {
  return Object.values(CARDS).filter((card) => !card.hidden);
}

export const DECK_SIZE = 8;
export const MAX_CARD_LEVEL = 3;
/** Bônus de vida/dano por nível acima do 1 (+8% por nível) */
export const LEVEL_STAT_BONUS = 0.08;

export function levelMultiplier(level: number | undefined): number {
  const clamped = Math.min(MAX_CARD_LEVEL, Math.max(1, level ?? 1));
  return 1 + LEVEL_STAT_BONUS * (clamped - 1);
}

/** Sanitiza níveis vindos do cliente: só cartas existentes, 1..MAX. */
export function sanitizeCardLevels(raw: unknown): Record<string, number> {
  const levels: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (CARDS[id] && typeof value === 'number' && Number.isFinite(value)) {
        levels[id] = Math.min(MAX_CARD_LEVEL, Math.max(1, Math.round(value)));
      }
    }
  }
  return levels;
}

/** Valida um deck: 8 cartas únicas, existentes, não internas e no máx. 1 campeão. */
export function isValidDeck(deck: unknown): deck is string[] {
  if (
    !Array.isArray(deck) ||
    deck.length !== DECK_SIZE ||
    !deck.every(
      (id) => typeof id === 'string' && CARDS[id] !== undefined && CARDS[id].hidden !== true,
    ) ||
    new Set(deck).size !== DECK_SIZE
  ) {
    return false;
  }
  const champions = deck.filter((id) => CARDS[id].type === 'champion').length;
  return champions <= 1;
}
