import * as THREE from 'three';
import {
  BeardStyles,
  ColorOptions,
  HeadwearStyles,
  NAME_MAX_LENGTH,
  headwearHasColor,
  randomAppearance,
  type Appearance,
  type ColorOptionSet,
} from '../content/appearance';
import { t, type StringKey } from '../content/strings';
import { CreatorFeel as F } from '../settings';
import { damp } from '../core/Time';
import { animatePlayer, applyAppearance, createPlayer, type PlayerModel } from '../models/createPlayer';
import { createBlobShadow } from '../render/BlobShadow';
import { addLighting } from '../render/Lighting';
import { Palette, toCss } from '../render/Palette';
import { flat, mesh } from '../models/materials';
import { Snowfall } from '../render/Snowfall';
import { panels } from './PanelManager';
import { onTap } from './tap';

type Tab = 'skin' | 'jacket' | 'headwear' | 'beard' | 'scarf' | 'name';
export type CreatorMode = 'new' | 'edit';

const TABS: ReadonlyArray<{ id: Tab; label: StringKey }> = [
  { id: 'skin', label: 'tab_skin' },
  { id: 'jacket', label: 'tab_jacket' },
  { id: 'headwear', label: 'tab_headwear' },
  { id: 'beard', label: 'tab_beard' },
  { id: 'scarf', label: 'tab_scarf' },
  { id: 'name', label: 'tab_name' },
];

