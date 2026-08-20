/**
 * SPEC §8.1, reduced to what Phase 1 has: a list of what is on the device.
 *
 * "Continue singing" needs performance history (Phase 5) and "browse by
 * language / mood" needs a catalogue bigger than three songs, so neither is
 * stubbed here — SPEC §2 asks that out-of-scope surfaces are not faked.
 *
 * The songs are run through the rights gate before they are listed rather than
 * after, so an uncleared song is never rendered at all.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playableIn } from '@/catalogue/types';
import type { Song } from '@/catalogue/types';
import {
  COLORS,
  FONT_BOLD,
  FONT_REGULAR,
  RADIUS,
  SPACING,
  TYPE,
} from '@/ui/theme';

import { SongRow } from './SongRow';

export interface HomeScreenProps {
  readonly songs: readonly Song[];
  /** ISO 3166 alpha-2. SPEC §11 has not settled how this is determined. */
  readonly territory: string;
  readonly onSelect: (song: Song) => void;
  readonly onOpenDiagnostics: () => void;
}

export function HomeScreen({
  songs,
  territory,
  onSelect,
  onOpenDiagnostics,
}: HomeScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const available = playableIn(songs, territory);
  const withheld = songs.length - available.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
      ]}
    >
      <Text style={styles.wordmark}>Afro-Genie</Text>
      <Text style={styles.subtitle}>On this device</Text>

      <View style={styles.list}>
        {available.map((song) => (
          <SongRow key={song.id} song={song} onPress={onSelect} />
        ))}
      </View>

      {available.length === 0 ? (
        <Text style={styles.empty}>
          Nothing is cleared to play in {territory.toUpperCase()} yet.
        </Text>
      ) : null}

      {withheld > 0 ? (
        <Text style={styles.withheld}>
          {withheld} {withheld === 1 ? 'song is' : 'songs are'} not cleared in{' '}
          {territory.toUpperCase()}.
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerNote}>
          These are synthesised fixture tracks built to exercise playback, not
          catalogue music.
        </Text>
        <Text
          style={styles.footerLink}
          onPress={onOpenDiagnostics}
          accessibilityRole="button"
        >
          Sync diagnostics
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.md,
  },
  wordmark: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.title,
    color: COLORS.text,
  },
  subtitle: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    color: COLORS.textFaint,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  list: {
    gap: SPACING.sm,
  },
  empty: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.body,
    color: COLORS.textMuted,
    marginTop: SPACING.lg,
  },
  withheld: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.micro,
    color: COLORS.textFaint,
    marginTop: SPACING.md,
  },
  footer: {
    marginTop: SPACING.xl,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    gap: SPACING.sm,
  },
  footerNote: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.micro,
    color: COLORS.textFaint,
    lineHeight: 16,
  },
  footerLink: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.label,
    color: COLORS.accent,
  },
});
