/**
 * Wires an `AudioEngine`, a `PlaybackClock` and a `LyricTimeline` into
 * something a screen can render.
 *
 * ## The re-render budget
 *
 * The lyric position has to be recomputed every frame, but React must *not*
 * re-render every frame. SPEC §1 sets the floor at a mid-range 2021 Android;
 * sixty state updates a second through the reconciler on that hardware costs
 * frames, and dropped frames during a performance look exactly like bad sync
 * even when the clock is perfect.
 *
 * So the loop splits in two:
 *
 * - **Continuous** values — progress through the line, through the song — go
 *   into `Animated.Value`s via `setValue`, which does not touch React state.
 * - **Discrete** values — which line, which word, which second of a countdown —
 *   go into state, and only when they actually change. That is a handful of
 *   updates a second rather than sixty.
 *
 * The frame timestamp `requestAnimationFrame` hands us is already a
 * high-resolution monotonic reading, so the loop uses it directly rather than
 * calling a clock again and introducing a small unnecessary error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';

import { parseElrc } from '@/lyrics/elrc/parse';
import type { LyricVariant } from '@/lyrics/elrc/types';
import { LyricTimeline } from '@/lyrics/LyricTimeline';
import type { TimelineState } from '@/lyrics/LyricTimeline';
import { lyricsFor } from '@/catalogue/types';
import type { Song } from '@/catalogue/types';

import type { AudioEngine } from './AudioEngine';
import { monotonicNowMs } from './clock';
import { PlaybackClock } from './PlaybackClock';
import type { PlaybackClockStats } from './PlaybackClock';

/**
 * How often the native position is read.
 *
 * Every read crosses into native and costs something, and the measurements in
 * `SyncHarness.test.ts` show four times a second is already deep inside the
 * budget — going faster buys nothing and spends battery.
 */
export const OBSERVE_INTERVAL_MS = 250;

export type SessionStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'error';

export interface PerformanceSession {
  readonly status: SessionStatus;
  readonly error: Error | null;
  /** Discrete lyric state. Changes a few times a second, not every frame. */
  readonly timeline: TimelineState;
  /** 0..1 through the song. Animated; safe to drive a bar without re-rendering. */
  readonly songProgress: Animated.Value;
  /** 0..1 through the active word. Animated. */
  readonly wordProgress: Animated.Value;
  readonly durationMs: number;
  readonly lines: LyricTimeline['lines'];
  readonly secondaryLines: LyricTimeline['lines'] | null;
  readonly clockStats: PlaybackClockStats;
  play(): void;
  pause(): void;
  restart(): void;
}

export interface PerformanceSessionOptions {
  readonly song: Song;
  /** Factory rather than an instance, so a screen can be remounted safely. */
  readonly createEngine: (song: Song) => AudioEngine;
  readonly primaryVariant: LyricVariant;
  /** Rendered under the primary line in dual mode. */
  readonly secondaryVariant: LyricVariant | null;
  /**
   * Shifts the lyrics relative to the audio, ms. Positive moves lyrics later.
   *
   * Every device has some output latency — the gap between the position the
   * player reports and the sound leaving the speaker — and over Bluetooth it
   * can be hundreds of milliseconds. No amount of clock tracking sees it,
   * because it happens after the point the clock can observe. SPEC §7 makes
   * measuring it a Phase 2 requirement; until then this is the manual control,
   * and Phase 2's measured value feeds the same input.
   */
  readonly lyricOffsetMs: number;
  readonly autoPlay?: boolean;
}

function useTimeline(
  song: Song,
  variant: LyricVariant,
): LyricTimeline | null {
  return useMemo(() => {
    const reference = lyricsFor(song, variant);
    if (reference === undefined) {
      return null;
    }
    return new LyricTimeline(parseElrc(reference.text).document.lines);
  }, [song, variant]);
}

const IDLE_STATE: TimelineState = {
  positionMs: 0,
  activeLineIndex: null,
  activeWordIndex: null,
  wordProgress: 0,
  lineProgress: 0,
  nextLineIndex: null,
  countdown: null,
  finished: false,
};

