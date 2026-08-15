/**
 * `AudioEngine` backed by `expo-audio`.
 *
 * See `docs/DECISIONS.md` for why this rather than `react-native-track-player`,
 * which SPEC §3 names. Short version: RNTP 4.1.2 is an old-architecture bridge
 * module and Expo SDK 57 ships React Native 0.86, which is New Architecture
 * only. It cannot be built into this app today.
 *
 * What matters for sync is that `AudioPlayer.currentTime` is a synchronous
 * property on a JSI shared object — reading it does not cross an async bridge
 * hop, so the wall time we pair with the reading is honest to within a few
 * hundred microseconds. That is a better foundation for ±20ms than RNTP's
 * async progress events would have been.
 */

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioSource } from 'expo-audio';

import type {
  AudioEngine,
  AudioEngineEvents,
  AudioEngineStatus,
} from './AudioEngine';

/**
 * How often expo-audio emits status events. We do not use these for position —
 * the clock reads `currentTime` directly at frame rate — but a slow trickle is
 * still wanted for load/ended transitions, and a long interval keeps the bridge
 * quiet during a performance.
 */
const STATUS_INTERVAL_MS = 500;

const LOAD_TIMEOUT_MS = 20_000;
const LOAD_POLL_MS = 25;

export class ExpoAudioEngine implements AudioEngine {
  private player: AudioPlayer | null = null;
  private status: AudioEngineStatus = 'idle';
  private events: AudioEngineEvents = {};
  private endedFired = false;

  constructor(private readonly source: AudioSource) {}

  async load(events: AudioEngineEvents = {}): Promise<void> {
    this.events = events;
    this.setStatus('loading');

    // `doNotMix` is what makes the OS hand us the lock-screen session and stop
    // other audio; without it a background podcast plays over the karaoke.
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
    });

    const player = createAudioPlayer(this.source, {
      updateInterval: STATUS_INTERVAL_MS,
    });
    this.player = player;

    player.addListener('playbackStatusUpdate', (update) => {
      if (update.didJustFinish && !this.endedFired) {
        this.endedFired = true;
        this.events.onEnded?.();
      }
    });

    try {
      await waitUntilLoaded(player);
    } catch (error) {
      this.setStatus('error');
      const wrapped =
        error instanceof Error ? error : new Error(String(error));
      this.events.onError?.(wrapped);
      throw wrapped;
    }

    this.setStatus('ready');
  }

  play(): void {
    this.endedFired = false;
    this.player?.play();
  }

  pause(): void {
    this.player?.pause();
  }

  async seekTo(positionMs: number): Promise<void> {
    const player = this.player;
    if (player === null) {
      return;
    }
    this.endedFired = false;
    // Tight tolerances: the default lets iOS land on the nearest keyframe,
    // which for AAC can be tens of milliseconds away from where we asked.
    await player.seekTo(positionMs / 1000, 0, 0);
  }

  getPositionMs(): number {
    const player = this.player;
    if (player === null) {
      return 0;
    }
    const seconds = player.currentTime;
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }

  getDurationMs(): number {
    const player = this.player;
    if (player === null) {
      return 0;
    }
    const seconds = player.duration;
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  isPlaying(): boolean {
    return this.player?.playing ?? false;
  }

  getStatus(): AudioEngineStatus {
    return this.status;
  }

  release(): void {
    this.player?.remove();
    this.player = null;
    this.setStatus('idle');
  }

  private setStatus(status: AudioEngineStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.events.onStatusChange?.(status);
  }
}

/**
 * expo-audio exposes `isLoaded` as a property rather than a promise, so there
 * is nothing to await. Polling is unglamorous but correct, and it only runs
 * during load — never during a performance.
 */
async function waitUntilLoaded(player: AudioPlayer): Promise<void> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!player.isLoaded) {
    if (Date.now() > deadline) {
      throw new Error('Timed out loading audio asset');
    }
    await delay(LOAD_POLL_MS);
  }
  if (player.duration <= 0) {
    throw new Error('Audio asset loaded with zero duration');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
