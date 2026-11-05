// Hot Spring Camp guests (GDD §15). They come day and night alike, want a fish platter (when there is a kitchen)
// and a tent (when one is free), then leave. Peace brings them more often and makes them tip.

export const Guests = {
  /** Mean seconds between arrivals before the peace bonus. */
  interval: 13,
  /** Each peace point makes guests come this much more often, up to `maxPeaceBonus`. */
  peaceBonusPerPoint: 0.012,
  maxPeaceBonus: 0.25,
  maxQueue: 4,
  /** A queued guest gives up on the platter after this long (still takes a tent if one is free). */
  plateWait: 50,
  walkSpeed: 2.0,
} as const;
