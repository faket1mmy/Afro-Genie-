/**
 * End-to-end test of the playback spine: a simulated audio device, the clock,
 * the timeline and the hook that drives a screen — everything Phase 1 builds,
 * short of the pixels.
 *
 * Time is entirely virtual. `performance.now` and `requestAnimationFrame` are
 * driven from one counter, so a sixty-second song runs in milliseconds and the
 * result is identical on every machine. Real timers here would make the test
 * both slow and flaky, and a flaky sync test is worse than no sync test.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { BUNDLED_SONGS } from '@/catalogue/bundled';
import type { Song } from '@/catalogue/types';

import type { AudioEngine } from './AudioEngine';
import { SimulatedAudioEngine } from './SimulatedAudioEngine';
import { usePerformanceSession } from './usePerformanceSession';
import type { PerformanceSessionOptions } from './usePerformanceSession';

const SONG = BUNDLED_SONGS[0] as Song;
const FRAME_MS = 1000 / 60;

let virtualNowMs = 0;
let pendingFrame: FrameRequestCallback | null = null;
let engine: SimulatedAudioEngine;

function baseOptions(
  overrides: Partial<PerformanceSessionOptions> = {},
): PerformanceSessionOptions {
  return {
    song: SONG,
    createEngine: () => engine,
    primaryVariant: 'original',
    secondaryVariant: null,
    lyricOffsetMs: 0,
    ...overrides,
  };
}

/** Advances virtual time, keeping the engine and the frame loop in step. */
function advance(durationMs: number): void {
  const target = virtualNowMs + durationMs;
  while (virtualNowMs < target) {
    virtualNowMs = Math.min(target, virtualNowMs + FRAME_MS);
    engine.tick(virtualNowMs);
    const frame = pendingFrame;
    if (frame !== null) {
      pendingFrame = null;
      frame(virtualNowMs);
    }
  }
}

