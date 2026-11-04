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
} as const;

export type PaletteKey = keyof typeof Palette;

// Character creator option lists (GDD §3)
export const SkinTones = [0xf6d7c3, 0xeec1a0, 0xd9a07a, 0xb8784f, 0x8d5a3b, 0x5f3b26] as const;
export const JacketColors = [
  Palette.jacket, 0xe2504c, 0x3f8fd2, 0x47b37a, 0xf2c94c, 0x8e6bd8, 0x2f3e52, 0xf4f8fb,
] as const;
export const ScarfColors = [0xe2504c, 0x3f8fd2, 0xf2c94c, 0x47b37a, 0xf4f8fb, 0x9b6bff] as const;
export const HeadwearColors = [0xe2504c, 0x3f8fd2, 0xf4f8fb, 0x2f3e52, 0xf2c94c] as const;
export const BeardColors = [0x5e3c27, 0x2b2420, 0xc98e4f, 0xd9d4cc] as const;

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
