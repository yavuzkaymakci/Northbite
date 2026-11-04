// All player-facing text lives here (tr + en). Fish, upgrade and region names live in their content files.

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
    basketFull: 'Dolu',
    kg: 'kg',
    rarity_common: 'Yaygın',
    rarity_uncommon: 'Sık değil',
    rarity_rare: 'Nadir',
    rarity_epic: 'Efsane',
    newSpecies: 'Yeni tür!',
    smoked: 'Tütsülenmiş',
    comingSoon: 'Yakında',
    unlock_hole2: 'Buz deliği',
    unlock_hole3: 'Buz deliği',
    unlock_net: 'Balık ağı',
    unlock_hut: 'Penguen kulübesi',
    unlock_penguin2: '2. penguen',
    unlock_smokehouse: 'Tütsühane',
    unlock_region: 'Buz duvarı',
    benchTitle: 'Olta tezgâhı',
    level: 'Sv. {n}/{max}',
    maxed: 'MAKS',
    upgrade_line: 'Gerilim tavanı %{a} → %{b}',
    upgrade_reel: 'Sarma hızı %{a} → %{b}',
    upgrade_bait: 'Büyük balık şansı ×{a} → ×{b}',
    upgrade_baitHalibut: 'Grönland kalkanı havuza girer!',
    upgrade_backpack: 'Taşıma {a} → {b} balık',
    upgrade_line_max: 'Gerilim tavanı %{a}',
    upgrade_reel_max: 'Sarma hızı %{a}',
    upgrade_bait_max: 'Büyük balık şansı ×{a}',
    upgrade_backpack_max: 'Taşıma {a} balık',
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
    basketFull: 'Full',
    kg: 'kg',
    rarity_common: 'Common',
    rarity_uncommon: 'Uncommon',
    rarity_rare: 'Rare',
    rarity_epic: 'Legendary',
    newSpecies: 'New species!',
    smoked: 'Smoked',
    comingSoon: 'Coming soon',
    unlock_hole2: 'Ice hole',
    unlock_hole3: 'Ice hole',
    unlock_net: 'Fishing net',
    unlock_hut: 'Penguin hut',
    unlock_penguin2: '2nd penguin',
    unlock_smokehouse: 'Smokehouse',
    unlock_region: 'Ice wall',
    benchTitle: 'Rod bench',
    level: 'Lv {n}/{max}',
    maxed: 'MAX',
    upgrade_line: 'Tension limit {a}% → {b}%',
    upgrade_reel: 'Reel speed {a}% → {b}%',
    upgrade_bait: 'Big fish chance ×{a} → ×{b}',
    upgrade_baitHalibut: 'Greenland halibut starts biting!',
    upgrade_backpack: 'Carry {a} → {b} fish',
    upgrade_line_max: 'Tension limit {a}%',
    upgrade_reel_max: 'Reel speed {a}%',
    upgrade_bait_max: 'Big fish chance ×{a}',
    upgrade_backpack_max: 'Carry {a} fish',
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

/** `t()` with `{name}` placeholders filled in. */
export function tf(key: StringKey, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** Label shown above an unlock frame, if there is a string for it. */
export function unlockName(id: string): string {
  const key = `unlock_${id}` as StringKey;
  return key in strings[lang] ? t(key) : '';
}
