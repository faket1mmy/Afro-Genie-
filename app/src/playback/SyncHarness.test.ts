import { SimulatedAudioEngine } from './SimulatedAudioEngine';
import type { SimulatedAudioOptions } from './SimulatedAudioEngine';
import { runSyncHarness } from './SyncHarness';

/** SPEC §3: "Sync accuracy of ±20ms is the target". */
const SYNC_BUDGET_MS = 20;

const SONG_MS = 4 * 60 * 1_000;

/**
 * The hardware conditions we claim to hold the budget under. Each is a guess at
 * a real class of device rather than an arbitrary knob setting — see
 * `SimulatedAudioEngine` for what each parameter models.
 */
const DEVICE_PROFILES: readonly {
  readonly name: string;
  readonly options: Omit<SimulatedAudioOptions, 'durationMs'>;
  readonly observeIntervalMs?: number;
}[] = [
  {
    name: 'flagship / wired',
    options: { quantumMs: 10, jitterMs: 2 },
  },
  {
    name: 'mid-range Android',
    options: { clockRate: 1.00005, quantumMs: 20, jitterMs: 8, seed: 7 },
  },
  {
    name: 'Bluetooth (+150ppm)',
    options: { clockRate: 1.00015, quantumMs: 20, jitterMs: 6, seed: 11 },
  },
  {
    name: 'Bluetooth (-150ppm)',
    options: { clockRate: 0.99985, quantumMs: 20, jitterMs: 6, seed: 13 },
  },
  {
    name: 'noisy / loaded JS',
    options: { clockRate: 1.0001, quantumMs: 40, jitterMs: 20, seed: 31 },
  },
  {
    name: 'sparse position reads',
    options: { clockRate: 1.0001, quantumMs: 20, jitterMs: 8, seed: 23 },
    observeIntervalMs: 1_000,
  },
];