// Simple line icons; stroke/fill follow the button's text color.
const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const TAB_ICONS: Record<Tab, string> = {
  skin: svg('<circle cx="16" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12.5" cy="14" r="1.6" fill="currentColor"/><circle cx="19.5" cy="14" r="1.6" fill="currentColor"/><path d="M12 19 q4 3 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  jacket: svg('<path d="M10 6 L16 9 L22 6 L28 12 L24 15 L24 27 L8 27 L8 15 L4 12 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 9 V27" stroke="currentColor" stroke-width="2"/>'),
  headwear: svg('<path d="M6 22 Q6 8 16 8 Q26 8 26 22 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="4" y="21" width="24" height="5" rx="2" fill="currentColor"/><circle cx="16" cy="6" r="2.6" fill="currentColor"/>'),
  beard: svg('<path d="M7 10 Q7 26 16 28 Q25 26 25 10 Q21 16 16 16 Q11 16 7 10 Z" fill="currentColor"/>'),
  scarf: svg('<path d="M6 10 Q16 16 26 10 L26 15 Q16 21 6 15 Z" fill="currentColor"/><path d="M19 16 L22 28 L17 28 L15 18 Z" fill="currentColor"/>'),
  name: svg('<path d="M5 9 H20 L27 16 L20 23 H5 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="16" r="2" fill="currentColor"/>'),
};
const STYLE_ICONS: Record<string, string> = {
  none: svg('<circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M9 23 L23 9" stroke="currentColor" stroke-width="2.5"/>'),
  beanie: svg('<path d="M7 22 Q7 9 16 9 Q25 9 25 22 Z" fill="currentColor"/><rect x="5" y="21" width="22" height="5" rx="2" fill="currentColor" opacity="0.7"/><circle cx="16" cy="7" r="3" fill="currentColor"/>'),
  furHat: svg('<rect x="7" y="9" width="18" height="13" rx="4" fill="currentColor" opacity="0.55"/><rect x="8" y="6" width="16" height="5" rx="2" fill="currentColor"/><rect x="4" y="16" width="4" height="9" rx="2" fill="currentColor" opacity="0.55"/><rect x="24" y="16" width="4" height="9" rx="2" fill="currentColor" opacity="0.55"/>'),
  hood: svg('<path d="M5 26 Q5 5 16 5 Q27 5 27 26 Z" fill="currentColor"/><circle cx="16" cy="18" r="7" fill="var(--panel-bg)"/>'),
  short: svg('<circle cx="16" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 15 Q16 24 23 15 L23 19 Q16 27 9 19 Z" fill="currentColor"/>'),
  long: svg('<circle cx="16" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 13 Q16 20 23 13 L20 26 L16 30 L12 26 Z" fill="currentColor"/>'),
};
const DICE = svg('<rect x="5" y="5" width="22" height="22" rx="5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="11" cy="11" r="2.2" fill="currentColor"/><circle cx="21" cy="21" r="2.2" fill="currentColor"/><circle cx="16" cy="16" r="2.2" fill="currentColor"/><circle cx="21" cy="11" r="2.2" fill="currentColor"/><circle cx="11" cy="21" r="2.2" fill="currentColor"/>');

/** Aurora sky: deep blue top, faint green/purple bands, pale horizon. */
function auroraBackground(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const mix = (a: number, b: number, k: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, toCss(Palette.creatorSkyTop));
    g.addColorStop(0.2, mix(Palette.creatorSkyTop, Palette.auroraPurple, 0.35));
    g.addColorStop(0.34, mix(Palette.creatorSkyTop, Palette.auroraGreen, 0.32));
    g.addColorStop(0.6, toCss(Palette.creatorSkyLow));
    g.addColorStop(1, toCss(Palette.creatorSkyLow));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Character creator (GDD §3): its own scene and camera on the shared renderer, plus an HTML panel.
 * Choices live in a draft until "Start"/"Save"; nothing is saved from here.
 */
export class CharacterCreator {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(F.fov, 1, 0.5, 60);
  private readonly model: PlayerModel;
  private readonly snow = new Snowfall();
  private readonly root: HTMLDivElement;
  private readonly options: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly sparkle: HTMLDivElement;
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>();
  private readonly origin = new THREE.Vector3();
  private draft: Appearance | null = null;
  private tab: Tab = 'skin';
  private onDone: ((a: Appearance | null) => void) | null = null;
  private openValue = false;

  // Spin / drag
  private yaw = 0.4;
  private spinVel: number = F.autoSpin;
  private dragId: number | null = null;
  private dragX = 0;
  private dragDelta = 0;
  private pop = 1;

  constructor(
    container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.scene.background = auroraBackground();
    this.scene.fog = new THREE.Fog(Palette.creatorSkyLow, 13, 24);
    addLighting(this.scene);
    const ground = mesh(new THREE.CylinderGeometry(9, 9, 0.2, 24), flat(Palette.creatorGround), 0, -0.1, 0);
    const ice = mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.06, 10), flat(Palette.ice, { roughness: 0.4 }), 0, 0.02, 0);
    this.model = createPlayer();
    this.scene.add(ground, ice, createBlobShadow(1.3), this.model.root, this.snow.mesh);
    const pitch = THREE.MathUtils.degToRad(F.pitchDeg);
    this.camera.position.set(0, F.lookAtY + Math.sin(pitch) * F.distance, Math.cos(pitch) * F.distance);
    this.camera.lookAt(0, F.lookAtY, 0);

    this.root = document.createElement('div');
    this.root.className = 'creator';
    this.root.innerHTML = `
      <div class="creator-head">
        <div class="creator-logo">${t('gameTitle')}</div>
        <div class="creator-sub"></div>
        <button class="creator-close" aria-label="${t('creatorClose')}">×</button>
      </div>
      <div class="creator-sparkle"></div>
      <div class="creator-panel">
        <div class="creator-options"></div>
        <div class="creator-tabs"></div>
        <div class="creator-actions">
          <button class="creator-random">${DICE}<span>${t('creatorRandom')}</span></button>
          <button class="creator-start"></button>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.options = q('.creator-options');
    this.subtitle = q('.creator-sub');
    this.startBtn = q('.creator-start');
    this.closeBtn = q('.creator-close');
    this.sparkle = q('.creator-sparkle');
    const tabs = q<HTMLDivElement>('.creator-tabs');
    for (const tab of TABS) {
      const b = document.createElement('button');
      b.className = 'creator-tab';
      b.innerHTML = `${TAB_ICONS[tab.id]}<span>${t(tab.label)}</span>`;
      onTap(b, () => this.setTab(tab.id));
      tabs.appendChild(b);
      this.tabButtons.set(tab.id, b);
    }
    onTap(q('.creator-random'), () => {
      if (!this.draft) return;
      this.draft = randomAppearance(this.draft.name);
      this.changed();
      this.renderOptions();
    });
    onTap(this.startBtn, () => this.finish(true));
    onTap(this.closeBtn, () => this.finish(false));
    container.appendChild(this.root);
    // Modal (GDD §23). Back / Escape closes it only when editing (a new player has to press "Start").
    panels.register({
      id: 'creator',
      kind: 'modal',
      root: this.root,
      back: () => this.root.classList.contains('edit'),
      sound: false,
      show: () => {
        this.openValue = true;
        this.root.classList.add('open');
      },
      hide: () => {
        this.openValue = false;
        this.dragId = null;
        this.root.classList.remove('open');
        (document.activeElement as HTMLElement | null)?.blur?.();
      },
      onClose: (reason) => {
        // Closed by back: same as "×" (nothing saved).
        if (reason === 'done' || !this.onDone) return;
        const done = this.onDone;
        this.onDone = null;
        done(null);
      },
    });

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
  }

  get isOpen(): boolean {
    return this.openValue;
  }

  /** Opens with a copy of `appearance`. `onDone` gets the result, or null when closed without saving (edit only). */
  show(mode: CreatorMode, appearance: Appearance, onDone: (a: Appearance | null) => void): void {
    panels.open('creator', {
      run: () => {
        this.draft = { ...appearance };
        this.onDone = onDone;
        this.root.classList.toggle('edit', mode === 'edit');
        this.subtitle.textContent = t(mode === 'edit' ? 'creatorEditSubtitle' : 'creatorSubtitle');
        this.startBtn.textContent = t(mode === 'edit' ? 'creatorSave' : 'creatorStart');
        applyAppearance(this.model, this.draft);
        this.setTab('skin');
      },
    });
  }

  hide(): void {
    panels.close('creator', 'done');
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // Shift the view so the model sits in the upper-middle band, above the panel.
    this.camera.setViewOffset(w, h, 0, h * (0.5 - F.screenY), w, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, time: number): void {
    if (this.dragId !== null) {
      this.yaw += this.dragDelta;
      this.spinVel = dt > 0 ? this.dragDelta / dt : this.spinVel;
      this.dragDelta = 0;
    } else {
      this.spinVel += (F.autoSpin - this.spinVel) * damp(F.spinReturn, dt);
      this.yaw += this.spinVel * dt;
    }
    this.model.root.rotation.y = this.yaw;
    this.pop = Math.min(this.pop + dt / F.popTime, 1);
    const s = 1 + Math.sin(this.pop * Math.PI) * F.popScale;
    this.model.root.scale.setScalar(s);
    animatePlayer(this.model, 0, 0, time);
    this.snow.update(dt, time, this.origin);
  }

  // ---------- Panel ----------

  private setTab(tab: Tab): void {
    this.tab = tab;
    for (const [id, b] of this.tabButtons) b.classList.toggle('active', id === tab);
    this.renderOptions();
  }

  private renderOptions(): void {
    const a = this.draft;
    if (!a) return;
    const el = this.options;
    el.innerHTML = '';
    switch (this.tab) {
      case 'skin':
        el.appendChild(this.swatches(ColorOptions.skin, a.skinTone, (i) => (a.skinTone = i)));
        break;
      case 'jacket':
        el.appendChild(this.swatches(ColorOptions.jacket, a.jacketColor, (i) => (a.jacketColor = i)));
        break;
      case 'headwear':
        el.appendChild(this.styles(HeadwearStyles, a.headwear, (id) => (a.headwear = id)));
        if (headwearHasColor(a.headwear)) {
          el.appendChild(this.swatches(ColorOptions.headwear, a.headwearColor, (i) => (a.headwearColor = i), true));
        }
        break;
      case 'beard':
        el.appendChild(this.styles(BeardStyles, a.beard, (id) => (a.beard = id)));
        if (a.beard !== 'none') el.appendChild(this.swatches(ColorOptions.beard, a.beardColor, (i) => (a.beardColor = i), true));
        break;
      case 'scarf': {
        const row = this.swatches(ColorOptions.scarf, a.scarfColor, (i) => (a.scarfColor = i));
        const none = this.styleCard('none', t('style_none'), a.scarfColor < 0, () => (a.scarfColor = -1));
        none.classList.add('compact');
        row.prepend(none);
        el.appendChild(row);
        break;
      }
      case 'name':
        el.appendChild(this.nameField(a));
        break;
    }
  }

  private swatches(set: ColorOptionSet, selected: number, pick: (i: number) => void, small = false): HTMLDivElement {
    const row = document.createElement('div');
    row.className = small ? 'creator-row swatch-row small' : 'creator-row swatch-row';
    set.colors.forEach((color, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === selected ? ' selected' : '');
      b.style.setProperty('--c', toCss(color));
      const label = set.labels[i];
      if (label) b.setAttribute('aria-label', t(label));
      onTap(b, () => {
        pick(i);
        this.changed();
        this.renderOptions();
      });
      row.appendChild(b);
    });
    return row;
  }

  private styles<T extends string>(list: ReadonlyArray<{ id: T; label: StringKey }>, selected: T, pick: (id: T) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'creator-row style-row';
    for (const s of list) {
      row.appendChild(
        this.styleCard(s.id, t(s.label), s.id === selected, () => pick(s.id)),
      );
    }
    return row;
  }

  private styleCard(icon: string, label: string, selected: boolean, pick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'style-card' + (selected ? ' selected' : '');
    b.innerHTML = `${STYLE_ICONS[icon] ?? ''}<span>${label}</span>`;
    onTap(b, () => {
      pick();
      this.changed();
      this.renderOptions();
    });
    return b;
  }

  private nameField(a: Appearance): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'creator-row name-row';
    wrap.innerHTML = `<label class="name-label">${t('nameLabel')}</label>`;
    const input = document.createElement('input');
    input.className = 'name-input';
    input.type = 'text';
    input.maxLength = NAME_MAX_LENGTH;
    input.placeholder = t('namePlaceholder');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = a.name;
    input.addEventListener('input', () => {
      a.name = input.value.slice(0, NAME_MAX_LENGTH);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    wrap.appendChild(input);
    return wrap;
  }

  /** Applies the draft to the model with a little pop and sparkle. */
  private changed(): void {
    if (!this.draft) return;
    applyAppearance(this.model, this.draft);
    this.pop = 0;
    this.sparkle.classList.remove('go');
    void this.sparkle.offsetWidth;
    this.sparkle.classList.add('go');
  }

  private finish(accept: boolean): void {
    if (!this.openValue || !this.onDone) return;
    const done = this.onDone;
    const result = accept && this.draft ? { ...this.draft, name: this.draft.name.trim() } : null;
    this.onDone = null;
    done(result);
  }

  // ---------- Drag to spin (canvas area above the panel) ----------

  private onDown = (e: PointerEvent): void => {
    if (!this.openValue || this.dragId !== null) return;
    this.dragId = e.pointerId;
    this.dragX = e.clientX;
    this.dragDelta = 0;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragId) return;
    this.dragDelta += (e.clientX - this.dragX) * F.dragSpeed;
    this.dragX = e.clientX;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.dragId) this.dragId = null;
  };
}
