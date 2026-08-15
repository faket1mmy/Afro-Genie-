# Karaoke App — Build Specification

> Paste this file into your repo root as `SPEC.md` (or `CLAUDE.md`) and point Claude Code at it. It is written to be read by a coding agent: scope is explicit, decisions are made rather than listed as options, and out-of-scope items are named so the agent doesn't wander.

---

## 1. Product summary

A mobile-first karaoke application with a catalogue weighted toward African music (Afrobeats, Amapiano, highlife, gospel, Francophone and Lusophone African repertoire), but architecturally catalogue-agnostic.

A user picks a song, hears the instrumental, sees lyrics scroll in time, sings into the device mic, and gets a score plus an optional recording they can keep or share.

**Primary platform:** iOS + Android via one codebase.
**Secondary:** responsive web player (Phase 3, not v1).

### What makes this different from generic karaoke apps

These should be treated as first-class requirements, not nice-to-haves:

1. **Multi-language lyric rendering.** Yoruba, Igbo, Pidgin, Swahili, Zulu, French, Portuguese, Arabic-script where relevant. Diacritics must render correctly (ẹ, ọ, ṣ, ǹ, ń). Font selection must not silently drop tone marks.
2. **Transliteration + translation toggle.** A user who speaks no Yoruba should still be able to sing a Yoruba song. Each lyric line can carry up to three parallel representations: original script, romanised/phonetic, and English gloss.
3. **Low-bandwidth and offline-first.** Assume expensive, intermittent mobile data. Songs are downloaded once and cached; playback never streams during a performance.
4. **Cheap devices.** Target a mid-range Android from ~2021 as the floor. No effect should require more than modest CPU headroom.

---

## 2. v1 scope

### In scope

- Browse and search catalogue (by song, artist, language, genre, mood)
- Song detail page → download for offline use
- Karaoke playback: instrumental audio + time-synced scrolling lyrics + countdown intro
- Mic capture with live pitch feedback (a moving indicator against the target note line)
- Post-performance score and breakdown
- Optional local recording of the performance (audio only), saved to device
- Lyric display modes: original / romanised / translated / dual-line
- Basic user account (email + OTP), favourites, performance history
- Admin ingestion pipeline (internal, not user-facing) — see §6

### Explicitly out of scope for v1

Do not build these; do not stub UI for them:

- Duets, multiplayer, or live rooms
- Video recording or video backgrounds
- Social feed, comments, following
- In-app purchases or subscription billing (design the data model to allow it; ship nothing)
- Web player
- Real-time vocal effects (reverb, autotune)
- Automatic lyric transcription from audio

---

## 3. Architecture

```
┌─────────────────────────────────────────┐
│  Mobile client (React Native / Expo)    │
│  - Playback engine (native audio)       │
│  - Lyric renderer                       │
│  - Pitch detection (on-device)          │
│  - Local cache (SQLite + filesystem)    │
└──────────────┬──────────────────────────┘
               │ REST/JSON, signed URLs
┌──────────────▼──────────────────────────┐
│  API (Python, FastAPI)                  │
│  - Catalogue, auth, entitlements        │
│  - Issues signed download URLs          │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
┌────▼──────┐    ┌────────▼─────────────┐
│ Postgres  │    │ Object storage (R2)  │
│ metadata  │    │ audio + lyric assets │
└───────────┘    └──────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Offline ingestion worker (Python)      │
│  - Stem separation, loudness norm,      │
│    lyric timing tools, QC               │
│  Runs on our infra, never at request    │
│  time                                   │
└─────────────────────────────────────────┘
```

### Stack decisions (made — don't re-litigate)

