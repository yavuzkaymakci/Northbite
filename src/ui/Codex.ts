import * as THREE from 'three';
import { FishSpeciesList, RarityColor, type FishSpecies } from '../content/fish';
import { getLang, t, tf, type StringKey } from '../content/strings';
import type { GameState } from '../core/GameState';
import { createFishGeometry } from '../models/createFish';
import { Palette, toCss } from '../render/Palette';
import { CodexFeel } from '../settings';
import { onTap } from './tap';

/**
 * Fish encyclopedia (GDD §19): a full-screen sheet sliding up from the bottom. The grid shows every species (grey
 * silhouette and "???" until caught, variant badges in the corner); a card opens the detail with the same low-poly
 * model turning in its own little scene. While the sheet is open the game keeps running but this scene is drawn
 * instead of the world.
 */
export class Codex {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(CodexFeel.fov, 1, 0.1, 50);
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly fish = new THREE.Group();
  private readonly mainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.1 });
  private readonly bellyMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 });
  private state: GameState | null = null;
  private openValue = false;

  constructor(overlay: HTMLElement) {
    this.scene.background = new THREE.Color(Palette.codexBg);
    this.scene.add(new THREE.HemisphereLight(Palette.hemiSky, Palette.hemiGround, 1.6));
    const sun = new THREE.DirectionalLight(Palette.sun, 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const geo = createFishGeometry();
    this.fish.add(new THREE.Mesh(geo.main, this.mainMat), new THREE.Mesh(geo.belly, this.bellyMat));
    this.fish.visible = false;
    this.scene.add(this.fish);
    // The fish sits in the upper part of the screen, above the detail text.
    this.camera.position.set(0, 0.25, CodexFeel.distance);
    this.camera.lookAt(0, -CodexFeel.lookBelow, 0);

    this.root = document.createElement('div');
    this.root.className = 'codex';
    this.root.innerHTML = `
      <div class="codex-sheet">
        <div class="codex-head"><span class="codex-title">${t('codexTitle')}</span><span class="codex-count"></span></div>
        <div class="codex-grid"></div>
        <div class="codex-detail"></div>
        <button class="settings-btn close codex-close">${t('codexClose')}</button>
      </div>`;
    this.grid = this.root.querySelector('.codex-grid') as HTMLElement;
    this.detail = this.root.querySelector('.codex-detail') as HTMLElement;
    this.countEl = this.root.querySelector('.codex-count') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.codex-close') as HTMLElement, () => this.close());
    overlay.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.openValue;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  open(state: GameState): void {
    this.state = state;
    this.openValue = true;
    state.codex.fresh = [];
    this.renderGrid();
    this.root.classList.add('open');
  }

  close(): void {
    this.openValue = false;
    this.fish.visible = false;
    this.root.classList.remove('open', 'detail-open');
  }

  update(dt: number): void {
    if (!this.fish.visible) return;
    this.fish.rotation.y += dt * CodexFeel.spin;
    this.fish.scale.setScalar(this.fishScale());
  }

  /** The model fills a share of the screen width (portrait screens are narrow), never more than `fishSize`. */
  private fishScale(): number {
    const visibleWidth = 2 * CodexFeel.distance * Math.tan(THREE.MathUtils.degToRad(CodexFeel.fov / 2)) * this.camera.aspect;
    return Math.min(CodexFeel.fishSize, visibleWidth * CodexFeel.widthShare);
  }

  private renderGrid(): void {
    const s = this.state;
    if (!s) return;
    this.countEl.textContent = tf('codexCount', { n: s.seen.length, max: FishSpeciesList.length });
    this.grid.innerHTML = '';
    this.root.classList.remove('detail-open');
    this.fish.visible = false;
    for (const f of FishSpeciesList) {
      const known = s.seen.includes(f.id);
      const card = document.createElement('button');
      card.className = `codex-card${known ? '' : ' locked'}`;
      card.style.setProperty('--fish', toCss(Palette[f.color]));
      card.style.setProperty('--rarity', toCss(Palette[RarityColor[f.rarity]]));
      const badges = (['gold', 'rainbow'] as const)
        .filter((v) => s.codex.variants[v].includes(f.id))
        .map((v) => `<span class="codex-badge ${v}"></span>`)
        .join('');
      card.innerHTML = `<span class="codex-fish"></span><span class="codex-name">${known ? f.name[getLang()] : t('codexUnknown')}</span><span class="codex-badges">${badges}</span>`;
      if (known) onTap(card, () => this.showDetail(f));
      this.grid.appendChild(card);
    }
  }

  private showDetail(f: FishSpecies): void {
    const s = this.state;
    if (!s) return;
    const rec = s.codex.species[f.id];
    const none = t('codexNoValue');
    const when: StringKey = f.when === 'night' ? 'whenNight' : f.when === 'aurora' ? 'whenAurora' : 'whenAny';
    const variants = (['gold', 'rainbow'] as const).filter((v) => s.codex.variants[v].includes(f.id));
    const row = (label: StringKey, value: string) => `<div class="codex-row"><span>${t(label)}</span><b>${value}</b></div>`;
    this.detail.innerHTML = `
      <div class="codex-model-space"></div>
      <div class="codex-info">
        <div class="codex-detail-name">${f.name[getLang()]}</div>
        <div class="codex-desc">${t(`codex_${f.id}` as StringKey)}</div>
        ${row('codexRecord', rec && rec.bestKg > 0 ? `${rec.bestKg.toFixed(2)} ${t('kg')}` : none)}
        ${row('codexCaught', rec && rec.count > 0 ? String(rec.count) : none)}
        ${row('codexFirstDay', rec && rec.firstDay > 0 ? tf('codexFirstDayValue', { n: rec.firstDay }) : none)}
        ${row('codexRarity', `<span style="color:${toCss(Palette[RarityColor[f.rarity]])}">${t(`rarity_${f.rarity}` as StringKey)}</span>`)}
        ${row('codexWhen', t(when))}
        ${row('codexVariants', variants.length ? variants.map((v) => t(v === 'gold' ? 'variantGold' : 'variantRainbow')).join(', ') : none)}
        <button class="settings-btn codex-back">${t('codexBack')}</button>
      </div>`;
    onTap(this.detail.querySelector('.codex-back') as HTMLElement, () => this.renderGrid());
    this.mainMat.color.set(Palette[f.color]);
    this.bellyMat.color.set(Palette[f.bellyColor]);
    this.fish.scale.setScalar(this.fishScale());
    this.fish.rotation.set(0.15, 0.6, 0);
    this.fish.visible = true;
    this.root.classList.add('detail-open');
  }
}
