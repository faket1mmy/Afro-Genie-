/**
 * What fills the screen during an intro or an instrumental break.
 *
 * SPEC §5 asks for a countdown rather than a blank screen. The count alone is
 * not quite enough though — knowing that four seconds remain does not tell you
 * what to sing when they run out. So the line you are about to sing is shown
 * underneath, greyed, which turns dead air into preparation time.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { LyricLine } from '@/lyrics/elrc/types';
import type { Countdown } from '@/lyrics/LyricTimeline';

import { LyricLineView } from './LyricLineView';
import { COLORS, FONT_BOLD, FONT_REGULAR, SPACING, TYPE } from './theme';

export interface CountdownViewProps {
  readonly countdown: Countdown;
  readonly upcoming: LyricLine | undefined;
  readonly secondary?: LyricLine | undefined;
}

/**
 * Below this, a number is more distracting than useful — it would flash once
 * and vanish — so a short gap gets the upcoming line without the count.
 */
const SHOW_DIGITS_ABOVE_MS = 1_200;

export function CountdownView({
  countdown,
  upcoming,
  secondary,
}: CountdownViewProps): React.ReactElement {
  const showDigits = countdown.remainingMs > SHOW_DIGITS_ABOVE_MS;

  return (
    <View style={styles.container} testID="countdown">
      {showDigits ? (
        <Text
          allowFontScaling={false}
          style={styles.digits}
          testID="countdown-digits"
        >
          {countdown.remainingSeconds}
        </Text>
      ) : (
        <Text allowFontScaling={false} style={styles.ready}>
          ready
        </Text>
      )}

      {upcoming === undefined ? null : (
        <View style={styles.upcoming}>
          <LyricLineView line={upcoming} emphasis="next" />
          {secondary === undefined ? null : (
            <View style={styles.secondary}>
              <LyricLineView line={secondary} emphasis="secondary" />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  digits: {
    fontFamily: FONT_BOLD,
    fontSize: 64,
    lineHeight: 74,
    color: COLORS.accent,
  },
  ready: {
    fontFamily: FONT_BOLD,
    fontSize: 30,
    lineHeight: 40,
    letterSpacing: 6,
    color: COLORS.accent,
    textTransform: 'uppercase',
  },
  upcoming: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  secondary: {
    marginTop: SPACING.sm,
  },
  label: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    color: COLORS.textFaint,
  },
});
