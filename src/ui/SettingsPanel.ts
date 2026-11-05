import { displayName, t, type StringKey } from '../content/strings';
import type { Prefs } from '../core/GameState';
import { onTap } from './tap';

type PrefKey = keyof Prefs;

/** Segmented choices per setting: value → label. */
const CHOICES: ReadonlyArray<{ key: PrefKey; label: StringKey; options: ReadonlyArray<[string, StringKey | null]> }> = [
  { key: 'threats', label: 'settingsThreats', options: [['true', 'on'], ['false', 'off']] },
  { key: 'dayLength', label: 'settingsDayLength', options: [['short', 'dayShort'], ['medium', 'dayMedium'], ['long', 'dayLong']] },
  { key: 'vibration', label: 'settingsVibration', options: [['true', 'on'], ['false', 'off']] },
  // Language names are written in their own language.
  { key: 'lang', label: 'settingsLanguage', options: [['tr', null], ['en', null]] },
];
const LANG_NAMES: Record<string, string> = { tr: 'Türkçe', en: 'English' };

/**
 * Settings card opened from the HUD gear: character name, peace, the game settings (threats, day length, vibration,
 * language) and "Edit character". Settings change at once; the game keeps running behind the card.
 */
export class SettingsPanel {
  private readonly root: HTMLDivElement;
  private readonly nameEl: HTMLElement;
  private readonly peaceEl: HTMLElement;
  private readonly segButtons: Array<{ key: PrefKey; value: string; el: HTMLElement }> = [];
  private prefs: Prefs | null = null;
  /** Language shown as selected (the device language while prefs.lang is ''). */
  private lang = 'tr';
  private openValue = false;

  constructor(
    overlay: HTMLElement,
    private readonly onEditCharacter: () => void,
    /** A setting changed (the game applies it; `prefs` is the game state's object, already updated). */
    private readonly onPrefs: (key: PrefKey) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'settings-backdrop';
    const rows = CHOICES.map(
      (c) => `<div class="settings-row seg-row"><span>${t(c.label)}</span><div class="seg" data-key="${c.key}">${c.options
        .map(([v, label]) => `<button class="seg-btn" data-v="${v}">${label ? t(label) : LANG_NAMES[v]}</button>`)
        .join('')}</div></div>`,
    ).join('');
    this.root.innerHTML = `
      <div class="settings-card">
        <div class="settings-title">${t('settingsTitle')}</div>
        <div class="settings-row"><span>${t('settingsCharacter')}</span><b class="settings-name"></b></div>
        <div class="settings-row"><span>${t('settingsPeace')}</span><b class="settings-peace"></b></div>
        ${rows}
        <button class="settings-btn primary">${t('settingsEditCharacter')}</button>
        <button class="settings-btn close">${t('creatorClose')}</button>
      </div>`;
    this.nameEl = this.root.querySelector('.settings-name') as HTMLElement;
    this.peaceEl = this.root.querySelector('.settings-peace') as HTMLElement;
    for (const seg of this.root.querySelectorAll<HTMLElement>('.seg')) {
      const key = seg.dataset.key as PrefKey;
      for (const btn of seg.querySelectorAll<HTMLElement>('.seg-btn')) {
        const value = btn.dataset.v as string;
        this.segButtons.push({ key, value, el: btn });
        onTap(btn, () => this.choose(key, value));
      }
    }
    const card = this.root.querySelector('.settings-card') as HTMLElement;
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.settings-btn.primary') as HTMLElement, () => {
      this.close();
      this.onEditCharacter();
    });
    onTap(this.root.querySelector('.settings-btn.close') as HTMLElement, () => this.close());
    // Tapping outside the card closes it.
    this.root.addEventListener('pointerup', (e) => {
      if (e.target === this.root) this.close();
    });
    overlay.appendChild(this.root);
  }

  get opened(): boolean {
    return this.openValue;
  }

  /** `lang` is the language in use (prefs.lang may be '' = device language). */
  open(name: string, peace: number, prefs: Prefs, lang: string): void {
    this.nameEl.textContent = displayName(name);
    this.peaceEl.textContent = String(peace);
    this.prefs = prefs;
    this.lang = lang;
    this.render();
    this.openValue = true;
    this.root.classList.add('open');
  }

  close(): void {
    this.openValue = false;
    this.root.classList.remove('open');
  }

  private choose(key: PrefKey, value: string): void {
    const p = this.prefs;
    if (!p) return;
    if (key === 'threats' || key === 'vibration') p[key] = value === 'true';
    else if (key === 'dayLength') p.dayLength = value as Prefs['dayLength'];
    else {
      p.lang = value as Prefs['lang'];
      this.lang = value;
    }
    this.render();
    this.onPrefs(key);
  }

  private render(): void {
    const p = this.prefs;
    if (!p) return;
    for (const b of this.segButtons) {
      const current = b.key === 'lang' ? this.lang : String(p[b.key]);
      b.el.classList.toggle('on', current === b.value);
    }
  }
}
