import { Ambience as A, Music as M, type PlaceMood, type TimeMood } from '../content/audio';
import { audio } from './AudioEngine';

export interface Mood {
  time: TimeMood;
  aurora: boolean;
  place: PlaceMood;
  /** A bear is coming or an avalanche is about to fall. */
  tension: boolean;
  sleeping: boolean;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Generative music (GDD §21): a soft pad gliding between chords, sparse pentatonic bells with an echo, a glassy layer
 * under the northern lights and a low tension drone for threats. Everything is driven by `setMood`; if real tracks are
 * added later, only this class changes (`loadTrack` is the hook). With the music volume at 0 (or muted) no nodes run.
 */
export class MusicDirector {
  private mood: Mood = { time: 'day', aurora: false, place: 'shore', tension: false, sleeping: false };
  private nodes: {
    bus: GainNode;
    filter: BiquadFilterNode;
    pad: OscillatorNode[];
    delay: DelayNode;
    feedback: GainNode;
    wet: GainNode;
    glass: GainNode;
    glassOsc: OscillatorNode[];
    tension: GainNode;
    tensionOsc: OscillatorNode[];
  } | null = null;
  private chord = 0;
  private chordTimer = 0;
  private bellTimer = 2;
  private readonly tracks = new Map<string, AudioBuffer>();

  /** Hook for real music files later (not used now): fetches and decodes a track. */
  async loadTrack(url: string): Promise<void> {
    const ctx = audio.ctx;
    if (!ctx) return;
    const data = await (await fetch(url)).arrayBuffer();
    this.tracks.set(url, await ctx.decodeAudioData(data));
  }

  setMood(m: Mood): void {
    const changed = m.time !== this.mood.time || m.aurora !== this.mood.aurora || m.place !== this.mood.place || m.tension !== this.mood.tension || m.sleeping !== this.mood.sleeping;
    this.mood = m;
    if (changed) this.applyMood();
  }

  /** Call every frame: starts or stops the graph with the music volume, schedules chords and bells. */
  update(dt: number): void {
    const want = audio.running && audio.getPrefs().music > 0;
    if (want && !this.nodes) this.build();
    if (!want && this.nodes) this.teardown();
    if (!this.nodes) return;
    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      this.chordTimer = M.chordSeconds[0] + Math.random() * (M.chordSeconds[1] - M.chordSeconds[0]);
      this.chord = (this.chord + 1) % M.chords[this.mood.time].length;
      this.glideToChord();
    }
    this.bellTimer -= dt * (this.mood.place === 'cave' ? 1.4 : this.mood.time === 'night' ? 0.8 : 1);
    if (this.bellTimer <= 0) {
      this.bellTimer = M.bellEvery[0] + Math.random() * (M.bellEvery[1] - M.bellEvery[0]);
      if (!this.mood.sleeping) this.bell();
    }
  }

