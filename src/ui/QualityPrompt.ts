import { t } from '../content/strings';
import { onTap } from './tap';
import { panels } from './PanelManager';

/** One-time offer on a slow device (GDD §22): "Switch to low quality?" Yes / No. */
export class QualityPrompt {
  private readonly root: HTMLDivElement;
  private answer: ((yes: boolean) => void) | null = null;
  private yes = false;

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
    // Modal; back means "No".
    panels.register({
      id: 'quality',
      kind: 'modal',
      root: this.root,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
      onClose: () => {
        const cb = this.answer;
        this.answer = null;
        cb?.(this.yes);
      },
    });
  }

  get isOpen(): boolean {
    return this.answer !== null;
  }

  show(answer: (yes: boolean) => void): void {
    this.answer = answer;
    this.yes = false;
    panels.open('quality', { queue: true });
  }

  private close(yes: boolean): void {
    this.yes = yes;
    panels.close('quality', 'done');
  }
}
