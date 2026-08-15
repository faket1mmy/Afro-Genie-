/**
 * Measures how far the rendered position drifts from the position the listener
 * is actually hearing, across a whole song.
 *
 * This is the instrument behind the Phase 1 exit criterion in SPEC §9: "a song
 * plays with lyrics that stay in time to ±20ms for its full duration". Running
 * it against `SimulatedAudioEngine` gives a deterministic, repeatable number in
 * CI; running the same loop against a real engine on a handset gives the
 * on-device figure (see `SyncDiagnosticsScreen`).
 */

import { PlaybackClock } from './PlaybackClock';
import type { PlaybackClockOptions } from './PlaybackClock';
import type { SimulatedAudioEngine } from './SimulatedAudioEngine';

export interface SyncHarnessOptions {
  /** Interval between rendered frames, ms. 16.67 ≈ 60fps. */
  readonly frameIntervalMs?: number;
  /** Interval between native position reads, ms. */
  readonly observeIntervalMs?: number;
  /** How long to run, ms. Defaults to the engine's duration. */
  readonly runForMs?: number;
  /**
   * Errors within this many ms of the start are excluded from the summary: the
   * clock has to acquire lock before it can hold it, and the app shows a
   * countdown over the intro anyway.
   */
  readonly settleMs?: number;
  readonly clock?: PlaybackClockOptions;
}

export interface SyncSample {
  readonly wallMs: number;
  readonly renderedMs: number;
  readonly trueMs: number;
  readonly errorMs: number;
}

export interface SyncReport {
  readonly maxAbsErrorMs: number;
  readonly meanAbsErrorMs: number;
  /** 95th percentile of |error|. */
  readonly p95AbsErrorMs: number;
  readonly maxBackwardsStepMs: number;
  readonly sampleCount: number;
  readonly settledSampleCount: number;
  readonly hardResyncCount: number;
  readonly finalRate: number;
  readonly samples: readonly SyncSample[];
}

const DEFAULTS = {
  frameIntervalMs: 1000 / 60,
  observeIntervalMs: 250,
  settleMs: 1_000,
} as const;

/**
 * Runs a simulated performance and returns the drift summary.
 *
 * The loop is deliberately the same shape as the real one: read the native
 * position occasionally, ask the clock for a position every frame. If the two
 * ever diverge in structure, this measurement stops meaning anything.
 */
export function runSyncHarness(
  engine: SimulatedAudioEngine,
  options: SyncHarnessOptions = {},
): SyncReport {
  const frameIntervalMs = options.frameIntervalMs ?? DEFAULTS.frameIntervalMs;
  const observeIntervalMs =
    options.observeIntervalMs ?? DEFAULTS.observeIntervalMs;
  const settleMs = options.settleMs ?? DEFAULTS.settleMs;
  const runForMs = options.runForMs ?? engine.getDurationMs();

  const clock = new PlaybackClock(options.clock ?? {});
  const samples: SyncSample[] = [];

  let wallMs = 0;
  engine.tick(wallMs);
  engine.play();
  clock.start(engine.getPositionMs(), wallMs);

  let nextObserveMs = wallMs + observeIntervalMs;
  let previousRendered = Number.NEGATIVE_INFINITY;
  let maxBackwardsStepMs = 0;

  while (wallMs <= runForMs) {
    engine.tick(wallMs);

    // Stop at end of audio. Past this point the engine's position is pinned at
    // the duration while the clock keeps running, so every further sample
    // reports a growing "error" against a song that is no longer playing. That
    // is an artefact of measuring, not a sync failure — and on a faster-than-
    // wall-clock audio device it is large enough to swamp the real numbers.
    if (engine.getTruePositionMs() >= engine.getDurationMs()) {
      break;
    }

    if (wallMs >= nextObserveMs) {
      // Order matters: read the native position, then take the wall time, so
      // any cost of the read lands in the error term rather than vanishing.
      const observed = engine.getPositionMs();
      clock.observe(observed, wallMs);
      nextObserveMs += observeIntervalMs;
    }

    const renderedMs = clock.positionAt(wallMs);
    const trueMs = engine.getTruePositionMs();
    samples.push({
      wallMs,
      renderedMs,
      trueMs,
      errorMs: renderedMs - trueMs,
    });

    if (previousRendered > Number.NEGATIVE_INFINITY) {
      const step = renderedMs - previousRendered;
      if (step < 0) {
        maxBackwardsStepMs = Math.max(maxBackwardsStepMs, -step);
      }
    }
    previousRendered = renderedMs;

    wallMs += frameIntervalMs;
  }

  const settled = samples.filter((sample) => sample.wallMs >= settleMs);
  const magnitudes = settled
    .map((sample) => Math.abs(sample.errorMs))
    .sort((a, b) => a - b);

  const stats = clock.stats();
  return {
    maxAbsErrorMs: magnitudes.at(-1) ?? 0,
    meanAbsErrorMs:
      magnitudes.length === 0
        ? 0
        : magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length,
    p95AbsErrorMs: percentile(magnitudes, 0.95),
    maxBackwardsStepMs,
    sampleCount: samples.length,
    settledSampleCount: settled.length,
    hardResyncCount: stats.hardResyncCount,
    finalRate: stats.rate,
    samples,
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}
