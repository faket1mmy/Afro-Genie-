import {
  availableModes,
  labelForMode,
  LYRIC_DISPLAY_MODES,
  variantsForMode,
} from './displayMode';
import type { LyricVariant } from './elrc/types';

const ALL: readonly LyricVariant[] = ['original', 'romanised', 'translated'];

describe('variantsForMode', () => {
  it('maps single-variant modes to themselves with no secondary', () => {
    expect(variantsForMode('original')).toEqual({
      primary: 'original',
      secondary: null,
    });
    expect(variantsForMode('romanised')).toEqual({
      primary: 'romanised',
      secondary: null,
    });
    expect(variantsForMode('translated')).toEqual({
      primary: 'translated',
      secondary: null,
    });
  });

  it('pairs the original with the romanisation in dual mode', () => {
    // The pairing matters: mid-verse a singer needs to know how to say the
    // words, not what they mean.
    expect(variantsForMode('dual')).toEqual({
      primary: 'original',
      secondary: 'romanised',
    });
  });

  it('gives every mode a label', () => {
    for (const mode of LYRIC_DISPLAY_MODES) {
      expect(labelForMode(mode).length).toBeGreaterThan(0);
    }
  });
});

describe('availableModes', () => {
  it('offers everything when every variant exists', () => {
    expect(availableModes(ALL)).toEqual(LYRIC_DISPLAY_MODES);
  });

  it('hides modes whose variant is missing', () => {
    expect(availableModes(['original', 'translated'])).toEqual([
      'original',
      'translated',
    ]);
  });

  it('hides dual mode when the romanisation is missing', () => {
    // Otherwise the toggle is there and the second line renders empty.
    expect(availableModes(['original', 'translated'])).not.toContain('dual');
  });

  it('offers dual mode as soon as both halves exist', () => {
    expect(availableModes(['original', 'romanised'])).toContain('dual');
  });

  it('returns nothing for a song with no lyrics at all', () => {
    expect(availableModes([])).toEqual([]);
  });
});
