import { parseElrc } from '@/lyrics/elrc/parse';
import type { LyricDocument, LyricVariant } from '@/lyrics/elrc/types';
import {
  DURATION_TOLERANCE_MS,
  validateVariantSet,
} from '@/lyrics/elrc/validate';
import { LyricTimeline } from '@/lyrics/LyricTimeline';

import { BUNDLED_SONGS, findBundledSong } from './bundled';
import { availableVariants, isPlayableIn, lyricsFor, playableIn } from './types';
import type { Song } from './types';

const VARIANTS: readonly LyricVariant[] = [
  'original',
  'romanised',
  'translated',
];

function parseAll(song: Song): Map<LyricVariant, LyricDocument> {
  const documents = new Map<LyricVariant, LyricDocument>();
  for (const variant of VARIANTS) {
    const reference = lyricsFor(song, variant);
    if (reference === undefined) {
      continue;
    }
    documents.set(variant, parseElrc(reference.text).document);
  }
  return documents;
}

describe('bundled catalogue', () => {
  it('ships the three songs Phase 1 asks for', () => {
    expect(BUNDLED_SONGS).toHaveLength(3);
    expect(BUNDLED_SONGS.map((song) => song.id)).toEqual([
      'kaabo-si-ile',
      'sikhona-manje',
      'how-you-dey',
    ]);
  });

  it('covers a spread of languages and genres', () => {
    // Not decoration: SPEC §1 makes multi-language rendering a first-class
    // requirement, and a fixture set that is all one language would let a
    // font or shaping bug through unnoticed.
    expect(new Set(BUNDLED_SONGS.map((song) => song.primaryLanguage))).toEqual(
      new Set(['yor', 'zul', 'pcm']),
    );
    expect(new Set(BUNDLED_SONGS.flatMap((song) => song.genre))).toEqual(
      new Set(['afrobeats', 'amapiano', 'highlife']),
    );
  });

  it('marks every bundled song as a fixture', () => {
    // These are synthesised placeholders. If this ever fails, something we do
    // not have rights to has been dressed up as catalogue content.
    for (const song of BUNDLED_SONGS) {
      expect(song.isFixture).toBe(true);
    }
  });

  it('registers audio for every song', () => {
    for (const song of BUNDLED_SONGS) {
      expect(song.audio.source_ref).toBeDefined();
      expect(song.audio.format).toBe('m4a');
      expect(song.audio.loudnessLufs).toBe(-14);
    }
  });

  it('finds a song by id and returns undefined otherwise', () => {
    expect(findBundledSong('kaabo-si-ile')?.title).toBe('Káàbọ̀ Sí Ilé');
    expect(findBundledSong('not-a-song')).toBeUndefined();
  });
});

describe('rights gate', () => {
  const song = BUNDLED_SONGS[0] as Song;

  it('allows a cleared song in a cleared territory', () => {
    expect(isPlayableIn(song, 'NG')).toBe(true);
    expect(isPlayableIn(song, 'ng')).toBe(true);
  });

  it('refuses a cleared song outside its territories', () => {
    expect(isPlayableIn(song, 'JP')).toBe(false);
  });

  it.each(['pending', 'blocked'] as const)(
    'refuses a %s song even in a cleared territory',
    (rightsStatus) => {
      expect(isPlayableIn({ ...song, rightsStatus }, 'NG')).toBe(false);
    },
  );

  it('refuses a song cleared nowhere', () => {
    expect(isPlayableIn({ ...song, clearedTerritories: [] }, 'NG')).toBe(false);
  });

  it('filters a catalogue by territory', () => {
    expect(playableIn(BUNDLED_SONGS, 'NG')).toHaveLength(3);
    expect(playableIn(BUNDLED_SONGS, 'JP')).toHaveLength(0);
  });
});

