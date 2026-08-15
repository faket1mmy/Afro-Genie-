/**
 * Runtime lookup over a parsed lyric document.
 *
 * The performance screen asks "what is happening at time T?" on every frame, so
 * this is built for repeated forward queries: a cursor walks forward in O(1)
 * amortised time and only falls back to binary search when the caller jumps
 * backwards (a seek, or a replay).
 *
 * The timeline owns no timing logic of its own beyond lookup — the position it
 * is handed comes from `PlaybackClock`, which is what actually carries the
 * ±20ms budget (SPEC §3).
 */

import { DEFAULT_BREAK_THRESHOLD_MS } from './elrc/parse';
import type { LyricLine } from './elrc/types';

export interface Countdown {
  /** Time until the next sung line begins, ms. Never negative. */
  readonly remainingMs: number;
  /** Length of the whole gap, ms — the denominator for a progress ring. */
  readonly totalMs: number;
  /** Whole beats remaining, for a "4 · 3 · 2 · 1" display. */
  readonly remainingSeconds: number;
  readonly nextLineIndex: number | null;
}

export interface TimelineState {
  readonly positionMs: number;
  /** The line being sung right now, or `null` between lines. */
  readonly activeLineIndex: number | null;
  /** Index into `lines[activeLineIndex].words`, or `null`. */
  readonly activeWordIndex: number | null;
  /** Progress through the active word, 0..1. Zero when no word is active. */
  readonly wordProgress: number;
  /** Progress through the active line, 0..1. Zero when no line is active. */
  readonly lineProgress: number;
  /** The next line that will be sung, or `null` past the end of the song. */
  readonly nextLineIndex: number | null;
  /**
   * Set while the singer is waiting: before the first line, in an instrumental
   * gap longer than the break threshold, or across an explicit `[break]`.
   */
  readonly countdown: Countdown | null;
  /** True once the position is past the end of the last line. */
  readonly finished: boolean;
}

export interface LyricTimelineOptions {
  /**
   * Gaps at least this long get a countdown instead of a blank screen
   * (SPEC §5). Explicit `[break]` lines always get one regardless of length.
   */
  readonly breakThresholdMs?: number;
}

const EMPTY_STATE: TimelineState = {
  positionMs: 0,
  activeLineIndex: null,
  activeWordIndex: null,
  wordProgress: 0,
  lineProgress: 0,
  nextLineIndex: null,
  countdown: null,
  finished: true,
};

export class LyricTimeline {
  /** Sung lines only — `break` lines are gaps, not content. */
  readonly lines: readonly LyricLine[];

  private readonly sungIndices: readonly number[];
  private readonly breakThresholdMs: number;
  private cursor = 0;

  constructor(lines: readonly LyricLine[], options: LyricTimelineOptions = {}) {
    this.lines = lines;
    this.breakThresholdMs =
      options.breakThresholdMs ?? DEFAULT_BREAK_THRESHOLD_MS;
    this.sungIndices = lines
      .map((line, index) => (line.kind === 'break' ? -1 : index))
      .filter((index) => index >= 0);
  }

  /** End of the last line, ms. Zero for an empty document. */
  get endMs(): number {
    return this.lines.at(-1)?.endMs ?? 0;
  }

  /** Start of the first sung line, ms. */
  get firstSungStartMs(): number {
    const first = this.sungIndices[0];
    return first === undefined ? 0 : (this.lines[first]?.startMs ?? 0);
  }

  /** Resets the cursor. Call on seek; `stateAt` also self-corrects. */
  reset(): void {
    this.cursor = 0;
  }

  stateAt(positionMs: number): TimelineState {
    if (this.lines.length === 0) {
      return { ...EMPTY_STATE, positionMs };
    }

    const index = this.locate(positionMs);
    const line = index === null ? undefined : this.lines[index];

    if (line !== undefined && line.kind !== 'break') {
      return this.activeState(positionMs, index as number, line);
    }

    // Either inside an explicit break, or in the gap between two lines.
    const nextIndex = this.nextSungIndexAt(positionMs);
    const finished = nextIndex === null && positionMs >= this.endMs;
    const countdown = this.countdownAt(positionMs, nextIndex);
    return {
      positionMs,
      activeLineIndex: null,
      activeWordIndex: null,
      wordProgress: 0,
      lineProgress: 0,
      nextLineIndex: nextIndex,
      countdown,
      finished,
    };
  }

