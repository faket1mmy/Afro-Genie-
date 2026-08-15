/**
 * The three bundled Phase 1 songs (SPEC §9).
 *
 * Metadata and lyrics come from `generated.ts`, which the fixture build script
 * writes. Audio cannot: `require()` needs a literal path, so the audio modules
 * are listed here by hand and matched to their metadata by slug. The mismatch
 * test in `bundled.test.ts` is what stops that list drifting out of step with
 * the generator.
 */

import type { LyricVariant } from '@/lyrics/elrc/types';

import { GENERATED_FIXTURES } from './generated';
import type { GeneratedFixture } from './generated';
import type { Song } from './types';

const AUDIO_MODULES: Readonly<Record<string, number>> = {
  'kaabo-si-ile': require('../../assets/songs/kaabo-si-ile/instrumental.m4a'),
  'sikhona-manje': require('../../assets/songs/sikhona-manje/instrumental.m4a'),
  'how-you-dey': require('../../assets/songs/how-you-dey/instrumental.m4a'),
};

/**
 * Where the fixtures are cleared to play.
 *
 * They are ours — synthesised by `tools/build_fixture_songs.py`, not recordings
 * of anything — so `cleared` is honest here in a way it will not be for real
 * repertoire. The territory list is the launch set rather than a wildcard,
 * because the gate is only worth building if the data exercises it, and SPEC
 * §11 has not yet settled how a territory is even determined.
 */
const FIXTURE_TERRITORIES: readonly string[] = [
  'NG',
  'GH',
  'ZA',
  'KE',
  'TZ',
  'CI',
  'SN',
  'AO',
  'MZ',
  'GB',
  'US',
  'CA',
  'FR',
  'PT',
  'BR',
];

const LANGUAGE_BY_VARIANT: Readonly<Record<LyricVariant, 'source' | 'eng'>> = {
  original: 'source',
  romanised: 'source',
  translated: 'eng',
};

function toSong(fixture: GeneratedFixture): Song {
  const audio = AUDIO_MODULES[fixture.slug];
  if (audio === undefined) {
    throw new Error(
      `No bundled audio registered for fixture '${fixture.slug}'. ` +
        'Add it to AUDIO_MODULES in bundled.ts.',
    );
  }

  const lyrics = (
    Object.keys(fixture.lyrics) as readonly LyricVariant[]
  ).map((variant) => ({
    variant,
    language:
      LANGUAGE_BY_VARIANT[variant] === 'eng' ? 'eng' : fixture.language,
    text: fixture.lyrics[variant],
  }));

  return {
    id: fixture.slug,
    title: fixture.title,
    artistName: fixture.artist,
    primaryLanguage: fixture.language,
    otherLanguages: [],
    genre: fixture.genre,
    mood: fixture.mood,
    bpm: fixture.bpm,
    musicalKey: fixture.musicalKey,
    durationMs: fixture.durationMs,
    rightsStatus: 'cleared',
    clearedTerritories: FIXTURE_TERRITORIES,
    audio: {
      kind: 'instrumental',
      source: 're_recorded',
      format: 'm4a',
      bitrate: '128k',
      sampleRate: 44_100,
      loudnessLufs: -14,
      checksum: fixture.audioChecksum,
      source_ref: audio,
    },
    lyrics,
    isFixture: true,
  };
}

export const BUNDLED_SONGS: readonly Song[] = GENERATED_FIXTURES.map(toSong);

export function findBundledSong(id: string): Song | undefined {
  return BUNDLED_SONGS.find((song) => song.id === id);
}
