import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Song } from '@/catalogue/types';
import {
  COLORS,
  FONT_BOLD,
  FONT_REGULAR,
  RADIUS,
  SPACING,
  TYPE,
} from '@/ui/theme';

export interface SongRowProps {
  readonly song: Song;
  readonly onPress: (song: Song) => void;
}

export function SongRow({ song, onPress }: SongRowProps): React.ReactElement {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(song)}
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artistName}`}
    >
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {song.artistName} · {formatDuration(song.durationMs)} · {song.bpm} bpm
        </Text>
      </View>

      <View style={styles.badges}>
        {/* The language badge is doing real work: it is how a user picks a
            song they can actually sing, and SPEC §8.3 calls for it. */}
        <Text style={styles.badge}>{song.primaryLanguage.toUpperCase()}</Text>
        {song.isFixture ? (
          <Text style={[styles.badge, styles.fixtureBadge]}>FIXTURE</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    gap: SPACING.md,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceRaised,
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.heading,
    color: COLORS.text,
  },
  meta: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    color: COLORS.textFaint,
    marginTop: 2,
  },
  badges: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  badge: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.micro,
    letterSpacing: 1,
    color: COLORS.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accentMuted,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  fixtureBadge: {
    color: COLORS.textFaint,
    borderColor: COLORS.border,
  },
});
