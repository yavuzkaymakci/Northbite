/** Vibration via navigator.vibrate (Android browsers). iOS Safari ignores it; native builds will use Capacitor Haptics. */
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when called without a user gesture; ignore.
  }
}
