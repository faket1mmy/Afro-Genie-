/**
 * Monotonic wall clock for the sync loop.
 *
 * `Date.now()` is the wrong tool here: it follows the system clock, so an NTP
 * correction or a user changing the time mid-song steps it, and a step in the
 * time base is indistinguishable to `PlaybackClock` from the song jumping.
 * `performance.now()` is monotonic and sub-millisecond, which is what a ±20ms
 * budget needs.
 */

export function monotonicNowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
