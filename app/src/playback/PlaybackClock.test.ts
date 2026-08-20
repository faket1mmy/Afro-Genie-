import { PlaybackClock } from './PlaybackClock';

/** Feeds the clock a perfect observation stream and returns the final error. */
function runIdeal(clock: PlaybackClock, durationMs: number): number {
  for (let wall = 0; wall <= durationMs; wall += 100) {
    clock.observe(wall, wall);
  }
  return clock.positionAt(durationMs) - durationMs;
}

describe('PlaybackClock — construction', () => {
  it.each([0, 1, 1.5, -0.1])('rejects maxSlewRate %p', (maxSlewRate) => {
    expect(() => new PlaybackClock({ maxSlewRate })).toThrow(RangeError);
  });
});

describe('PlaybackClock — free running', () => {
  it('advances with wall time once started', () => {
    const clock = new PlaybackClock();
    clock.start(0, 1_000);
    expect(clock.positionAt(1_000)).toBe(0);
    expect(clock.positionAt(2_000)).toBe(1_000);
    expect(clock.positionAt(2_500)).toBe(1_500);
  });

  it('starts from a non-zero position', () => {
    const clock = new PlaybackClock();
    clock.start(30_000, 500);
    expect(clock.positionAt(1_500)).toBe(31_000);
  });

  it('reports nothing before start', () => {
    const clock = new PlaybackClock();
    expect(clock.positionAt(5_000)).toBe(0);
    expect(clock.stats().state).toBe('idle');
  });

  it('is idempotent for a repeated query at the same time', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    expect(clock.positionAt(1_000)).toBe(1_000);
    expect(clock.positionAt(1_000)).toBe(1_000);
  });

  it('does not run backwards when queried out of order', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    const forward = clock.positionAt(1_000);
    expect(clock.positionAt(900)).toBe(forward);
  });
});

describe('PlaybackClock — pause and seek', () => {
  it('freezes while paused and resumes from the same position', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    clock.positionAt(1_000);
    clock.pause(1_000);
    expect(clock.positionAt(5_000)).toBe(1_000);
    clock.resume(5_000);
    expect(clock.positionAt(6_000)).toBe(2_000);
  });

  it('ignores observations while paused', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    clock.pause(1_000);
    clock.observe(90_000, 2_000);
    expect(clock.positionAt(3_000)).toBe(1_000);
  });

  it('jumps on seek and discards the pending correction', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    clock.observe(80, 1_000); // leaves a correction owing
    clock.seek(60_000, 1_000);
    expect(clock.positionAt(1_000)).toBe(60_000);
    expect(clock.positionAt(2_000)).toBe(61_000);
    expect(clock.stats().pendingCorrectionMs).toBe(0);
  });

  it('stops cleanly', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    clock.stop(2_000);
    expect(clock.stats().state).toBe('idle');
    expect(clock.positionAt(9_000)).toBe(2_000);
  });
});

