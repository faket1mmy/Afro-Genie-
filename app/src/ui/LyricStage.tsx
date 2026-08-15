/**
 * The centre of the performance screen: the line being sung, the one before it
 * and the one after.
 *
 * SPEC §8 is specific about the hierarchy — active line clearly dominant, next
 * line visible — so the three slots have fixed positions rather than scrolling
 * freely. A fixed frame is easier to read at arm's length than a moving one:
 * the singer's eye learns where the current line lives and stops hunting for it.
 *
 * Between lines the last-sung line stays in the active slot rather than
 * blanking. Blanking makes the screen flicker between every line of a fast
 * verse, and the singer loses their place in the very gap where they most need
 * to see what is coming.
 */

import { StyleSheet, View } from 'react-native';

import type { LyricLine } from '@/lyrics/elrc/types';
import type { TimelineState } from '@/lyrics/LyricTimeline';

import { CountdownView } from './CountdownView';
import { LyricLineView } from './LyricLineView';
import { COLORS, SPACING } from './theme';

export interface LyricStageProps {
  readonly lines: readonly LyricLine[];
  /** Aligned by line index with `lines`; rendered under the active line. */
  readonly secondaryLines: readonly LyricLine[] | null;
  readonly state: TimelineState;
}

export function LyricStage({
  lines,
  secondaryLines,
  state,
}: LyricStageProps): React.ReactElement {
  const focusIndex = state.activeLineIndex ?? previousSungIndex(lines, state);
  const focus = focusIndex === null ? undefined : lines[focusIndex];
  const isSinging = state.activeLineIndex !== null;

  const nextIndex = state.nextLineIndex;
  const next = nextIndex === null ? undefined : lines[nextIndex];
  const previous =
    focusIndex === null ? undefined : previousSung(lines, focusIndex);

  const secondary =
    secondaryLines === null || focusIndex === null
      ? undefined
      : secondaryLines[focusIndex];

  return (
    <View style={styles.container}>
      <View style={styles.pastSlot}>
        <LyricLineView line={previous} emphasis="past" testID="lyric-past" />
      </View>

      <View style={styles.activeSlot}>
        {state.countdown !== null ? (
          <CountdownView
            countdown={state.countdown}
            upcoming={next}
            secondary={
              secondaryLines === null || nextIndex === null
                ? undefined
                : secondaryLines[nextIndex]
            }
          />
        ) : (
          <>
            <LyricLineView
              line={focus}
              emphasis="active"
              activeWordIndex={isSinging ? state.activeWordIndex : null}
              testID="lyric-active"
            />
            {secondary === undefined ? null : (
              <View style={styles.secondary}>
                <LyricLineView
                  line={secondary}
                  emphasis="secondary"
                  testID="lyric-secondary"
                />
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.nextSlot}>
        {state.countdown === null ? (
          <LyricLineView line={next} emphasis="next" testID="lyric-next" />
        ) : null}
      </View>
    </View>
  );
}

function previousSungIndex(
  lines: readonly LyricLine[],
  state: TimelineState,
): number | null {
  const limit = state.nextLineIndex ?? lines.length;
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (lines[index]?.kind !== 'break') {
      return index;
    }
  }
  return null;
}

function previousSung(
  lines: readonly LyricLine[],
  before: number,
): LyricLine | undefined {
  for (let index = before - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line !== undefined && line.kind !== 'break') {
      return line;
    }
  }
  return undefined;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  pastSlot: {
    minHeight: 40,
    justifyContent: 'flex-end',
    paddingBottom: SPACING.md,
  },
  activeSlot: {
    minHeight: 170,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.lg,
  },
  secondary: {
    marginTop: SPACING.md,
  },
  nextSlot: {
    minHeight: 60,
    justifyContent: 'flex-start',
    paddingTop: SPACING.md,
  },
});
