// All player-facing text lives here (tr + en).

const strings = {
  tr: {
    gameTitle: 'Northbite',
    moveHint: 'Yürümek için ekrana dokun ve sürükle',
    paused: 'Duraklatıldı',
    fps: 'FPS',
  },
  en: {
    gameTitle: 'Northbite',
    moveHint: 'Touch and drag anywhere to walk',
    paused: 'Paused',
    fps: 'FPS',
  },
} as const;

export type Lang = keyof typeof strings;
export type StringKey = keyof (typeof strings)['tr'];

let lang: Lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';

export function setLang(next: Lang): void {
  lang = next;
}

export function t(key: StringKey): string {
  return strings[lang][key];
}
