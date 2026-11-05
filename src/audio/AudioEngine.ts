import { AudioMix, Sfx, type SfxId, type SfxLayer } from '../content/audio';

export interface AudioPrefs {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  mute: boolean;
}

export type AudioGroup = 'sfx' | 'music' | 'ambience';

/**
 * One AudioContext for the whole game (GDD §21): master gain with sfx / music / ambience groups. The context is
 * created on the first touch or key press (mobile browsers need a gesture) and never when sound is muted. It is
 * suspended in the background and while muted, so muted sound costs no CPU.
 *
 * WebAudio source nodes are one-shot, so the "pool" is: one shared noise buffer, a cap on simultaneous voices, and
 * a minimum gap per sound (a coin shower plays at most one coin every 30 ms).
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private groups: Partial<Record<AudioGroup, GainNode>> = {};
  private noise: AudioBuffer | null = null;
  private prefs: AudioPrefs = { ...AudioMix.defaults, mute: false };
  private hidden = false;
  private voices = 0;
  private readonly last = new Map<SfxId, number>();
  private chain = 0;
  private chainAt = -1;
  private listenerX = 0;
  private listenerZ = 0;
  private readonly onReady: Array<() => void> = [];

  /** Listens for the first gesture; call once at start. */
  attach(): void {
    const unlock = () => {
      if (this.prefs.mute) return;
      this.start();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  /** Something that needs the context (music, ambience) waits for it. */
  whenReady(cb: () => void): void {
    if (this.ctx) cb();
    else this.onReady.push(cb);
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !this.prefs.mute && !this.hidden;
  }

  group(id: AudioGroup): GainNode | null {
    return this.groups[id] ?? null;
  }

  private start(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      for (const g of ['sfx', 'music', 'ambience'] as const) {
        const node = ctx.createGain();
        node.connect(this.master);
        this.groups[g] = node;
      }
      // One second of white noise, shared by every noise layer.
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      for (const cb of this.onReady.splice(0)) cb();
    }
    if (!this.hidden && !this.prefs.mute) void this.ctx.resume();
  }

  /** Settings: volumes and mute (mute suspends the context). */
  configure(prefs: AudioPrefs): void {
    this.prefs = { ...prefs };
    this.applyVolumes();
    if (!this.ctx) return;
    if (prefs.mute) void this.ctx.suspend();
    else if (!this.hidden) void this.ctx.resume();
  }

  getPrefs(): AudioPrefs {
    return this.prefs;
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.mute ? 0 : this.prefs.master, t, 0.05);
    for (const g of ['sfx', 'music', 'ambience'] as const) this.groups[g]?.gain.setTargetAtTime(this.prefs[g], t, 0.05);
  }

  /** The app went to the background (or came back). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (!this.prefs.mute) void this.ctx.resume();
  }

  /** World sounds fade with the distance to this point (the player). */
  setListener(x: number, z: number): void {
    this.listenerX = x;
    this.listenerZ = z;
  }

  /**
   * Plays an effect. `at` places a world sound (it fades with distance); `pitch` scales its frequencies;
   * `chain` makes repeated plays climb in pitch (coins).
   */
  play(id: SfxId, opts: { at?: { x: number; z: number }; pitch?: number; chain?: boolean } = {}): void {
    const ctx = this.ctx;
    const out = this.groups.sfx;
    if (!ctx || !out || !this.running) return;
    const def = Sfx[id];
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -1) < def.minGap) return;
    if (this.voices >= AudioMix.maxVoices) return;
    let level = 1;
    if (def.world && opts.at) {
      const d = Math.hypot(opts.at.x - this.listenerX, opts.at.z - this.listenerZ);
      const k = 1 - (d - AudioMix.near) / (AudioMix.far - AudioMix.near);
      level = Math.min(Math.max(k, 0), 1) ** 2;
      if (level < 0.02) return;
    }
    let pitch = opts.pitch ?? 1;
    if (opts.chain) {
      this.chain = now - this.chainAt < AudioMix.chainWindow ? this.chain + 1 : 0;
      this.chainAt = now;
      pitch *= Math.min(1 + this.chain * AudioMix.chainStep, AudioMix.chainMax);
    }
    this.last.set(id, now);
    for (const layer of def.layers) this.layer(ctx, out, layer, now, pitch, level);
  }

  private layer(ctx: AudioContext, out: AudioNode, l: SfxLayer, now: number, pitch: number, level: number): void {
    const t0 = now + (l.at ?? 0);
    const t1 = t0 + l.dur;
    const env = ctx.createGain();
    const peak = l.gain * level;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + (l.attack ?? 0.005));
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    env.connect(out);
    let src: AudioScheduledSourceNode;
    if (l.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = l.wave ?? 'sine';
      osc.frequency.setValueAtTime(l.freq[0] * pitch, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(l.freq[1] * pitch, 1), t1);
      osc.connect(env);
      src = osc;
    } else {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = l.filter ?? 'lowpass';
      filter.Q.value = l.q ?? 1;
      filter.frequency.setValueAtTime(l.freq[0] * pitch, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(l.freq[1] * pitch, 20), t1);
      noise.connect(filter);
      filter.connect(env);
      // Start somewhere random in the shared buffer so repeats do not sound identical.
      noise.start(t0, Math.random() * 0.5);
      noise.stop(t1 + 0.05);
      this.track(noise, env);
      return;
    }
    src.start(t0);
    src.stop(t1 + 0.05);
    this.track(src, env);
  }

  private track(src: AudioScheduledSourceNode, env: GainNode): void {
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
      env.disconnect();
    };
  }
}

/** The game's audio engine (one context for everything). */
export const audio = new AudioEngine();

/** Shorthand for effects. */
export function sfx(id: SfxId, at?: { x: number; z: number }, pitch?: number): void {
  audio.play(id, { at, pitch });
}
