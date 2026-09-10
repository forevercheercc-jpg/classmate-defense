import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { getCard, gridToScreen } from '@claude-royale/shared';
import type { SimEvent } from '@claude-royale/shared';
import { drawArena, drawDeployZone, drawDropPreview, type ArenaTheme } from './arena';
import { ambient } from './ambient';
import { loadSettings } from '../ui/settings';
import { EntityView } from './EntityView';
import { bus } from './bus';
import {
  ANIMATED_DECO, BUILDING_TEXTURES, EXPLOSION, FIRE, SFX, STATIC_DECO,
  UNIT_ANIM_FRAMES, UNIT_FRAME_SIZE, sfxUrl, unitSheetKey, unitSheetUrl,
  type SideColor, type UnitAnim, type UnitAsset,
} from './assets';

const UNIT_TYPES: UnitAsset[] = ['warrior', 'archer', 'pawn'];
const SIDE_COLORS: SideColor[] = ['blue', 'red'];
const UNIT_ANIMS: UnitAnim[] = ['idle', 'run', 'attack'];
const ANIM_FRAME_RATE: Record<UnitAnim, number> = { idle: 8, run: 10, attack: 12 };

/** Decorações espalhadas pelas bordas da arena: [key, gx, gy, escala]. */
const DECO_PLACEMENTS: Array<[string, number, number, number]> = [
  ['tree1', 0.8, 0.8, 0.9], ['tree2', 3.2, 0.6, 0.8], ['tree1', 28.8, 0.7, 0.85],
  ['tree2', 31.2, 1.0, 0.9], ['tree1', 0.7, 16.8, 1.0], ['tree2', 31.3, 16.9, 1.0],
  ['tree1', 9.5, 0.5, 0.75], ['tree2', 22.5, 0.5, 0.75],
  ['bush1', 5.5, 17.2, 0.8], ['bush1', 26.5, 17.2, 0.8], ['bush1', 12.5, 0.4, 0.7],
  ['rock1', 2.2, 12.5, 0.8], ['rock2', 29.8, 5.5, 0.8],
  ['rock2', 8.5, 8.8, 0.7], ['rock1', 23.5, 9.2, 0.7],
  ['water_rocks', 16, 8.2, 0.9], ['water_rocks', 16, 10.4, 0.75],
];

export class BattleScene extends Phaser.Scene {
  private room!: Room;
  private mySide: 'left' | 'right' = 'left';
  private theme: ArenaTheme = 'campo';
  private defenseMode = false;
  private defenseHud!: Phaser.GameObjects.Graphics;
  private defenseHudText!: Phaser.GameObjects.Text;
  private views = new Map<string, EntityView>();
  private deployZone!: Phaser.GameObjects.Graphics;
  private dropPreview!: Phaser.GameObjects.Graphics;
  private cleanups: Array<() => void> = [];
  private lastSfxAt = new Map<string, number>();

  constructor() {
    super('battle');
  }

  init(data: { room: Room; mySide: 'left' | 'right'; theme?: ArenaTheme; defense?: boolean }): void {
    this.room = data.room;
    this.mySide = data.mySide;
    this.theme = data.theme ?? 'campo';
    this.defenseMode = data.defense === true;
  }

  preload(): void {
    for (const unit of UNIT_TYPES) {
      for (const color of SIDE_COLORS) {
        for (const anim of UNIT_ANIMS) {
          this.load.spritesheet(unitSheetKey(unit, color, anim), unitSheetUrl(unit, color, anim), {
            frameWidth: UNIT_FRAME_SIZE,
            frameHeight: UNIT_FRAME_SIZE,
          });
        }
      }
    }
    for (const { key, url } of BUILDING_TEXTURES) this.load.image(key, url);
    for (const { key, url } of STATIC_DECO) this.load.image(key, url);
    for (const { key, url, frameW, frameH } of ANIMATED_DECO) {
      this.load.spritesheet(key, url, { frameWidth: frameW, frameHeight: frameH });
    }
    this.load.spritesheet(EXPLOSION.key, EXPLOSION.url, {
      frameWidth: EXPLOSION.frameW,
      frameHeight: EXPLOSION.frameH,
    });
    this.load.spritesheet(FIRE.key, FIRE.url, {
      frameWidth: FIRE.frameW,
      frameHeight: FIRE.frameH,
    });
    for (const key of SFX) this.load.audio(key, sfxUrl(key));
  }