export function usePerformanceSession(
  options: PerformanceSessionOptions,
): PerformanceSession {
  const {
    song,
    createEngine,
    primaryVariant,
    secondaryVariant,
    lyricOffsetMs,
    autoPlay = false,
  } = options;

  const primary = useTimeline(song, primaryVariant);
  const secondary = useTimeline(song, secondaryVariant ?? primaryVariant);

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [timelineState, setTimelineState] = useState<TimelineState>(IDLE_STATE);
  const [clockStats, setClockStats] = useState<PlaybackClockStats>(() =>
    new PlaybackClock().stats(),
  );
  const [durationMs, setDurationMs] = useState(song.durationMs);

  const songProgress = useRef(new Animated.Value(0)).current;
  const wordProgress = useRef(new Animated.Value(0)).current;

  const engineRef = useRef<AudioEngine | null>(null);
  // The factory is held in a ref, and the load effect keys on the song alone.
  // Depending on the factory's identity would make an inline `createEngine={...}`
  // tear down and reload the audio on every render — an unbounded reload loop
  // that only shows up as "stuck on loading", which is a miserable thing to
  // debug. Callers should not have to know to memoise it.
  const createEngineRef = useRef(createEngine);
  const durationRef = useRef(song.durationMs);
  const clockRef = useRef<PlaybackClock>(new PlaybackClock());
  const frameRef = useRef<number | null>(null);
  const nextObserveRef = useRef(0);
  const lastEmittedRef = useRef<TimelineState>(IDLE_STATE);
  const offsetRef = useRef(lyricOffsetMs);
  const statusRef = useRef<SessionStatus>('loading');

  offsetRef.current = lyricOffsetMs;
  createEngineRef.current = createEngine;
  durationRef.current = durationMs;

  const setStatusBoth = useCallback((next: SessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // --- the frame loop -----------------------------------------------------

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const runLoop = useCallback(() => {
    const step = (frameTimeMs: number): void => {
      const engine = engineRef.current;
      const clock = clockRef.current;
      if (engine === null || primary === null) {
        return;
      }

      if (frameTimeMs >= nextObserveRef.current) {
        // Read native first, then take the time, so the cost of the read shows
        // up as error rather than disappearing into the timestamp.
        const observed = engine.getPositionMs();
        clock.observe(observed, monotonicNowMs());
        nextObserveRef.current = frameTimeMs + OBSERVE_INTERVAL_MS;
        setClockStats(clock.stats());
      }

      const positionMs = clock.positionAt(frameTimeMs) + offsetRef.current;
      const next = primary.stateAt(positionMs);

      const total = durationRef.current > 0 ? durationRef.current : 1;
      songProgress.setValue(Math.max(0, Math.min(1, positionMs / total)));
      wordProgress.setValue(next.wordProgress);

      if (hasDiscreteChange(lastEmittedRef.current, next)) {
        lastEmittedRef.current = next;
        setTimelineState(next);
      }

      if (next.finished && statusRef.current === 'playing') {
        setStatusBoth('finished');
      }

      frameRef.current = requestAnimationFrame(step);
    };

    stopLoop();
    frameRef.current = requestAnimationFrame(step);
  }, [primary, setStatusBoth, songProgress, stopLoop, wordProgress]);

  // --- lifecycle ----------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const engine = createEngineRef.current(song);
    engineRef.current = engine;
    clockRef.current = new PlaybackClock();
    lastEmittedRef.current = IDLE_STATE;
    setTimelineState(IDLE_STATE);
    setStatusBoth('loading');
    setError(null);

    engine
      .load({
        onEnded: () => {
          if (!cancelled) {
            setStatusBoth('finished');
          }
        },
        onError: (loadError) => {
          if (!cancelled) {
            setError(loadError);
            setStatusBoth('error');
          }
        },
      })
      .then(() => {
        if (cancelled) {
          return;
        }
        const reported = engine.getDurationMs();
        if (reported > 0) {
          setDurationMs(reported);
        }
        setStatusBoth('ready');
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(
          loadError instanceof Error ? loadError : new Error(String(loadError)),
        );
        setStatusBoth('error');
      });

    return () => {
      cancelled = true;
      stopLoop();
      engine.release();
      engineRef.current = null;
    };
  }, [setStatusBoth, song, stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  // --- controls -----------------------------------------------------------

  const play = useCallback(() => {
    const engine = engineRef.current;
    if (engine === null || statusRef.current === 'loading') {
      return;
    }
    if (statusRef.current === 'finished') {
      void engine.seekTo(0);
      clockRef.current.seek(0, monotonicNowMs());
      primary?.reset();
    }
    engine.play();
    clockRef.current.start(engine.getPositionMs(), monotonicNowMs());
    nextObserveRef.current = 0;
    setStatusBoth('playing');
    runLoop();
  }, [primary, runLoop, setStatusBoth]);

  const pause = useCallback(() => {
    const engine = engineRef.current;
    if (engine === null) {
      return;
    }
    engine.pause();
    clockRef.current.pause(monotonicNowMs());
    stopLoop();
    setStatusBoth('paused');
  }, [setStatusBoth, stopLoop]);

  const restart = useCallback(() => {
    const engine = engineRef.current;
    if (engine === null) {
      return;
    }
    void engine.seekTo(0);
    clockRef.current.seek(0, monotonicNowMs());
    primary?.reset();
    lastEmittedRef.current = IDLE_STATE;
    setTimelineState(IDLE_STATE);
    songProgress.setValue(0);
    engine.play();
    clockRef.current.start(0, monotonicNowMs());
    nextObserveRef.current = 0;
    setStatusBoth('playing');
    runLoop();
  }, [primary, runLoop, setStatusBoth, songProgress]);

  useEffect(() => {
    if (autoPlay && status === 'ready') {
      play();
    }
  }, [autoPlay, play, status]);

  return {
    status,
    error,
    timeline: timelineState,
    songProgress,
    wordProgress,
    durationMs,
    lines: primary?.lines ?? [],
    secondaryLines:
      secondaryVariant === null ? null : (secondary?.lines ?? null),
    clockStats,
    play,
    pause,
    restart,
  };
}

/**
 * Whether anything a component actually renders has changed. Progress within a
 * word is deliberately excluded — that rides on an `Animated.Value`.
 */
function hasDiscreteChange(
  previous: TimelineState,
  next: TimelineState,
): boolean {
  return (
    previous.activeLineIndex !== next.activeLineIndex ||
    previous.activeWordIndex !== next.activeWordIndex ||
    previous.nextLineIndex !== next.nextLineIndex ||
    previous.finished !== next.finished ||
    (previous.countdown?.remainingSeconds ?? null) !==
      (next.countdown?.remainingSeconds ?? null)
  );
}
