import { t } from '../content/strings';
import { onTap } from './tap';

/** One-time offer on a slow device (GDD §22): "Switch to low quality?" Yes / No. */
export class QualityPrompt {
  private readonly root: HTMLDivElement;
  private answer: ((yes: boolean) => void) | null = null;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'settings-backdrop quality-prompt';
    this.root.innerHTML = `
      <div class="settings-card">
        <div class="settings-title">${t('qualityPromptTitle')}</div>
        <div class="quality-text">${t('qualityPromptText')}</div>
        <button class="settings-btn primary yes">${t('qualityPromptYes')}</button>
        <button class="settings-btn no">${t('qualityPromptNo')}</button>
      </div>`;
    (this.root.querySelector('.settings-card') as HTMLElement).addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.yes') as HTMLElement, () => this.close(true));
    onTap(this.root.querySelector('.no') as HTMLElement, () => this.close(false));
    overlay.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.answer !== null;
  }

  show(answer: (yes: boolean) => void): void {
    this.answer = answer;
    this.root.classList.add('open');
  }

  private close(yes: boolean): void {
    const cb = this.answer;
    this.answer = null;
    this.root.classList.remove('open');
    cb?.(yes);
  }
}
