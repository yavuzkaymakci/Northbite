// All player-facing text lives here (tr + en). Fish names live in content/fish.ts.

const strings = {
  tr: {
    gameTitle: 'Northbite',
    moveHint: 'Yürümek için ekrana dokun ve sürükle',
    paused: 'Duraklatıldı',
    fps: 'FPS',
    tapNow: 'Dokun!',
    reelHint: 'Basılı tut · çekişte bırak',
    reelLabel: 'Sarma',
    tensionLabel: 'Gerilim',
    escaped: 'Kaçtı!',
    missed: 'Kaçırdın',
    full: 'Dolu!',
    kg: 'kg',
    rarity_common: 'Yaygın',
    rarity_uncommon: 'Sık değil',
    rarity_rare: 'Nadir',
    rarity_epic: 'Efsane',
  },
  en: {
    gameTitle: 'Northbite',
    moveHint: 'Touch and drag anywhere to walk',
    paused: 'Paused',
    fps: 'FPS',
    tapNow: 'Tap!',
    reelHint: 'Hold · let go on tugs',
    reelLabel: 'Reel',
    tensionLabel: 'Tension',
    escaped: 'Got away!',
    missed: 'Missed',
    full: 'Full!',
    kg: 'kg',
    rarity_common: 'Common',
    rarity_uncommon: 'Uncommon',
    rarity_rare: 'Rare',
    rarity_epic: 'Legendary',
  },
} as const;

export type Lang = keyof typeof strings;
export type StringKey = keyof (typeof strings)['tr'];

let lang: Lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';

export function setLang(next: Lang): void {
  lang = next;
}

export function getLang(): Lang {
  return lang;
}

export function t(key: StringKey): string {
  return strings[lang][key];
}
