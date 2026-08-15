# Decisions

Choices that departed from `SPEC.md`, or that the spec left open and the code
had to close. SPEC §10 asks that a stack decision which turns out wrong in
practice is reported rather than silently substituted — this is that report,
plus the smaller calls that a reader would otherwise have to reverse-engineer.

---

## 1. `expo-audio` instead of `react-native-track-player`

**Spec:** §3 names "`react-native-track-player` or a thin native module over
AVAudioEngine / ExoPlayer".

**What happened:** RNTP's current release, 4.1.2, is an old-architecture bridge
module — it has no `codegenConfig` and no Fabric/TurboModule surface. Expo SDK
57 ships React Native 0.86, which is New Architecture only. The module installs
from npm and then cannot be built into the app.

**What we did:** `AudioEngine` is an interface (`src/playback/AudioEngine.ts`)
with `ExpoAudioEngine` behind it. Swapping players means writing one adapter;
no sync logic touches the audio module.

**Why this is not a downgrade.** The spec's stated reason for naming RNTP was
sample-accurate position reporting. `expo-audio` is better on exactly that
axis: `AudioPlayer.currentTime` is a synchronous property on a JSI shared
object, so reading it does not cross an async bridge hop and the wall time we
pair with the reading is honest to within a few hundred microseconds. RNTP
reports position through async progress *events*, which would have meant
inferring the read time rather than knowing it.

**When to revisit:** if RNTP ships New Architecture support and we need
something it has that `expo-audio` lacks — gapless playlists and richer
lock-screen control are the likely candidates. The adapter boundary is where
that change lands.

---

## 2. The sync loop's constants came from measurement

`PlaybackClock`'s defaults are not taste. The sweep behind them is reproducible
via the profiles in `SyncHarness.test.ts`.

Two results worth recording because both are counter-intuitive:

**A short-baseline rate estimator is worse than none.** Estimating the audio
clock's rate from position readings over a 4-second window sounds obviously
right — real crystal drift is ~100ppm and would otherwise accumulate 24ms over
a four-minute song. But rate noise is roughly `2 × jitter / window`, so a
4-second window over ±8ms readings is ±4000ppm of noise on a ~100ppm quantity.
The estimate random-walked by hundreds of ppm and peak error got *worse*.

The window is now 20 seconds with a low gain. At the observation rate we
actually run (4 Hz) the proportional loop alone absorbs realistic drift and the
rate loop contributes nothing measurable; its value appears only when readings
become rare, where at one every five seconds it cuts peak error from ~14ms to
~8ms. It is a safeguard for degraded conditions, not the main mechanism.

**Resync has to be asymmetric.** The first implementation jumped whenever the
error exceeded a threshold, in either direction. Jumping *backwards* rewinds the
lyrics — text un-highlights and replays — which reads as a broken app in a way
that skipping forward does not. Forward jumps now need one reading; backward
correction only ever happens through the outlier path, which demands several
readings in agreement first.

The cost is explicit: absorbing a long freeze without rewinding takes a few
seconds at the slew ceiling. `SyncHarness.test.ts` pins both halves of that
trade so neither can be changed by accident.

---

## 3. eLRC dialect details the spec left open

Full grammar in [`LYRIC_FORMAT.md`](./LYRIC_FORMAT.md). Three decisions that
needed making:

**Repeated timestamps are rejected.** Classic LRC lets one text line carry
several timestamps as a compression trick. SPEC §5 requires line indices to
match across variants, and a line that appears at three times has no single
index — so the parser errors rather than picking an interpretation.

**Source order is authoritative; the parser never sorts.** A silent sort would
reorder one variant relative to another and desynchronise a translation from
its original. Out-of-order lines are an error, not something to fix quietly.

**`.` is the only fraction separator.** Some taggers write `mm:ss:xx`, but
`00:12:34` cannot be distinguished from `hh:mm:ss` — it is either 12.34 seconds
or 12 minutes 34 seconds. Guessing wrong misplaces a line by an hour, so the
colon form is rejected.

The spec names a `[bg:]` marker and "an instrumental-break marker" without
giving the latter a spelling. It is `[break]`, optionally `[break:mm:ss.xxx]`
when it ends the file and has no following line to run up against.