describe('sync budget — SPEC §9 Phase 1 exit criterion', () => {
  it('holds ±20ms for a full song on a well-behaved player', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      quantumMs: 10,
      jitterMs: 2,
    });
    const report = runSyncHarness(engine);
    expect(report.maxAbsErrorMs).toBeLessThan(SYNC_BUDGET_MS);
    expect(report.maxBackwardsStepMs).toBe(0);
    expect(report.hardResyncCount).toBe(0);
  });

  it('holds ±20ms on a mid-range Android profile', () => {
    // SPEC §1: the floor is a mid-range 2021 Android. ExoPlayer quantises
    // position to ~its update period, readings jitter, and the reported
    // position carries a small constant bias.
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      clockRate: 1.00005,
      quantumMs: 20,
      jitterMs: 8,
      biasMs: 5,
      seed: 7,
    });
    const report = runSyncHarness(engine);
    expect(report.maxAbsErrorMs).toBeLessThan(SYNC_BUDGET_MS);
    expect(report.maxBackwardsStepMs).toBe(0);
  });

  it('holds ±20ms with a Bluetooth-grade clock offset', () => {
    // ~150ppm. Left uncorrected this alone is 36ms of drift over four minutes,
    // so this test is really checking that rate estimation works over a long
    // run rather than that the error loop is fast.
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      clockRate: 1.00015,
      quantumMs: 20,
      jitterMs: 6,
      seed: 11,
    });
    const report = runSyncHarness(engine);
    expect(report.maxAbsErrorMs).toBeLessThan(SYNC_BUDGET_MS);
    expect(report.finalRate).toBeGreaterThan(1);
  });

  it('holds ±20ms with a slow audio clock', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      clockRate: 0.99985,
      quantumMs: 20,
      jitterMs: 6,
      seed: 13,
    });
    const report = runSyncHarness(engine);
    expect(report.maxAbsErrorMs).toBeLessThan(SYNC_BUDGET_MS);
    expect(report.finalRate).toBeLessThan(1);
  });

  it('is stable across seeds', () => {
    const maxima = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const engine = new SimulatedAudioEngine({
        durationMs: SONG_MS,
        clockRate: 1.0001,
        quantumMs: 20,
        jitterMs: 8,
        seed,
      });
      return runSyncHarness(engine).maxAbsErrorMs;
    });
    for (const maximum of maxima) {
      expect(maximum).toBeLessThan(SYNC_BUDGET_MS);
    }
  });

  it('recovers to inside budget after a buffer stall', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      quantumMs: 20,
      jitterMs: 6,
      stalls: [{ atMs: 60_000, durationMs: 900 }],
      seed: 17,
    });
    const report = runSyncHarness(engine);

    // The stall itself is a real error — the audio froze and we could not have
    // known for up to one observation period. What matters is that we notice
    // and recover, not that the error never happens.
    expect(report.hardResyncCount).toBeGreaterThan(0);

    // The guarantee is bounded recovery, not absence of error. Absorbing a
    // 900ms freeze without ever rewinding the text takes a few seconds at the
    // slew ceiling, and that trade — a slow catch-up over a visible rewind — is
    // the deliberate one.
    const RECOVERY_ALLOWANCE_MS = 4_000;
    const stallEndsAtMs = 60_900;
    const afterRecovery = report.samples.filter(
      (sample) => sample.wallMs > stallEndsAtMs + RECOVERY_ALLOWANCE_MS,
    );
    const worstAfter = Math.max(
      ...afterRecovery.map((sample) => Math.abs(sample.errorMs)),
    );
    expect(worstAfter).toBeLessThan(SYNC_BUDGET_MS);
  });

  it('never rewinds the lyrics through jitter, quantisation or drift', () => {
    // The one thing a singer must never see during normal playback. A skip
    // forward is forgivable; text un-highlighting itself reads as a bug.
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      clockRate: 1.0002,
      quantumMs: 40,
      jitterMs: 20,
      seed: 19,
    });
    const report = runSyncHarness(engine);
    expect(report.maxBackwardsStepMs).toBe(0);
  });

  it('absorbs a short stall without rewinding', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      quantumMs: 20,
      jitterMs: 10,
      stalls: [{ atMs: 30_000, durationMs: 400 }],
      seed: 19,
    });
    const report = runSyncHarness(engine);
    expect(report.maxBackwardsStepMs).toBe(0);
  });

  it('does rewind after a long freeze, and settles afterwards', () => {
    // Past a certain point the alternative is worse: a second and a half ahead
    // of the music, slewing back at 10%, would leave the lyrics visibly wrong
    // for fifteen seconds. So a confirmed freeze is corrected by rewinding.
    // This test exists to keep that trade explicit rather than accidental.
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      quantumMs: 20,
      jitterMs: 10,
      stalls: [{ atMs: 90_000, durationMs: 1_500 }],
      seed: 19,
    });
    const report = runSyncHarness(engine);
    expect(report.maxBackwardsStepMs).toBeGreaterThan(0);

    const settled = report.samples.filter(
      (sample) => sample.wallMs > 100_000,
    );
    const worst = Math.max(
      ...settled.map((sample) => Math.abs(sample.errorMs)),
    );
    expect(worst).toBeLessThan(SYNC_BUDGET_MS);
  });

  it('treats a constant reporting bias as a calibration offset, not drift', () => {
    // A player that truncates its position reports a systematic lag. No amount
    // of tracking removes it — it is a fixed offset, which is exactly what the
    // latency calibration in SPEC §7 and the user-facing lyric nudge exist for.
    // What matters here is that it stays constant rather than accumulating.
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      quantumMs: 40,
      quantiseMode: 'floor',
      jitterMs: 2,
      seed: 3,
    });
    const report = runSyncHarness(engine);

    const early = report.samples.filter(
      (sample) => sample.wallMs > 10_000 && sample.wallMs < 20_000,
    );
    const late = report.samples.filter((sample) => sample.wallMs > 220_000);
    const mean = (values: readonly number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    const earlyBias = mean(early.map((sample) => sample.errorMs));
    const lateBias = mean(late.map((sample) => sample.errorMs));

    expect(earlyBias).toBeLessThan(0);
    expect(Math.abs(lateBias - earlyBias)).toBeLessThan(5);
  });

  it('degrades gracefully when observations are rare', () => {
    // Some platforms only offer a position once a second. Sync should get
    // worse, not fall apart.
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      clockRate: 1.0001,
      quantumMs: 20,
      jitterMs: 8,
      seed: 23,
    });
    const report = runSyncHarness(engine, { observeIntervalMs: 1_000 });
    expect(report.maxAbsErrorMs).toBeLessThan(SYNC_BUDGET_MS * 2);
    expect(report.maxBackwardsStepMs).toBe(0);
  });

  it('keeps the mean error far inside the budget, not just the peak', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: SONG_MS,
      clockRate: 1.00005,
      quantumMs: 20,
      jitterMs: 8,
      seed: 29,
    });
    const report = runSyncHarness(engine);
    expect(report.meanAbsErrorMs).toBeLessThan(SYNC_BUDGET_MS / 2);
    expect(report.p95AbsErrorMs).toBeLessThan(SYNC_BUDGET_MS);
  });

  it('samples the whole song at frame rate', () => {
    const engine = new SimulatedAudioEngine({ durationMs: SONG_MS });
    const report = runSyncHarness(engine);
    expect(report.sampleCount).toBeGreaterThan((SONG_MS / 1000) * 59);
  });

  it('prints the drift table for every device profile', () => {
    // Not really an assertion — this is the evidence behind the Phase 1 claim,
    // printed into the CI log so the numbers are checkable rather than
    // asserted about in the abstract. `npm run sync:report` runs just this.
    const rows = DEVICE_PROFILES.map((profile) => {
      const engine = new SimulatedAudioEngine({
        durationMs: SONG_MS,
        ...profile.options,
      });
      const report = runSyncHarness(engine, {
        observeIntervalMs: profile.observeIntervalMs ?? 250,
      });
      return {
        profile: profile.name,
        max: report.maxAbsErrorMs,
        p95: report.p95AbsErrorMs,
        mean: report.meanAbsErrorMs,
        rewind: report.maxBackwardsStepMs,
      };
    });

    const table = rows
      .map(
        (row) =>
          `  ${row.profile.padEnd(22)} max ${row.max.toFixed(1).padStart(5)}ms` +
          `   p95 ${row.p95.toFixed(1).padStart(5)}ms` +
          `   mean ${row.mean.toFixed(1).padStart(5)}ms` +
          `   rewind ${row.rewind.toFixed(1)}ms`,
      )
      .join('\n');
    console.log(`\nLyric sync drift over a ${SONG_MS / 1000}s song:\n${table}\n`);

    for (const row of rows) {
      expect(row.max).toBeLessThan(SYNC_BUDGET_MS);
      expect(row.rewind).toBe(0);
    }
  });
});