describe.each(BUNDLED_SONGS)('$id lyrics', (song) => {
  const documents = parseAll(song);

  it('offers all three lyric variants', () => {
    expect(availableVariants(song)).toEqual(VARIANTS);
  });

  it.each(VARIANTS)('parses the %s variant without errors', (variant) => {
    const reference = lyricsFor(song, variant);
    expect(reference).toBeDefined();
    const { issues } = parseElrc(reference?.text ?? '');
    const errors = issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('declares the right language on each variant', () => {
    expect(documents.get('original')?.metadata.language).toBe(
      song.primaryLanguage,
    );
    expect(documents.get('romanised')?.metadata.language).toBe(
      song.primaryLanguage,
    );
    expect(documents.get('translated')?.metadata.language).toBe('eng');
  });

  it('passes the SPEC §6.8 publish gate', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents,
      audioDurationMs: song.durationMs,
    });
    expect(issues).toEqual([]);
  });

  it('keeps line indices aligned across variants', () => {
    const counts = VARIANTS.map(
      (variant) => documents.get(variant)?.lines.length ?? -1,
    );
    expect(new Set(counts).size).toBe(1);
  });

  it('has word-level timestamps on every sung line', () => {
    // SPEC §5: line-level alone is not enough for a syllable-tracking pitch
    // indicator, which is what Phase 2 will hang off these timings.
    const original = documents.get('original');
    const sung = (original?.lines ?? []).filter(
      (line) => line.kind !== 'break',
    );
    expect(sung.length).toBeGreaterThan(0);
    for (const line of sung) {
      expect(line.words.length).toBeGreaterThan(0);
      for (const word of line.words) {
        expect(word.endMs).toBeGreaterThan(word.startMs);
      }
    }
  });

  it('ends within the audio duration', () => {
    for (const [, document] of documents) {
      const end = document.lines.at(-1)?.endMs ?? 0;
      expect(end).toBeLessThanOrEqual(
        song.durationMs + DURATION_TOLERANCE_MS,
      );
    }
  });

  it('has a countdown before the first line', () => {
    // An intro that drops straight into a lyric gives the singer nowhere to
    // come in from. SPEC §5 wants a countdown rather than a blank screen.
    const original = documents.get('original');
    const timeline = new LyricTimeline(original?.lines ?? []);
    expect(timeline.stateAt(0).countdown).not.toBeNull();
  });

  it('marks its instrumental breaks', () => {
    const original = documents.get('original');
    const breaks = (original?.lines ?? []).filter(
      (line) => line.kind === 'break',
    );
    expect(breaks.length).toBeGreaterThan(0);
  });

  it('includes a backing line', () => {
    const original = documents.get('original');
    const backing = (original?.lines ?? []).filter(
      (line) => line.kind === 'backing',
    );
    expect(backing.length).toBeGreaterThan(0);
  });

  it('advances monotonically through the whole song', () => {
    const original = documents.get('original');
    const timeline = new LyricTimeline(original?.lines ?? []);
    let previousLine = -1;
    for (let ms = 0; ms <= song.durationMs; ms += 20) {
      const state = timeline.stateAt(ms);
      if (state.activeLineIndex !== null) {
        expect(state.activeLineIndex).toBeGreaterThanOrEqual(previousLine);
        previousLine = state.activeLineIndex;
      }
    }
    expect(previousLine).toBeGreaterThan(0);
  });
});

describe('diacritic integrity', () => {
  it('keeps Yoruba tone marks and sub-dots intact through the pipeline', () => {
    // SPEC §1: "Font selection must not silently drop tone marks." The font is
    // a rendering concern, but nothing renders what the data has already lost,
    // and this is the last point where we can prove the data still has it.
    const song = findBundledSong('kaabo-si-ile');
    expect(song).toBeDefined();
    const original = parseElrc(lyricsFor(song as Song, 'original')?.text ?? '')
      .document;
    const text = original.lines
      .flatMap((line) => line.words.map((word) => word.text))
      .join(' ');

    expect(text).toContain('Ẹ');
    expect(text).toContain('káàbọ̀');
    expect(text).toContain('Ọ̀rẹ́');
    expect(text).toContain('ṣé');
    expect(text).toContain('ń');
    expect(text).toContain('ọkàn');
  });

  it('parses the fixture titles with their diacritics', () => {
    expect(findBundledSong('kaabo-si-ile')?.title).toBe('Káàbọ̀ Sí Ilé');
  });
});
