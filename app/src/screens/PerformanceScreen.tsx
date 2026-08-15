/**
 * SPEC §8: "Performance screen is the product."
 *
 * Everything on it is subordinate to the lyrics. The chrome — title, progress,
 * pause — sits at the edges and stays dim; the middle two thirds are lyrics and
 * nothing else. Tapping anywhere that is not a control pauses, because reaching
 * for a small button while singing is a good way to miss a line.
 */

import { useCallback, useMemo } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Song } from '@/catalogue/types';
import type { LyricVariant } from '@/lyrics/elrc/types';
import type { AudioEngine } from '@/playback/AudioEngine';
import { usePerformanceSession } from '@/playback/usePerformanceSession';
import { LyricStage } from '@/ui/LyricStage';
import {
  COLORS,
  FONT_BOLD,
  FONT_REGULAR,
  RADIUS,
  SPACING,
  TYPE,
} from '@/ui/theme';

export interface PerformanceScreenProps {
  readonly song: Song;
  readonly createEngine: (song: Song) => AudioEngine;
  readonly primaryVariant: LyricVariant;
  readonly secondaryVariant: LyricVariant | null;
  readonly lyricOffsetMs: number;
  readonly onExit: () => void;
}

export function PerformanceScreen({
  song,
  createEngine,
  primaryVariant,
  secondaryVariant,
  lyricOffsetMs,
  onExit,
}: PerformanceScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const session = usePerformanceSession({
    song,
    createEngine,
    primaryVariant,
    secondaryVariant,
    lyricOffsetMs,
    autoPlay: true,
  });

  const { status, play, pause } = session;
  const isPlaying = status === 'playing';

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const progressWidth = useMemo(
    () =>
      session.songProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    [session.songProgress],
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + SPACING.sm, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onExit}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Leave performance"
        >
          <Text style={styles.exit}>Close</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {song.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {song.artistName}
          </Text>
        </View>
        <View style={styles.exitSpacer} />
      </View>

      <Pressable
        style={styles.stage}
        onPress={togglePlayback}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        {status === 'loading' ? (
          <Text style={styles.notice}>Loading…</Text>
        ) : status === 'error' ? (
          <Text style={[styles.notice, styles.noticeError]}>
            {session.error?.message ?? 'Could not load this song'}
          </Text>
        ) : (
          <LyricStage
            lines={session.lines}
            secondaryLines={session.secondaryLines}
            state={session.timeline}
          />
        )}
      </Pressable>

      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[styles.progressFill, { width: progressWidth }]}
          />
        </View>

        <View style={styles.controls}>
          <Text style={styles.status}>
            {status === 'finished'
              ? 'Finished'
              : status === 'paused'
                ? 'Paused'
                : status === 'playing'
                  ? song.isFixture
                    ? 'Fixture track'
                    : ''
                  : ''}
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={
              status === 'finished' ? session.restart : togglePlayback
            }
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {status === 'finished'
                ? 'Sing again'
                : isPlaying
                  ? 'Pause'
                  : 'Play'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  exit: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    color: COLORS.textMuted,
    width: 52,
  },
  exitSpacer: {
    width: 52,
  },
  title: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.body,
    color: COLORS.text,
  },
  artist: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.micro,
    color: COLORS.textFaint,
  },
  stage: {
    flex: 1,
  },
  notice: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.heading,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
  noticeError: {
    color: COLORS.danger,
  },
  footer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  progressTrack: {
    height: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.accent,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  status: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.micro,
    color: COLORS.textFaint,
    flex: 1,
  },
  primaryButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.body,
    color: '#1A1400',
  },
});
