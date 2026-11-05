import * as THREE from 'three';
import { DayFeel as F } from '../settings';
import { damp } from '../core/Time';
import type { DayCycle } from '../systems/DayCycle';
import type { Lights, Sky } from './Lighting';
import { NightLights } from './NightLights';
import { Palette } from './Palette';
import type { Snowfall } from './Snowfall';

interface Look {
  skyTop: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sun: THREE.Color;
  water: THREE.Color;
  snow: THREE.Color;
  hemiI: number;
  sunI: number;
  night: number;
}

const c = (hex: number) => new THREE.Color(hex);
const LOOKS: Record<'dawn' | 'day' | 'dusk' | 'night', Look> = {
  dawn: { skyTop: c(Palette.skyTopDawn), fog: c(Palette.fogDawn), hemiSky: c(Palette.hemiSkyDawn), hemiGround: c(Palette.hemiGround), sun: c(Palette.sunDawn), water: c(Palette.deepWater), snow: c(Palette.snow), hemiI: F.hemi.dusk, sunI: F.sun.dusk, night: 0.15 },
  day: { skyTop: c(Palette.skyTop), fog: c(Palette.fog), hemiSky: c(Palette.hemiSky), hemiGround: c(Palette.hemiGround), sun: c(Palette.sun), water: c(Palette.deepWater), snow: c(Palette.snow), hemiI: F.hemi.day, sunI: F.sun.day, night: 0 },
  dusk: { skyTop: c(Palette.skyTopDusk), fog: c(Palette.fogDusk), hemiSky: c(Palette.hemiSkyDusk), hemiGround: c(Palette.hemiGround), sun: c(Palette.sunDusk), water: c(Palette.deepWater), snow: c(Palette.snow), hemiI: F.hemi.dusk, sunI: F.sun.dusk, night: 0.35 },
  night: { skyTop: c(Palette.skyTopNight), fog: c(Palette.fogNight), hemiSky: c(Palette.hemiSkyNight), hemiGround: c(Palette.hemiGroundNight), sun: c(Palette.moon), water: c(Palette.waterNight), snow: c(Palette.snowNight), hemiI: F.hemi.night, sunI: F.sun.night, night: 1 },
};

/** Look keys over the day (cyclic). Between keys the look blends linearly. */
const KEYS: ReadonlyArray<{ t: number; look: Look }> = [
  { t: 0.02, look: LOOKS.dawn },
  { t: 0.14, look: LOOKS.day },
  { t: 0.53, look: LOOKS.day },
  { t: 0.62, look: LOOKS.dusk },
  { t: 0.72, look: LOOKS.night },
  { t: 0.97, look: LOOKS.night },
];

const AURORA_VERT = `
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.y += sin(p.x * 0.18 + uTime * 0.35) * 1.2 + sin(p.x * 0.07 - uTime * 0.2) * 1.6;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const AURORA_FRAG = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uGreen;
uniform vec3 uPurple;
varying vec2 vUv;
void main() {
  float ripple = 0.6 + 0.4 * sin(vUv.x * 18.0 + uTime * 0.9) * sin(vUv.x * 7.0 - uTime * 0.4);
  float vertical = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float sides = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
  vec3 col = mix(uGreen, uPurple, smoothstep(0.3, 0.95, vUv.y));
  gl_FragColor = vec4(col * ripple, vertical * sides * uOpacity);
}`;

/**
 * Time-of-day and weather look (GDD §12): blends light, fog, sky, water and snow colors, moves the sun,
 * fades the aurora ribbons and the night window glow. Only colors and uniforms change per frame.
 */
