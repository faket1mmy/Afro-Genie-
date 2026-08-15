/**
 * Drift-corrected estimate of "where are we in the song?".
 *
 * ## Why this exists
 *
 * The lyric renderer needs a position every frame (~16ms), but no native player
 * gives you a trustworthy position at that rate:
 *
 * - ExoPlayer quantises its reported position to the renderer's update period,
 *   so consecutive reads return the same value and then jump.
 * - AVPlayer's `currentTime` is cheap but still snaps to buffer boundaries.
 * - Any read crossing the JS bridge is subject to whatever else the JS thread
 *   is doing, which during a scroll animation is plenty.
 *
 * Rendering straight off those reads produces lyrics that stutter and, worse,
 * jump backwards. So instead: run a local clock, and steer it with the native
 * position the way a PLL steers an oscillator.
 *
 * ## The loop
 *
 * 1. A free-running model, `position = base + rate * elapsed`, answers every
 *    frame query in constant time with no native call.
 * 2. Native observations arrive at whatever rate the platform offers. Each one
 *    produces an error term against the model's prediction.
 * 3. Small errors are corrected by *slewing* — the model briefly runs up to
 *    `maxSlewRate` fast or slow until the error is paid off. Because the slew
 *    rate is below 1.0, the reported position never moves backwards and never
 *    stalls. A 30ms correction at the 10% default is spread over 300ms, which
 *    is invisible in a scrolling lyric and inaudible in a highlight.
 * 4. Large errors mean something discontinuous happened (a seek we did not
 *    initiate, a buffer stall, the OS suspending us). Those get a hard jump,
 *    because slewing a 2-second error would take 20 seconds. Jumping forward
 *    needs only one reading; jumping *backward* needs several in agreement,
 *    because rewinding the lyrics is far more jarring than skipping them.
 * 5. A slow outer loop estimates the *rate* at which the audio clock runs
 *    relative to the JS clock. The two can be different crystals — Bluetooth
 *    output routinely differs by ~100ppm, which is 24ms of drift over a
 *    four-minute song if nothing corrects it.
 *
 *    Measured caveat, because it shapes the defaults: at the observation rates
 *    we actually run (every 250ms), step 3 alone already absorbs realistic
 *    drift, and rate estimation makes no measurable difference. Its value
 *    shows up when observations become rare — at one reading every five
 *    seconds it cuts peak error from ~14ms to ~8ms. So the rate loop is a
 *    safeguard for degraded conditions, deliberately given a long window and a
 *    low gain: estimating rate from noisy readings over a short baseline
 *    produces a rate estimate that random-walks by hundreds of ppm, which is
 *    worse than not estimating at all. The numbers behind those defaults come
 *    from the profiles in `SyncHarness.test.ts`.
 *
 * ## Time base
 *
 * Every method takes the wall time explicitly rather than reading a clock
 * internally. That keeps the whole thing deterministic and testable without
 * fake timers, and lets the caller pass a monotonic source (`performance.now`)
 * instead of `Date.now`, which can step when the system clock is corrected.
 */

export interface PlaybackClockOptions {
  /**
   * Ceiling on how fast the model may run away from real time while paying off
   * an error, as a fraction of nominal rate. Must be in (0, 1) — at 1.0 the
   * clock could stall, above 1.0 it could run backwards.
   */
  readonly maxSlewRate?: number;
  /**
   * Positive errors (the audio is ahead of us) at or above this are corrected
   * by jumping forward rather than slewing. A forward jump skips a little text,
   * which is a small, forgivable glitch.
   */
  readonly hardResyncMs?: number;
  /** Observations this far from prediction are treated as suspect. */
  readonly outlierMs?: number;
  /** Consecutive outliers before we believe them and hard-resync anyway. */
  readonly outlierTolerance?: number;
  /** Weight applied to the filtered error term. 1.0 corrects it all at once. */
  readonly errorGain?: number;
  /**
   * How many recent errors the median filter considers. The median is what
   * makes a single bad reading harmless; the window length is what decides how
   * quickly a genuine change is believed. Must be odd and at least 1.
   */
  readonly errorWindow?: number;
  /**
   * Minimum baseline before a rate estimate is trusted. Long on purpose: rate
   * noise is roughly `2 * jitter / window`, so a 4-second window over ±8ms
   * readings is ±4000ppm of noise on a quantity whose real value is ~100ppm.
   */
  readonly rateWindowMs?: number;
  /** Weight applied to each new rate estimate. */
  readonly rateGain?: number;
  /** Hard bound on the estimated rate, as a fraction either side of 1.0. */
  readonly maxRateDeviation?: number;
}

