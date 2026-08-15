# Lyric format

The enhanced-LRC (eLRC) dialect this project reads and writes. SPEC §5 fixes the
essentials — word-level timestamps, one document per language/variant, line
indices matching across variants, a `[bg:]` marker, an instrumental-break
marker. This document is the complete grammar, including the parts the spec
left to implementation.

Reference implementation: `app/src/lyrics/elrc/`. If this document and the
parser disagree, the parser's tests are the tiebreak.

---

## File shape

```
[ti:Káàbọ̀ Sí Ilé]
[ar:Afro-Genie Fixture Band]
[la:yor]
[var:original]
[length:01:00.000]

[00:08.889]<00:08.889>Ẹ <00:09.306>káàbọ̀ <00:09.861>sí <00:10.278>ilé <00:10.972>
[00:11.111]<00:11.111>Ọ̀rẹ́ <00:11.667>mi <00:12.222>ṣé <00:12.500>o <00:12.778>wà <00:13.194>
[00:17.778][bg]<00:17.778>ó <00:18.194>yá <00:18.750>
[00:18.889][break:00:25.556]
```

UTF-8, no BOM required but tolerated. LF or CRLF. Blank lines ignored.

**Do not normalise Unicode.** `ọ̀` may be a precomposed character or a base
plus a combining mark, and both must round-trip untouched. The parser does not
normalise, and neither should any tool that writes these files: SPEC §1 makes
correct diacritic rendering a first-class requirement, and nothing downstream
can restore a mark that was normalised away.

---

## Timestamps

```
mm:ss            08:00      → 8 minutes
mm:ss.x          00:08.9    → 8.9 seconds
mm:ss.xx         00:08.90   → 8.9 seconds
mm:ss.xxx        00:08.889  → 8.889 seconds
hh:mm:ss.xxx     01:02:03.4 → tolerated, never emitted
```

The fraction is a **decimal fraction of a second**, left-aligned: `.5` is 500ms,
not 5ms. Values are rounded to integer milliseconds on parse; the ±20ms budget
in SPEC §3 does not benefit from sub-millisecond precision and floats invite
rounding drift.

`.` is the only fraction separator. `mm:ss:xx` is read as `hh:mm:ss`, because
the two cannot be distinguished and guessing wrong misplaces a line by an hour.

Our pipeline always writes `mm:ss.xxx`.

---

## Metadata tags

One or more `[key:value]` groups on a line with no timestamp.

| Tag | Meaning | Required |
|---|---|---|
| `ti` | Title | no |
| `ar` | Artist | no |
| `al` | Album | no |
| `la` | Language, ISO 639-3 (`eng` for the translated variant) | **yes** |
| `var` | `original` \| `romanised` \| `translated` | **yes** |
| `length` | Total duration; used as the last line's end when nothing else gives one | no |
| `offset` | Signed milliseconds applied to every timestamp in the file | no |

Unknown tags are preserved verbatim in `metadata.extra` so ingestion can
round-trip them.

`la` and `var` are errors when missing, not warnings: a document that does not
say which variant it is cannot be placed in a variant set, and SPEC §6.8 gates
publishing on that placement.

---

## Timed lines

```
[<line-start>]{marker}{content}
```

Exactly **one** timestamp per line. Classic LRC allows several, as a way to
write a chorus once; we reject it, because a line appearing at three times has
no single line index, and SPEC §5 requires line indices to match across
variants.

Lines must appear in chronological order. The parser never sorts — a silent
reorder would desynchronise a translation from its original — so lines out of
order are an error.

Line indices count sung lines *and* break lines, from zero, in source order.

### Content and word timings

```
[00:08.889]<00:08.889>Ẹ <00:09.306>káàbọ̀ <00:09.861>sí <00:10.278>ilé <00:10.972>
```

Each `<timestamp>` marks the onset of the text that follows it. A word's end is
the next word's onset; the final word's end is the line's end marker.

- **Text before the first marker** takes the line's own start time.
- **A trailing marker with no text after it** is the line's end marker. Strongly
  preferred — without it the line ends at the next line's start, which is wrong
  whenever a line is followed by a gap.
- **No markers at all** is accepted with a warning: the whole line highlights at
  once. SPEC §5 says line-level alone is not enough for a syllable-tracking
  pitch indicator, so the pipeline should not produce these.
- Whitespace between words is preserved as written. The renderer does not invent
  spaces, because word-boundary conventions are not universal.

Word onsets must not run backwards, and the first word must not precede the
line's own timestamp.

---

## Markers

Markers sit between the timestamp and the content.

### `[bg]` — backing / ad-lib

```
[00:17.778][bg]<00:17.778>ó <00:18.194>yá <00:18.750>
```

Rendered smaller and dimmer, and not scored (SPEC §5). `[bg:]`, the spelling in
the spec, is accepted identically.

### `[break]` — instrumental break

```
[00:18.889][break]
[00:18.889][break:00:25.556]
```

Carries no text. Tells the UI to show a countdown rather than a blank screen.

Without an explicit end it runs to the next line's start, which is what you
want almost always. The exception is a break that ends the file — nothing
follows it to bound it — so a trailing break **must** give an explicit end, and
it is an error if it does not.

Gaps longer than five seconds get a countdown even without a `[break]` marker.
The marker is for gaps you want counted down regardless of length.

Unknown markers are warned about and ignored, so a future marker does not make
old clients reject a file outright.

---

## Variant sets

One document per language/variant pair. A song ships `original`, and as many of
`romanised` and `translated` as have been authored.

The rule that matters (SPEC §5): **line indices match across variants of the
same song.** Line 7 is line 7 in every variant, with the same kind (`lead`,
`backing`, `break`) and effectively the same start time.

Word counts do **not** have to match, and generally will not:

```
original     [00:08.889]<00:08.889>Ẹ <00:09.306>káàbọ̀ <00:09.861>sí <00:10.278>ilé <00:10.972>
translated   [00:08.889]<00:08.889>Welcome <00:09.861>to <00:10.278>the house <00:10.972>
```

Four words against three, same line index, same span. Each variant carries its
own word timings.

`validateVariantSet` is the publish gate (SPEC §6.8) and checks:

- every variant has the same number of lines
- line kinds agree at each index
- line starts agree within 20ms
- no variant runs more than 500ms past the end of the audio

---

## Errors and warnings

Parsing is lenient but loud: it always returns a document, so the admin UI can
show a half-broken file instead of a stack trace, and it reports everything it
found. `hasErrors()` is the publish gate.

**Errors** — block publishing: malformed timestamp, missing `la` or `var`,
unknown variant, repeated timestamps, lines out of order, words out of order,
end marker before the last word, empty timed line, no timed lines at all,
unterminated trailing break, and every variant-set failure above.

**Warnings** — recorded, do not block: unknown marker, malformed tag, text after
metadata tags, line with no word timestamps, text on a break line.

---

## Worked example

```
[ti:Sikhona Manje]
[ar:Afro-Genie Fixture Band]
[la:zul]
[var:original]
[length:01:02.200]

[00:09.643]<00:09.643>Sawubona <00:10.446>mngane <00:11.250>wami <00:11.652>
[00:11.786]<00:11.786>Sikhona <00:12.589>manje <00:13.259>lapha <00:13.795>
[00:19.286][bg]<00:19.286>yebo <00:19.821>yebo <00:20.223>
[00:20.357][break:00:25.714]
```

Line 0 and line 1 are sung; line 2 is a backing line; line 3 is a break running
to 25.714s, after which the next verse begins. The `translated` variant of this
file has four lines with the same indices, kinds and start times — and different
words.
