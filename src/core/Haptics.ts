let enabled = true;

/** Settings switch ("Vibration: On/Off"). */
export function setVibration(on: boolean): void {
  enabled = on;
}

/** Vibration via navigator.vibrate (Android browsers). iOS Safari ignores it; native builds will use Capacitor Haptics. */
export function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when called without a user gesture; ignore.
  }
}
