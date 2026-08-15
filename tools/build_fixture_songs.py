#!/usr/bin/env python3
"""Build the bundled Phase 1 fixture songs.

SPEC §9 Phase 1 asks for three songs hardcoded as bundled assets. We have no
licensed catalogue yet, and SPEC §4's `rights_status` gate exists precisely so
that unlicensed audio never reaches a device — so these are synthesised
instrumentals written here, not recordings of anything. They exist to exercise
the playback spine, and they are labelled as fixtures everywhere they appear.

The point of generating audio and lyrics from one description is that the two
cannot drift apart. Every lyric timestamp is derived from the same beat grid
that places the notes, so a lyric that looks late on device means the *playback*
is late — which is the only thing Phase 1 is trying to measure. Hand-timed
fixture lyrics would have made the ±20ms claim untestable end to end.

Usage:
    python3 tools/build_fixture_songs.py [--ffmpeg PATH] [--out DIR]

Outputs, per song, into app/assets/songs/<slug>/:
    instrumental.m4a      AAC 128kbps, loudness-normalised (SPEC §6.4, §6)
    original.elrc         eLRC, [var:original]
    romanised.elrc        eLRC, [var:romanised]
    translated.elrc       eLRC, [var:translated]
    fixture.json          durations and checksums, for the catalogue module
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
DEFAULT_OUT = REPO_ROOT / "app" / "assets" / "songs"

SAMPLE_RATE = 44_100
CHANNELS = 1

# SPEC §6.4.
TARGET_LUFS = -14.0
TARGET_TRUE_PEAK = -1.0
# SPEC §6, "Encode delivery audio as AAC 128kbps m4a".
TARGET_BITRATE = "128k"

VARIANTS = ("original", "romanised", "translated")


# --------------------------------------------------------------------------
# Synthesis
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Voice:
    """One synthesised layer, rendered into the mix buffer."""

    name: str
    gain: float


def _adsr(index: int, length: int, attack: int, decay: float) -> float:
    """Percussive envelope: linear attack, exponential decay."""
    if index < attack:
        return index / max(1, attack)
    fall = (index - attack) / max(1.0, length * decay)
    return math.exp(-fall)


def _kick(buffer: list[float], at: int, gain: float) -> None:
    """Pitch-swept sine. Cheap, and it reads as a kick on a phone speaker."""
    length = int(0.22 * SAMPLE_RATE)
    for i in range(length):
        if at + i >= len(buffer):
            return
        t = i / SAMPLE_RATE
        frequency = 45 + 95 * math.exp(-t * 28)
        envelope = _adsr(i, length, int(0.002 * SAMPLE_RATE), 0.18)
        buffer[at + i] += gain * envelope * math.sin(2 * math.pi * frequency * t)


def _shaker(buffer: list[float], at: int, gain: float, rng: random.Random) -> None:
    length = int(0.06 * SAMPLE_RATE)
    for i in range(length):
        if at + i >= len(buffer):
            return
        envelope = _adsr(i, length, int(0.001 * SAMPLE_RATE), 0.12)
        buffer[at + i] += gain * envelope * (rng.random() * 2 - 1) * 0.5


def _log_drum(buffer: list[float], at: int, frequency: float, gain: float) -> None:
    """The amapiano log drum: a short, pitched, heavily damped pluck."""
    length = int(0.35 * SAMPLE_RATE)
    for i in range(length):
        if at + i >= len(buffer):
            return
        t = i / SAMPLE_RATE
        envelope = _adsr(i, length, int(0.004 * SAMPLE_RATE), 0.12)
        body = math.sin(2 * math.pi * frequency * t)
        click = 0.3 * math.sin(2 * math.pi * frequency * 2.02 * t) * math.exp(-t * 40)
        buffer[at + i] += gain * envelope * (body + click)


def _bass(buffer: list[float], at: int, frequency: float, beats: float,
          seconds_per_beat: float, gain: float) -> None:
    length = int(beats * seconds_per_beat * SAMPLE_RATE)
    for i in range(length):
        if at + i >= len(buffer):
            return
        t = i / SAMPLE_RATE
        envelope = _adsr(i, length, int(0.01 * SAMPLE_RATE), 0.9)
        # Two partials is enough weight without turning to mud on a small speaker.
        value = math.sin(2 * math.pi * frequency * t)
        value += 0.3 * math.sin(2 * math.pi * frequency * 2 * t)
        buffer[at + i] += gain * envelope * value


def _pad(buffer: list[float], at: int, frequencies: Sequence[float], beats: float,
         seconds_per_beat: float, gain: float) -> None:
    length = int(beats * seconds_per_beat * SAMPLE_RATE)
    attack = int(0.08 * SAMPLE_RATE)
    release = int(0.25 * SAMPLE_RATE)
    for i in range(length):
        if at + i >= len(buffer):
            return
        t = i / SAMPLE_RATE
        if i < attack:
            envelope = i / attack
        elif i > length - release:
            envelope = max(0.0, (length - i) / release)
        else:
            envelope = 1.0
        value = sum(math.sin(2 * math.pi * f * t) for f in frequencies)
        buffer[at + i] += gain * envelope * value / max(1, len(frequencies))


SEMITONE = 2 ** (1 / 12)


def _note(root_hz: float, semitones: int) -> float:
    return root_hz * (SEMITONE ** semitones)


def synthesise(song: dict) -> list[float]:
    """Render a song description into a mono float buffer."""
    bpm: float = song["bpm"]
    seconds_per_beat = 60.0 / bpm
    total_beats: float = song["beats"]
    total_samples = int((total_beats + 4) * seconds_per_beat * SAMPLE_RATE)
    buffer = [0.0] * total_samples
    rng = random.Random(song["seed"])

    root = song["root_hz"]
    style = song["style"]
    progression: list[list[int]] = song["progression"]
    bars = int(total_beats // 4)

    def sample_at(beat: float) -> int:
        return int(beat * seconds_per_beat * SAMPLE_RATE)

    for bar in range(bars):
        chord = progression[bar % len(progression)]
        bar_beat = bar * 4
        in_break = any(
            section["start"] <= bar_beat < section["end"]
            for section in song.get("quiet_sections", [])
        )

        # Chord bed, one per bar.
        _pad(
            buffer,
            sample_at(bar_beat),
            [_note(root, interval + 12) for interval in chord],
            4.0,
            seconds_per_beat,
            0.10 if in_break else 0.16,
        )

        for beat in range(4):
            position = bar_beat + beat
            if style == "afrobeats":
                # Kick on 1 and the "and" of 3 — the lilt that makes it move.
                if beat in (0, 2):
                    _kick(buffer, sample_at(position), 0.85)
                if beat == 2:
                    _kick(buffer, sample_at(position + 0.75), 0.55)
                for eighth in (0.5, 1.5, 2.5, 3.5):
                    _shaker(buffer, sample_at(bar_beat + eighth), 0.30, rng)
                _bass(buffer, sample_at(position), _note(root, chord[0]), 0.9,
                      seconds_per_beat, 0.30)
            elif style == "amapiano":
                if beat == 0:
                    _kick(buffer, sample_at(position), 0.80)
                if beat in (1, 3):
                    _shaker(buffer, sample_at(position), 0.34, rng)
                if not in_break and beat in (0, 2):
                    for offset, interval in ((0.0, 0), (0.5, 7), (0.75, 5)):
                        _log_drum(buffer, sample_at(position + offset),
                                  _note(root, chord[0] + interval), 0.34)
                _bass(buffer, sample_at(position), _note(root, chord[0]), 1.8,
                      seconds_per_beat, 0.26)
            else:  # highlife
                if beat in (0, 2):
                    _kick(buffer, sample_at(position), 0.72)
                for sixteenth in (0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75):
                    _shaker(buffer, sample_at(bar_beat + sixteenth), 0.22, rng)
                _bass(buffer, sample_at(position),
                      _note(root, chord[beat % len(chord)]), 0.85,
                      seconds_per_beat, 0.28)

    peak = max((abs(value) for value in buffer), default=1.0)
    if peak > 0:
        scale = 0.89 / peak
        buffer = [value * scale for value in buffer]
    return buffer


def write_wav(path: Path, buffer: Iterable[float]) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(CHANNELS)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for value in buffer:
            clamped = max(-1.0, min(1.0, value))
            frames += struct.pack("<h", int(clamped * 32767))
        handle.writeframes(bytes(frames))


# --------------------------------------------------------------------------
# Encoding
# --------------------------------------------------------------------------


def encode(ffmpeg: str, source: Path, destination: Path) -> None:
    """Loudness-normalise to SPEC §6.4 and encode AAC 128kbps m4a."""
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source),
            "-af",
            f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TRUE_PEAK}:LRA=11",
            "-c:a", "aac", "-b:a", TARGET_BITRATE,
            "-movflags", "+faststart",
            str(destination),
        ],
        check=True,
    )


def probe_duration_ms(ffmpeg: str, path: Path) -> int:
    ffprobe = str(Path(ffmpeg).with_name("ffprobe"))
    tool = ffprobe if Path(ffprobe).exists() else None
    if tool is None:
        # ffmpeg-static ships without ffprobe; read the duration back off the
        # decode instead, which is slower but needs no second binary.
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(path), "-f", "null", "-"],
            capture_output=True, text=True, check=False,
        )
        for line in reversed(result.stderr.splitlines()):
            if "time=" in line:
                stamp = line.split("time=")[1].split(" ")[0]
                hours, minutes, seconds = stamp.split(":")
                return int(
                    (int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000
                )
        raise RuntimeError(f"could not determine duration of {path}")
    result = subprocess.run(
        [tool, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return int(float(result.stdout.strip()) * 1000)


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return f"sha256:{digest.hexdigest()}"


# --------------------------------------------------------------------------
# Lyrics
# --------------------------------------------------------------------------


def format_timestamp(total_ms: float) -> str:
    ms = max(0, int(round(total_ms)))
    return f"{ms // 60000:02d}:{(ms % 60000) // 1000:02d}.{ms % 1000:03d}"


def expand_arrangement(song: dict) -> list[dict]:
    """Flatten `arrangement` into one chronological list of lines.

    Songs repeat, so the fixtures describe a verse once and place it several
    times. Expanding here — rather than in the JSON — keeps the descriptions
    readable and guarantees the expansion is identical for every variant, which
    is what makes the line-index parity rule in SPEC §5 hold by construction
    rather than by proofreading.
    """
    lines: list[dict] = []
    for entry in song["arrangement"]:
        if "break" in entry:
            lines.append({"break": True, **entry["break"]})
            continue
        block = song["blocks"][entry["block"]]
        for line in block["lines"]:
            lines.append({
                **line,
                "start": entry["at"] + line["start"],
                "end": entry["at"] + line["end"],
            })
    lines.sort(key=lambda line: line["start"])
    return lines


def render_elrc(song: dict, lines: list[dict], variant: str,
                duration_ms: int) -> str:
    """Emit one eLRC document.

    Variants share line indices but not word counts — an English gloss rarely
    has the same number of words as the Yoruba it glosses. That is exactly the
    shape SPEC §5 calls for, and rendering all three from one arrangement is
    what keeps them aligned.
    """
    seconds_per_beat = 60.0 / song["bpm"]

    def at(beat: float) -> float:
        return beat * seconds_per_beat * 1000

    language = "eng" if variant == "translated" else song["language"]
    out = [
        f"[ti:{song['title']}]",
        f"[ar:{song['artist']}]",
        f"[la:{language}]",
        f"[var:{variant}]",
        f"[length:{format_timestamp(duration_ms)}]",
        f"[by:Afro-Genie fixture generator — synthesised placeholder, not a release]",
        "",
    ]

    for line in lines:
        if line.get("break"):
            out.append(
                f"[{format_timestamp(at(line['start']))}]"
                f"[break:{format_timestamp(at(line['end']))}]"
            )
            continue
        marker = "[bg]" if line.get("kind") == "backing" else ""
        pieces = [f"[{format_timestamp(at(line['start']))}]{marker}"]
        for word in line["variants"][variant]:
            beat = line["start"] + word["at"]
            pieces.append(f"<{format_timestamp(at(beat))}>{word['text']} ")
        pieces.append(f"<{format_timestamp(at(line['end']))}>")
        out.append("".join(pieces).rstrip())
    out.append("")
    return "\n".join(out)


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------


def build_song(song: dict, ffmpeg: str, out_root: Path) -> dict:
    slug = song["slug"]
    destination = out_root / slug
    destination.mkdir(parents=True, exist_ok=True)

    print(f"  synthesising {slug} ({song['style']}, {song['bpm']} bpm)…")
    buffer = synthesise(song)

    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.wav"
        write_wav(raw, buffer)
        audio = destination / "instrumental.m4a"
        encode(ffmpeg, raw, audio)

    duration_ms = probe_duration_ms(ffmpeg, audio)
    print(f"    {audio.name}: {duration_ms}ms, {audio.stat().st_size // 1024}KB")

    lines = expand_arrangement(song)
    lyric_files = {}
    for variant in VARIANTS:
        path = destination / f"{variant}.elrc"
        path.write_text(
            render_elrc(song, lines, variant, duration_ms), encoding="utf-8"
        )
        lyric_files[variant] = {
            "file": path.name,
            "checksum": checksum(path),
        }

    manifest = {
        "slug": slug,
        "title": song["title"],
        "artist": song["artist"],
        "language": song["language"],
        "genre": song["genre"],
        "mood": song["mood"],
        "bpm": song["bpm"],
        "musicalKey": song["key"],
        "durationMs": duration_ms,
        "audio": {
            "file": "instrumental.m4a",
            "format": "m4a",
            "bitrate": TARGET_BITRATE,
            "sampleRate": SAMPLE_RATE,
            "loudnessLufs": TARGET_LUFS,
            "checksum": checksum(destination / "instrumental.m4a"),
            "source": "re_recorded",
        },
        "lyrics": lyric_files,
        "lineCount": sum(1 for line in lines if not line.get("break")),
    }
    (destination / "fixture.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return manifest


GENERATED_HEADER = """\
// Generated by tools/build_fixture_songs.py — do not edit by hand.
//
// The lyric documents are inlined as strings rather than shipped as asset files
// on purpose. SPEC §3 is explicit that no network call and nothing slow may sit
// between the play button and the first beat; text that is already in the JS
// bundle cannot be late. It also sidesteps teaching Metro about a `.elrc`
// extension for what is, in Phase 1, three fixture songs.
//
// Audio stays an asset — a megabyte of AAC has no business in a JS bundle — and
// is wired up in `bundled.ts`, where `require()` can take a literal path.