| Layer | Choice | Why |
|---|---|---|
| Client | React Native + Expo (dev build, not Expo Go) | One codebase; native modules needed for audio |
| Audio playback | `react-native-track-player` or a thin native module over AVAudioEngine / ExoPlayer | Needs sample-accurate position reporting |
| Mic + DSP | Native module exposing a PCM stream to a JS-side or native pitch tracker | JS-only mic capture is too laggy |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic | Same language as the audio/ML pipeline |
| DB | PostgreSQL 16 | — |
| Storage | S3-compatible; Cloudflare R2 preferred | Zero egress fees matter at African data volumes |
| Ingestion | Python; Demucs (htdemucs) for separation, ffmpeg, pyloudnorm | — |
| Auth | Email OTP; no passwords in v1 | Fewer support burdens |

### The one hard constraint

**Audio and lyrics must be fully local before a performance starts.** No network call sits between the play button and the first beat. Sync accuracy of ±20ms is the target; anything worse and users perceive the lyrics as "wrong".

---

## 4. Data model

```
Song
  id, title, artist_name, artist_id, album, year
  primary_language (ISO 639-3), other_languages[]
  genre[], mood[], bpm, musical_key, duration_ms
  cover_art_key
  rights_status (enum: cleared | pending | blocked)   ← see note
  cleared_territories[] (ISO 3166 alpha-2)
  publisher_ref, master_ref
  created_at, published_at

AudioAsset
  id, song_id
  kind (enum: instrumental | guide_vocal | reference_mix)
  storage_key, format (aac/m4a), bitrate, sample_rate
  loudness_lufs, checksum
  source (enum: licensed_instrumental | separated | re_recorded)

LyricDocument
  id, song_id, format (enum: elrc)
  language, variant (enum: original | romanised | translated)
  storage_key, checksum

PitchReference
  id, song_id
  storage_key   -- serialised f0 contour + note segments, from the guide vocal

User
  id, email, display_name, created_at, locale

Performance
  id, user_id, song_id
  started_at, completed, score_total
  score_pitch, score_timing, score_completion
  recording_local_only (bool)   -- v1 never uploads audio
```

**Note on `rights_status`:** the API must refuse to issue download URLs for any song not `cleared`, and must filter the catalogue by the user's territory against `cleared_territories`. Build this gate in from commit one — retrofitting it is how apps end up shipping unlicensed content by accident. The licensing work itself is separate and outside this spec.

---

## 5. Lyric format

Use **enhanced LRC (eLRC)** with word-level timestamps. Line-level alone is not enough for a pitch indicator that tracks syllables.

```
[ti:Song Title]
[ar:Artist]
[la:yor]
[var:original]

[00:12.340]<00:12.340>Ẹ <00:12.610>ma <00:12.880>wo <00:13.400>mi
[00:15.100]<00:15.100>Bí <00:15.380>ó <00:15.700>ti <00:16.020>rí
```

Rules:

- One `LyricDocument` per language/variant. The client fetches the variant(s) the user has toggled on and renders them aligned by line index.
- **Line indices must match across variants of the same song.** The ingestion pipeline validates this and rejects mismatches.
- Support a `[bg:]` marker for backing/ad-lib lines, rendered smaller and not scored.
- Support an instrumental-break marker so the UI can show a countdown rather than a blank screen.

---

## 6. Ingestion pipeline

An internal CLI + minimal admin web UI. Not user-facing.

**Steps per song:**

1. **Ingest source.** Either a licensed instrumental (preferred), a re-recording, or a full master for separation.
2. **Separate** (only if starting from a master): `demucs --two-stems=vocals`. Retain both stems — the vocal stem becomes the pitch reference, the accompaniment becomes the instrumental.
3. **QC the separation.** Flag artefacts. Amapiano log drums and dense highlife horn sections separate badly; expect a meaningful reject rate and build the queue to handle it. Human listen-through is required before publish.
4. **Loudness normalise** to −14 LUFS integrated, true peak −1 dBTP.
5. **Extract pitch reference** from the vocal stem (CREPE or pYIN → f0 contour at 10ms hop → median-filtered → segmented into note events).
6. **Time the lyrics.** Semi-automatic: forced alignment where a transcript exists, then manual correction in the admin UI. Assume manual correction is always needed for tonal languages — aligners trained on English do poorly on Yoruba and Igbo.
7. **Produce variants.** Romanisation and translation are human-authored or human-reviewed. Do not ship machine translation unreviewed.
8. **Validate** (line-index parity, no timestamp regressions, duration match within 500ms) then publish.

