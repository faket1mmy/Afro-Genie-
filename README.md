# Afro-Genie

A mobile-first karaoke app with a catalogue weighted toward African music.
Build specification: [`SPEC.md`](./SPEC.md).

**Status: Phase 1 (playback spine) complete.** Phases 2–5 are not started. See
[Where this stands](#where-this-stands).

---

## What works today

Pick one of three bundled songs, and it plays with lyrics that scroll in time,
highlight word by word, count down through the intro and instrumental breaks,
and can show the original, a phonetic romanisation, an English translation, or
the original and romanisation together.

No microphone, no scoring, no backend, no downloads — those are Phases 2 and 3.

## Repository layout

```
app/          React Native (Expo SDK 57) client
  src/
    lyrics/     eLRC parser, validator, runtime timeline
    playback/   sync clock, audio engine adapters, test harness
    catalogue/  song model and the bundled fixtures
    screens/    home, pre-performance, performance, diagnostics
    ui/         lyric rendering and theme
  assets/songs/ generated fixture audio and lyrics
tools/        fixture song generator and its song descriptions
docs/         format spec and decision log
```

## Running it

```bash
cd app
npm install
npm start          # then open in a dev build — not Expo Go, native modules
```

`expo-audio` is a native module, so Expo Go will not run this. Use
`npx expo run:android` / `run:ios`, or a development build.

```bash
npm test           # 218 tests
npm run typecheck  # tsc --noEmit, strict
npm run lint
npm run check      # all three
npm run sync:report   # prints the measured drift table
```

## Rebuilding the fixture songs

The bundled audio and lyrics are generated. To change a fixture, edit its
description in `tools/fixtures/` and regenerate — never hand-edit the outputs,
because the point of generating both from one description is that their timings
cannot drift apart.

```bash
python3 tools/build_fixture_songs.py --ffmpeg /path/to/ffmpeg
```

Needs ffmpeg with the AAC encoder and the `loudnorm` filter. Writes audio,
three lyric variants and a manifest per song, plus the generated TypeScript
module the app imports.

**These are synthesised placeholders, not catalogue music.** Nothing is
licensed. Every bundled song carries `isFixture: true`, the UI badges it, and a
test asserts it.

---

## The interesting part: sync

SPEC §3 sets one hard constraint — lyrics in time to ±20ms for a whole song, or
users perceive them as wrong.

No native player gives you a trustworthy position at frame rate. ExoPlayer
quantises, AVPlayer snaps to buffer boundaries, and every read competes with
whatever else the JS thread is doing. Rendering straight off those reads
produces lyrics that stutter and jump backwards.

So `PlaybackClock` runs a local model of the song position and steers it with
native readings the way a PLL steers an oscillator. Small errors are corrected
by briefly running fast or slow, always below the rate that would let the
position move backwards. Large ones jump — forward on one reading, backward only
after several agree, because rewinding lyrics reads as a bug where skipping them
does not.

Everything above the audio module is pure TypeScript, which is what makes the
budget measurable in CI rather than only on a handset. `SimulatedAudioEngine`
reproduces quantisation, jitter, crystal drift and buffer stalls; `SyncHarness`
runs a four-minute song against it in milliseconds.

Measured drift, worst case over a four-minute song:

| Profile | Peak | p95 | Mean | Rewinds |
|---|---|---|---|---|
| Flagship / wired | 3.4ms | 3.4ms | 1.8ms | 0 |
| Mid-range Android | 6.2ms | 4.4ms | 1.8ms | 0 |
| Bluetooth (+150ppm) | 5.8ms | 3.6ms | 1.5ms | 0 |
| Bluetooth (−150ppm) | 6.5ms | 3.4ms | 1.4ms | 0 |
| Noisy / loaded JS thread | 13.6ms | 9.3ms | 3.9ms | 0 |
| Sparse position reads (1 Hz) | 8.1ms | 5.6ms | 2.7ms | 0 |

Reproduce with `npm run sync:report`.

**What this does not measure: output latency.** The gap between the position a
player reports and the sound leaving the speaker is invisible to anything
JavaScript can observe, and over Bluetooth it can be hundreds of milliseconds.
That is a *calibration* problem, not a tracking one. SPEC §7 makes measuring it
a Phase 2 requirement; until then the pre-performance screen has a manual lyric
nudge, and the in-app **Sync diagnostics** screen reports the tracking half on
real hardware.

---

## Where this stands

Phase 1's exit criterion (SPEC §9) is "a song plays with lyrics that stay in
time to ±20ms for its full duration".

**Met, with one caveat stated plainly.** The engine holds the budget with
margin across six simulated device profiles, and the app bundles and runs.
Nobody has yet run it on a physical handset — no device was available in the
environment this was built in — so the on-device figure is unmeasured. The
diagnostics screen exists to produce it in one tap, and it is the first thing
to do before Phase 2.

Not started: mic capture and scoring (Phase 2), backend and catalogue
(Phase 3), ingestion tooling (Phase 4), polish (Phase 5).

Deviations from the spec and the reasoning behind them are in
[`docs/DECISIONS.md`](./docs/DECISIONS.md). The lyric format is fully specified
in [`docs/LYRIC_FORMAT.md`](./docs/LYRIC_FORMAT.md).
