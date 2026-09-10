import Phaser from 'phaser';
import { getCard, gridToScreen } from '@claude-royale/shared';
import {
  CARD_VISUALS, UNIT_ANIM_FRAMES, sideColor, unitSheetKey, type SideColor, type UnitAsset,
} from './assets';

const ATTACK_FRAME_RATE = 12;

const HP_BAR_W = 44;
const SIDE_HP_COLOR: Record<SideColor, number> = { blue: 0x42a5f5, red: 0xef5350 };
const SHIELD_COLOR = 0xffd54f;
const FLY_HEIGHT = 34;

/** Escala base de exibição das tropas (frame de 192px → ~105px em profundidade 1). */
const UNIT_DISPLAY_SCALE = 0.55;
const KING_DISPLAY_SCALE = 0.6;
const PRINCESS_DISPLAY_SCALE = 0.55;

interface EntitySnapshot {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  kind: string;
  side: string;
  cardId: string;
  tower: string;
  action: string;
  facing: number;
  dormant?: boolean;
  shield?: number;
  status?: string;
  evolved?: boolean;
  abilityCooldown?: number;
}

/**
 * Representação visual de uma entidade: sombra + sprite animado + barras de
 * vida/escudo, com interpolação de posição, projeção 2.5D, altura de voo e
 * indicação de status (congelado, enfurecido, carga).
 */
export class EntityView {
  readonly container: Phaser.GameObjects.Container;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private hpText?: Phaser.GameObjects.Text;
  private sprite?: Phaser.GameObjects.Sprite;
  private buildingImage?: Phaser.GameObjects.Image;
  private zoneCircle?: Phaser.GameObjects.Ellipse;

  private gx: number;
  private gy: number;
  private targetGx: number;
  private targetGy: number;
  private targetHp: number;
  private readonly maxHp: number;
  private readonly maxShield: number;
  private targetShield = 0;
  private action = 'idle';
  private facing = 1;
  private status = '';
  private currentAnim = '';

  private lastDrawnHp = -1;
  private readonly kind: string;
  private readonly isFlying: boolean;
  private readonly color: SideColor;
  private readonly unit?: UnitAsset;
  private readonly visualScale: number = 1;
  private readonly baseTint?: number;
  private readonly scene: Phaser.Scene;
  private flashUntil = 0;
  private smoke?: Phaser.GameObjects.Sprite;
  private sleepIcon?: Phaser.GameObjects.Text;
  private kingFigure?: Phaser.GameObjects.Sprite;
  private attackTimeScale = 1;
  readonly side: string;
  readonly towerKind: string;
  private readonly cardId: string;
  private dying = false;

  constructor(scene: Phaser.Scene, entity: EntitySnapshot) {
    this.scene = scene;
    this.gx = entity.x;
    this.gy = entity.y;
    this.targetGx = entity.x;
    this.targetGy = entity.y;
    this.targetHp = entity.hp;
    this.maxHp = entity.maxHp;
    this.targetShield = entity.shield ?? 0;
    this.maxShield = entity.shield ?? 0;
    this.kind = entity.kind;
    this.color = sideColor(entity.side);

    this.side = entity.side;
    this.towerKind = entity.tower;
    this.cardId = entity.cardId;
    const visual = CARD_VISUALS[entity.cardId];
    this.isFlying = entity.kind === 'unit' && this.hasFlyingTag(entity.cardId);
    // Variação individual: enxames não parecem clones carimbados.
    const variation = entity.kind === 'unit' ? 0.94 + Math.random() * 0.12 : 1;
    this.visualScale = (visual?.scale ?? 1) * variation;
    this.baseTint = visual?.tint;

    // Sincroniza a animação de ataque com a cadência real de golpes.
    const attack = getCard(entity.cardId)?.components.attack;
    if (attack && visual?.unit) {
      const cycleSeconds = UNIT_ANIM_FRAMES[visual.unit].attack / ATTACK_FRAME_RATE;
      this.attackTimeScale = cycleSeconds / attack.hitSpeed;
    }

    const children: Phaser.GameObjects.GameObject[] = [];
    if (entity.kind === 'tower') {
      children.push(...this.buildTower(scene, entity.tower, entity.dormant === true, entity.hp));
    } else if (entity.kind === 'building') {
      children.push(...this.buildBuilding(scene));
    } else if (entity.kind === 'zone') {
      children.push(this.buildZone(scene));
    } else {
      this.unit = visual?.unit ?? 'warrior';
      children.push(...this.buildUnit(scene));
      if (entity.evolved) children.push(this.addStarBadge(scene, '⭐'));
      if (entity.cardId === 'campeaValente' || entity.cardId === 'mestreDasTempestades') {
        children.push(this.addStarBadge(scene, '⚜️'));
      }
      // Acessibilidade: forma além da cor para distinguir os times
      if (scene.registry.get('colorblind')) {
        const marker = this.color === 'blue' ? '●' : '▲';
        const markerColor = this.color === 'blue' ? '#42a5f5' : '#ff9800';
        children.push(
          scene.add
            .text(0, -(64 * this.visualScale + 4), marker, { fontSize: '11px', color: markerColor })
            .setOrigin(0.5),
        );
      }
    }

    this.hpBar = scene.add.graphics();
    children.push(this.hpBar);

    this.container = scene.add.container(0, 0, children);
    this.applyTransform(0);
    this.drawHpBar();

    if (entity.kind === 'unit') {
      // Nascimento: surge do chão com fade + escala
      this.container.setAlpha(0);
      scene.tweens.add({ targets: this.container, alpha: 1, duration: 280 });
      if (this.sprite) {
        // Dessincroniza os frames do grupo
        this.sprite.play({ key: unitSheetKey(this.unit!, this.color, 'idle'), startFrame: Math.floor(Math.random() * 4) });
        this.currentAnim = unitSheetKey(this.unit!, this.color, 'idle');
      }
    }
    if (entity.kind === 'tower') {
      // Cerimônia de abertura: a torre "constrói" subindo do chão
      const image = children[1] as Phaser.GameObjects.Image;
      const targetY = image.y;
      image.y = targetY + 50;
      image.setAlpha(0);
      scene.tweens.add({
        targets: image,
        y: targetY,
        alpha: 1,
        delay: 100 + Math.abs(entity.x - 16) * 40,
        duration: 550,
        ease: 'Back.easeOut',
      });
    }
  }

