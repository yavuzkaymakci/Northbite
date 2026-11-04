// Character creator options (GDD §3). Color values live in render/Palette.ts; labels in strings.ts.
import { BeardColors, HeadwearColors, JacketColors, ScarfColors, SkinTones } from '../render/Palette';
import type { StringKey } from './strings';

export type Headwear = 'none' | 'beanie' | 'furHat' | 'hood';
export type BeardStyle = 'none' | 'short' | 'long';

/** Saved as plain JSON. Colors are indices into the Palette option lists. */
export interface Appearance {
  name: string;
  skinTone: number;
  jacketColor: number;
  headwear: Headwear;
  headwearColor: number;
  beard: BeardStyle;
  beardColor: number;
  /** Index into ScarfColors, or -1 for no scarf. */
  scarfColor: number;
}

export const NAME_MAX_LENGTH = 12;

export const defaultAppearance: Appearance = {
  name: '',
  skinTone: 1,
  jacketColor: 0,
  headwear: 'beanie',
  headwearColor: 0,
  beard: 'short',
  beardColor: 0,
  scarfColor: 1,
};

export interface ColorOptionSet {
  colors: readonly number[];
  labels: readonly StringKey[];
}

export const ColorOptions = {
  skin: {
    colors: SkinTones,
    labels: ['skin_1', 'skin_2', 'skin_3', 'skin_4', 'skin_5', 'skin_6'],
  },
  jacket: {
    colors: JacketColors,
    labels: ['color_orange', 'color_red', 'color_blue', 'color_green', 'color_yellow', 'color_purple', 'color_navy', 'color_white'],
  },
  headwear: {
    colors: HeadwearColors,
    labels: ['color_red', 'color_blue', 'color_white', 'color_navy', 'color_yellow', 'color_green'],
  },
  beard: {
    colors: BeardColors,
    labels: ['beard_brown', 'beard_black', 'beard_ginger', 'beard_grey'],
  },
  scarf: {
    colors: ScarfColors,
    labels: ['color_red', 'color_blue', 'color_yellow', 'color_green', 'color_white', 'color_purple', 'color_teal', 'color_pink'],
  },
} satisfies Record<string, ColorOptionSet>;

export const HeadwearStyles: ReadonlyArray<{ id: Headwear; label: StringKey }> = [
  { id: 'none', label: 'style_none' },
  { id: 'beanie', label: 'headwear_beanie' },
  { id: 'furHat', label: 'headwear_furHat' },
  { id: 'hood', label: 'headwear_hood' },
];

export const BeardStyles: ReadonlyArray<{ id: BeardStyle; label: StringKey }> = [
  { id: 'none', label: 'style_none' },
  { id: 'short', label: 'beard_short' },
  { id: 'long', label: 'beard_long' },
];

/** Headwear styles that have their own color (the hood takes the jacket color). */
export function headwearHasColor(h: Headwear): boolean {
  return h === 'beanie' || h === 'furHat';
}

/** Chances used by "Random". */
const RANDOM = { noHeadwear: 0.15, noScarf: 0.15, beard: { none: 0.4, short: 0.35 } };

const pickIndex = (n: number, rand: () => number) => Math.floor(rand() * n) % n;

/**
 * A random but tidy look: the scarf never matches the jacket and a colored hat never matches the jacket.
 * The name is kept.
 */
export function randomAppearance(name: string, rand: () => number = Math.random): Appearance {
  const jacketColor = pickIndex(JacketColors.length, rand);
  const jacketHex = JacketColors[jacketColor] as number;
  const r = rand();
  const worn = ['beanie', 'furHat', 'hood'] as const;
  const headwear: Headwear = r < RANDOM.noHeadwear ? 'none' : (worn[pickIndex(worn.length, rand)] ?? 'beanie');
  let headwearColor = pickIndex(HeadwearColors.length, rand);
  while (HeadwearColors[headwearColor] === jacketHex) headwearColor = pickIndex(HeadwearColors.length, rand);
  let scarfColor = -1;
  if (rand() >= RANDOM.noScarf) {
    scarfColor = pickIndex(ScarfColors.length, rand);
    while (ScarfColors[scarfColor] === jacketHex) scarfColor = pickIndex(ScarfColors.length, rand);
  }
  const b = rand();
  const beard: BeardStyle = b < RANDOM.beard.none ? 'none' : b < RANDOM.beard.none + RANDOM.beard.short ? 'short' : 'long';
  return {
    name,
    skinTone: pickIndex(SkinTones.length, rand),
    jacketColor,
    headwear,
    headwearColor,
    beard,
    beardColor: pickIndex(BeardColors.length, rand),
    scarfColor,
  };
}

/** Repairs a saved appearance; falls back to defaults field by field. Returns null for no appearance at all. */
export function sanitizeAppearance(raw: unknown): Appearance | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Partial<Record<keyof Appearance, unknown>>;
  const d = defaultAppearance;
  const index = (v: unknown, n: number, fallback: number, allowNone = false) =>
    typeof v === 'number' && Number.isInteger(v) && ((v >= 0 && v < n) || (allowNone && v === -1)) ? v : fallback;
  const oneOf = <T extends string>(v: unknown, list: ReadonlyArray<{ id: T }>, fallback: T): T =>
    list.some((o) => o.id === v) ? (v as T) : fallback;
  return {
    name: typeof a.name === 'string' ? a.name.slice(0, NAME_MAX_LENGTH) : '',
    skinTone: index(a.skinTone, SkinTones.length, d.skinTone),
    jacketColor: index(a.jacketColor, JacketColors.length, d.jacketColor),
    headwear: oneOf(a.headwear, HeadwearStyles, d.headwear),
    headwearColor: index(a.headwearColor, HeadwearColors.length, d.headwearColor),
    beard: oneOf(a.beard, BeardStyles, d.beard),
    beardColor: index(a.beardColor, BeardColors.length, d.beardColor),
    scarfColor: index(a.scarfColor, ScarfColors.length, d.scarfColor, true),
  };
}
