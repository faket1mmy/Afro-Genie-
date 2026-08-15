import { parseElrc } from './elrc/parse';
import { hasErrors } from './elrc/types';
import type { LyricLine } from './elrc/types';
import { LyricTimeline } from './LyricTimeline';

function linesFrom(body: string): readonly LyricLine[] {
  const source = `[la:yor]\n[var:original]\n${body}`;
  const { document, issues } = parseElrc(source);
  if (hasErrors(issues)) {
    throw new Error(
      `fixture has parse errors: ${issues.map((i) => i.message).join('; ')}`,
    );
  }
  return document.lines;
}

const SIMPLE = linesFrom(
  [
    '[00:01.000]<00:01.000>one <00:02.000>two <00:03.000>',
    '[00:04.000]<00:04.000>three <00:05.000>four <00:06.000>',
    '[00:07.000]<00:07.000>five <00:08.000>',
  ].join('\n'),
);

describe('LyricTimeline — line lookup', () => {
  it('reports no active line before the first line', () => {
    const timeline = new LyricTimeline(SIMPLE);
    const state = timeline.stateAt(0);
    expect(state.activeLineIndex).toBeNull();
    expect(state.nextLineIndex).toBe(0);
    expect(state.finished).toBe(false);
  });

  it('activates a line at its exact start and releases it at its end', () => {
    const timeline = new LyricTimeline(SIMPLE);
    expect(timeline.stateAt(999).activeLineIndex).toBeNull();
    expect(timeline.stateAt(1_000).activeLineIndex).toBe(0);
    expect(timeline.stateAt(2_999).activeLineIndex).toBe(0);
    // The end of line 0 is the start of line 1's span in this fixture only
    // because they abut; here they do not, so 3_000 falls into the gap.
    expect(timeline.stateAt(3_000).activeLineIndex).toBeNull();
    expect(timeline.stateAt(4_000).activeLineIndex).toBe(1);
  });

  it('walks forward across the whole song without losing a line', () => {
    const timeline = new LyricTimeline(SIMPLE);
    const seen = new Set<number>();
    for (let ms = 0; ms <= 9_000; ms += 16) {
      const index = timeline.stateAt(ms).activeLineIndex;
      if (index !== null) {
        seen.add(index);
      }
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('recovers from a backwards jump', () => {
    const timeline = new LyricTimeline(SIMPLE);
    expect(timeline.stateAt(7_500).activeLineIndex).toBe(2);
    expect(timeline.stateAt(1_500).activeLineIndex).toBe(0);
    expect(timeline.stateAt(4_500).activeLineIndex).toBe(1);
  });

  it('recovers from a long forward jump past the step budget', () => {
    const many = linesFrom(
      Array.from({ length: 40 }, (_, i) => {
        const start = 1_000 + i * 1_000;
        return `[00:${String(Math.floor(start / 1000)).padStart(2, '0')}.000]<00:${String(Math.floor(start / 1000)).padStart(2, '0')}.000>line${i} <00:${String(Math.floor(start / 1000) + 1).padStart(2, '0')}.000>`;
      }).join('\n'),
    );
    const timeline = new LyricTimeline(many);
    expect(timeline.stateAt(1_500).activeLineIndex).toBe(0);
    expect(timeline.stateAt(35_500).activeLineIndex).toBe(34);
  });

  it('agrees with a brute-force scan at every millisecond', () => {
    const timeline = new LyricTimeline(SIMPLE);
    for (let ms = 0; ms <= 9_000; ms += 1) {
      const expected = SIMPLE.findIndex(
        (line) => ms >= line.startMs && ms < line.endMs,
      );
      const actual = timeline.stateAt(ms).activeLineIndex;
      expect(actual).toBe(expected === -1 ? null : expected);
    }
  });

  it('reports finished past the last line', () => {
    const timeline = new LyricTimeline(SIMPLE);
    const state = timeline.stateAt(20_000);
    expect(state.finished).toBe(true);
    expect(state.nextLineIndex).toBeNull();
  });
});

describe('LyricTimeline — word lookup', () => {
  it('tracks the active word and its progress', () => {
    const timeline = new LyricTimeline(SIMPLE);
    expect(timeline.stateAt(1_000)).toMatchObject({
      activeWordIndex: 0,
      wordProgress: 0,
    });
    expect(timeline.stateAt(1_500).wordProgress).toBeCloseTo(0.5, 5);
    expect(timeline.stateAt(2_000)).toMatchObject({
      activeWordIndex: 1,
      wordProgress: 0,
    });
    expect(timeline.stateAt(2_999).activeWordIndex).toBe(1);
  });

  it('reports line progress across the line span', () => {
    const timeline = new LyricTimeline(SIMPLE);
    expect(timeline.stateAt(1_000).lineProgress).toBeCloseTo(0, 5);
    expect(timeline.stateAt(2_000).lineProgress).toBeCloseTo(0.5, 5);
    expect(timeline.stateAt(2_999).lineProgress).toBeCloseTo(0.9995, 3);
  });

  it('holds the last word rather than un-highlighting during a trailing gap', () => {
    // A line whose end marker sits well after the last word's own end.
    const lines = linesFrom('[00:01.000]<00:01.000>a <00:02.000>b <00:09.000>');
    const timeline = new LyricTimeline(lines);
    const state = timeline.stateAt(8_000);
    expect(state.activeLineIndex).toBe(0);
    expect(state.activeWordIndex).toBe(1);
  });
});

describe('LyricTimeline — countdowns', () => {
  it('counts down into the first line when the intro is long', () => {
    const lines = linesFrom('[00:08.000]<00:08.000>first <00:09.000>');
    const timeline = new LyricTimeline(lines);
    const state = timeline.stateAt(3_000);
    expect(state.countdown).toMatchObject({
      remainingMs: 5_000,
      totalMs: 8_000,
      remainingSeconds: 5,
      nextLineIndex: 0,
    });
  });

  it('stays quiet across a short gap', () => {
    const timeline = new LyricTimeline(SIMPLE);
    expect(timeline.stateAt(3_500).countdown).toBeNull();
  });

  it('counts down across a long instrumental gap', () => {
    const lines = linesFrom(
      [
        '[00:01.000]<00:01.000>a <00:02.000>',
        '[00:30.000]<00:30.000>b <00:31.000>',
      ].join('\n'),
    );
    const timeline = new LyricTimeline(lines);
    const state = timeline.stateAt(25_000);
    expect(state.countdown).toMatchObject({
      remainingMs: 5_000,
      totalMs: 28_000,
      nextLineIndex: 1,
    });
  });

  it('counts down across an explicit [break] even when it is short', () => {
    const lines = linesFrom(
      [
        '[00:01.000]<00:01.000>a <00:02.000>',
        '[00:02.000][break]',
        '[00:04.000]<00:04.000>b <00:05.000>',
      ].join('\n'),
    );
    const timeline = new LyricTimeline(lines);
    const state = timeline.stateAt(3_000);
    expect(state.activeLineIndex).toBeNull();
    expect(state.countdown).toMatchObject({
      remainingMs: 1_000,
      remainingSeconds: 1,
      nextLineIndex: 2,
    });
  });

  it('never reports a negative remaining time', () => {
    const lines = linesFrom('[00:08.000]<00:08.000>first <00:09.000>');
    const timeline = new LyricTimeline(lines);
    expect(timeline.stateAt(7_999).countdown?.remainingMs).toBe(1);
    expect(timeline.stateAt(8_000).countdown).toBeNull();
  });

  it('honours a custom break threshold', () => {
    const timeline = new LyricTimeline(SIMPLE, { breakThresholdMs: 500 });
    expect(timeline.stateAt(3_500).countdown).not.toBeNull();
  });
});

describe('LyricTimeline — degenerate input', () => {
  it('handles an empty document', () => {
    const timeline = new LyricTimeline([]);
    expect(timeline.stateAt(1_000)).toMatchObject({
      activeLineIndex: null,
      nextLineIndex: null,
      finished: true,
    });
    expect(timeline.endMs).toBe(0);
  });

  it('skips break lines when reporting the next line', () => {
    const lines = linesFrom(
      [
        '[00:01.000]<00:01.000>a <00:02.000>',
        '[00:02.000][break]',
        '[00:10.000]<00:10.000>b <00:11.000>',
      ].join('\n'),
    );
    const timeline = new LyricTimeline(lines);
    expect(timeline.stateAt(1_500).nextLineIndex).toBe(2);
  });
});
