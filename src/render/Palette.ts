// The only place colors are defined. Everything else (3D materials and CSS) reads from here.

export const Palette = {
  // Core roles from GDD §9
  snow: 0xf4f8fb,
  ice: 0xcfe6f2,
  shadowBlue: 0x8fb3c9,
  deepWater: 0x2b6e8f,
  jacket: 0xf28c38,
  wood: 0x8a5a3b,
  coin: 0xffd447,
  auroraGreen: 0x5ff2b0,
  auroraPurple: 0x9b6bff,

  // Supporting roles
  skyTop: 0x7fb4d6,
  skyHorizon: 0xdcecf5,
  fog: 0xdcecf5,
  shallowWater: 0x4f93b3,
  iceDark: 0xa9cde0,
  woodDark: 0x5e3c27,
  pine: 0x3f7466,
  pineDark: 0x2f5a50,
  rock: 0x9aaab8,
  doorway: 0x2a3d4e,
  pants: 0x3b4d63,
  boots: 0x4a3426,
  fur: 0xe9e1d3,
  eye: 0x1f2a33,
  blobShadow: 0x1d3a4d,
  hemiSky: 0xeaf6ff,
  hemiGround: 0x8fb3c9,
  sun: 0xfff3e0,
  uiInk: 0x1d3a4d,
  white: 0xffffff,

  // Fishing
  holeWater: 0x1f5674,
  fishingLine: 0x34434f,
  rod: 0x6b4a33,
  reel: 0x7d8a96,
  bobberRed: 0xe2504c,
  fishCapelin: 0x9fb8c8,
  fishCod: 0x8f8b68,
  fishChar: 0x4f7078,
  fishHalibut: 0x6e5c4b,
  fishBellyLight: 0xe8eef2,
  fishBellyWarm: 0xf08a5d,
  rarityCommon: 0x7f97aa,
  rarityUncommon: 0x47b37a,
  rarityRare: 0x3f8fd2,
  rarityEpic: 0x9b6bff,
  tensionGreen: 0x47b37a,
  tensionYellow: 0xf2c94c,
  tensionRed: 0xe2504c,
  alert: 0xe2504c,

  // Stall and unlocks
  awning: 0xe2504c,
  unlockDash: 0xf4f8fb,
  unlockFill: 0xffd447,
  guideArrow: 0xffd447,

  // Smoked fish and the smokehouse
  smokedFish: 0x8f4f26,
  smokedBelly: 0xc9864a,
  woodLight: 0xb07a4f,
  emberGlow: 0xff9a3c,
  emberDeep: 0xd9622b,
  smoke: 0xc9d2da,
  steam: 0xf4f8fb,

  // Net and basket
  netCord: 0x4f5f6b,
  wicker: 0xc49a62,

  // Penguin
  penguinBack: 0x26303c,
  penguinBelly: 0xf7f4ee,
  penguinBeak: 0xf2a03d,

  // Ice walls and the teaser pier
  wallIce: 0xbfe1f2,
  wallCrack: 0x5d8fae,
  haze: 0xb9cfdc,

  // Upgrade bench and panel
  benchPad: 0xf28c38,
  panelBg: 0xf4f8fb,
  panelCard: 0xffffff,
  panelMuted: 0x8fa3b3,
  buy: 0x47b37a,

  // Character creator stage
  creatorSkyTop: 0x1f3c5c,
  creatorSkyLow: 0xd6e8f2,
  creatorGround: 0xe9f1f6,
} as const;

export type PaletteKey = keyof typeof Palette;

// Character creator option lists (GDD §3). Order matches the labels in content/appearance.ts.
export const SkinTones = [0xf6d7c3, 0xeec1a0, 0xd9a07a, 0xb8784f, 0x8d5a3b, 0x5f3b26] as const;
export const JacketColors = [
  Palette.jacket, 0xe2504c, 0x3f8fd2, 0x47b37a, 0xf2c94c, 0x8e6bd8, 0x2f3e52, 0xf4f8fb,
] as const;
export const ScarfColors = [0xe2504c, 0x3f8fd2, 0xf2c94c, 0x47b37a, 0xf4f8fb, 0x9b6bff, 0x2fa5a0, 0xe07aa8] as const;
export const HeadwearColors = [0xe2504c, 0x3f8fd2, 0xf4f8fb, 0x2f3e52, 0xf2c94c, 0x47b37a] as const;
export const BeardColors = [0x5e3c27, 0x2b2420, 0xc98e4f, 0xd9d4cc] as const;

// Townsfolk (customers) use their own muted set so the player's character always stands out.
export const TownJacketColors = [0x6d7f8f, 0x8a6f55, 0x5d7360, 0x7b5866, 0xa39270, 0x4f6478] as const;
export const TownHatColors = [0x9aa7b0, 0x6b5a4a, 0xb89a6a, 0x58707a, 0xc7c1b6, 0x7d6a7a] as const;

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Exposes palette entries as CSS custom properties (--snow, --deep-water, ...). */
export function applyPaletteToCss(root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(Palette)) {
    const cssName = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    root.style.setProperty(`--${cssName}`, toCss(value));
  }
}
