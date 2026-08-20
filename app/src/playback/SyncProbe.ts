/**
 * On-device measurement of how well the clock is tracking.
 *
 * ## What this can and cannot tell you
 *
 * `SyncHarness` measures against ground truth, because the simulator knows
 * where the audio really is. On a handset nothing knows that. What we can
 * measure is the *residual*: how far the model's predicted position sits from
 * the position the player reports, sampled at each observation.
 *
 * That bounds one of the two error terms and misses the other:
 *
 * - **Tracking error** — the model failing to follow the player. Fully visible
 *   here. If the residual is small, the model is following.
 * - **Output latency** — the gap between the position the player reports and
 *   the sound leaving the speaker. Completely invisible here, because it
 *   happens downstream of anything JavaScript can observe. On Bluetooth it can
 *   be several hundred milliseconds.
 *
 * So a good reading from this screen means "the lyric engine is not the
 * problem", not "the lyrics are in time". Closing the second gap needs the
 * mic→speaker round-trip measurement that SPEC §7 makes a Phase 2 requirement;
 * until then the user-facing lyric nudge is the manual equivalent.
 */

export interface SyncProbeSummary {
  readonly sampleCount: number;
  readonly maxAbsResidualMs: number;
  readonly meanAbsResidualMs: number;
  readonly p95AbsResidualMs: number;
  /** Signed mean. A consistent sign points at a systematic offset. */
  readonly biasMs: number;
  readonly maxBackwardsStepMs: number;
}

const EMPTY: SyncProbeSummary = {
  sampleCount: 0,
  maxAbsResidualMs: 0,
  meanAbsResidualMs: 0,
  p95AbsResidualMs: 0,
  biasMs: 0,
  maxBackwardsStepMs: 0,
};

/**
 * Keeps a bounded window of recent residuals. Bounded because a four-minute
 * song at four observations a second is a thousand samples, and there is no
 * reason to hold more than the recent picture on a phone.
 */
export class SyncProbe {
  private readonly residuals: number[] = [];
  private readonly capacity: number;
  private lastRenderedMs: number | null = null;
  private maxBackwardsStepMs = 0;

  constructor(capacity = 600) {
    this.capacity = Math.max(1, capacity);
  }

  /** Records one observation: what we predicted against what was reported. */
  observe(predictedMs: number, reportedMs: number): void {
    this.residuals.push(predictedMs - reportedMs);
    if (this.residuals.length > this.capacity) {
      this.residuals.shift();
    }
  }

  /**
   * Records a rendered frame position, so the probe can catch the failure that
   * matters most to a singer even when the residual looks fine: text moving
   * backwards.
   */
  frame(renderedMs: number): void {
    if (this.lastRenderedMs !== null && renderedMs < this.lastRenderedMs) {
      this.maxBackwardsStepMs = Math.max(
        this.maxBackwardsStepMs,
        this.lastRenderedMs - renderedMs,
      );
    }
    this.lastRenderedMs = renderedMs;
  }

  reset(): void {
    this.residuals.length = 0;
    this.lastRenderedMs = null;
    this.maxBackwardsStepMs = 0;
  }

  summary(): SyncProbeSummary {
    if (this.residuals.length === 0) {
      return { ...EMPTY, maxBackwardsStepMs: this.maxBackwardsStepMs };
    }
    const magnitudes = this.residuals
      .map((value) => Math.abs(value))
      .sort((a, b) => a - b);
    const total = this.residuals.reduce((sum, value) => sum + value, 0);
    const absTotal = magnitudes.reduce((sum, value) => sum + value, 0);
    const index = Math.min(
      magnitudes.length - 1,
      Math.max(0, Math.ceil(0.95 * magnitudes.length) - 1),
    );

    return {
      sampleCount: this.residuals.length,
      maxAbsResidualMs: magnitudes.at(-1) ?? 0,
      meanAbsResidualMs: absTotal / magnitudes.length,
      p95AbsResidualMs: magnitudes[index] ?? 0,
      biasMs: total / this.residuals.length,
      maxBackwardsStepMs: this.maxBackwardsStepMs,
    };
  }
}
