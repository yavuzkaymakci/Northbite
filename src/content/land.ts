// Lands bought with a deed (GDD §15): the Ice Cave and the Hot Spring Camp. Balance values only;
// positions live in zones.ts (CaveLayout / CampLayout), feel values in settings.ts (LandFeel).

/** Prices of the deeds (region walls) and the unlock frames inside the lands. */
export const LandCosts = {
  iceCave: 180,
  crystalBench: 90,
  hotSpring: 380,
  tent1: 140,
  kitchen: 180,
  tent2: 240,
  tent3: 340,
  attendant: 400,
} as const;

export const Cave = {
  /** Hold still on a glowing vein this long to break crystals off. */
  mineTime: 2,
  /** Seconds for a mined vein to grow back. */
  refill: 60,
  /** Crystals per mining by vein size (1 small, 2 medium, 3 large). */
  yieldBySize: [1, 1, 2],
  bench: {
    inputCapacity: 6,
    /** Seconds to carve one crystal into an ice statuette. */
    processTime: 5,
    outputCapacity: 6,
  },
  /** Sale value of one statuette (~6× an average raw fish, but slow to make). */
  statuetteValue: 16,
  collector: {
    /** Seconds between visits, how long a visit lasts, and the first visit after the bench is built. */
    interval: 100,
    stay: 30,
    firstDelay: 25,
  },
} as const;

export const Camp = {
  kitchen: {
    inputCapacity: 6,
    /** Seconds per fish platter. */
    plateTime: 5,
    outputCapacity: 6,
    /** Platter value = smoked fish value × this (smoked is 2.5× raw, so a platter is ~4× raw). */
    plateMultiplier: 1.6,
  },
  tent: {
    /** Rent per minute while a guest stays, paid when they leave. */
    rentPerMin: 14,
    stay: 75,
  },
  /** The camp attendant hands out one platter every this many seconds. */
  attendantServeInterval: 1.4,
} as const;