import type { LyricVariant } from '@/lyrics/elrc/types';

export interface GeneratedFixture {
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  readonly language: string;
  readonly genre: readonly string[];
  readonly mood: readonly string[];
  readonly bpm: number;
  readonly musicalKey: string;
  readonly durationMs: number;
  readonly audioChecksum: string;
  readonly lineCount: number;
  readonly lyrics: Readonly<Record<LyricVariant, string>>;
}

"""


def ts_string(value: str) -> str:
    """Emit a TypeScript template literal, escaping only what would break it."""
    escaped = (
        value.replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("${", "\\${")
    )
    return f"`{escaped}`"


def write_generated_module(manifests: list[dict], out_root: Path) -> Path:
    destination = REPO_ROOT / "app" / "src" / "catalogue" / "generated.ts"
    destination.parent.mkdir(parents=True, exist_ok=True)

    parts = [
        GENERATED_HEADER,
        "export const GENERATED_FIXTURES: readonly GeneratedFixture[] = [\n",
    ]
    for manifest in manifests:
        song_dir = out_root / manifest["slug"]
        parts.append("  {\n")
        parts.append(f"    slug: {json.dumps(manifest['slug'])},\n")
        parts.append(f"    title: {json.dumps(manifest['title'], ensure_ascii=False)},\n")
        parts.append(f"    artist: {json.dumps(manifest['artist'], ensure_ascii=False)},\n")
        parts.append(f"    language: {json.dumps(manifest['language'])},\n")
        parts.append(f"    genre: {json.dumps(manifest['genre'])},\n")
        parts.append(f"    mood: {json.dumps(manifest['mood'])},\n")
        parts.append(f"    bpm: {manifest['bpm']},\n")
        parts.append(f"    musicalKey: {json.dumps(manifest['musicalKey'])},\n")
        parts.append(f"    durationMs: {manifest['durationMs']},\n")
        parts.append(f"    audioChecksum: {json.dumps(manifest['audio']['checksum'])},\n")
        parts.append(f"    lineCount: {manifest['lineCount']},\n")
        parts.append("    lyrics: {\n")
        for variant in VARIANTS:
            text = (song_dir / f"{variant}.elrc").read_text(encoding="utf-8")
            parts.append(f"      {variant}: {ts_string(text)},\n")
        parts.append("    },\n")
        parts.append("  },\n")
    parts.append("];\n")

    destination.write_text("".join(parts), encoding="utf-8")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if shutil.which(args.ffmpeg) is None and not Path(args.ffmpeg).exists():
        print(
            f"ffmpeg not found at {args.ffmpeg!r}. Pass --ffmpeg PATH.",
            file=sys.stderr,
        )
        return 1

    fixtures = sorted(FIXTURE_DIR.glob("*.json"))
    if not fixtures:
        print(f"no fixture descriptions in {FIXTURE_DIR}", file=sys.stderr)
        return 1

    print(f"Building {len(fixtures)} fixture songs into {args.out}")
    manifests = [
        build_song(json.loads(path.read_text(encoding="utf-8")), args.ffmpeg, args.out)
        for path in fixtures
    ]

    index = args.out / "index.json"
    index.write_text(
        json.dumps(manifests, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {index}")

    generated = write_generated_module(manifests, args.out)
    print(f"Wrote {generated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