  private activeState(
    positionMs: number,
    index: number,
    line: LyricLine,
  ): TimelineState {
    const span = Math.max(1, line.endMs - line.startMs);
    const lineProgress = clamp01((positionMs - line.startMs) / span);

    let activeWordIndex: number | null = null;
    let wordProgress = 0;
    for (let i = 0; i < line.words.length; i += 1) {
      const word = line.words[i];
      if (word === undefined) {
        continue;
      }
      if (positionMs >= word.startMs && positionMs < word.endMs) {
        activeWordIndex = i;
        wordProgress = clamp01(
          (positionMs - word.startMs) / Math.max(1, word.endMs - word.startMs),
        );
        break;
      }
      if (positionMs >= word.endMs) {
        // Past this word: remember it so a trailing gap inside the line still
        // shows the last word as sung rather than snapping back to none.
        activeWordIndex = i;
        wordProgress = 1;
      }
    }

    return {
      positionMs,
      activeLineIndex: index,
      activeWordIndex,
      wordProgress,
      lineProgress,
      nextLineIndex: this.nextSungIndexAfter(index),
      countdown: null,
      finished: false,
    };
  }

  private countdownAt(
    positionMs: number,
    nextIndex: number | null,
  ): Countdown | null {
    if (nextIndex === null) {
      return null;
    }
    const next = this.lines[nextIndex];
    if (next === undefined) {
      return null;
    }
    const gapStart = this.gapStartBefore(nextIndex);
    const totalMs = next.startMs - gapStart;
    const explicitBreak = this.lines.some(
      (line) =>
        line.kind === 'break' &&
        positionMs >= line.startMs &&
        positionMs < line.endMs,
    );
    if (!explicitBreak && totalMs < this.breakThresholdMs) {
      return null;
    }
    const remainingMs = Math.max(0, next.startMs - positionMs);
    return {
      remainingMs,
      totalMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      nextLineIndex: nextIndex,
    };
  }

  /** Where the current silence began: end of the previous sung line, or 0. */
  private gapStartBefore(nextIndex: number): number {
    for (let i = nextIndex - 1; i >= 0; i -= 1) {
      const line = this.lines[i];
      if (line !== undefined && line.kind !== 'break') {
        return line.endMs;
      }
    }
    return 0;
  }

  private nextSungIndexAfter(index: number): number | null {
    for (let i = index + 1; i < this.lines.length; i += 1) {
      if (this.lines[i]?.kind !== 'break') {
        return i;
      }
    }
    return null;
  }

  private nextSungIndexAt(positionMs: number): number | null {
    for (const index of this.sungIndices) {
      const line = this.lines[index];
      if (line !== undefined && line.startMs > positionMs) {
        return index;
      }
    }
    return null;
  }

  /**
   * Index of the line whose span contains `positionMs`, or `null` if the
   * position falls in a gap. Amortised O(1) for monotonically increasing
   * queries; O(log n) after a backwards jump.
   */
  private locate(positionMs: number): number | null {
    const atCursor = this.lines[this.cursor];
    if (
      atCursor !== undefined &&
      positionMs >= atCursor.startMs &&
      positionMs < atCursor.endMs
    ) {
      return this.cursor;
    }
    if (atCursor !== undefined && positionMs < atCursor.startMs) {
      // Backwards jump — the cursor is stale.
      this.cursor = this.binarySearch(positionMs);
    } else {
      // Forwards. Step, but bail out to binary search on a long jump.
      let steps = 0;
      while (this.cursor < this.lines.length - 1 && steps < 8) {
        const line = this.lines[this.cursor];
        if (line === undefined || positionMs < line.endMs) {
          break;
        }
        this.cursor += 1;
        steps += 1;
      }
      const settled = this.lines[this.cursor];
      if (settled !== undefined && positionMs >= settled.endMs) {
        this.cursor = this.binarySearch(positionMs);
      }
    }

    const line = this.lines[this.cursor];
    if (
      line !== undefined &&
      positionMs >= line.startMs &&
      positionMs < line.endMs
    ) {
      return this.cursor;
    }
    return null;
  }

  /** Index of the last line starting at or before `positionMs` (clamped to 0). */
  private binarySearch(positionMs: number): number {
    let low = 0;
    let high = this.lines.length - 1;
    let best = 0;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const line = this.lines[mid];
      if (line === undefined) {
        break;
      }
      if (line.startMs <= positionMs) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
