/**
 * An `AudioEngine` that behaves like a real one behaves badly.
 *
 * A perfect fake proves nothing. This one reproduces the four things that
 * actually break lyric sync on real hardware:
 *
 * - **Quantisation.** ExoPlayer reports position in steps, not continuously.
 *   Between steps it returns the same number, so a naive renderer freezes and
 *   then jumps.
 * - **Jitter.** The moment a reading is taken is not the moment it describes.
 * - **Crystal drift.** The audio device clock and the JS clock are not the same
 *   oscillator. Bluetooth output is routinely ~100ppm off, which is enough to
 *   blow the ±20ms budget over a single song.
 * - **Stalls.** Buffer underruns and OS suspension freeze the audio clock for a
 *   stretch, then it resumes — from where it stopped, not where it would have
 *   been.
 *
 * The engine is driven by an explicit wall clock (`tick`), never a real timer,
 * so tests are deterministic and a four-minute song simulates in milliseconds.
 */

import type {
  AudioEngine,
  AudioEngineEvents,
  AudioEngineStatus,
} from './AudioEngine';

export interface SimulatedAudioOptions {
  readonly durationMs: number;
  /**
   * Audio clock rate relative to wall time. 1.0001 is +100ppm — a realistic
   * Bluetooth headset.
   */
  readonly clockRate?: number;
  /** Reported position snaps to a multiple of this. */
  readonly quantumMs?: number;
  /**
   * How the reported position snaps to `quantumMs`.
   *
   * `round` is the default because it matches what the players we actually
   * target do: both ExoPlayer's `AudioTrackPositionTracker` and AVPlayer fit a
   * smoothed linear model to the audio hardware's frame counter, so the value
   * they hand back straddles the truth rather than trailing it.
   *
   * `floor` models a dumber player that truncates. It is worth testing because
   * it produces a systematic −quantum/2 lag, and a systematic lag is a
   * *calibration* problem, not a tracking one — see the test that pins this.
   */
  readonly quantiseMode?: 'round' | 'floor';
  /** Peak symmetric noise added to each reading, ms. */
  readonly jitterMs?: number;
  /** Fixed bias in reported position, ms. Models a reporting offset. */
  readonly biasMs?: number;
  /** Deterministic PRNG seed for the jitter. */
  readonly seed?: number;
  /** Windows of wall time during which the audio clock freezes. */
  readonly stalls?: readonly StallWindow[];
}

export interface StallWindow {
  readonly atMs: number;
  readonly durationMs: number;
}

const DEFAULTS = {
  clockRate: 1,
  quantumMs: 0,
  quantiseMode: 'round',
  jitterMs: 0,
  biasMs: 0,
  seed: 1,
} as const;

export class SimulatedAudioEngine implements AudioEngine {
  private readonly options: Required<Omit<SimulatedAudioOptions, 'stalls'>> & {
    readonly stalls: readonly StallWindow[];
  };

  private status: AudioEngineStatus = 'idle';
  private events: AudioEngineEvents = {};
  private playing = false;

  /** True position in the audio stream, ms. */
  private truePositionMs = 0;
  private lastTickMs = 0;
  private random: () => number;
  private ended = false;

  constructor(options: SimulatedAudioOptions) {
    this.options = { ...DEFAULTS, stalls: [], ...options };
    this.random = mulberry32(this.options.seed);
  }

  async load(events: AudioEngineEvents = {}): Promise<void> {
    this.events = events;
    this.setStatus('loading');
    this.setStatus('ready');
  }

  play(): void {
    this.playing = true;
    this.ended = false;
  }

  pause(): void {
    this.playing = false;
  }

  async seekTo(positionMs: number): Promise<void> {
    this.truePositionMs = clamp(positionMs, 0, this.options.durationMs);
    this.ended = false;
  }

  getPositionMs(): number {
    const { quantumMs, quantiseMode, jitterMs, biasMs } = this.options;
    const noise = jitterMs === 0 ? 0 : (this.random() * 2 - 1) * jitterMs;
    const reported = this.truePositionMs + biasMs + noise;
    const bounded = clamp(reported, 0, this.options.durationMs);
    if (quantumMs <= 0) {
      return bounded;
    }
    const snap = quantiseMode === 'floor' ? Math.floor : Math.round;
    return snap(bounded / quantumMs) * quantumMs;
  }

  getDurationMs(): number {
    return this.options.durationMs;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getStatus(): AudioEngineStatus {
    return this.status;
  }

  release(): void {
    this.playing = false;
    this.setStatus('idle');
  }

  // --- simulation controls -------------------------------------------------

  /** Advances the simulation to wall time `atMs`. */
  tick(atMs: number): void {
    const elapsed = atMs - this.lastTickMs;
    if (elapsed <= 0) {
      this.lastTickMs = atMs;
      return;
    }
    if (this.playing) {
      const stalled = this.stalledMsWithin(this.lastTickMs, atMs);
      const running = Math.max(0, elapsed - stalled);
      this.truePositionMs = Math.min(
        this.options.durationMs,
        this.truePositionMs + running * this.options.clockRate,
      );
      if (this.truePositionMs >= this.options.durationMs && !this.ended) {
        this.ended = true;
        this.playing = false;
        this.events.onEnded?.();
      }
    }
    this.lastTickMs = atMs;
  }

  /** The position the listener is actually hearing — ground truth for tests. */
  getTruePositionMs(): number {
    return this.truePositionMs;
  }

  private stalledMsWithin(fromMs: number, toMs: number): number {
    let total = 0;
    for (const stall of this.options.stalls) {
      const start = Math.max(fromMs, stall.atMs);
      const end = Math.min(toMs, stall.atMs + stall.durationMs);
      if (end > start) {
        total += end - start;
      }
    }
    return total;
  }

  private setStatus(status: AudioEngineStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.events.onStatusChange?.(status);
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Small, fast, seedable PRNG. Deterministic across platforms. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