describe('PlaybackClock — error correction', () => {
  it('converges on a small positive error without jumping', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    // The player is 60ms ahead of where we think we are.
    clock.observe(1_060, 1_000);
    expect(clock.stats().hardResyncCount).toBe(0);

    // The correction is spread out, not applied at once.
    const justAfter = clock.positionAt(1_010);
    expect(justAfter).toBeGreaterThan(1_010);
    expect(justAfter).toBeLessThan(1_060);

    for (let wall = 1_100; wall <= 4_000; wall += 100) {
      clock.observe(wall + 60, wall);
    }
    expect(clock.positionAt(4_000)).toBeCloseTo(4_060, 0);
  });

  it('converges on a small negative error', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    for (let wall = 100; wall <= 4_000; wall += 100) {
      clock.observe(wall - 60, wall);
    }
    expect(clock.positionAt(4_000)).toBeCloseTo(3_940, 0);
    expect(clock.stats().hardResyncCount).toBe(0);
  });

  it('never moves backwards while correcting a negative error', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    let previous = clock.positionAt(0);
    for (let wall = 16; wall <= 6_000; wall += 16) {
      if (wall % 96 === 0) {
        clock.observe(wall - 200, wall);
      }
      const position = clock.positionAt(wall);
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
  });

  it('respects the slew ceiling', () => {
    const clock = new PlaybackClock({ maxSlewRate: 0.1, errorGain: 1 });
    clock.start(0, 0);
    clock.observe(1_200, 1_000);
    // Over the next 100ms the model may gain at most 10% of 100ms = 10ms on
    // top of the natural 100ms.
    expect(clock.positionAt(1_100)).toBeLessThanOrEqual(1_210.000001);
  });

  it('hard-resyncs forward on a large positive error instead of slewing for ever', () => {
    const clock = new PlaybackClock({ hardResyncMs: 250 });
    clock.start(0, 0);
    clock.observe(1_400, 1_000);
    expect(clock.stats().hardResyncCount).toBe(1);
    expect(clock.positionAt(1_000)).toBe(1_400);
  });

  it('slews rather than rewinding when we are moderately ahead', () => {
    // Same magnitude as the forward case above, opposite sign. Jumping here
    // would un-highlight text the singer has already sung past, so one reading
    // is never enough to justify it.
    const clock = new PlaybackClock({ hardResyncMs: 250 });
    clock.start(0, 0);
    clock.observe(600, 1_000);
    expect(clock.stats().hardResyncCount).toBe(0);
    expect(clock.positionAt(1_000)).toBe(1_000);
    expect(clock.positionAt(1_100)).toBeGreaterThan(1_000);
  });

  it('rewinds only once several readings agree that we are ahead', () => {
    const clock = new PlaybackClock({ outlierMs: 500, outlierTolerance: 3 });
    clock.start(0, 0);
    clock.observe(1_000, 1_000);

    // The audio has frozen at 1000ms. Every subsequent reading says we are
    // further ahead of it, but no single one is allowed to rewind us.
    let wall = 1_250;
    for (; wall <= 2_000; wall += 250) {
      clock.observe(1_000, wall);
      expect(clock.stats().hardResyncCount).toBe(0);
      expect(clock.positionAt(wall)).toBeGreaterThan(1_000);
    }

    // Once the freeze is beyond doubt, it is corrected — accepting the rewind,
    // because staying a second ahead of the music is the worse outcome.
    for (; wall <= 4_000; wall += 250) {
      clock.observe(1_000, wall);
      if (clock.stats().hardResyncCount > 0) {
        break;
      }
    }
    expect(clock.stats().hardResyncCount).toBe(1);
    expect(clock.positionAt(wall)).toBe(1_000);
  });

  it('ignores a lone outlier', () => {
    const clock = new PlaybackClock({ outlierMs: 500, outlierTolerance: 3 });
    clock.start(0, 0);
    clock.observe(1_000, 1_000);
    clock.observe(9_999, 1_100); // nonsense reading
    expect(clock.stats().hardResyncCount).toBe(0);
    expect(clock.positionAt(1_100)).toBeCloseTo(1_100, 0);
    expect(clock.stats().outlierCount).toBe(1);
  });

  it('believes outliers once they persist', () => {
    const clock = new PlaybackClock({ outlierMs: 500, outlierTolerance: 3 });
    clock.start(0, 0);
    clock.observe(1_000, 1_000);
    clock.observe(9_000, 1_100);
    clock.observe(9_100, 1_200);
    clock.observe(9_200, 1_300);
    expect(clock.stats().hardResyncCount).toBe(1);
    expect(clock.positionAt(1_300)).toBe(9_200);
  });

  it('resets the outlier run when a good reading arrives', () => {
    const clock = new PlaybackClock({ outlierMs: 500, outlierTolerance: 3 });
    clock.start(0, 0);
    clock.observe(9_000, 1_000);
    clock.observe(9_000, 1_100);
    clock.observe(1_200, 1_200); // sane again
    clock.observe(9_000, 1_300);
    clock.observe(9_000, 1_400);
    expect(clock.stats().hardResyncCount).toBe(0);
  });

  it('reports lock only after an accepted observation', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    expect(clock.stats().locked).toBe(false);
    clock.observe(1_000, 1_000);
    expect(clock.stats().locked).toBe(true);
    clock.observe(50_000, 1_100);
    clock.observe(50_100, 1_200);
    clock.observe(50_200, 1_300);
    expect(clock.stats().locked).toBe(false);
  });
});

describe('PlaybackClock — rate estimation', () => {
  it('learns a fast audio clock and tracks it', () => {
    // +2000ppm is far beyond anything real, chosen so the effect is visible
    // within a short test rather than needing a four-minute run.
    const rate = 1.002;
    const clock = new PlaybackClock();
    clock.start(0, 0);
    for (let wall = 100; wall <= 60_000; wall += 100) {
      clock.observe(wall * rate, wall);
    }
    // The rate loop is deliberately slow (see the class comment): over a
    // 60-second run it closes most of the gap, not all of it. What has to be
    // right is that it moves the right way and that the position still tracks,
    // because the error loop covers the remainder.
    expect(clock.stats().rate).toBeGreaterThan(1.001);
    expect(Math.abs(clock.positionAt(60_000) - 60_000 * rate)).toBeLessThan(2);
  });

  it('learns a slow audio clock', () => {
    const rate = 0.998;
    const clock = new PlaybackClock();
    clock.start(0, 0);
    for (let wall = 100; wall <= 60_000; wall += 100) {
      clock.observe(wall * rate, wall);
    }
    expect(clock.stats().rate).toBeLessThan(0.999);
    expect(Math.abs(clock.positionAt(60_000) - 60_000 * rate)).toBeLessThan(2);
  });

  it('keeps the estimated rate inside its clamp', () => {
    const clock = new PlaybackClock({ maxRateDeviation: 0.05 });
    clock.start(0, 0);
    for (let wall = 100; wall <= 60_000; wall += 100) {
      clock.observe(wall * 1.5, wall);
    }
    const { rate } = clock.stats();
    expect(rate).toBeLessThanOrEqual(1.05);
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });

  it('holds rate at 1.0 for a well-behaved player', () => {
    const clock = new PlaybackClock();
    clock.start(0, 0);
    const error = runIdeal(clock, 60_000);
    expect(Math.abs(error)).toBeLessThan(1);
    expect(clock.stats().rate).toBeCloseTo(1, 3);
  });
});
