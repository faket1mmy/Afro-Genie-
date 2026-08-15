/**
 * SPEC §8.5, minus what Phase 1 does not have.
 *
 * Present: lyric mode toggles, and the lyric nudge. Absent: key transposition
 * (Phase 5) and the mic check (Phase 2), neither of which is stubbed, per
 * SPEC §2.
 *
 * The nudge is here rather than buried in settings on purpose. Output latency
 * is per-route, not per-device — plugging in Bluetooth headphones changes it by
 * a hundred milliseconds or more — so the moment to correct it is the moment
 * before you sing, on the screen where you are already choosing how the lyrics
 * look.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { availableVariants } from '@/catalogue/types';
import type { Song } from '@/catalogue/types';
import {
  availableModes,
  labelForMode,
} from '@/lyrics/displayMode';
import type { LyricDisplayMode } from '@/lyrics/displayMode';
import {
  COLORS,
  FONT_BOLD,
  FONT_REGULAR,
  RADIUS,
  SPACING,
  TYPE,
} from '@/ui/theme';

/** SPEC §3 targets ±20ms, so the nudge steps in units the ear can resolve. */
const NUDGE_STEP_MS = 20;
const NUDGE_LIMIT_MS = 500;

export interface PrePerformanceScreenProps {
  readonly song: Song;
  readonly mode: LyricDisplayMode;
  readonly onChangeMode: (mode: LyricDisplayMode) => void;
  readonly lyricOffsetMs: number;
  readonly onChangeLyricOffset: (offsetMs: number) => void;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

export function PrePerformanceScreen({
  song,
  mode,
  onChangeMode,
  lyricOffsetMs,
  onChangeLyricOffset,
  onStart,
  onBack,
}: PrePerformanceScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const modes = availableModes(availableVariants(song));

  const nudge = (delta: number): void => {
    const next = clamp(
      lyricOffsetMs + delta,
      -NUDGE_LIMIT_MS,
      NUDGE_LIMIT_MS,
    );
    onChangeLyricOffset(next);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SPACING.md },
        ]}
      >
        <Pressable onPress={onBack} hitSlop={16} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>

        <Text style={styles.title}>{song.title}</Text>
        <Text style={styles.meta}>
          {song.artistName} · {song.genre.join(', ')} ·{' '}
          {song.primaryLanguage.toUpperCase()} · {song.musicalKey}
        </Text>

        <Text style={styles.sectionLabel}>Lyrics</Text>
        <View style={styles.modeRow}>
          {modes.map((option) => {
            const selected = option === mode;
            return (
              <Pressable
                key={option}
                onPress={() => onChangeMode(option)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {labelForMode(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Lyric timing</Text>
        <View style={styles.nudgeRow}>
          <Pressable
            style={styles.nudgeButton}
            onPress={() => nudge(-NUDGE_STEP_MS)}
            accessibilityRole="button"
            accessibilityLabel="Show lyrics earlier"
          >
            <Text style={styles.nudgeButtonText}>Earlier</Text>
          </Pressable>

          <View style={styles.nudgeValue}>
            <Text style={styles.nudgeNumber}>
              {lyricOffsetMs > 0 ? '+' : ''}
              {lyricOffsetMs} ms
            </Text>
            {lyricOffsetMs === 0 ? null : (
              <Pressable
                onPress={() => onChangeLyricOffset(0)}
                accessibilityRole="button"
              >
                <Text style={styles.reset}>Reset</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={styles.nudgeButton}
            onPress={() => nudge(NUDGE_STEP_MS)}
            accessibilityRole="button"
            accessibilityLabel="Show lyrics later"
          >
            <Text style={styles.nudgeButtonText}>Later</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          If the words land ahead of the music, nudge them later. Bluetooth
          headphones usually need a large positive value.
        </Text>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}
      >
        <Pressable
          style={styles.startButton}
          onPress={onStart}
          accessibilityRole="button"
        >
          <Text style={styles.startButtonText}>Start singing</Text>
        </Pressable>
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  back: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.title,
    color: COLORS.text,
  },
  meta: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    color: COLORS.textFaint,
    marginTop: SPACING.xs,
  },
  sectionLabel: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.micro,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.textFaint,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.body,
    color: COLORS.textMuted,
  },
  chipTextSelected: {
    fontFamily: FONT_BOLD,
    color: '#1A1400',
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  nudgeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  nudgeButtonText: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.body,
    color: COLORS.text,
  },
  nudgeValue: {
    flex: 1,
    alignItems: 'center',
  },
  nudgeNumber: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.heading,
    color: COLORS.text,
  },
  reset: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.micro,
    color: COLORS.accent,
    marginTop: 2,
  },
  hint: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.micro,
    color: COLORS.textFaint,
    lineHeight: 16,
    marginTop: SPACING.sm,
  },
  footer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  startButton: {
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  startButtonText: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.heading,
    color: '#1A1400',
  },
});