---

## 4. Bundled audio is synthesised, and labelled

SPEC §9 Phase 1 wants three songs as bundled assets. Nothing is licensed yet,
and SPEC §4 is emphatic that the rights gate exists so unlicensed audio never
reaches a device.

So `tools/build_fixture_songs.py` synthesises three instrumentals from scratch.
Every song carries `isFixture: true`, the UI badges them, and a test asserts the
flag — if it ever goes false, something we do not have rights to has been
dressed up as catalogue content.

Audio and lyrics are generated from one description, so their timings cannot
drift apart. That is what makes the ±20ms claim testable end to end: a lyric
that looks late on device means playback is late, not that someone mistyped a
timestamp.

The lyrics are short, real, common phrases in Yoruba, Zulu and Nigerian Pidgin,
chosen to exercise diacritics and rendering. They are fixtures, not repertoire,
and no claim is made that they are songs.

---

## 5. Line indices, not word indices, are what align across variants

SPEC §5 requires line-index parity. It does not require word parity, and it
must not: an English gloss rarely has the same number of words as the Yoruba it
glosses. Each variant carries its own word timings within a shared line
structure. `validateVariantSet` enforces line parity and line timing agreement
and deliberately says nothing about word counts.

---

## 6. Per-word `Text` nodes

`LyricLineView` renders each word as its own `Text` node so it can be coloured
independently. The platform can therefore not shape across word boundaries.

Fine for every script in v1 scope. It would need revisiting for anything with
cursive joining — SPEC §1 mentions Arabic-script repertoire "where relevant",
and if that becomes real this is the code to change, probably to a single
`Text` with nested `<Text>` spans.

---

## 7. No navigation library

Four screens, no deep links. Navigation is a discriminated union in `useState`
in `App.tsx`. A router would add a dependency, a native module and a set of
nesting decisions the app has not earned.

Phase 3 brings search, downloads and profile; that is the point to adopt
`expo-router`. The screens already take plain props and hold no navigation
state, so the change is confined to the shell.

---

## 8. Lyric documents are inlined into the JS bundle

The eLRC text ships as generated TypeScript strings, not as asset files. SPEC §3
is explicit that no network call and nothing slow may sit between the play
button and the first beat, and text already in the bundle cannot be late. It
also avoids teaching Metro about a `.elrc` extension for three fixture songs.

Audio stays an asset — a megabyte of AAC has no business in a JS bundle.

This is a Phase 1 arrangement. From Phase 3 lyrics come from the download cache
like everything else; `LyricDocumentRef.text` is the seam.

---

## 9. Territory is hard-coded

`App.tsx` has `TERRITORY = 'NG'`. SPEC §11 lists territory detection as an open
question that must be answered before Phase 3 — IP geolocation, store region, or
user-declared. Hard-coding keeps the rights gate exercised end to end without
pretending the question is settled, and puts the eventual answer in one place.

Relatedly: `clearedTerritories` is an explicit ISO 3166 list with no wildcard.
A "worldwide" sentinel would need to survive into Postgres, and inventing one
before the licensing model exists is how you end up with a magic value nobody
can safely remove.

---

## 10. Open questions this work did not answer

From SPEC §11, still open and now with a little more context:

- **Territory detection.** See above. Blocks Phase 3.
- **Cache eviction and a storage cap.** Untouched — Phase 1 has no downloads.
  Worth noting the fixtures are ~1.1MB per minute at AAC 128k, so a 500MB cap
  is roughly 7½ hours of material.
- **Commissioned vs house-band instrumentals.** Untouched; a licensing question,
  not an engineering one.
- **Offline entitlement expiry.** Untouched. The data model has room for it —
  nothing in the client assumes a download is permanent.

One question this work adds:

- **Output latency calibration.** SPEC §7 makes measuring the mic→speaker
  round trip a Phase 2 requirement, framed as a scoring concern. It is also a
  *lyric* concern, and the bigger one: on Bluetooth the lyrics can be hundreds
  of milliseconds out with a perfectly healthy clock. Phase 2's measurement
  should feed the lyric offset, not only the scorer. The manual nudge on the
  pre-performance screen is the stand-in until then.