  /** O rei do topo do castelo comemora (torre inimiga caiu). */
  celebrate(): void {
    if (!this.kingFigure) return;
    this.kingFigure.play(unitSheetKey('warrior', this.color, 'attack'));
    this.scene.time.delayedCall(1400, () => {
      this.kingFigure?.play(unitSheetKey('warrior', this.color, 'idle'));
    });
  }

  /** Morte com corpo tombando (em vez de sumir). */
  playDeath(onDone: () => void): void {
    if (this.dying) return;
    this.dying = true;
    this.hpBar.clear();
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      angle: this.facing >= 0 ? 78 : -78,
      y: this.container.y + 6,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: onDone,
    });
  }

  get isDying(): boolean {
    return this.dying;
  }

  private hasFlyingTag(cardId: string): boolean {
    // Voadores são renderizados elevados; a informação vem do catálogo compartilhado.
    const flyingIds = new Set(['morcegos', 'nuvemDeMorcegos', 'dragaozinho', 'dirigivel']);
    return flyingIds.has(cardId);
  }

  private shadow?: Phaser.GameObjects.Ellipse;
  private reflection?: Phaser.GameObjects.Sprite;
  private lastTrailAt = 0;
  private crackStage = 0;
  private cracks?: Phaser.GameObjects.Graphics;

  private buildUnit(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
    const shadowSize = 46 * this.visualScale;
    // Sombra direcional (fim de tarde): alongada e deslocada
    this.shadow = scene.add.ellipse(8, 2, shadowSize * 1.35, shadowSize * 0.4, 0x000000, 0.28);
    const shadow = this.shadow;

    this.sprite = scene.add.sprite(0, 0, unitSheetKey(this.unit!, this.color, 'idle'), 0);
    this.sprite.setOrigin(0.5, 0.72);
    try {
      this.sprite.setPipeline('Light2D');
    } catch {
      // WebGL indisponível — segue sem iluminação dinâmica
    }
    this.sprite.setScale(UNIT_DISPLAY_SCALE * this.visualScale);
    if (this.isFlying) this.sprite.y = -FLY_HEIGHT;
    if (this.baseTint !== undefined) this.sprite.setTint(this.baseTint);
    return [shadow, this.sprite];
  }

  /** Estrela dourada sobre unidades evoluídas / campeãs. */
  private addStarBadge(scene: Phaser.Scene, emoji: string): Phaser.GameObjects.Text {
    return scene.add
      .text(0, -(64 * this.visualScale + 26), emoji, { fontSize: '16px' })
      .setOrigin(0.5);
  }

  private buildBuilding(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
    const shadow = scene.add.ellipse(0, 2, 70, 26, 0x000000, 0.3);
    this.buildingImage = scene.add
      .image(0, 0, `tower_${this.color}`)
      .setOrigin(0.5, 0.85)
      .setScale(this.visualScale * 1.6);
    if (this.baseTint !== undefined) this.buildingImage.setTint(this.baseTint);
    return [shadow, this.buildingImage];
  }

  private buildZone(scene: Phaser.Scene): Phaser.GameObjects.GameObject {
    this.zoneCircle = scene.add.ellipse(0, 0, 170, 85, 0x7cb342, 0.28);
    this.zoneCircle.setStrokeStyle(3, 0x558b2f, 0.7);
    return this.zoneCircle;
  }

  private buildTower(
    scene: Phaser.Scene,
    tower: string,
    dormant: boolean,
    hp: number,
  ): Phaser.GameObjects.GameObject[] {
    const isKing = tower === 'king';
    const key = isKing ? `castle_${this.color}` : `tower_${this.color}`;
    const scale = isKing ? KING_DISPLAY_SCALE : PRINCESS_DISPLAY_SCALE;

    const shadowW = isKing ? 150 : 80;
    const shadow = scene.add.ellipse(0, 4, shadowW, shadowW * 0.35, 0x000000, 0.3);
    const image = scene.add.image(0, 0, key).setOrigin(0.5, 0.82).setScale(scale);

    const children: Phaser.GameObjects.GameObject[] = [shadow, image];
    if (isKing) {
      // O rei em pessoa, de pé no topo do castelo
      this.kingFigure = scene.add
        .sprite(0, -104, unitSheetKey('warrior', this.color, 'idle'), 0)
        .setOrigin(0.5, 0.72)
        .setScale(0.34);
      this.kingFigure.play(unitSheetKey('warrior', this.color, 'idle'));
      children.push(this.kingFigure);
      this.sleepIcon = scene.add
        .text(30, -120, '💤', { fontSize: '22px' })
        .setOrigin(0.5)
        .setVisible(dormant);
      children.push(this.sleepIcon);
    }
    this.hpText = scene.add
      .text(0, -128, String(hp), {
        fontFamily: '"Lilita One", sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#00000088',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    children.push(this.hpText);
    return children;
  }

  /** Buffer de snapshots: renderizamos ~120ms no passado para suavizar jitter. */
  private snapshots: Array<{ t: number; x: number; y: number }> = [];

  /** Atualiza alvo vindo do servidor (chamado a cada frame com o estado do schema). */
  syncFrom(entity: EntitySnapshot): void {
    if (entity.hp < this.targetHp || (entity.shield ?? 0) < this.targetShield) {
      this.flashUntil = this.scene.time.now + 90; // flash branco ao tomar dano
    }
    const last = this.snapshots[this.snapshots.length - 1];
    if (!last || last.x !== entity.x || last.y !== entity.y) {
      this.snapshots.push({ t: performance.now(), x: entity.x, y: entity.y });
      if (this.snapshots.length > 12) this.snapshots.shift();
    }
    this.targetGx = entity.x;
    this.targetGy = entity.y;
    this.targetHp = entity.hp;
    this.targetShield = entity.shield ?? 0;
    this.action = entity.action;
    this.facing = entity.facing;
    this.status = entity.status ?? '';
    this.sleepIcon?.setVisible(entity.dormant === true);
  }

  /** Interpola posição (buffer com atraso de 120ms), projeta e anima. */
  update(dtMs: number): void {
    if (this.dying) return;
    const renderAt = performance.now() - 120;
    let interpolated = false;
    for (let i = this.snapshots.length - 1; i > 0; i--) {
      const b = this.snapshots[i];
      const a = this.snapshots[i - 1];
      if (a.t <= renderAt && renderAt <= b.t) {
        const f = (renderAt - a.t) / Math.max(1, b.t - a.t);
        this.gx = a.x + (b.x - a.x) * f;
        this.gy = a.y + (b.y - a.y) * f;
        interpolated = true;
        break;
      }
    }
    if (!interpolated) {
      // Buffer vazio/atrasado: cai no lerp exponencial de antes
      const lerp = 1 - Math.exp(-10 * (dtMs / 1000));
      this.gx += (this.targetGx - this.gx) * lerp;
      this.gy += (this.targetGy - this.gy) * lerp;
    }
    this.applyTransform(this.scene.time.now);
    this.updateAnimation();
    this.drawHpBar();
  }

  private applyTransform(timeMs: number): void {
    const p = gridToScreen(this.gx, this.gy);
    this.container.setPosition(p.x, p.y);
    this.container.setScale(p.scale);
    this.container.setDepth(this.kind === 'zone' ? -800 : p.y);

    // Voadores flutuam com uma oscilação suave.
    if (this.sprite && this.isFlying) {
      this.sprite.y = -FLY_HEIGHT + Math.sin(timeMs / 320) * 5;
    }

    // Sombra direcional que se alonga com o passar da partida (sol baixando)
    if (this.shadow) {
      const elapsed = Math.min(1, timeMs / 240000);
      this.shadow.x = 8 + elapsed * 12;
      this.shadow.scaleX = 1 + elapsed * 0.5;
    }

    // Reflexo na água enquanto atravessa a ponte
    const inRiver = this.gx > 14.6 && this.gx < 17.4 && this.kind === 'unit' && !this.isFlying;
    if (inRiver && !this.reflection && this.sprite) {
      this.reflection = this.scene.add
        .sprite(0, 42, this.sprite.texture.key, this.sprite.frame.name)
        .setOrigin(0.5, 0.72)
        .setScale(this.sprite.scaleX, -this.sprite.scaleY * 0.8)
        .setAlpha(0.2)
        .setTint(0x4a90e2);
      this.container.addAt(this.reflection, 0);
    } else if (!inRiver && this.reflection) {
      this.reflection.destroy();
      this.reflection = undefined;
    }
    if (this.reflection && this.sprite) {
      this.reflection.setFrame(this.sprite.frame.name);
      this.reflection.setFlipX(this.sprite.flipX);
    }

    // Rastro de poeira (rápidos no chão) ou de vento (voadores)
    const speed = getCard(this.cardId)?.components.movement?.speed;
    if (
      this.kind === 'unit' && this.action === 'walk' &&
      timeMs - this.lastTrailAt > 150 && !this.scene.registry.get('lowQuality')
    ) {
      const fast = (speed ?? 0) >= 2.2;
      if (fast || this.isFlying) {
        this.lastTrailAt = timeMs;
        const p = gridToScreen(this.gx, this.gy);
        const puff = this.isFlying
          ? this.scene.add.rectangle(p.x - this.facing * 14, p.y - FLY_HEIGHT * p.scale, 14, 2, 0xffffff, 0.35)
          : this.scene.add.circle(p.x - this.facing * 8, p.y, 4 * p.scale, 0xcbb894, 0.4);
        puff.setDepth(p.y - 1);
        this.scene.tweens.add({
          targets: puff, alpha: 0, scale: this.isFlying ? 1.6 : 2, duration: 420,
          onComplete: () => puff.destroy(),
        });
      }
    }
    // Zonas pulsam.
    if (this.zoneCircle) {
      const pulse = 1 + 0.06 * Math.sin(timeMs / 200);
      this.zoneCircle.setScale(pulse);
    }
  }

  private updateAnimation(): void {
    if (!this.sprite || !this.unit) return;

    const frozen = this.status === 'frozen' || this.status === 'stunned';
    const anim = this.action === 'walk' ? 'run' : this.action === 'attack' ? 'attack' : 'idle';
    const key = unitSheetKey(this.unit, this.color, anim);
    if (this.currentAnim !== key) {
      this.currentAnim = key;
      this.sprite.play(key);
      // Golpe sincronizado: um ciclo da animação de ataque = um hit real
      this.sprite.anims.timeScale = anim === 'attack' ? this.attackTimeScale : 1;
    }
    if (frozen) this.sprite.anims.pause();
    else if (this.sprite.anims.isPaused) this.sprite.anims.resume();

    this.sprite.setFlipX(this.facing < 0);

    if (this.scene.time.now < this.flashUntil) {
      this.sprite.setTintFill(0xffffff);
    } else if (frozen) {
      this.sprite.setTint(0x9fd8ff);
    } else if (this.status === 'raged') {
      this.sprite.setTint(0xff9ec4);
    } else if (this.status === 'charging') {
      this.sprite.setTint(0xfff59d);
    } else if (this.baseTint !== undefined) {
      this.sprite.setTint(this.baseTint);
    } else {
      this.sprite.clearTint();
    }
  }

  /** Torre abaixo de 50%: fogo/fumaça permanente no topo. */
  private updateTowerDamageSmoke(ratio: number): void {
    if (this.kind !== 'tower' || this.smoke || ratio >= 0.5) return;
    this.smoke = this.scene.add.sprite(10, -84, 'fire', 0).setScale(0.9).setAlpha(0.9);
    this.smoke.play('fire_burn');
    this.container.add(this.smoke);
  }

  private drawHpBar(): void {
    if (this.kind === 'zone') return;
    const hp = Math.max(0, this.targetHp);
    const combined = hp + this.targetShield;
    if (Math.abs(combined - this.lastDrawnHp) < 0.5) return;
    this.lastDrawnHp = combined;

    const ratio = Math.min(1, hp / this.maxHp);
    if (this.kind === 'tower') {
      this.drawTowerHpPill(ratio);
      this.updateTowerDamageSmoke(ratio);
      return;
    }

    const yOff = this.isFlying
      ? -(64 * this.visualScale + 14 + FLY_HEIGHT)
      : this.kind === 'building'
        ? -66
        : -(64 * this.visualScale + 14);
    this.hpBar.clear();
    const fullAndNoShieldLoss = ratio >= 1 && this.targetShield >= this.maxShield;
    if (fullAndNoShieldLoss) return; // intacta: sem barra
    this.hpBar.fillStyle(0x000000, 0.55);
    this.hpBar.fillRect(-HP_BAR_W / 2 - 1, yOff - 1, HP_BAR_W + 2, 8);
    this.hpBar.fillStyle(SIDE_HP_COLOR[this.color]);
    this.hpBar.fillRect(-HP_BAR_W / 2, yOff, HP_BAR_W * ratio, 6);
    // Escudo: barrinha dourada acima da vida
    if (this.maxShield > 0 && this.targetShield > 0) {
      const shieldRatio = Math.min(1, this.targetShield / this.maxShield);
      this.hpBar.fillStyle(SHIELD_COLOR);
      this.hpBar.fillRect(-HP_BAR_W / 2, yOff - 5, HP_BAR_W * shieldRatio, 3);
    }
  }

  /** Destruição progressiva: rachaduras a 75%, pedaços a 50%, pânico do rei a 25%. */
  private updateTowerDamageStage(ratio: number): void {
    const stage = ratio < 0.25 ? 3 : ratio < 0.5 ? 2 : ratio < 0.75 ? 1 : 0;
    if (stage === this.crackStage) return;
    this.crackStage = stage;

    if (!this.cracks) {
      this.cracks = this.scene.add.graphics();
      this.container.add(this.cracks);
    }
    this.cracks.clear();
    if (stage >= 1) {
      this.cracks.lineStyle(2, 0x1f1a12, 0.7);
      this.cracks.beginPath();
      this.cracks.moveTo(-14, -70); this.cracks.lineTo(-6, -46); this.cracks.lineTo(-16, -28);
      this.cracks.moveTo(12, -60); this.cracks.lineTo(6, -38);
      this.cracks.strokePath();
    }
    if (stage >= 2) {
      this.cracks.fillStyle(0x1f1a12, 0.55);
      this.cracks.fillRect(-22, -52, 9, 7);
      this.cracks.fillRect(14, -34, 7, 6);
      this.cracks.lineStyle(2, 0x1f1a12, 0.7);
      this.cracks.beginPath();
      this.cracks.moveTo(0, -76); this.cracks.lineTo(10, -52); this.cracks.lineTo(2, -30);
      this.cracks.strokePath();
    }
    // Rei em pânico quando o castelo está por um fio
    if (stage >= 3 && this.kingFigure) {
      this.kingFigure.play(unitSheetKey('warrior', this.color, 'run'));
    }
  }

  /** Pílula de HP das torres: número sobre fundo colorido + barrinha, sempre visível. */
  private drawTowerHpPill(ratio: number): void {
    this.updateTowerDamageStage(ratio);
    const w = 66;
    const y = -140;
    const color = SIDE_HP_COLOR[this.color];

    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.45);
    this.hpBar.fillRoundedRect(-w / 2 - 2, y - 2, w + 4, 26, 8);
    this.hpBar.fillStyle(color, 0.92);
    this.hpBar.fillRoundedRect(-w / 2, y, w, 17, 6);
    this.hpBar.fillStyle(0x000000, 0.5);
    this.hpBar.fillRect(-w / 2 + 3, y + 18, w - 6, 4);
    this.hpBar.fillStyle(0xffffff, 0.95);
    this.hpBar.fillRect(-w / 2 + 3, y + 18, (w - 6) * ratio, 4);

    this.hpText?.setPosition(0, y + 8.5);
    this.hpText?.setText(String(Math.max(0, Math.ceil(this.targetHp))));
  }

  destroy(): void {
    this.container.destroy();
  }
}
