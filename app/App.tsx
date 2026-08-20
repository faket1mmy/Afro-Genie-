/**
 * App shell.
 *
 * Navigation is a discriminated union in `useState` rather than a router.
 * Phase 1 has four screens and no deep links, and a router would add a
 * dependency, a native module and a set of decisions about nesting that the
 * app has not earned yet. When Phase 3 brings search, downloads and profile,
 * this is the point to swap in `expo-router` — the screens already take plain
 * props and hold no navigation state of their own.
 */

import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { BUNDLED_SONGS } from '@/catalogue/bundled';
import type { Song } from '@/catalogue/types';
import { variantsForMode } from '@/lyrics/displayMode';
import type { LyricDisplayMode } from '@/lyrics/displayMode';
import { ExpoAudioEngine } from '@/playback/ExpoAudioEngine';
import type { AudioEngine } from '@/playback/AudioEngine';
import { HomeScreen } from '@/screens/HomeScreen';
import { PerformanceScreen } from '@/screens/PerformanceScreen';
import { PrePerformanceScreen } from '@/screens/PrePerformanceScreen';
import { SyncDiagnosticsScreen } from '@/screens/SyncDiagnosticsScreen';
import { COLORS, FONTS } from '@/ui/theme';

/**
 * Placeholder for the rights gate's territory input.
 *
 * SPEC §11 lists this as an open question — IP geolocation, store region or
 * user-declared — and it has to be answered before Phase 3. Hard-coding it
 * here keeps the gate exercised end to end without pretending the question is
 * settled; the constant is the one place to change when it is.
 */
const TERRITORY = 'NG';

type Route =
  | { readonly name: 'home' }
  | { readonly name: 'pre-performance'; readonly song: Song }
  | { readonly name: 'performance'; readonly song: Song }
  | { readonly name: 'diagnostics' };

export default function App(): React.ReactElement {
  const [fontsLoaded] = useFonts(FONTS);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [mode, setMode] = useState<LyricDisplayMode>('dual');
  const [lyricOffsetMs, setLyricOffsetMs] = useState(0);

  const createEngine = useCallback(
    (song: Song): AudioEngine => new ExpoAudioEngine(song.audio.source_ref),
    [],
  );

  const variants = useMemo(() => variantsForMode(mode), [mode]);

  if (!fontsLoaded) {
    // Rendering lyrics in a fallback font for even one frame is the exact
    // failure SPEC §1 warns about — tone marks silently dropped — so the app
    // waits rather than flashing text it cannot render correctly.
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {route.name === 'home' ? (
          <HomeScreen
            songs={BUNDLED_SONGS}
            territory={TERRITORY}
            onSelect={(song) => setRoute({ name: 'pre-performance', song })}
            onOpenDiagnostics={() => setRoute({ name: 'diagnostics' })}
          />
        ) : null}

        {route.name === 'pre-performance' ? (
          <PrePerformanceScreen
            song={route.song}
            mode={mode}
            onChangeMode={setMode}
            lyricOffsetMs={lyricOffsetMs}
            onChangeLyricOffset={setLyricOffsetMs}
            onStart={() =>
              setRoute({ name: 'performance', song: route.song })
            }
            onBack={() => setRoute({ name: 'home' })}
          />
        ) : null}

        {route.name === 'performance' ? (
          <PerformanceScreen
            song={route.song}
            createEngine={createEngine}
            primaryVariant={variants.primary}
            secondaryVariant={variants.secondary}
            lyricOffsetMs={lyricOffsetMs}
            onExit={() =>
              setRoute({ name: 'pre-performance', song: route.song })
            }
          />
        ) : null}

        {route.name === 'diagnostics' ? (
          <SyncDiagnosticsScreen
            songs={BUNDLED_SONGS}
            createEngine={createEngine}
            onBack={() => setRoute({ name: 'home' })}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
