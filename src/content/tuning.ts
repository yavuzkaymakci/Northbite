// Global knobs for quick tuning on a phone (GDD §16).

export const Tuning = {
  /** Multiplies every unlock and upgrade price. */
  priceScale: 1,
  /** 0 = no threats at all, 1 = normal. Multiplies threat frequency. */
  threatScale: 1,
};

/** A price after `priceScale` (never below 1). */
export function scaledPrice(base: number): number {
  return Math.max(1, Math.round(base * Tuning.priceScale));
}