  private build(): void {
    const ctx = audio.ctx;
    const out = audio.group('music');
    if (!ctx || !out) return;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.4;
    bus.connect(filter);
    filter.connect(out);
    // Echo send (bells and glass go through it).
    const delay = ctx.createDelay(1.5);
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(out);
    const pad = M.chords[this.mood.time][this.chord]!.map((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = hz(note);
      osc.detune.value = (i - 1.5) * 4; // a slight chorus
      const g = ctx.createGain();
      g.gain.value = M.padGain / (i === 0 ? 1.5 : 3);
      osc.connect(g);
      g.connect(bus);
      osc.start();
      return osc;
    });
    const glass = ctx.createGain();
    glass.gain.value = 0;
    glass.connect(delay);
    glass.connect(out);
    const glassOsc = M.glassNotes.map((note, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz(note);
      // Slow wavering: an LFO on the pitch.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.11 + i * 0.07;
      const depth = ctx.createGain();
      depth.gain.value = 6;
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start();
      osc.connect(glass);
      osc.start();
      osc.onended = () => lfo.stop();
      return osc;
    });
    const tension = ctx.createGain();
    tension.gain.value = 0;
    tension.connect(out);
    const tensionOsc = M.tensionNotes.map((note) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz(note);
      osc.connect(tension);
      osc.start();
      return osc;
    });
    this.nodes = { bus, filter, pad, delay, feedback, wet, glass, glassOsc, tension, tensionOsc };
    this.chordTimer = M.chordSeconds[0];
    this.applyMood();
  }

  private teardown(): void {
    const n = this.nodes;
    if (!n) return;
    for (const o of [...n.pad, ...n.glassOsc, ...n.tensionOsc]) o.stop();
    for (const node of [n.bus, n.filter, n.delay, n.feedback, n.wet, n.glass, n.tension]) node.disconnect();
    this.nodes = null;
  }

  /** Brightness, levels, echo and layers follow the mood (smoothly). */
  private applyMood(): void {
    const n = this.nodes;
    const ctx = audio.ctx;
    if (!n || !ctx) return;
    const t = ctx.currentTime;
    const m = this.mood;
    const k = M.glide;
    const level = m.sleeping ? M.sleepDuck : m.tension ? M.tensionDuck : 1;
    n.bus.gain.setTargetAtTime(level, t, k / 2);
    n.filter.frequency.setTargetAtTime(M.padCutoff[m.time] * M.placeCutoff[m.place], t, k);
    const echo = m.place === 'cave' ? M.caveEcho : M.echo;
    n.delay.delayTime.setTargetAtTime(echo.delay, t, 0.5);
    n.feedback.gain.setTargetAtTime(echo.feedback, t, 0.5);
    n.wet.gain.setTargetAtTime(echo.wet * level, t, 0.5);
    n.glass.gain.setTargetAtTime(m.aurora && !m.sleeping ? M.glassGain : 0, t, k);
    n.tension.gain.setTargetAtTime(m.tension && !m.sleeping ? M.tensionGain : 0, t, 1);
    this.glideToChord();
  }

  private glideToChord(): void {
    const n = this.nodes;
    const ctx = audio.ctx;
    if (!n || !ctx) return;
    const chords = M.chords[this.mood.time];
    const chord = chords[this.chord % chords.length] as readonly number[];
    n.pad.forEach((osc, i) => osc.frequency.setTargetAtTime(hz(chord[i] ?? chord[0] ?? 48), ctx.currentTime, M.glide));
  }

  /** One soft bell note from the mood's scale (a warmer pluck in the camp, a crystal ring in the cave). */
  private bell(): void {
    const n = this.nodes;
    const ctx = audio.ctx;
    if (!n || !ctx) return;
    const scale = M.scales[this.mood.time];
    const note = scale[Math.floor(Math.random() * scale.length)] as number;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = this.mood.place === 'camp' ? 'triangle' : 'sine';
    osc.frequency.value = hz(note + (this.mood.place === 'cave' ? 12 : this.mood.place === 'camp' ? -12 : 0));
    const env = ctx.createGain();
    const decay = this.mood.place === 'camp' ? M.bellDecay * 0.6 : M.bellDecay;
    const level = M.bellGain * (this.mood.tension ? M.tensionDuck : 1);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(env);
    env.connect(n.bus);
    env.connect(n.delay);
    osc.start(t);
    osc.stop(t + decay + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
}

export interface AmbienceEnv {
  storm: boolean;
  night: boolean;
  /** Distance to the open sea (waves). */
  seaDistance: number;
}

/** Wind (always, stronger in a storm, softer at night) and waves near the sea (GDD §21). No nodes at volume 0. */
export class AmbienceDirector {
  private nodes: { wind: GainNode; windFilter: BiquadFilterNode; waves: GainNode; sources: AudioScheduledSourceNode[]; all: AudioNode[] } | null = null;
  private t = 0;

  update(dt: number, env: AmbienceEnv): void {
    const want = audio.running && audio.getPrefs().ambience > 0;
    if (want && !this.nodes) this.build();
    if (!want && this.nodes) this.teardown();
    const n = this.nodes;
    const ctx = audio.ctx;
    if (!n || !ctx) return;
    this.t += dt;
    const now = ctx.currentTime;
    const wind = env.storm ? A.wind.storm : env.night ? A.wind.night : A.wind.gain;
    n.wind.gain.setTargetAtTime(wind * (1 + Math.sin(this.t * A.wind.sway * 6) * 0.25), now, 0.8);
    const [lo, hi] = A.wind.cutoff;
    n.windFilter.frequency.setTargetAtTime(lo + (hi - lo) * (0.5 + 0.5 * Math.sin(this.t * A.wind.sway * 2.3)) * (env.storm ? 1.3 : 1), now, 0.8);
    const near = 1 - Math.min(Math.max((env.seaDistance - A.waves.near) / (A.waves.far - A.waves.near), 0), 1);
    const swell = 0.55 + 0.45 * Math.sin(this.t * A.waves.rate * Math.PI * 2);
    n.waves.gain.setTargetAtTime(A.waves.gain * near * swell, now, 0.4);
  }

  private build(): void {
    const ctx = audio.ctx;
    const out = audio.group('ambience');
    const buffer = audio.noiseBuffer;
    if (!ctx || !out || !buffer) return;
    const loop = () => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start(0, Math.random());
      return src;
    };
    const windSrc = loop();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.7;
    const wind = ctx.createGain();
    wind.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(wind);
    wind.connect(out);
    const wavesSrc = loop();
    const wavesFilter = ctx.createBiquadFilter();
    wavesFilter.type = 'lowpass';
    wavesFilter.frequency.value = A.waves.cutoff;
    const waves = ctx.createGain();
    waves.gain.value = 0;
    wavesSrc.connect(wavesFilter);
    wavesFilter.connect(waves);
    waves.connect(out);
    this.nodes = { wind, windFilter, waves, sources: [windSrc, wavesSrc], all: [windFilter, wind, wavesFilter, waves] };
  }

  private teardown(): void {
    const n = this.nodes;
    if (!n) return;
    for (const s of n.sources) {
      s.stop();
      s.disconnect();
    }
    for (const node of n.all) node.disconnect();
    this.nodes = null;
  }
}
