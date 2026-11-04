// Day/night and weather balance (GDD §12). Day length (real seconds) is a feel setting in settings.ts.

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export const TimeOfDay = {
  /** Where each part starts, as a fraction of the day (0 = dawn). */
  parts: [
    { id: 'morning', start: 0 },
    { id: 'day', start: 0.12 },
    { id: 'evening', start: 0.55 },
    { id: 'night', start: 0.68 },
  ] as const satisfies ReadonlyArray<{ id: DayPart; start: number }>,
  /** A new game starts mid-morning. */
  startAt: 0.15,
  night: {
    /** Customer arrival rate multiplier at night. */
    customerRate: 0.6,
  },
  aurora: {
    /** Sale value bonus while the aurora buff is active. */
    saleBonus: 0.1,
    /** Seconds the buff lasts. */
    duration: 60,
  },
  storm: {
    /** Chance per day that a storm happens. */
    chancePerDay: 0.15,
    durationMin: 60,
    durationMax: 90,
    /** Warning banner lead time, seconds. */
    warning: 8,
    customerRate: 0.7,
    /** Bite weight multiplier for non-common species. */
    rareFishBonus: 1.5,
  },
} as const;
