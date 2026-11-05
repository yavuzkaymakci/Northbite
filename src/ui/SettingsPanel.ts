import { displayName, t, type StringKey } from '../content/strings';
import type { Prefs } from '../core/GameState';
import { onTap } from './tap';
import { panels } from './PanelManager';

type PrefKey = keyof Prefs;

type Choice = { key: PrefKey; label: StringKey; options: ReadonlyArray<[string, StringKey | null]> };
const ON_OFF: ReadonlyArray<[string, StringKey]> = [['true', 'on'], ['false', 'off']];
/** Segmented choices per setting: value → label. */
const CHOICES: readonly Choice[] = [
  { key: 'threats', label: 'settingsThreats', options: ON_OFF },
  { key: 'dayLength', label: 'settingsDayLength', options: [['short', 'dayShort'], ['medium', 'dayMedium'], ['long', 'dayLong']] },
  { key: 'vibration', label: 'settingsVibration', options: ON_OFF },
  // Language names are written in their own language.
  { key: 'lang', label: 'settingsLanguage', options: [['tr', null], ['en', null]] },
];
/** Display (GDD §22). */
const DISPLAY: readonly Choice[] = [
  { key: 'quality', label: 'settingsQuality', options: [['low', 'qualityLow'], ['medium', 'qualityMedium'], ['high', 'qualityHigh']] },
  { key: 'reduceMotion', label: 'settingsReduceMotion', options: ON_OFF },
];
const DEBUG: readonly Choice[] = [
  { key: 'showFps', label: 'settingsFps', options: ON_OFF },
  { key: 'debugTools', label: 'settingsDebugTools', options: ON_OFF },
];
const BOOL_KEYS: readonly PrefKey[] = ['threats', 'vibration', 'reduceMotion', 'showFps', 'debugTools'];
const LANG_NAMES: Record<string, string> = { tr: 'Türkçe', en: 'English' };
type VolumeKey = 'master' | 'music' | 'sfx' | 'ambience';
const VOLUMES: ReadonlyArray<[VolumeKey, StringKey]> = [
  ['master', 'soundMaster'],
  ['music', 'soundMusic'],
  ['sfx', 'soundSfx'],
  ['ambience', 'soundAmbience'],
];

/**
 * Settings card opened from the HUD gear: character name, peace, the game settings (threats, day length, vibration,
 * language) and "Edit character". Settings change at once; the game keeps running behind the card.
 */
export class SettingsPanel {
  private readonly root: HTMLDivElement;
  private readonly nameEl: HTMLElement;
  private readonly peaceEl: HTMLElement;
  private readonly titleRow: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly segButtons: Array<{ key: PrefKey; value: string; el: HTMLElement }> = [];
  private prefs: Prefs | null = null;
  /** Language shown as selected (the device language while prefs.lang is ''). */
  private lang = 'tr';

