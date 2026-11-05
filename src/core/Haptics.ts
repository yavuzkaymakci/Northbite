let enabled = true;
let lastAt = -1;
/** A second buzz this soon after the first is dropped (one event, one vibration). */
const MIN_GAP_MS = 70;

/** Settings switch ("Vibration: On/Off"). */
export function setVibration(on: boolean): void {
  enabled = on;
}

/** Vibration via navigator.vibrate (Android browsers). iOS Safari ignores it; native builds will use Capacitor Haptics. */
export function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - lastAt < MIN_GAP_MS) return;
  lastAt = now;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when called without a user gesture; ignore.
  }
}