export type PlaybackClockState = 'idle' | 'playing' | 'paused';

export interface PlaybackClockStats {
  readonly state: PlaybackClockState;
  /** Most recent raw error, ms (observed − predicted). Positive: we are behind. */
  readonly lastErrorMs: number;
  /** Median-filtered error, ms — what the correction loop actually acts on. */
  readonly filteredErrorMs: number;
  /** Correction still owed, ms. */
  readonly pendingCorrectionMs: number;
  /** Estimated audio-clock rate relative to wall time. */
  readonly rate: number;
  /** Observations accepted since the last hard resync. */
  readonly observationCount: number;
  readonly hardResyncCount: number;
  readonly outlierCount: number;
  /** True once at least one observation has been accepted without a resync. */
  readonly locked: boolean;
}

const DEFAULTS = {
  maxSlewRate: 0.1,
  hardResyncMs: 250,
  outlierMs: 500,
  outlierTolerance: 3,
  errorGain: 0.15,
  errorWindow: 3,
  rateWindowMs: 20_000,
  rateGain: 0.25,
  maxRateDeviation: 0.05,
} as const;

export class PlaybackClock {
  private readonly options: Required<PlaybackClockOptions>;

  private state: PlaybackClockState = 'idle';
  private basePositionMs = 0;
  private baseWallMs = 0;
  private pendingCorrectionMs = 0;
  private lastErrorMs = 0;
  private filteredErrorMs = 0;
  private readonly errorHistory: number[] = [];
  private rate = 1;

  private rateAnchorWallMs = 0;
  private rateAnchorPositionMs = 0;
  private rateAnchorValid = false;

  private consecutiveOutliers = 0;
  private observationCount = 0;
  private hardResyncCount = 0;
  private outlierCount = 0;
  private locked = false;

  constructor(options: PlaybackClockOptions = {}) {
    const maxSlewRate = options.maxSlewRate ?? DEFAULTS.maxSlewRate;
    if (!(maxSlewRate > 0 && maxSlewRate < 1)) {
      throw new RangeError(
        `maxSlewRate must be in (0, 1) to keep the clock monotonic; got ${maxSlewRate}`,
      );
    }
    const errorWindow = options.errorWindow ?? DEFAULTS.errorWindow;
    if (!Number.isInteger(errorWindow) || errorWindow < 1 || errorWindow % 2 === 0) {
      throw new RangeError(
        `errorWindow must be an odd positive integer; got ${errorWindow}`,
      );
    }
    this.options = { ...DEFAULTS, ...options, maxSlewRate, errorWindow };
  }

  /** Anchors the clock at `positionMs` and begins running. */
  start(positionMs: number, atMs: number): void {
    this.hardAnchor(positionMs, atMs);
    this.state = 'playing';
    this.locked = false;
    this.observationCount = 0;
    this.hardResyncCount = 0;
    this.outlierCount = 0;
  }

  /** Freezes the position. Observations while paused are ignored. */
  pause(atMs: number): void {
    if (this.state === 'playing') {
      this.advanceTo(atMs);
    }
    this.state = 'paused';
    this.baseWallMs = atMs;
    this.rateAnchorValid = false;
  }

  resume(atMs: number): void {
    if (this.state === 'playing') {
      return;
    }
    this.state = 'playing';
    this.baseWallMs = atMs;
    this.pendingCorrectionMs = 0;
    this.rateAnchorValid = false;
  }

  /**
   * Discontinuous move. Discards pending corrections — after a seek the old
   * error term describes a position that no longer exists.
   */
  seek(positionMs: number, atMs: number): void {
    this.hardAnchor(positionMs, atMs);
    this.locked = false;
  }

  stop(atMs: number): void {
    this.advanceTo(atMs);
    this.state = 'idle';
    this.pendingCorrectionMs = 0;
    this.rateAnchorValid = false;
  }

  /**
   * Position at `atMs`, ms.
   *
   * Note: this advances internal state, because the slew correction is applied
   * incrementally over elapsed time and there is no closed form for it. Calling
   * it repeatedly with the same or a decreasing `atMs` is safe and returns a
   * consistent value; it is not safe to call it with times out of order and
   * expect the intermediate values back.
   */
  positionAt(atMs: number): number {
    this.advanceTo(atMs);
    return this.basePositionMs;
  }