  constructor(
    overlay: HTMLElement,
    private readonly onEditCharacter: () => void,
    /** A setting changed (the game applies it; `prefs` is the game state's object, already updated). */
    private readonly onPrefs: (key: PrefKey) => void,
    /** Volumes or mute changed (`final`: the slider was let go, time to save). */
    private readonly onAudio: (final: boolean) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'settings-backdrop';
    const rowsOf = (list: readonly Choice[]) =>
      list
        .map(
          (c) => `<div class="settings-row seg-row"><span>${t(c.label)}</span><div class="seg" data-key="${c.key}">${c.options
            .map(([v, label]) => `<button class="seg-btn" data-v="${v}">${label ? t(label) : LANG_NAMES[v]}</button>`)
            .join('')}</div></div>`,
        )
        .join('');
    const rows = rowsOf(CHOICES);
    this.root.innerHTML = `
      <div class="settings-card">
        <div class="settings-title">${t('settingsTitle')}</div>
        <div class="settings-row"><span>${t('settingsCharacter')}</span><b class="settings-name"></b></div>
        <div class="settings-row settings-title-row"><span>${t('settingsTitleLabel')}</span><b class="settings-player-title"></b></div>
        <div class="settings-row"><span>${t('settingsPeace')}</span><b class="settings-peace"></b></div>
        ${rows}
        <div class="settings-sub">${t('settingsSound')}</div>
        ${VOLUMES.map(([k, label]) => `<label class="settings-row slider-row"><span>${t(label)}</span><input type="range" min="0" max="100" step="1" data-vol="${k}"></label>`).join('')}
        <div class="settings-row seg-row"><span>${t('soundMute')}</span><div class="seg seg-mute"><button class="seg-btn" data-v="true">${t('on')}</button><button class="seg-btn" data-v="false">${t('off')}</button></div></div>
        <div class="settings-sub">${t('settingsDisplay')}</div>
        ${rowsOf(DISPLAY)}
        <div class="settings-sub">${t('settingsDebug')}</div>
        ${rowsOf(DEBUG)}
        <button class="settings-btn primary">${t('settingsEditCharacter')}</button>
        <button class="settings-btn close">${t('creatorClose')}</button>
      </div>`;
    this.nameEl = this.root.querySelector('.settings-name') as HTMLElement;
    this.peaceEl = this.root.querySelector('.settings-peace') as HTMLElement;
    this.titleRow = this.root.querySelector('.settings-title-row') as HTMLElement;
    this.titleEl = this.root.querySelector('.settings-player-title') as HTMLElement;
    for (const seg of this.root.querySelectorAll<HTMLElement>('.seg[data-key]')) {
      const key = seg.dataset.key as PrefKey;
      for (const btn of seg.querySelectorAll<HTMLElement>('.seg-btn')) {
        const value = btn.dataset.v as string;
        this.segButtons.push({ key, value, el: btn });
        onTap(btn, () => this.choose(key, value));
      }
    }
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-vol]')) {
      const key = input.dataset.vol as VolumeKey;
      input.addEventListener('input', () => this.setVolume(key, input, false));
      input.addEventListener('change', () => this.setVolume(key, input, true));
    }
    for (const btn of this.root.querySelectorAll<HTMLElement>('.seg-mute .seg-btn')) {
      onTap(btn, () => {
        if (!this.prefs) return;
        this.prefs.audio.mute = btn.dataset.v === 'true';
        this.render();
        this.onAudio(true);
      });
    }
    const card = this.root.querySelector('.settings-card') as HTMLElement;
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.settings-btn.primary') as HTMLElement, () => {
      panels.close('settings', 'done');
      this.onEditCharacter();
    });
    onTap(this.root.querySelector('.settings-btn.close') as HTMLElement, () => panels.close('settings', 'button'));
    overlay.appendChild(this.root);
    // Modal; tapping outside the card closes it.
    panels.register({
      id: 'settings',
      kind: 'modal',
      root: this.root,
      inside: () => card,
      outside: true,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
    });
  }

  get opened(): boolean {
    return panels.isOpen('settings');
  }

  /** `lang` is the language in use (prefs.lang may be '' = device language). */
  open(name: string, peace: number, prefs: Prefs, lang: string, title: string): void {
    this.nameEl.textContent = displayName(name);
    // Profile title from the encyclopedia ("Master angler"), shown once earned.
    this.titleEl.textContent = title;
    this.titleRow.style.display = title ? '' : 'none';
    this.peaceEl.textContent = String(peace);
    this.prefs = prefs;
    this.lang = lang;
    this.render();
    panels.open('settings');
  }

  private choose(key: PrefKey, value: string): void {
    const p = this.prefs;
    if (!p) return;
    if (BOOL_KEYS.includes(key)) (p as unknown as Record<string, boolean>)[key] = value === 'true';
    else if (key === 'dayLength') p.dayLength = value as Prefs['dayLength'];
    else if (key === 'quality') p.quality = value as Prefs['quality'];
    else {
      p.lang = value as Prefs['lang'];
      this.lang = value;
    }
    this.render();
    this.onPrefs(key);
  }

  private setVolume(key: VolumeKey, input: HTMLInputElement, final: boolean): void {
    if (!this.prefs) return;
    this.prefs.audio[key] = Math.min(Math.max(Number(input.value) / 100, 0), 1);
    this.onAudio(final);
  }

  private render(): void {
    const p = this.prefs;
    if (!p) return;
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-vol]')) {
      input.value = String(Math.round(p.audio[input.dataset.vol as VolumeKey] * 100));
    }
    for (const btn of this.root.querySelectorAll<HTMLElement>('.seg-mute .seg-btn')) btn.classList.toggle('on', String(p.audio.mute) === btn.dataset.v);
    for (const b of this.segButtons) {
      const current = b.key === 'lang' ? this.lang : String(p[b.key]);
      b.el.classList.toggle('on', current === b.value);
    }
  }
}