Encode delivery audio as **AAC 128kbps m4a**. Keep lossless masters in cold storage.

---

## 7. Scoring engine

Runs entirely on-device. No audio leaves the phone in v1.

**Inputs:** live mic f0 contour vs. the song's `PitchReference`.

**Algorithm:**

1. Capture mic at 44.1kHz, 512-sample frames.
2. Estimate f0 per frame (YIN is adequate and cheap; avoid neural pitch trackers on-device for v1).
3. Convert to cents relative to the target note at that timestamp.
4. **Octave-agnostic comparison** — a user singing an octave below the reference should score full marks. Compare pitch class, not absolute pitch.
5. Ignore frames where mic energy is below a noise gate, or where the reference has no note (instrumental sections, ad-libs).
6. Score components:
   - **Pitch accuracy** — proportion of voiced frames within ±50 cents (perfect), ±100 (good), ±200 (fair)
   - **Timing** — onset alignment per note event, tolerance ±150ms
   - **Completion** — proportion of scoreable notes attempted
7. Weighted total: pitch 55%, timing 25%, completion 20%. Expose the weights as constants.

**Calibration:** measure the round-trip mic→speaker latency once at first launch and store the offset. Without this, every score on Android is wrong. This is not optional.

**Tuning target:** a confident amateur singing along should land in the 70–85 range. If the median score is below 60, the thresholds are too tight — people stop playing.

---

## 8. Key screens

1. **Home** — continue singing, new additions, browse by language, browse by mood
2. **Search** — text search with language and genre filters
3. **Song detail** — cover, metadata, language badges, download button with size shown in MB, preview snippet
4. **Downloads** — what's on device, storage used, clear cache
5. **Pre-performance** — lyric mode toggles (original / romanised / translated / dual), key transposition ±3 semitones, mic check with level meter
6. **Performance** — scrolling lyrics with word-level highlight, pitch indicator, progress bar, pause
7. **Results** — total score, three-part breakdown, replay recording, retry, save
8. **Profile** — history, favourites, settings

**Performance screen is the product.** It should be the most polished thing in the app. Lyrics must be legible at arm's length in a noisy room: large type, high contrast, the active line clearly dominant, the next line visible.

---

## 9. Build phases

**Phase 1 — Playback spine**
Hardcode three songs as bundled assets. Build playback + eLRC parsing + lyric rendering + sync accuracy. No backend, no mic. **Done when** a song plays with lyrics that stay in time to ±20ms for its full duration.

**Phase 2 — Scoring**
Mic capture, latency calibration, pitch detection, scoring, results screen. **Done when** scores are stable across repeated identical performances (±3 points) and feel fair to three test singers.

**Phase 3 — Backend + catalogue**
FastAPI, Postgres, R2, auth, download and cache management, rights gating. **Done when** a song can go from ingestion to a user's device without manual steps.

**Phase 4 — Ingestion tooling**
The CLI and admin UI. **Done when** a non-engineer can time and publish a song.

**Phase 5 — Polish**
Transposition, lyric variant toggles, favourites, history, empty states, error states.

---

## 10. Conventions for the coding agent

- Python: `ruff` + `black`, type hints throughout, `pytest`.
- TypeScript: strict mode on, no `any`.
- Every audio-processing function gets a test with a short fixture file — audio bugs are invisible in code review.
- Commit after each working increment; keep commits small.
- When a phase's "done when" condition is met, stop and report before starting the next phase.
- If a stack decision in §3 turns out to be wrong in practice, say so and explain why rather than silently substituting something else.

---

## 11. Open questions to resolve before Phase 3

- Territory detection: IP geolocation, store region, or user-declared? Affects the rights gate.
- Cache eviction policy and a default cap on device storage.
- Whether re-recorded instrumentals are commissioned per song or a house band records in batches.
- Offline entitlement expiry — do downloads need periodic re-validation?
