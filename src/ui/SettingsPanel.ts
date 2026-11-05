import { displayName, t } from '../content/strings';
import { onTap } from './tap';

/** Small settings card opened from the HUD gear: shows the character name and "Edit character". */
export class SettingsPanel {
  private readonly root: HTMLDivElement;
  private readonly nameEl: HTMLElement;
  private readonly peaceEl: HTMLElement;
  private openValue = false;

  constructor(
    overlay: HTMLElement,
    private readonly onEditCharacter: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'settings-backdrop';
    this.root.innerHTML = `
      <div class="settings-card">
        <div class="settings-title">${t('settingsTitle')}</div>
        <div class="settings-row"><span>${t('settingsCharacter')}</span><b class="settings-name"></b></div>
        <div class="settings-row"><span>${t('settingsPeace')}</span><b class="settings-peace"></b></div>
        <button class="settings-btn primary">${t('settingsEditCharacter')}</button>
        <button class="settings-btn close">${t('creatorClose')}</button>
      </div>`;
    this.nameEl = this.root.querySelector('.settings-name') as HTMLElement;
    this.peaceEl = this.root.querySelector('.settings-peace') as HTMLElement;
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

  open(name: string, peace: number): void {
    this.nameEl.textContent = displayName(name);
    this.peaceEl.textContent = String(peace);
    this.openValue = true;
    this.root.classList.add('open');
  }

  close(): void {
    this.openValue = false;
    this.root.classList.remove('open');
  }
}