beforeEach(() => {
  virtualNowMs = 0;
  pendingFrame = null;
  engine = new SimulatedAudioEngine({
    durationMs: SONG.durationMs,
    quantumMs: 20,
    jitterMs: 6,
    seed: 5,
  });

  jest.spyOn(performance, 'now').mockImplementation(() => virtualNowMs);
  jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      pendingFrame = callback;
      return 1;
    });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {
    pendingFrame = null;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePerformanceSession', () => {
  it('loads the song and reports its duration', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.durationMs).toBe(SONG.durationMs);
    expect(result.current.lines.length).toBeGreaterThan(0);
  });

  it('counts down through the intro, then sings', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
    });
    expect(result.current.status).toBe('playing');

    act(() => {
      advance(1_000);
    });
    expect(result.current.timeline.countdown).not.toBeNull();
    expect(result.current.timeline.activeLineIndex).toBeNull();

    // The first fixture line lands at 8.889s.
    act(() => {
      advance(8_500);
    });
    expect(result.current.timeline.activeLineIndex).toBe(0);
    expect(result.current.timeline.countdown).toBeNull();
  });

  it('advances through words within a line', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
      advance(9_000);
    });
    const first = result.current.timeline.activeWordIndex;

    act(() => {
      advance(1_200);
    });
    const later = result.current.timeline.activeWordIndex;

    expect(first).not.toBeNull();
    expect(later).not.toBeNull();
    expect(later as number).toBeGreaterThan(first as number);
  });

  it('never moves the active line backwards across the whole song', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
    });

    let highest = -1;
    for (let elapsed = 0; elapsed < SONG.durationMs; elapsed += 500) {
      act(() => {
        advance(500);
      });
      const index = result.current.timeline.activeLineIndex;
      if (index !== null) {
        expect(index).toBeGreaterThanOrEqual(highest);
        highest = index;
      }
    }
    expect(highest).toBeGreaterThan(5);
  });

  it('reaches the end of the song and reports it finished', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
      advance(SONG.durationMs + 2_000);
    });
    expect(result.current.status).toBe('finished');
  });

  it('freezes the lyrics while paused', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
      advance(12_000);
    });
    const atPause = result.current.timeline.activeWordIndex;

    act(() => {
      result.current.pause();
      advance(5_000);
    });
    expect(result.current.status).toBe('paused');
    expect(result.current.timeline.activeWordIndex).toBe(atPause);
  });

  it('resumes from where it paused', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
      advance(12_000);
    });
    const before = result.current.timeline.activeLineIndex;

    act(() => {
      result.current.pause();
      advance(3_000);
      result.current.play();
      advance(100);
    });
    expect(result.current.timeline.activeLineIndex).toBe(before);
  });

  it('restarts from the top', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // 12s is inside the first verse; 20s would be in the instrumental break,
    // where no line is active.
    act(() => {
      result.current.play();
      advance(12_000);
    });
    expect(result.current.timeline.activeLineIndex).not.toBeNull();

    act(() => {
      result.current.restart();
      advance(200);
    });
    expect(result.current.status).toBe('playing');
    expect(result.current.timeline.activeLineIndex).toBeNull();
  });

  it('shifts the lyrics by the lyric offset', async () => {
    // The nudge is the manual stand-in for the latency calibration SPEC §7
    // requires, so it has to actually move the words.
    const withoutOffset = renderHook(() =>
      usePerformanceSession(baseOptions()),
    );
    await waitFor(() => expect(withoutOffset.result.current.status).toBe('ready'));
    act(() => {
      withoutOffset.result.current.play();
      advance(8_800);
    });
    const plain = withoutOffset.result.current.timeline.activeLineIndex;

    virtualNowMs = 0;
    pendingFrame = null;
    engine = new SimulatedAudioEngine({
      durationMs: SONG.durationMs,
      quantumMs: 20,
      jitterMs: 6,
      seed: 5,
    });

    const shifted = renderHook(() =>
      usePerformanceSession(baseOptions({ lyricOffsetMs: 400 })),
    );
    await waitFor(() => expect(shifted.result.current.status).toBe('ready'));
    act(() => {
      shifted.result.current.play();
      advance(8_800);
    });

    expect(plain).toBeNull();
    expect(shifted.result.current.timeline.activeLineIndex).toBe(0);
  });

  it('exposes the secondary variant only when one is requested', async () => {
    const single = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(single.result.current.status).toBe('ready'));
    expect(single.result.current.secondaryLines).toBeNull();

    const dual = renderHook(() =>
      usePerformanceSession(baseOptions({ secondaryVariant: 'romanised' })),
    );
    await waitFor(() => expect(dual.result.current.status).toBe('ready'));
    expect(dual.result.current.secondaryLines?.length).toBe(
      dual.result.current.lines.length,
    );
  });

  it('keeps the clock locked without hard resyncs on a clean run', async () => {
    const { result } = renderHook(() => usePerformanceSession(baseOptions()));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.play();
      advance(30_000);
    });
    expect(result.current.clockStats.hardResyncCount).toBe(0);
    expect(result.current.clockStats.locked).toBe(true);
  });

  it('surfaces a load failure instead of hanging on the loading state', async () => {
    // Spreading a class instance would drop its prototype methods, so the
    // failing engine is built as a full stub.
    const failing: AudioEngine = {
      load: () => Promise.reject(new Error('asset missing')),
      play: () => undefined,
      pause: () => undefined,
      seekTo: () => Promise.resolve(),
      getPositionMs: () => 0,
      getDurationMs: () => 0,
      isPlaying: () => false,
      getStatus: () => 'error',
      release: () => undefined,
    };
    const { result } = renderHook(() =>
      usePerformanceSession(baseOptions({ createEngine: () => failing })),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('asset missing');
  });

  it('releases the engine on unmount', async () => {
    const release = jest.spyOn(engine, 'release');
    const { result, unmount } = renderHook(() =>
      usePerformanceSession(baseOptions()),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    unmount();
    expect(release).toHaveBeenCalled();
  });
});