describe('SimulatedAudioEngine', () => {
  it('is deterministic for a given seed', () => {
    const build = (): SimulatedAudioEngine =>
      new SimulatedAudioEngine({
        durationMs: 10_000,
        jitterMs: 10,
        seed: 42,
      });
    const first = runSyncHarness(build(), { runForMs: 5_000 });
    const second = runSyncHarness(build(), { runForMs: 5_000 });
    expect(first.maxAbsErrorMs).toBe(second.maxAbsErrorMs);
  });

  it('freezes the true position during a stall', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: 10_000,
      stalls: [{ atMs: 1_000, durationMs: 500 }],
    });
    engine.play();
    engine.tick(1_000);
    expect(engine.getTruePositionMs()).toBeCloseTo(1_000, 0);
    engine.tick(1_500);
    expect(engine.getTruePositionMs()).toBeCloseTo(1_000, 0);
    engine.tick(2_000);
    expect(engine.getTruePositionMs()).toBeCloseTo(1_500, 0);
  });

  it('quantises the reported position to the nearest step by default', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: 10_000,
      quantumMs: 20,
    });
    engine.play();
    engine.tick(1_017);
    expect(engine.getPositionMs()).toBe(1_020);
  });

  it('truncates in floor mode', () => {
    const engine = new SimulatedAudioEngine({
      durationMs: 10_000,
      quantumMs: 20,
      quantiseMode: 'floor',
    });
    engine.play();
    engine.tick(1_017);
    expect(engine.getPositionMs()).toBe(1_000);
  });

  it('fires onEnded once at the end', () => {
    const onEnded = jest.fn();
    const engine = new SimulatedAudioEngine({ durationMs: 1_000 });
    void engine.load({ onEnded });
    engine.play();
    engine.tick(1_200);
    engine.tick(1_400);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
