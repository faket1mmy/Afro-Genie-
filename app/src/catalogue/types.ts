/**
 * The client's view of the catalogue.
 *
 * These are the SPEC §4 entities, trimmed to what Phase 1 actually uses and
 * renamed to TypeScript conventions. The shape is deliberately close to the
 * database model rather than to the screens: Phase 3 replaces the bundled
 * source with the API, and the less the UI has to change at that point, the
 * better.
 *
 * `rightsStatus` and `clearedTerritories` are here from the start even though
 * nothing is licensed yet, because SPEC §4 is emphatic that retrofitting the
 * gate is how apps ship unlicensed content by accident.
 */

import type { LyricVariant } from '@/lyrics/elrc/types';

/** SPEC §4: `Song.rights_status`. */
export type RightsStatus = 'cleared' | 'pending' | 'blocked';

/** SPEC §4: `AudioAsset.kind`. Phase 1 only ever loads `instrumental`. */
export type AudioAssetKind = 'instrumental' | 'guide_vocal' | 'reference_mix';

/** SPEC §4: `AudioAsset.source`. */
export type AudioAssetSource =
  | 'licensed_instrumental'
  | 'separated'
  | 're_recorded';

export interface AudioAsset {
  readonly kind: AudioAssetKind;
  readonly source: AudioAssetSource;
  readonly format: 'm4a';
  readonly bitrate: string;
  readonly sampleRate: number;
  readonly loudnessLufs: number;
  readonly checksum: string;
  /**
   * What gets handed to the audio engine. In Phase 1 this is the module id
   * returned by `require()` for a bundled asset; from Phase 3 it becomes a
   * local file URI produced by the download manager. The engine accepts either,
   * which is the point of keeping the type this loose.
   */
  readonly source_ref: number | string;
}

export interface LyricDocumentRef {
  readonly variant: LyricVariant;
  /** ISO 639-3. `eng` for the translated variant. */
  readonly language: string;
  /** eLRC text. Phase 1 inlines it; Phase 3 reads it from the cache. */
  readonly text: string;
}

export interface Song {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  /** ISO 639-3. */
  readonly primaryLanguage: string;
  readonly otherLanguages: readonly string[];
  readonly genre: readonly string[];
  readonly mood: readonly string[];
  readonly bpm: number;
  readonly musicalKey: string;
  readonly durationMs: number;
  readonly rightsStatus: RightsStatus;
  /** ISO 3166 alpha-2. Empty means cleared nowhere. */
  readonly clearedTerritories: readonly string[];
  readonly audio: AudioAsset;
  readonly lyrics: readonly LyricDocumentRef[];
  /**
   * True for the synthesised Phase 1 placeholders. Surfaced in the UI so a
   * fixture is never mistaken for catalogue content, and asserted on in tests
   * so it cannot quietly become false for something we do not have rights to.
   */
  readonly isFixture: boolean;
}

export function lyricsFor(
  song: Song,
  variant: LyricVariant,
): LyricDocumentRef | undefined {
  return song.lyrics.find((document) => document.variant === variant);
}

export function availableVariants(song: Song): readonly LyricVariant[] {
  return song.lyrics.map((document) => document.variant);
}

/**
 * The client half of the rights gate in SPEC §4.
 *
 * The authoritative check lives on the API, which refuses to issue a download
 * URL for anything that is not `cleared` in the user's territory. This is the
 * belt to that braces: a song that slipped into a cached catalogue response
 * still must not become playable.
 *
 * `territory` is ISO 3166 alpha-2. How we determine it is still open — SPEC §11
 * lists IP geolocation, store region and user-declared as candidates — so this
 * takes it as an argument rather than reaching for a source of truth that does
 * not exist yet.
 */
export function isPlayableIn(song: Song, territory: string): boolean {
  if (song.rightsStatus !== 'cleared') {
    return false;
  }
  return song.clearedTerritories.includes(territory.toUpperCase());
}

export function playableIn(
  songs: readonly Song[],
  territory: string,
): readonly Song[] {
  return songs.filter((song) => isPlayableIn(song, territory));
}
