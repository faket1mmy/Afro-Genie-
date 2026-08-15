/**
 * Runs the real playback loop on the real device and reports how well the clock
 * is tracking.
 *
 * The ±20ms budget in SPEC §3 is verified in CI against a simulator, which is
 * the only way to get a repeatable number. This is the other half: the same
 * loop, on actual hardware, with actual audio. It cannot see output latency —
 * `SyncProbe` explains why at length — so read it as "is the lyric engine
 * behaving", not "are the lyrics in time".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Song } from '@/catalogue/types';
import type { AudioEngine } from '@/playback/AudioEngine';
import { monotonicNowMs } from '@/playback/clock';
import { PlaybackClock } from '@/playback/PlaybackClock';
import type { PlaybackClockStats } from '@/playback/PlaybackClock';
import { SyncProbe } from '@/playback/SyncProbe';
import type { SyncProbeSummary } from '@/playback/SyncProbe';
import { OBSERVE_INTERVAL_MS } from '@/playback/usePerformanceSession';
import {
  COLORS,
  FONT_BOLD,
  FONT_REGULAR,
  RADIUS,
  SPACING,
  TYPE,
} from '@/ui/theme';

/** SPEC §3. */
const SYNC_BUDGET_MS = 20;
/** Refreshing the numbers faster than this just makes them unreadable. */
const SUMMARY_INTERVAL_MS = 400;

export interface SyncDiagnosticsScreenProps {
  readonly songs: readonly Song[];
  readonly createEngine: (song: Song) => AudioEngine;
  readonly onBack: () => void;
}

export function SyncDiagnosticsScreen({
  songs,
  createEngine,
  onBack,
}: SyncDiagnosticsScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [songIndex, setSongIndex] = useState(0);
  const song = songs[songIndex];

  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SyncProbeSummary | null>(null);
  const [stats, setStats] = useState<PlaybackClockStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);
  const clockRef = useRef(new PlaybackClock());
  const probeRef = useRef(new SyncProbe());
  const frameRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    engineRef.current?.release();
    engineRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (song === undefined) {
      return;
    }
    stop();
    setError(null);
    probeRef.current.reset();
    setSummary(null);

    const engine = createEngine(song);
    engineRef.current = engine;
    const clock = new PlaybackClock();
    clockRef.current = clock;

    try {
      await engine.load();
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
      return;
    }

    engine.play();
    clock.start(engine.getPositionMs(), monotonicNowMs());
    setRunning(true);

    let nextObserveAt = 0;
    let nextSummaryAt = 0;

    const step = (frameTimeMs: number): void => {
      if (engineRef.current === null) {
        return;
      }
      if (frameTimeMs >= nextObserveAt) {
        const reported = engine.getPositionMs();
        const readAt = monotonicNowMs();
        const predicted = clock.positionAt(readAt);
        probeRef.current.observe(predicted, reported);
        clock.observe(reported, readAt);
        nextObserveAt = frameTimeMs + OBSERVE_INTERVAL_MS;
      }

      probeRef.current.frame(clock.positionAt(frameTimeMs));

      if (frameTimeMs >= nextSummaryAt) {
        setSummary(probeRef.current.summary());
        setStats(clock.stats());
        nextSummaryAt = frameTimeMs + SUMMARY_INTERVAL_MS;
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
  }, [createEngine, song, stop]);

  const withinBudget =
    summary !== null && summary.maxAbsResidualMs < SYNC_BUDGET_MS;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + SPACING.md,
          paddingBottom: insets.bottom + SPACING.xl,
        },
      ]}
    >
      <Pressable onPress={onBack} hitSlop={16} accessibilityRole="button">
        <Text style={styles.back}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Sync diagnostics</Text>
      <Text style={styles.blurb}>
        Runs the playback loop and measures how far the lyric clock sits from
        the position the audio player reports. It cannot measure output latency
        — that happens after the last point this code can see — so use the
        lyric nudge for that.
      </Text>

      <View style={styles.songPicker}>
        {songs.map((candidate, index) => {
          const selected = index === songIndex;
          return (
            <Pressable
              key={candidate.id}
              onPress={() => setSongIndex(index)}
              disabled={running}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: running }}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {candidate.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.runButton}
        onPress={running ? stop : start}
        accessibilityRole="button"
      >
        <Text style={styles.runButtonText}>
          {running ? 'Stop' : 'Run measurement'}
        </Text>
      </Pressable>

      {error === null ? null : (
        <Text style={styles.error}>{error}</Text>
      )}

      {summary === null ? null : (
        <View style={styles.results}>
          <Metric
            label="Peak residual"
            value={`${summary.maxAbsResidualMs.toFixed(1)} ms`}
            tone={withinBudget ? 'good' : 'bad'}
          />
          <Metric
            label="95th percentile"
            value={`${summary.p95AbsResidualMs.toFixed(1)} ms`}
          />
          <Metric
            label="Mean"
            value={`${summary.meanAbsResidualMs.toFixed(1)} ms`}
          />
          <Metric
            label="Bias"
            value={`${summary.biasMs > 0 ? '+' : ''}${summary.biasMs.toFixed(1)} ms`}
          />
          <Metric
            label="Backwards steps"
            value={`${summary.maxBackwardsStepMs.toFixed(1)} ms`}
            tone={summary.maxBackwardsStepMs > 0 ? 'bad' : 'good'}
          />
          <Metric label="Samples" value={String(summary.sampleCount)} />

          {stats === null ? null : (
            <>
              <Metric
                label="Hard resyncs"
                value={String(stats.hardResyncCount)}
                tone={stats.hardResyncCount > 0 ? 'bad' : 'good'}
              />
              <Metric
                label="Rejected readings"
                value={String(stats.outlierCount)}
              />
              <Metric
                label="Estimated clock rate"
                value={stats.rate.toFixed(6)}
              />
            </>
          )}

          <Text style={styles.verdict}>
            {withinBudget
              ? `Inside the ${SYNC_BUDGET_MS}ms budget.`
              : `Outside the ${SYNC_BUDGET_MS}ms budget — the clock is not tracking this device's player.`}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'good' | 'bad';
}): React.ReactElement {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'good' && styles.metricGood,
          tone === 'bad' && styles.metricBad,
        ]}
      >
        {value}
      </Text>
    </View>
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
  blurb: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    lineHeight: 20,
    color: COLORS.textFaint,
    marginTop: SPACING.sm,
  },
  songPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
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
    fontSize: TYPE.label,
    color: COLORS.textMuted,
  },
  chipTextSelected: {
    fontFamily: FONT_BOLD,
    color: '#1A1400',
  },
  runButton: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  runButtonText: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.body,
    color: COLORS.text,
  },
  error: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.body,
    color: COLORS.danger,
    marginTop: SPACING.md,
  },
  results: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  metric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  metricLabel: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.body,
    color: COLORS.textMuted,
  },
  metricValue: {
    fontFamily: FONT_BOLD,
    fontSize: TYPE.body,
    color: COLORS.text,
  },
  metricGood: {
    color: COLORS.good,
  },
  metricBad: {
    color: COLORS.danger,
  },
  verdict: {
    fontFamily: FONT_REGULAR,
    fontSize: TYPE.label,
    lineHeight: 20,
    color: COLORS.textFaint,
    paddingVertical: SPACING.md,
  },
});