  create(): void {
    const bgByTheme: Record<ArenaTheme, string> = {
      campo: '#2c3e2a', deserto: '#5a4a2c', neve: '#5c6b76', noite: '#101a14',
    };
    this.cameras.main.setBackgroundColor(bgByTheme[this.theme]);
    const arena = this.add.graphics();
    drawArena(arena, this.theme);
    arena.setDepth(-1000);

    // Iluminação dinâmica: ambiente claro de dia, escuro à noite (luzes ganham peso)
    try {
      const ambientByTheme: Record<ArenaTheme, number> = {
        campo: 0xdddddd, deserto: 0xe8dcc0, neve: 0xe6ecf2, noite: 0x556077,
      };
      this.lights.enable().setAmbientColor(ambientByTheme[this.theme]);
      arena.setPipeline('Light2D');
      if (this.theme === 'noite') {
        // Tochas cintilando nas seis torres
        for (const [tx, ty] of [[2.5, 9], [6, 4.5], [6, 13.5], [29.5, 9], [26, 4.5], [26, 13.5]]) {
          const p = gridToScreen(tx, ty);
          const torch = this.lights.addLight(p.x, p.y - 60, 160, 0xffaa55, 1.4);
          this.time.addEvent({
            delay: 120, loop: true,
            callback: () => { torch.intensity = 1.2 + Math.random() * 0.5; },
          });
        }
      }
    } catch {
      // Canvas renderer: sem Light2D
    }

    this.deployZone = this.add.graphics();
    this.deployZone.setDepth(-900);
    this.dropPreview = this.add.graphics();
    this.dropPreview.setDepth(-850);

    // Acessibilidade + desempenho: flags lidas pelos efeitos
    const settings = loadSettings();
    this.registry.set('colorblind', settings.colorblind);
    this.registry.set('lowQuality', settings.reduceEffects);

    this.createAnimations();
    this.createProjectileTextures();
    this.placeDecorations();
    this.startAmbientLife();
    this.buildCrowd();
    this.startWeather();

    // Renderização adaptativa: FPS baixo desliga clima/luzes/rastros sozinho
    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        if (!this.registry.get('lowQuality') && this.game.loop.actualFps < 40) {
          this.registry.set('lowQuality', true);
        }
      },
    });

    this.cleanups.push(
      bus.on('simEvents', (events: SimEvent[]) => {
        for (const event of events) this.playEffect(event);
      }),
      bus.on('emote', ({ side, emoji }) => this.showEmote(side, emoji)),
      bus.on('dragStart', ({ cardId }) => {
        const type = getCard(cardId)?.type;
        if (type === 'troop' || type === 'building') {
          drawDeployZone(this.deployZone, this.mySide);
        }
      }),
      bus.on('dragMove', (move) => {
        if (!move) {
          this.dropPreview.clear();
          return;
        }
        const card = getCard(move.cardId);
        drawDropPreview(this.dropPreview, move.gx, move.gy, move.valid, card?.components.spell?.radius);
      }),
      bus.on('dragEnd', () => {
        this.deployZone.clear();
        this.dropPreview.clear();
      }),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanups.forEach((fn) => fn());
    });

    // 防守模式（M0 同学局版）：跳开原卡牌手牌监听，绘制 3 路 lane + HUD
    if (this.defenseMode) {
      this.setupDefenseOverlay();
    }
  }

  /**
   * 防守模式（M0）的极简 overlay：
   * - 画 3 条进攻 lane 的竖条色块
   * - 复用 LANE_XS 投影定位
   * - 顶部 HUD：wave 序号 / 距离下波倒计时 / 核心 HP 条
   * - 监听 room.state 增量更新 HUD
   */
  private setupDefenseOverlay(): void {
    import('@claude-royale/shared').then(({ LANE_XS, POINT_YS, CORE_POS, CORE_RADIUS,
                                            POINT_RADIUS, CORE_HP }) => {
      const laneGfx = this.add.graphics();
      laneGfx.setDepth(-500);

      // 3 条 lane 中央亮带 + 浅色通道
      const laneCols = [0xff5a5a, 0xff9c3a, 0x5ac5ff];
      for (let i = 0; i < LANE_XS.length; i++) {
        const cx = LANE_XS[i]!;
        const top = gridToScreen(cx, 0);
        const bot = gridToScreen(cx, GRID_H);
        laneGfx.fillStyle(laneCols[i]!, 0.06);
        laneGfx.fillRect(top.x - 50, top.y, 100, bot.y - top.y);
        laneGfx.lineStyle(2, laneCols[i]!, 0.5);
        laneGfx.lineBetween(cx + 0, top.y, cx + 0, bot.y);
        // 起讫标签
        this.add.text(top.x - 16, top.y - 18, `L${i + 1}`, {
          fontSize: '14px', color: '#ffffff',
        }).setDepth(100);
      }

      // 9 个点位 + 1 个核心 highlight（按 entity state 的实际位置）
      const pointsGfx = this.add.graphics();
      pointsGfx.setDepth(-400);
      const updatePoints = () => {
        pointsGfx.clear();
        for (const [, ent] of Object.entries(this.room.state.entities)) {
          const e = ent as Record<string, unknown>;
          if (e.kind !== 'tower' || e.side !== 'left') continue;
          const p = gridToScreen(Number(e.x), Number(e.y));
          const isCore = e.tower === 'king';
          const r = isCore ? CORE_RADIUS : POINT_RADIUS;
          const scale = isCore ? 1.5 : 1.0;
          const sp = gridToScreen(Number(e.x), Number(e.y));
          const tw = this.cameras.main.scaleManager.zoom;
          // 用 sp 转屏幕坐标（gridToScreen 输出已含 phaser scale 因子）
          void r; void scale; void tw;
          if (isCore) {
            pointsGfx.fillStyle(0xffd54f, 0.7);
            pointsGfx.fillCircle(sp.x, sp.y, 14);
            pointsGfx.lineStyle(2, 0xffd54f, 0.9);
            pointsGfx.strokeCircle(sp.x, sp.y, 18);
          } else {
            const alive = (e.hp as number) > 0;
            pointsGfx.fillStyle(alive ? 0x80cbc4 : 0x555555, alive ? 0.55 : 0.3);
            pointsGfx.fillCircle(sp.x, sp.y, 8);
            pointsGfx.lineStyle(1, alive ? 0x4db6ac : 0x888888, 0.9);
            pointsGfx.strokeCircle(sp.x, sp.y, 10);
          }
        }
      };
      updatePoints();

      // HUD 文本 / 进度条（顶部）
      const hudText = this.add.text(20, 20, '防守模式', {
        fontSize: '20px', color: '#ffffff',
        fontStyle: 'bold',
      }).setDepth(2000);
      const hudBar = this.add.graphics().setDepth(2000);
      const updateHud = () => {
        const st = this.room.state as Record<string, unknown>;
        const wave = (st.wave as number) ?? 1;
        const cd = (st.waveCountdown as number) ?? 0;
        const coreHp = (st.coreHp as number) ?? 0;
        const coreMax = (st.coreMaxHp as number) ?? CORE_HP;
        const phase = String(st.phase ?? 'battle');
        const winner = String(st.winner ?? '');
        hudText.setText(
          `🛡️ 防守 · Wave ${wave} · ${phase === 'ended' ? `胜负：${winner || '持平'}` : `下波 ${cd.toFixed(1)}s`} · 核心 ${Math.round(coreHp)}/${Math.round(coreMax)}`,
        );
        hudBar.clear();
        const barW = 240, barH = 18;
        const px = 20, py = 48;
        hudBar.fillStyle(0x000000, 0.6);
        hudBar.fillRect(px, py, barW, barH);
        const ratio = coreMax > 0 ? Math.max(0, coreHp / coreMax) : 0;
        hudBar.fillStyle(ratio > 0.4 ? 0x66bb6a : ratio > 0.2 ? 0xffb74d : 0xef5350, 1);
        hudBar.fillRect(px, py, barW * ratio, barH);
        hudBar.lineStyle(1, 0xffffff, 0.6);
        hudBar.strokeRect(px, py, barW, barH);
      };
      updateHud();

      // 监听 schema state 增量变化
      const onStateChange = () => {
        updatePoints();
        updateHud();
      };
      this.room.onStateChange(onStateChange);
      this.cleanups.push(() => this.room.onStateChange(undefined as any));
      void POINT_YS; // M1 占位，TODO M2 加点位 boss 焦点动画
    }).catch((err) => console.error('defense overlay init failed', err));
  }

  private createAnimations(): void {
    for (const unit of UNIT_TYPES) {
      for (const color of SIDE_COLORS) {
        for (const anim of UNIT_ANIMS) {
          const key = unitSheetKey(unit, color, anim);
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(key, {
              start: 0,
              end: UNIT_ANIM_FRAMES[unit][anim] - 1,
            }),
            frameRate: ANIM_FRAME_RATE[anim],
            repeat: -1,
          });
        }
      }
    }
    for (const { key, frames } of ANIMATED_DECO) {
      this.anims.create({
        key: `${key}_sway`,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    this.anims.create({
      key: 'explosion_boom',
      frames: this.anims.generateFrameNumbers(EXPLOSION.key, { start: 0, end: EXPLOSION.frames - 1 }),
      frameRate: 18,
      repeat: 0,
    });
    this.anims.create({
      key: 'fire_burn',
      frames: this.anims.generateFrameNumbers(FIRE.key, { start: 0, end: FIRE.frames - 1 }),
      frameRate: 12,
      repeat: -1,
    });
  }

  /** Texturas dos projéteis, geradas proceduralmente (flecha e pedra de torre). */
  private createProjectileTextures(): void {
    const arrow = this.make.graphics({ x: 0, y: 0 }, false);
    arrow.fillStyle(0x8d6e63);
    arrow.fillRect(0, 3, 22, 2.5); // haste
    arrow.fillStyle(0xcfd8dc);
    arrow.fillTriangle(22, 0, 22, 8, 30, 4); // ponta
    arrow.fillStyle(0xeceff1);
    arrow.fillTriangle(0, 0, 6, 4, 0, 8); // penas
    arrow.generateTexture('proj_arrow', 30, 8);
    arrow.destroy();

    const bolt = this.make.graphics({ x: 0, y: 0 }, false);
    bolt.fillStyle(0x78909c);
    bolt.fillCircle(6, 6, 6);
    bolt.fillStyle(0xb0bec5);
    bolt.fillCircle(4.5, 4.5, 2.5);
    bolt.generateTexture('proj_bolt', 12, 12);
    bolt.destroy();

    const fireball = this.make.graphics({ x: 0, y: 0 }, false);
    fireball.fillStyle(0xff7043);
    fireball.fillCircle(10, 10, 10);
    fireball.fillStyle(0xffc107);
    fireball.fillCircle(8, 8, 6);
    fireball.fillStyle(0xfff59d);
    fireball.fillCircle(7, 7, 3);
    fireball.generateTexture('proj_fireball', 20, 20);
    fireball.destroy();
  }

  /** Toca um SFX com throttle, pan posicional (gx) e variação de pitch. */
  private playSfx(key: string, volume = 0.5, throttleMs = 90, gx?: number, rate = 1): void {
    const now = this.time.now;
    if (now - (this.lastSfxAt.get(key) ?? -Infinity) < throttleMs) return;
    this.lastSfxAt.set(key, now);
    const pan = gx !== undefined ? Phaser.Math.Clamp((gx - 16) / 18, -0.85, 0.85) : 0;
    this.sound.play(key, { volume, pan, rate });
  }

  /** "Voz" da tropa: pitch determinístico por carta (cada tipo soa diferente). */
  private voiceRate(cardId: string): number {
    let hash = 0;
    for (let i = 0; i < cardId.length; i++) hash = (hash * 31 + cardId.charCodeAt(i)) | 0;
    return 0.75 + (Math.abs(hash) % 50) / 100; // 0.75–1.25
  }

  private placeDecorations(): void {
    const animatedKeys = new Set(ANIMATED_DECO.map((d) => d.key));
    for (const [key, gx, gy, scale] of DECO_PLACEMENTS) {
      const p = gridToScreen(gx, gy);
      if (animatedKeys.has(key)) {
        const sprite = this.add.sprite(p.x, p.y, key, 0);
        sprite.setOrigin(0.5, 0.85).setScale(scale * p.scale).setDepth(p.y);
        // Desloca o início para as decorações não balançarem em uníssono.
        sprite.play({ key: `${key}_sway`, startFrame: Math.floor(Math.random() * 4) });
      } else {
        this.add.image(p.x, p.y, key).setOrigin(0.5, 0.8).setScale(scale * p.scale).setDepth(p.y);
      }
    }
  }

  update(_time: number, delta: number): void {
    const entities = (this.room.state as Record<string, any>).entities;
    if (!entities) return;

    const seen = new Set<string>();
    entities.forEach((entity: any, id: string) => {
      seen.add(id);
      let view = this.views.get(id);
      if (!view) {
        view = new EntityView(this, entity);
        this.views.set(id, view);
      }
      view.syncFrom(entity);
      view.update(delta);
    });

    for (const [id, view] of this.views) {
      if (!seen.has(id) && !view.isDying) {
        this.views.delete(id);
        view.playDeath(() => view.destroy());
      }
    }

    this.updateCameraIntent();
    this.updateAudioDrama();
  }

  /** Slow-motion no golpe que decide a partida. */
  private finalBlowSlowMo(): void {
    this.tweens.timeScale = 0.25;
    this.anims.globalTimeScale = 0.25;
    this.cameras.main.zoomTo(1.18, 300, 'Quad.easeOut', true);
    try {
      (this.cameras.main as any).postFX?.addColorMatrix()?.saturate(-0.5);
    } catch {
      // sem postFX
    }
    window.setTimeout(() => {
      this.tweens.timeScale = 1;
      this.anims.globalTimeScale = 1;
      this.cameras.main.zoomTo(1, 600, 'Quad.easeInOut', true);
      try {
        (this.cameras.main as any).postFX?.clear();
      } catch {
        // sem postFX
      }
    }, 1100);
  }

  /** Mixagem por intensidade + "ooooh" da torcida quando um push cruza a ponte. */
  private lastIntensityAt = 0;
  private lastOohAt = 0;
  private crossedIds = new Set<string>();
  private updateAudioDrama(): void {
    const now = this.time.now;
    if (now - this.lastIntensityAt > 500) {
      this.lastIntensityAt = now;
      let fighting = 0;
      const entities = (this.room.state as Record<string, any>).entities;
      entities?.forEach((entity: any) => {
        if (entity.kind === 'unit' && entity.action === 'attack') fighting++;
      });
      const intensity = Math.min(1, fighting / 8);
      ambient.setIntensity(intensity);
      bus.emit('intensity', intensity);
    }
    const entities = (this.room.state as Record<string, any>).entities;
    entities?.forEach((entity: any, id: string) => {
      if (entity.kind !== 'unit' || this.crossedIds.has(id)) return;
      const crossed =
        (entity.side === 'left' && entity.x > 17.5) ||
        (entity.side === 'right' && entity.x < 14.5);
      if (crossed) {
        this.crossedIds.add(id);
        if (now - this.lastOohAt > 3000) {
          this.lastOohAt = now;
          ambient.ooh();
        }
      }
    });
  }

  /** Câmera com intenção: acompanha suavemente o centro de massa das tropas. */
  private updateCameraIntent(): void {
    const entities = (this.room.state as Record<string, any>).entities;
    let sumX = 0;
    let count = 0;
    entities?.forEach((entity: any) => {
      if (entity.kind !== 'unit') return;
      sumX += gridToScreen(entity.x, entity.y).x;
      count++;
    });
    const target = count > 0 ? Phaser.Math.Clamp((sumX / count - 640) * 0.08, -26, 26) : 0;
    const cam = this.cameras.main;
    cam.scrollX += (target - cam.scrollX) * 0.02;
  }

  private playEffect(event: SimEvent): void {
    switch (event.type) {
      case 'spell':
        this.spellEffectFor(event);
        break;
      case 'areaDamage':
        this.explosionAt(
          gridToScreen(event.x, event.y).x,
          gridToScreen(event.x, event.y).y,
          gridToScreen(event.x, event.y).scale,
          event.radius,
        );
        break;
      case 'ability': {
        const p = gridToScreen(event.x, event.y);
        this.statusRingEffect(event.x, event.y, 2.2, 0xffd700);
        this.playSfx('sfx_countdown', 0.5, 0);
        const label = this.add
          .text(p.x, p.y - 110 * p.scale, '✨ HABILIDADE!', {
            fontFamily: '"Lilita One", sans-serif',
            fontSize: '16px',
            color: '#ffd700',
            stroke: '#5d4200',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(12000);
        this.tweens.add({
          targets: label, y: label.y - 26, alpha: 0, duration: 900,
          onComplete: () => label.destroy(),
        });
        break;
      }
      case 'death':
        this.deathEffect(event.x, event.y, event.kind);
        break;
      case 'spawn':
        this.spawnEffect(event.x, event.y, event.cardId);
        break;
      case 'towerHit':
        this.towerHitEffect(event.x, event.y);
        break;
      case 'projectile':
        this.projectileEffect(event.fromX, event.fromY, event.toX, event.toY, event.kind);
        break;
      case 'hit':
        this.playSfx(event.ranged ? 'sfx_arrow' : 'sfx_melee', 0.25, 140, event.x);
        this.floatDamageNumber(event.x, event.y, event.amount);
        if (event.ranged && Math.random() < 0.3) this.arrowDecal(event.x, event.y);
        break;
    }
  }

  /** Flecha/pedra voando do atacante ao alvo, em arco com rotação. */
  private projectileEffect(fx: number, fy: number, tx: number, ty: number, kind: 'arrow' | 'bolt'): void {
    const from = gridToScreen(fx, fy);
    const to = gridToScreen(tx, ty);
    const fromY = from.y - (kind === 'bolt' ? 90 * from.scale : 40 * from.scale);
    const toY = to.y - 24 * to.scale;

    const sprite = this.add.image(from.x, fromY, `proj_${kind}`);
    sprite.setScale(from.scale).setDepth(10000);

    const dist = Math.hypot(to.x - from.x, toY - fromY);
    const arc = Math.min(60, dist * 0.25);
    const duration = Math.max(130, dist * 0.55);
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration,
      onUpdate: () => {
        const t = state.t;
        const x = from.x + (to.x - from.x) * t;
        const yLine = fromY + (toY - fromY) * t;
        const y = yLine - arc * 4 * t * (1 - t); // parábola
        // Rotação acompanha a tangente da trajetória
        const dxdt = to.x - from.x;
        const dydt = toY - fromY - arc * 4 * (1 - 2 * t);
        sprite.setPosition(x, y);
        sprite.setRotation(Math.atan2(dydt, dxdt));
      },
      onComplete: () => sprite.destroy(),
    });
  }

  /** Bola de fogo: voa da torre do rei até o alvo, explode e deixa fogo residual. */
  private fireballEffect(fx: number, fy: number, gx: number, gy: number, radius: number): void {
    const from = gridToScreen(fx, fy);
    const to = gridToScreen(gx, gy);
    const startY = from.y - 120 * from.scale;

    const ball = this.add.image(from.x, startY, 'proj_fireball').setDepth(10000).setScale(1.4);
    const trail = this.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        const puff = this.add.circle(ball.x, ball.y, 5, 0xff8a50, 0.55).setDepth(9999);
        this.tweens.add({
          targets: puff, alpha: 0, scale: 2.2, duration: 260,
          onComplete: () => puff.destroy(),
        });
      },
    });

    const dist = Math.hypot(to.x - from.x, to.y - startY);
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration: Math.max(320, dist * 0.6),
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const t = state.t;
        const x = from.x + (to.x - from.x) * t;
        const y = startY + (to.y - startY) * t - 120 * 4 * t * (1 - t) * 0.35;
        ball.setPosition(x, y);
      },
      onComplete: () => {
        trail.remove();
        ball.destroy();
        this.explosionAt(to.x, to.y, to.scale, radius, gx, gy);
      },
    });
  }

  /** Número de dano flutuante subindo do alvo. */
  private floatDamageNumber(gx: number, gy: number, amount: number): void {
    const p = gridToScreen(gx, gy);
    const jitter = (Math.random() - 0.5) * 18 * p.scale;
    const text = this.add
      .text(p.x + jitter, p.y - 46 * p.scale, `-${Math.round(amount)}`, {
        fontFamily: '"Lilita One", sans-serif',
        fontSize: `${Math.round(15 * p.scale)}px`,
        color: '#ffffff',
        stroke: '#b71c1c',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(11000);
    this.tweens.add({
      targets: text,
      y: text.y - 34 * p.scale,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /** Balão de emote sobre a torre do rei do lado que enviou. */
  private showEmote(side: string, emoji: string): void {
    let king: any;
    (this.room.state as Record<string, any>).entities?.forEach((entity: any) => {
      if (entity.tower === 'king' && entity.side === side) king = entity;
    });
    if (!king) return;
    const p = gridToScreen(king.x, king.y);
    const bubble = this.add.container(p.x, p.y - 150 * p.scale).setDepth(12000).setAlpha(0);
    const bg = this.add.circle(0, 0, 26, 0xffffff, 0.95);
    bg.setStrokeStyle(3, side === 'left' ? 0x3f8cff : 0xef5350);
    const face = this.add.text(0, 0, emoji, { fontSize: '26px' }).setOrigin(0.5);
    bubble.add([bg, face]);
    this.tweens.add({ targets: bubble, alpha: 1, y: bubble.y - 14, duration: 180 });
    this.tweens.add({
      targets: bubble,
      alpha: 0,
      delay: 1600,
      duration: 260,
      onComplete: () => bubble.destroy(),
    });
  }

  /** Flecha cravada no chão que desvanece — o campo conta a batalha. */
  private decalCount = 0;
  private arrowDecal(gx: number, gy: number): void {
    if (this.decalCount > 40) return;
    this.decalCount++;
    const p = gridToScreen(gx + (Math.random() - 0.5) * 0.8, gy + (Math.random() - 0.5) * 0.6);
    const decal = this.add
      .image(p.x, p.y, 'proj_arrow')
      .setRotation(1.15 + (Math.random() - 0.5) * 0.4)
      .setScale(p.scale * 0.8)
      .setAlpha(0.75)
      .setDepth(-880);
    this.tweens.add({
      targets: decal, alpha: 0, delay: 7000, duration: 2000,
      onComplete: () => { decal.destroy(); this.decalCount--; },
    });
  }

  /** Queimadura no chão após explosões grandes. */
  private scorchDecal(gx: number, gy: number, radius: number): void {
    if (this.decalCount > 40) return;
    this.decalCount++;
    const p = gridToScreen(gx, gy);
    const scorch = this.add
      .ellipse(p.x, p.y, radius * 60 * p.scale, radius * 26 * p.scale, 0x1a120a, 0.4)
      .setDepth(-885);
    this.tweens.add({
      targets: scorch, alpha: 0, delay: 15000, duration: 5000,
      onComplete: () => { scorch.destroy(); this.decalCount--; },
    });
  }

  /** Torcida nas bordas: mini espectadores no "arquibancada" do topo. */
  private crowd: Phaser.GameObjects.Sprite[] = [];
  private buildCrowd(): void {
    for (let i = 0; i < 14; i++) {
      const x = 120 + i * 78 + Math.random() * 30;
      const y = 26 + Math.random() * 20;
      const color = i % 2 === 0 ? 'blue' : 'red';
      const fan = this.add
        .sprite(x, y, unitSheetKey('pawn', color as SideColor, 'idle'), 0)
        .setOrigin(0.5, 0.85)
        .setScale(0.17 + Math.random() * 0.05)
        .setAlpha(0.9)
        .setDepth(-990);
      fan.play({ key: unitSheetKey('pawn', color as SideColor, 'idle'), startFrame: Math.floor(Math.random() * 6) });
      this.crowd.push(fan);
    }
  }

  private crowdCheer(): void {
    for (const fan of this.crowd) {
      this.tweens.add({
        targets: fan,
        y: fan.y - 8,
        duration: 140,
        yoyo: true,
        repeat: 3,
        delay: Math.random() * 250,
      });
    }
  }

  /** Clima por tema: folhas, neve, vagalumes ou areia. */
  private startWeather(): void {
    this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => {
        if (this.registry.get('lowQuality')) return;
        const x = Math.random() * 1280;
        if (this.theme === 'neve') {
          const flake = this.add.circle(x, -8, 2 + Math.random() * 2, 0xffffff, 0.8).setDepth(20005);
          this.tweens.add({
            targets: flake, y: 740, x: x + 60 + Math.random() * 80,
            duration: 6000 + Math.random() * 3000, onComplete: () => flake.destroy(),
          });
        } else if (this.theme === 'noite') {
          const fly = this.add.circle(Math.random() * 1280, 200 + Math.random() * 420, 2, 0xfff59d, 0).setDepth(20005);
          this.tweens.add({
            targets: fly, alpha: 0.9, yoyo: true, repeat: 2, duration: 900,
            y: fly.y - 30 + Math.random() * 60, onComplete: () => fly.destroy(),
          });
        } else if (this.theme === 'deserto') {
          const grain = this.add.rectangle(-10, 100 + Math.random() * 500, 14, 2, 0xd9b975, 0.5).setDepth(20005);
          this.tweens.add({
            targets: grain, x: 1300, duration: 1600 + Math.random() * 900,
            onComplete: () => grain.destroy(),
          });
        } else {
          const leaf = this.add.rectangle(x, -6, 5, 3, 0x9ccc65, 0.8).setDepth(20005).setRotation(Math.random() * 3);
          this.tweens.add({
            targets: leaf, y: 740, x: x + 120, angle: 260,
            duration: 7000 + Math.random() * 3000, onComplete: () => leaf.destroy(),
          });
        }
      },
    });
  }

  /** Vida ambiente: brilhos no rio, nuvens com sombra e pássaros ocasionais. */
  private startAmbientLife(): void {
    // Brilhos descendo o rio
    for (let i = 0; i < 5; i++) {
      const gy = (i / 5) * 17;
      const p = gridToScreen(16 + (Math.random() - 0.5) * 1.2, gy);
      const shimmer = this.add
        .ellipse(p.x, p.y, 14 * p.scale, 4 * p.scale, 0xffffff, 0.35)
        .setDepth(-950);
      this.tweens.add({
        targets: shimmer,
        y: shimmer.y + 60,
        alpha: 0.05,
        duration: 2400 + Math.random() * 1600,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }

    // Textura de nuvem procedural
    const cloudG = this.make.graphics({ x: 0, y: 0 }, false);
    cloudG.fillStyle(0xffffff, 1);
    cloudG.fillEllipse(60, 34, 110, 40);
    cloudG.fillEllipse(34, 26, 60, 34);
    cloudG.fillEllipse(90, 24, 66, 34);
    cloudG.generateTexture('cloud', 130, 52);
    cloudG.destroy();

    for (let i = 0; i < 3; i++) this.spawnCloud(true);
    this.time.addEvent({ delay: 14000, loop: true, callback: () => this.spawnBirds() });
  }

  private spawnCloud(randomStart = false): void {
    const y = 60 + Math.random() * 500;
    const scale = 0.9 + Math.random() * 1.1;
    const startX = randomStart ? Math.random() * 1280 : -140;
    const shadow = this.add
      .ellipse(startX, y + 190 * scale, 120 * scale, 40 * scale, 0x000000, 0.1)
      .setDepth(-940);
    const cloud = this.add
      .image(startX, y, 'cloud')
      .setScale(scale)
      .setAlpha(0.5)
      .setDepth(20000);
    const duration = (1420 - startX) * 90;
    this.tweens.add({
      targets: [cloud, shadow],
      x: 1420,
      duration,
      onComplete: () => {
        cloud.destroy();
        shadow.destroy();
        this.spawnCloud();
      },
    });
  }

  private spawnBirds(): void {
    const y = 40 + Math.random() * 180;
    for (let i = 0; i < 3; i++) {
      const bird = this.add
        .text(-30 - i * 26, y + (i % 2) * 12, 'ᵛ', { fontSize: '14px', color: '#263238' })
        .setDepth(20001)
        .setAlpha(0.75);
      this.tweens.add({
        targets: bird,
        x: 1340,
        y: y - 30 + Math.random() * 60,
        duration: 9000 + i * 300,
        onComplete: () => bird.destroy(),
      });
      this.tweens.add({
        targets: bird,
        scaleY: 0.6,
        duration: 240,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** Escolhe o efeito visual do feitiço pelos componentes da carta. */
  private spellEffectFor(event: Extract<SimEvent, { type: 'spell' }>): void {
    const spell = getCard(event.cardId)?.components.spell;
    if (!spell) return;

    if (spell.freezeSeconds) {
      this.statusRingEffect(event.x, event.y, event.radius, 0x81d4fa);
      this.playSfx('sfx_tower_hit', 0.4, 0);
      return;
    }
    if (spell.rageSeconds) {
      this.statusRingEffect(event.x, event.y, event.radius, 0xec407a);
      return;
    }
    if (spell.stunSeconds) {
      this.lightningEffect(event.x, event.y, event.radius);
      return;
    }
    if (spell.zone) {
      this.statusRingEffect(event.x, event.y, event.radius, 0x7cb342);
      return;
    }
    if (spell.spawn && !spell.damage) {
      // Barril: voa como projétil e "estoura" com o anel de spawn
      this.fireballEffect(event.fromX, event.fromY, event.x, event.y, 0.8);
      return;
    }
    if (event.cardId === 'flechas') {
      this.arrowRainEffect(event.x, event.y, event.radius);
      return;
    }
    this.fireballEffect(event.fromX, event.fromY, event.x, event.y, event.radius);
  }

  /** Anel colorido expandindo (congelamento, fúria, veneno). */
  private statusRingEffect(gx: number, gy: number, radius: number, color: number): void {
    const p = gridToScreen(gx, gy);
    const ring = this.add.ellipse(p.x, p.y, 20, 10, color, 0.3).setDepth(p.y + 500);
    ring.setStrokeStyle(4, color, 0.9);
    this.tweens.add({
      targets: ring,
      scaleX: (radius * 2 * 38 * p.scale) / 20,
      scaleY: (radius * 2 * 19 * p.scale) / 10,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Relâmpago/choque: flashes brancos rápidos na área. */
  private lightningEffect(gx: number, gy: number, radius: number): void {
    const p = gridToScreen(gx, gy);
    this.playSfx('sfx_explosion', 0.5, 0);
    this.cameras.main.flash(120, 255, 255, 220);
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 30 * p.scale;
      const bolt = this.add
        .rectangle(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r * 0.5 - 60, 4, 120, 0xfff59d, 0.95)
        .setDepth(p.y + 600)
        .setRotation((Math.random() - 0.5) * 0.5);
      this.tweens.add({
        targets: bolt,
        alpha: 0,
        delay: i * 60,
        duration: 200,
        onComplete: () => bolt.destroy(),
      });
    }
  }

  /** Chuva de flechas: várias flechas caem do céu dentro do raio do feitiço. */
  private arrowRainEffect(gx: number, gy: number, radius: number): void {
    const center = gridToScreen(gx, gy);
    this.playSfx('sfx_arrow', 0.5, 0);
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 38 * center.scale;
      const tx = center.x + Math.cos(angle) * r;
      const ty = center.y + Math.sin(angle) * r * 0.5;

      const arrow = this.add
        .image(tx + 30, ty - 320, 'proj_arrow')
        .setDepth(10000)
        .setScale(center.scale)
        .setRotation(Math.PI / 2.2); // caindo quase na vertical
      this.tweens.add({
        targets: arrow,
        x: tx,
        y: ty,
        delay: i * 45,
        duration: 220,
        ease: 'Quad.easeIn',
        onComplete: () => {
          const pop = this.add.circle(tx, ty, 6 * center.scale, 0xd7ccc8, 0.8).setDepth(ty);
          this.tweens.add({
            targets: pop, alpha: 0, scale: 1.8, duration: 200,
            onComplete: () => pop.destroy(),
          });
          arrow.destroy();
        },
      });
    }
  }

  private explosionAt(x: number, y: number, scale: number, radius: number, gx?: number, gy?: number): void {
    if (gx !== undefined && gy !== undefined && radius >= 1.5) this.scorchDecal(gx, gy, radius);
    // Clarão de luz real da explosão
    if (this.registry.get('lowQuality')) return;
    try {
      const light = this.lights.addLight(x, y, radius * 130 * scale, 0xffa040, 2.2);
      this.tweens.add({
        targets: light, intensity: 0, duration: 500,
        onComplete: () => this.lights.removeLight(light),
      });
    } catch {
      // sem WebGL
    }
    const targetSize = radius * 2 * 38 * scale * 1.35;
    const boom = this.add.sprite(x, y - 10, EXPLOSION.key, 0).setDepth(y + 500);
    boom.setScale(targetSize / EXPLOSION.frameW);
    boom.play('explosion_boom');
    boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
    this.playSfx('sfx_explosion', 0.7, 0);
    this.cameras.main.shake(220, 0.008);

    // Fogo residual queimando na área por ~1,2s
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 24 * scale;
      const fire = this.add
        .sprite(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.5, FIRE.key, 0)
        .setDepth(y + 501)
        .setScale(scale * (0.8 + Math.random() * 0.5));
      fire.play('fire_burn');
      this.tweens.add({
        targets: fire,
        alpha: 0,
        delay: 700 + i * 180,
        duration: 450,
        onComplete: () => fire.destroy(),
      });
    }
  }

  private deathEffect(gx: number, gy: number, kind: string): void {
    const p = gridToScreen(gx, gy);
    if (kind === 'tower') {
      this.towerFallCinematic(p.x, p.y, p.scale);
      // O rei do lado oposto comemora + a torcida vibra (som e pulos)
      const fallenSide = gx < 16 ? 'left' : 'right';
      for (const view of this.views.values()) {
        if (view.towerKind === 'king' && view.side !== fallenSide) view.celebrate();
      }
      this.crowdCheer();
      ambient.cheer();
      // Golpe final no REI: câmera lenta cinematográfica
      const isKing = Math.abs(gx - 2.5) < 2 || Math.abs(gx - 29.5) < 2;
      if (isKing) this.finalBlowSlowMo();
    } else {
      this.playSfx('sfx_death', 0.35, 120, gx, 0.8 + Math.random() * 0.4);
    }
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const puff = this.add.circle(p.x, p.y - 10, 5 * p.scale, 0xffffff, 0.8).setDepth(p.y + 500);
      this.tweens.add({
        targets: puff,
        x: p.x + Math.cos(angle) * 26 * p.scale,
        y: p.y - 10 + Math.sin(angle) * 18 * p.scale,
        alpha: 0,
        scale: 0.3,
        duration: 380,
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** Queda de torre: zoom de câmera, explosão, escombros voando e cratera. */
  private towerFallCinematic(x: number, y: number, scale: number): void {
    this.playSfx('sfx_tower_down', 0.85, 0);
    navigator.vibrate?.(120); // feedback tátil no celular
    this.explosionAt(x, y, scale, 1.8);

    // Soco de zoom na câmera
    const cam = this.cameras.main;
    cam.zoomTo(1.09, 160, 'Quad.easeOut', true);
    this.time.delayedCall(420, () => cam.zoomTo(1, 480, 'Quad.easeInOut', true));
    cam.shake(420, 0.011);

    // Cratera permanente no chão
    const crater = this.add.graphics().setDepth(-899);
    crater.fillStyle(0x3d3227, 0.55);
    crater.fillEllipse(x, y, 110 * scale, 46 * scale);
    crater.fillStyle(0x2a2119, 0.5);
    crater.fillEllipse(x, y, 74 * scale, 30 * scale);
    crater.fillStyle(0x55483a, 0.6);
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7;
      crater.fillEllipse(
        x + Math.cos(a) * 62 * scale,
        y + Math.sin(a) * 26 * scale,
        13 * scale, 8 * scale,
      );
    }

    // Escombros voando em arco
    for (let i = 0; i < 10; i++) {
      const debris = this.add
        .rectangle(x, y - 40, 7 + Math.random() * 9, 7 + Math.random() * 9,
          [0x8d6e63, 0x9e9e9e, 0x6d4c41][i % 3])
        .setDepth(y + 600)
        .setRotation(Math.random() * Math.PI);
      const dx = (Math.random() - 0.5) * 220 * scale;
      const peak = 60 + Math.random() * 90;
      const state = { t: 0 };
      this.tweens.add({
        targets: state,
        t: 1,
        duration: 520 + Math.random() * 260,
        onUpdate: () => {
          const t = state.t;
          debris.x = x + dx * t;
          debris.y = y - 40 + 90 * t - peak * 4 * t * (1 - t);
          debris.rotation += 0.12;
        },
        onComplete: () => {
          this.tweens.add({ targets: debris, alpha: 0, duration: 500, onComplete: () => debris.destroy() });
        },
      });
    }
  }

  private spawnEffect(gx: number, gy: number, cardId?: string): void {
    const p = gridToScreen(gx, gy);
    this.playSfx('sfx_deploy', 0.55, 60, gx, cardId ? this.voiceRate(cardId) : 1);
    const ring = this.add.circle(p.x, p.y, 8, 0xffffff, 0).setDepth(p.y + 500);
    ring.setStrokeStyle(3, 0xffee58, 0.9);
    this.tweens.add({
      targets: ring,
      radius: 34 * p.scale,
      alpha: 0,
      duration: 350,
      onComplete: () => ring.destroy(),
    });
  }

  private towerHitEffect(gx: number, gy: number): void {
    const p = gridToScreen(gx, gy);
    this.playSfx('sfx_tower_hit', 0.4, 150);
    const flash = this.add.circle(p.x, p.y - 40, 12 * p.scale, 0xffffff, 0.85).setDepth(p.y + 500);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.8,
      duration: 160,
      onComplete: () => flash.destroy(),
    });
  }
}
