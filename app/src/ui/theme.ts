/**
 * Visual constants.
 *
 * The type scale is set by the performance screen's actual job, not by taste:
 * SPEC §8 says lyrics have to be legible at arm's length in a noisy room, with
 * the active line clearly dominant and the next line visible. So the active
 * line is very large, the next line is roughly half its weight, and everything
 * else gets out of the way.
 *
 * The palette is dark because that is what a phone propped on a table in a
 * dim room needs, and because a bright screen at arm's length is unpleasant to
 * sing at for three minutes.
 */

// Imported from the per-weight subpaths, not the package root. The root index
// re-exports all eighteen weights as `require`d assets, and Metro cannot
// tree-shake a require — importing it pulls 11MB of unused TTFs into the
// bundle. SPEC §1 assumes expensive, intermittent mobile data; 11MB of fonts
// nobody sees is not a rounding error on that budget.
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSans_700Bold } from '@expo-google-fonts/noto-sans/700Bold';

/**
 * Noto Sans, specifically.
 *
 * SPEC §1: "Font selection must not silently drop tone marks." The platform
 * defaults are the risk here — a font without the Latin Extended Additional
 * block renders `ẹ` as a fallback glyph or a box, and combining tone marks
 * (`ǹ`, `ọ̀`) either stack wrong or vanish. Noto covers the block and is
 * designed for exactly this class of problem, so the app bundles it rather
 * than hoping about what a given Android build ships with.
 */
export const FONTS = {
  NotoSans_400Regular,
  NotoSans_700Bold,
} as const;

export const FONT_REGULAR = 'NotoSans_400Regular';
export const FONT_BOLD = 'NotoSans_700Bold';

export const COLORS = {
  background: '#0B0B12',
  surface: '#16161F',
  surfaceRaised: '#1F1F2B',
  border: '#2A2A38',

  /** The line being sung. Deliberately the brightest thing on screen. */
  lyricActive: '#FFFFFF',
  /** Words already sung within the active line. */
  lyricSung: '#FFC94A',
  /** The line coming next. Readable, but clearly subordinate. */
  lyricNext: '#8E8EA8',
  /** The line just finished. Present for context, nearly gone. */
  lyricPast: '#4A4A5C',

  accent: '#FFC94A',
  accentMuted: '#7A6428',
  text: '#EDEDF5',
  textMuted: '#9A9AB0',
  textFaint: '#61617A',
  danger: '#FF6B6B',
  good: '#5BD98A',
} as const;

export const TYPE = {
  /** The active lyric line. */
  lyric: 34,
  /** The active line's secondary representation in dual mode. */
  lyricSecondary: 21,
  /** The next line. */
  lyricNext: 22,
  /** The line just sung. */
  lyricPast: 17,

  title: 26,
  heading: 19,
  body: 15,
  label: 13,
  micro: 11,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 36,
} as const;

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;
