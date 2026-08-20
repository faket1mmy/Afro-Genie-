/**
 * SPEC §2: "Lyric display modes: original / romanised / translated / dual-line".
 *
 * The modes exist to serve the requirement in SPEC §1 — someone who speaks no
 * Yoruba should still be able to sing a Yoruba song. That splits into two
 * different needs, which is why romanised and translated are separate modes
 * rather than one "help me" toggle: romanised tells you *how to say it*,
 * translated tells you *what it means*, and a singer mid-verse wants the first.
 *
 * Dual mode therefore pairs the original with the romanisation by default: the
 * two things you need while actually singing. Reading the meaning is a
 * before-or-after activity, and putting three lines on screen at once costs the
 * legibility SPEC §8 asks for.
 */

import type { LyricVariant } from './elrc/types';

export type LyricDisplayMode =
  | 'original'
  | 'romanised'
  | 'translated'
  | 'dual';

export const LYRIC_DISPLAY_MODES: readonly LyricDisplayMode[] = [
  'original',
  'romanised',
  'translated',
  'dual',
];

export interface VariantSelection {
  readonly primary: LyricVariant;
  readonly secondary: LyricVariant | null;
}

export function variantsForMode(mode: LyricDisplayMode): VariantSelection {
  switch (mode) {
    case 'original':
      return { primary: 'original', secondary: null };
    case 'romanised':
      return { primary: 'romanised', secondary: null };
    case 'translated':
      return { primary: 'translated', secondary: null };
    case 'dual':
      return { primary: 'original', secondary: 'romanised' };
  }
}

export function labelForMode(mode: LyricDisplayMode): string {
  switch (mode) {
    case 'original':
      return 'Original';
    case 'romanised':
      return 'Phonetic';
    case 'translated':
      return 'English';
    case 'dual':
      return 'Both';
  }
}

/**
 * Modes a given song can actually offer. A song with no romanisation must not
 * present a phonetic toggle that renders nothing.
 */
export function availableModes(
  variants: readonly LyricVariant[],
): readonly LyricDisplayMode[] {
  const has = (variant: LyricVariant): boolean => variants.includes(variant);
  return LYRIC_DISPLAY_MODES.filter((mode) => {
    const selection = variantsForMode(mode);
    if (!has(selection.primary)) {
      return false;
    }
    return selection.secondary === null || has(selection.secondary);
  });
}
