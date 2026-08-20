/**
 * One lyric line.
 *
 * Words are laid out as individual `Text` nodes inside a wrapping row rather
 * than as one string, because a per-word highlight needs per-word colour. The
 * cost is that the platform can no longer shape across word boundaries — fine
 * for the scripts in scope, and it would need revisiting for anything with
 * cursive joining, which is why `docs/DECISIONS.md` records it.
 *
 * Trailing spaces come from the parser rather than being inserted here: the
 * eLRC source knows whether two tokens were separated, and inventing a space
 * would corrupt languages that mark word boundaries differently.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LyricLine } from '@/lyrics/elrc/types';

import { COLORS, FONT_BOLD, FONT_REGULAR, TYPE } from './theme';

export type LyricEmphasis = 'active' | 'next' | 'past' | 'secondary';

export interface LyricLineViewProps {
  readonly line: LyricLine | undefined;
  readonly emphasis: LyricEmphasis;
  /** Index of the word being sung. Only used when emphasis is `active`. */
  readonly activeWordIndex?: number | null;
  readonly testID?: string;
}

const SIZE: Record<LyricEmphasis, number> = {
  active: TYPE.lyric,
  next: TYPE.lyricNext,
  past: TYPE.lyricPast,
  secondary: TYPE.lyricSecondary,
};

const COLOR: Record<LyricEmphasis, string> = {
  active: COLORS.lyricActive,
  next: COLORS.lyricNext,
  past: COLORS.lyricPast,
  secondary: COLORS.lyricNext,
};

function LyricLineViewImpl({
  line,
  emphasis,
  activeWordIndex = null,
  testID,
}: LyricLineViewProps): React.ReactElement | null {
  if (line === undefined) {
    return null;
  }

  const isActive = emphasis === 'active';
  const backing = line.kind === 'backing';
  const fontSize = backing ? SIZE[emphasis] * 0.72 : SIZE[emphasis];
  const baseColor = COLOR[emphasis];

  return (
    <View style={styles.row} testID={testID}>
      {line.words.map((word, index) => {
        const sung = isActive && activeWordIndex !== null && index <= activeWordIndex;
        return (
          <Text
            // Word text repeats within a line ("yebo yebo"), so the index is
            // the only stable key available.
            key={`${line.index}-${index}`}
            allowFontScaling={false}
            style={[
              styles.word,
              {
                fontSize,
                lineHeight: fontSize * 1.42,
                color: sung ? COLORS.lyricSung : baseColor,
                fontFamily: isActive && !backing ? FONT_BOLD : FONT_REGULAR,
                opacity: backing ? 0.75 : 1,
              },
            ]}
          >
            {word.text}
            {word.trailingSpace}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  word: {
    // `lineHeight` is set per-instance above. It has to be generous: Yoruba
    // stacks a tone mark over a vowel that already carries a sub-dot, and a
    // tight line box clips the mark rather than the glyph, so the text looks
    // subtly wrong instead of obviously broken.
    textAlign: 'center',
  },
});

export const LyricLineView = memo(LyricLineViewImpl);