export class Atmosphere {
  private readonly cur: Look = {
    skyTop: new THREE.Color(),
    fog: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sun: new THREE.Color(),
    water: new THREE.Color(),
    snow: new THREE.Color(),
    hemiI: 1,
    sunI: 1,
    night: 0,
  };
  private readonly aurora: THREE.Group;
  private readonly auroraSecond: THREE.Mesh;
  private readonly auroraUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uGreen: { value: new THREE.Color(Palette.auroraGreen) },
    uPurple: { value: new THREE.Color(Palette.auroraPurple) },
  };
  private storm = 0;
  private skyTimer = 0;
  private readonly stormFog = new THREE.Color(Palette.fogStorm);
  private readonly horizon = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly lights: Lights,
    private readonly sky: Sky,
    private readonly water: THREE.MeshStandardMaterial,
    private readonly snow: Snowfall,
    private readonly cycle: DayCycle,
  ) {
    // Aurora curtains ride with the camera near the top of the view, in front of the far sea.
    this.aurora = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.auroraUniforms,
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(46, 7, 48, 1), mat);
    a.position.set(-4, 7.5, -34);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(40, 5, 48, 1), mat);
    b.position.set(6, 9.5, -36);
    b.rotation.z = 0.05;
    this.aurora.add(a, b);
    this.auroraSecond = b;
    this.aurora.visible = false;
    camera.add(this.aurora);
    scene.add(camera);
  }

  /** Low quality: a single aurora curtain. */
  setSimple(simple: boolean): void {
    this.auroraSecond.visible = !simple;
  }

  /** Storm fog level 0..1 (smooth). */
  get stormLevel(): number {
    return this.storm;
  }

  /** 0 = day, 1 = full night (smooth). */
  get nightLevel(): number {
    return this.cur.night;
  }

  update(dt: number, time: number): void {
    this.blend(this.cycle.t);
    const target = this.cycle.stormActive ? 1 : 0;
    this.storm += (target - this.storm) * damp(3 / F.stormFadeTime, dt);
    const s = this.storm;
    const L = this.cur;

    this.lights.hemi.color.copy(L.hemiSky);
    this.lights.hemi.groundColor.copy(L.hemiGround);
    this.lights.hemi.intensity = L.hemiI * (1 - 0.25 * s);
    this.lights.sun.color.copy(L.sun);
    this.lights.sun.intensity = L.sunI * (1 - 0.45 * s);
    // Sun swings east → west over the day; the moon sits high in the south-west.
    const dayAngle = (this.cycle.t - 0.05) * Math.PI * 1.6;
    const sx = Math.cos(dayAngle) * 10;
    const sz = 5;
    this.lights.sun.position.set(sx * (1 - L.night) - 5 * L.night, F.sunHeight, sz);

    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(L.fog).lerp(this.stormFog, s * (1 - L.night * 0.6));
    fog.near = F.fogNear.clear + (F.fogNear.storm - F.fogNear.clear) * s;
    fog.far = F.fogFar.clear + (F.fogFar.storm - F.fogFar.clear) * s;
    this.water.color.copy(L.water);
    (this.snow.mesh.material as THREE.MeshBasicMaterial).color.copy(L.snow);
    this.snow.setWind(F.stormSnowWind * s, 1 + (F.stormSnowFall - 1) * s);

    this.skyTimer -= dt;
    if (this.skyTimer <= 0) {
      this.skyTimer = 0.4;
      this.horizon.copy(L.fog).lerp(L.skyTop, 0.35);
      this.sky.paint(L.skyTop, this.horizon, fog.color);
    }

    const auroraLevel = Math.max(0, (L.night - 0.5) * 2) * (1 - s);
    this.aurora.visible = auroraLevel > 0.01;
    this.auroraUniforms.uOpacity.value = auroraLevel * F.auroraOpacity;
    this.auroraUniforms.uTime.value = time;
    NightLights.set(Math.max(0, (L.night - 0.25) / 0.75));
  }

  private blend(t: number): void {
    // Find the keys around t on the cycle.
    let i = KEYS.length - 1;
    for (let k = 0; k < KEYS.length; k++) if ((KEYS[k] as (typeof KEYS)[number]).t <= t) i = k;
    const a = KEYS[i] as (typeof KEYS)[number];
    const b = KEYS[(i + 1) % KEYS.length] as (typeof KEYS)[number];
    let span = b.t - a.t;
    let pos = t - a.t;
    if (span <= 0) span += 1;
    if (pos < 0) pos += 1;
    const k = Math.min(Math.max(pos / span, 0), 1);
    const L = this.cur;
    for (const key of ['skyTop', 'fog', 'hemiSky', 'hemiGround', 'sun', 'water', 'snow'] as const) {
      L[key].copy(a.look[key]).lerp(b.look[key], k);
    }
    L.hemiI = a.look.hemiI + (b.look.hemiI - a.look.hemiI) * k;
    L.sunI = a.look.sunI + (b.look.sunI - a.look.sunI) * k;
    L.night = a.look.night + (b.look.night - a.look.night) * k;
  }
}
