import { MapSchema, ArraySchema, Schema, type } from '@colyseus/schema';

export class EntitySchema extends Schema {
  @type('string') id = '';
  @type('string') kind = 'unit';
  @type('string') side = 'left';
  @type('string') cardId = '';
  @type('string') tower = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') hp = 0;
  @type('number') maxHp = 0;
  @type('string') action = 'idle';
  @type('number') facing = 1;
  @type('boolean') dormant = false;
  @type('number') shield = 0;
  /** '' | stunned | frozen | raged | charging */
  @type('string') status = '';
  @type('boolean') evolved = false;
  /** Campeões: recarga da habilidade (s) */
  @type('number') abilityCooldown = 0;
  /** ===== 防守模式字段 ===== */
  /** 怪物种类（horde / ogre / imp），空字符串 = 玩家单位 */
  @type('string') mobVariant = '';
  /** 防守模式：路线 0..2（怪物与点位都有） */
  @type('number') lane = -1;
  /** 防守模式：点位序号 0/1/2，仅点位有 */
  @type('number') pointIndex = -1;
  /** 防守模式：点位强化倍率（越靠近核心越高） */
  @type('number') buff = 1;
  /** 防守模式 M1：野怪营地归属索引（-1 = 不是野怪） */
  @type('number') campIndex = -1;
  /** 防守模式 M1：是否为肉山 */
  @type('boolean') isRoshan = false;
}

export class PlayerSchema extends Schema {
  @type('string') side = 'left';
  @type('number') elixir = 0;
  @type('number') crowns = 0;
  @type(['string']) hand = new ArraySchema<string>();
  @type('string') nextCard = '';
  @type('string') name = '';
}

export class BattleState extends Schema {
  @type('string') phase = 'waiting';
  @type('string') roomCode = '';
  @type('number') timeRemaining = 0;
  @type('boolean') suddenDeath = false;
  @type('boolean') tiebreaker = false;
  @type('string') winner = '';
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: EntitySchema }) entities = new MapSchema<EntitySchema>();
  /** ===== 防守模式字段 ===== */
  @type('boolean') defense = false;
  @type('number') wave = 1;
  @type('number') waveCountdown = 0;
  @type('number') coreHp = 0;
  @type('number') coreMaxHp = 0;
  /** M1：肉山状态 0=未苏醒 1=苏醒 2=已击杀 */
  @type('number') roshanState = 0;
  /** M1：肉山刷新倒计时（秒） */
  @type('number') roshanRespawn = 0;
  /** M1：全队强化 Buff 剩余秒数 */
  @type('number') teamBuffSeconds = 0;
}
