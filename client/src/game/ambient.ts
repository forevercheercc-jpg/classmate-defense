import type { ArenaTheme } from './arena';

/**
 * Áudio ambiente 100% procedural via WebAudio — sem arquivos:
 * vento (ruído filtrado), pássaros (chirps FM), grilos (pulsos agudos)
 * e a torcida (murmúrio contínuo + "ooooh" + explosão de grito).
 */
class AmbientAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private crowdGain?: GainNode;
  private windGain?: GainNode;
  private timers: number[] = [];
  private muted = false;

  start(theme: ArenaTheme): void {
    this.stop();
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // Vento: ruído branco → lowpass (timbre por tema)
    const noise = this.noiseSource();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = theme === 'neve' ? 300 : theme === 'deserto' ? 700 : 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = theme === 'campo' ? 0.015 : theme === 'noite' ? 0.01 : 0.035;
    noise.connect(windFilter).connect(this.windGain).connect(this.master);
    noise.start();

    // Murmúrio da torcida: ruído → bandpass "vozes"
    const crowd = this.noiseSource();
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 500;
    crowdFilter.Q.value = 0.8;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.012;
    crowd.connect(crowdFilter).connect(this.crowdGain).connect(this.master);
    crowd.start();

    // Fauna por tema
    if (theme === 'campo') {
      this.timers.push(window.setInterval(() => this.birdChirp(), 3500 + Math.random() * 3000));
    } else if (theme === 'noite') {
      this.timers.push(window.setInterval(() => this.cricket(), 1200));
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    void this.ctx?.close().catch(() => undefined);
    this.ctx = undefined;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /** Combate intenso: torcida sobe, vento desce (mixagem por intensidade). */
  setIntensity(v: number): void {
    if (!this.ctx) return;
    this.crowdGain?.gain.setTargetAtTime(0.012 + v * 0.03, this.ctx.currentTime, 0.4);
    this.windGain?.gain.setTargetAtTime(Math.max(0.006, 0.03 * (1 - v)), this.ctx.currentTime, 0.4);
  }

  /** "Ooooh" quando um push cruza a ponte. */
  ooh(): void {
    this.swell(0.06, 0.5, 380);
  }

  /** Explosão de grito na queda de torre. */
  cheer(): void {
    this.swell(0.16, 1.4, 620);
  }

  private swell(peak: number, seconds: number, freq: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const noise = this.noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + seconds * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start();
    noise.stop(ctx.currentTime + seconds + 0.1);
  }

  private birdChirp(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(2400 + Math.random() * 1200, t);
    osc.frequency.exponentialRampToValueAtTime(3400 + Math.random() * 800, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(2000, t + 0.16);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.02, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private cricket(): void {
    if (!this.ctx || !this.master || Math.random() < 0.4) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 4200;
      gain.gain.setValueAtTime(0.0001, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.008, t + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.05);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.06);
    }
  }

  private noiseSource(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Ruído "marrom" (mais grave, menos áspero)
      last = (last + (Math.random() * 2 - 1) * 0.04) * 0.98;
      data[i] = last * 6;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }
}

export const ambient = new AmbientAudio();
