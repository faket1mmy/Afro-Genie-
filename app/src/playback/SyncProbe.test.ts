import { SyncProbe } from './SyncProbe';

describe('SyncProbe', () => {
  it('reports nothing before any observation', () => {
    expect(new SyncProbe().summary()).toEqual({
      sampleCount: 0,
      maxAbsResidualMs: 0,
      meanAbsResidualMs: 0,
      p95AbsResidualMs: 0,
      biasMs: 0,
      maxBackwardsStepMs: 0,
    });
  });

  it('summarises residual magnitude', () => {
    const probe = new SyncProbe();
    probe.observe(100, 100);
    probe.observe(110, 100);
    probe.observe(80, 100);

    const summary = probe.summary();
    expect(summary.sampleCount).toBe(3);
    expect(summary.maxAbsResidualMs).toBe(20);
    expect(summary.meanAbsResidualMs).toBeCloseTo(10, 5);
  });

  it('separates bias from magnitude', () => {
    // Two runs with identical magnitude but different character: the first is
    // noise around zero, the second is a systematic lag. Only the signed mean
    // tells them apart, and only the second is fixable with a nudge.
    const noisy = new SyncProbe();
    noisy.observe(110, 100);
    noisy.observe(90, 100);
    expect(noisy.summary().meanAbsResidualMs).toBe(10);
    expect(noisy.summary().biasMs).toBe(0);

    const lagging = new SyncProbe();
    lagging.observe(90, 100);
    lagging.observe(90, 100);
    expect(lagging.summary().meanAbsResidualMs).toBe(10);
    expect(lagging.summary().biasMs).toBe(-10);
  });

  it('computes a 95th percentile', () => {
    const probe = new SyncProbe();
    for (let i = 1; i <= 100; i += 1) {
      probe.observe(i, 0);
    }
    expect(probe.summary().p95AbsResidualMs).toBe(95);
  });

  it('keeps only the most recent window', () => {
    const probe = new SyncProbe(3);
    probe.observe(1_000, 0);
    probe.observe(1, 0);
    probe.observe(2, 0);
    probe.observe(3, 0);

    const summary = probe.summary();
    expect(summary.sampleCount).toBe(3);
    expect(summary.maxAbsResidualMs).toBe(3);
  });

  it('catches a backwards step in rendered position', () => {
    const probe = new SyncProbe();
    probe.frame(1_000);
    probe.frame(1_016);
    probe.frame(1_004);
    probe.frame(1_020);
    expect(probe.summary().maxBackwardsStepMs).toBe(12);
  });

  it('reports no backwards step for a monotonic run', () => {
    const probe = new SyncProbe();
    for (let ms = 0; ms < 1_000; ms += 16) {
      probe.frame(ms);
    }
    expect(probe.summary().maxBackwardsStepMs).toBe(0);
  });

  it('clears everything on reset', () => {
    const probe = new SyncProbe();
    probe.observe(50, 0);
    probe.frame(100);
    probe.frame(10);
    probe.reset();
    expect(probe.summary().sampleCount).toBe(0);
    expect(probe.summary().maxBackwardsStepMs).toBe(0);
  });
});