  /**
   * Feeds a native player reading. `positionMs` is the player's reported
   * position and `atMs` is the wall time at which it was read — read the wall
   * clock immediately *after* the native call returns, so bridge latency shows
   * up as a small positive error rather than being silently absorbed.
   */
  observe(positionMs: number, atMs: number): void {
    if (this.state !== 'playing') {
      return;
    }
    this.advanceTo(atMs);

    const error = positionMs - this.basePositionMs;
    this.lastErrorMs = error;
    const magnitude = Math.abs(error);

    if (magnitude >= this.options.outlierMs) {
      this.outlierCount += 1;
      this.consecutiveOutliers += 1;
      if (this.consecutiveOutliers >= this.options.outlierTolerance) {
        // Several readings agree: it is not noise, the song really did move.
        this.hardAnchor(positionMs, atMs);
        this.hardResyncCount += 1;
        this.locked = false;
      }
      return;
    }

    this.consecutiveOutliers = 0;

    // Asymmetric on purpose. A *forward* jump skips a little text — a small,
    // forgivable glitch — so a single reading is enough to justify one. A
    // *backward* jump rewinds the lyrics: text un-highlights and replays, which
    // reads as a broken app. So we never rewind on one reading. A genuine
    // backward discontinuity still gets corrected, but only through the outlier
    // path above, which demands several readings in agreement first.
    if (error >= this.options.hardResyncMs) {
      this.hardAnchor(positionMs, atMs);
      this.hardResyncCount += 1;
      this.locked = false;
      return;
    }

    // Median-filter before acting. Position readings carry both jitter and
    // quantisation, and a mean would let a single wild sample drag the clock;
    // the median ignores it entirely as long as most of the window is sane.
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.options.errorWindow) {
      this.errorHistory.shift();
    }
    this.filteredErrorMs = median(this.errorHistory);

    // `pendingCorrectionMs` is replaced rather than accumulated: the error is
    // measured against a base that already reflects every correction applied so
    // far, so accumulating would double-count.
    this.pendingCorrectionMs = this.filteredErrorMs * this.options.errorGain;
    this.observationCount += 1;
    this.locked = true;
    this.updateRateEstimate(positionMs, atMs);
  }

  stats(): PlaybackClockStats {
    return {
      state: this.state,
      lastErrorMs: this.lastErrorMs,
      filteredErrorMs: this.filteredErrorMs,
      pendingCorrectionMs: this.pendingCorrectionMs,
      rate: this.rate,
      observationCount: this.observationCount,
      hardResyncCount: this.hardResyncCount,
      outlierCount: this.outlierCount,
      locked: this.locked,
    };
  }

  private hardAnchor(positionMs: number, atMs: number): void {
    this.basePositionMs = positionMs;
    this.baseWallMs = atMs;
    this.pendingCorrectionMs = 0;
    this.lastErrorMs = 0;
    this.filteredErrorMs = 0;
    // The history describes a position that no longer exists.
    this.errorHistory.length = 0;
    this.consecutiveOutliers = 0;
    this.rateAnchorWallMs = atMs;
    this.rateAnchorPositionMs = positionMs;
    this.rateAnchorValid = true;
  }

  private advanceTo(atMs: number): void {
    if (this.state !== 'playing') {
      this.baseWallMs = atMs;
      return;
    }
    const elapsed = atMs - this.baseWallMs;
    if (elapsed <= 0) {
      return;
    }
    const natural = elapsed * this.rate;
    const budget = elapsed * this.options.maxSlewRate;
    const correction = clamp(this.pendingCorrectionMs, -budget, budget);
    this.basePositionMs += natural + correction;
    this.pendingCorrectionMs -= correction;
    this.baseWallMs = atMs;
  }

  /**
   * Long-baseline rate estimate. Comparing two observations far apart divides
   * the per-observation noise by the baseline, which is the only thing that
   * makes the estimate usable at all — and why the window is 20 seconds rather
   * than the few seconds that first looks sufficient. The result is still only
   * blended in at `rateGain` and hard-clamped.
   */
  private updateRateEstimate(positionMs: number, atMs: number): void {
    if (!this.rateAnchorValid) {
      this.rateAnchorWallMs = atMs;
      this.rateAnchorPositionMs = positionMs;
      this.rateAnchorValid = true;
      return;
    }
    const wallSpan = atMs - this.rateAnchorWallMs;
    if (wallSpan < this.options.rateWindowMs) {
      return;
    }
    const measured = (positionMs - this.rateAnchorPositionMs) / wallSpan;
    const { maxRateDeviation, rateGain } = this.options;
    const blended = this.rate + rateGain * (measured - this.rate);
    this.rate = clamp(blended, 1 - maxRateDeviation, 1 + maxRateDeviation);
    this.rateAnchorWallMs = atMs;
    this.rateAnchorPositionMs = positionMs;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
