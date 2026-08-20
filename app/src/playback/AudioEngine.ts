/**
 * The seam between the sync engine and whatever native audio module is
 * underneath.
 *
 * Everything above this interface — `PlaybackClock`, `LyricTimeline`, the
 * performance controller — is pure TypeScript with no native dependency, which
 * is what makes the ±20ms budget testable at all (see `SyncHarness`). Swapping
 * the audio module means writing one adapter, not touching the sync logic.
 *
 * Positions and durations are **milliseconds** at this boundary, even though
 * most native modules speak seconds. Converting once, here, keeps float-second
 * rounding out of the timeline.
 */

export type AudioEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AudioEngineEvents {
  onStatusChange?: (status: AudioEngineStatus) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

export interface AudioEngine {
  /** Resolves once the asset is fully readable and playback can begin. */
  load(events?: AudioEngineEvents): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(positionMs: number): Promise<void>;
  /**
   * Current position in ms, read synchronously. Must not throw before load;
   * return 0 instead. Callers treat the value as noisy and quantised.
   */
  getPositionMs(): number;
  /** Total duration in ms, or 0 while unknown. */
  getDurationMs(): number;
  isPlaying(): boolean;
  getStatus(): AudioEngineStatus;
  release(): void;
}
