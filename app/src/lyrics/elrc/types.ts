/**
 * Types for the enhanced-LRC (eLRC) dialect described in `docs/LYRIC_FORMAT.md`.
 *
 * A `LyricDocument` here is the *parsed* form of one storage object. It maps onto
 * the `LyricDocument` row in the data model (SPEC §4): one document per
 * language/variant pair, and line indices are stable across variants of a song.
 */

/** SPEC §4: `LyricDocument.variant`. */
export type LyricVariant = 'original' | 'romanised' | 'translated';

export const LYRIC_VARIANTS: readonly LyricVariant[] = [
  'original',
  'romanised',
  'translated',
];

export function isLyricVariant(value: string): value is LyricVariant {
  return (LYRIC_VARIANTS as readonly string[]).includes(value);
}

/** A single timed word (or syllable) within a lyric line. */
export interface LyricWord {
  /** Word onset, ms from the start of the audio asset, offset already applied. */
  readonly startMs: number;
  /**
   * Word end, ms. Derived: the next word's onset, or the line's explicit end
   * marker for the final word. Always `>= startMs`.
   */
  readonly endMs: number;
  /** Display text, without surrounding whitespace. Never empty. */
  readonly text: string;
  /** Whitespace that followed this word in the source, preserved for rendering. */
  readonly trailingSpace: string;
}

export type LyricLineKind = 'lead' | 'backing' | 'break';

export interface LyricLine {
  /**
   * Position of this line in the document, counting from 0. Line indices must
   * match across variants of the same song (SPEC §5).
   */
  readonly index: number;
  readonly kind: LyricLineKind;
  readonly startMs: number;
  readonly endMs: number;
  /** Empty for `break` lines. */
  readonly words: readonly LyricWord[];
  /** Concatenated word text, for search and for measuring. */
  readonly text: string;
  /** 1-based line number in the source file, for diagnostics. */
  readonly sourceLine: number;
}

/** Metadata parsed from `[tag:value]` header lines. */
export interface LyricMetadata {
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  /** ISO 639-3, e.g. `yor`, `ibo`, `swh`, `pcm`. */
  readonly language?: string;
  readonly variant?: LyricVariant;
  /** `[length:mm:ss.xxx]`, ms. */
  readonly lengthMs?: number;
  /** `[offset:±ms]`. Already applied to every timestamp in `lines`. */
  readonly offsetMs: number;
  /** Any tag we do not model, kept verbatim so ingestion can round-trip it. */
  readonly extra: Readonly<Record<string, string>>;
}

export interface LyricDocument {
  readonly metadata: LyricMetadata;
  readonly lines: readonly LyricLine[];
}

export type LyricIssueSeverity = 'error' | 'warning';

export interface LyricIssue {
  readonly severity: LyricIssueSeverity;
  readonly code: LyricIssueCode;
  readonly message: string;
  /** 1-based line number in the source file, when the issue has a location. */
  readonly sourceLine?: number;
}

export type LyricIssueCode =
  | 'malformed-timestamp'
  | 'malformed-tag'
  | 'line-without-timestamp'
  | 'empty-line-content'
  | 'line-level-only'
  | 'repeated-timestamps'
  | 'non-monotonic-words'
  | 'non-monotonic-lines'
  | 'break-with-content'
  | 'unterminated-break'
  | 'unknown-marker'
  | 'no-lines'
  | 'missing-language'
  | 'missing-variant'
  | 'line-count-mismatch'
  | 'line-timing-mismatch'
  | 'duration-mismatch';

export interface LyricParseResult {
  readonly document: LyricDocument;
  /**
   * Every problem found while parsing. Parsing is lenient: it always returns a
   * document, and the caller decides whether `error`-severity issues are fatal.
   * The ingestion pipeline (SPEC §6.8) treats any error as a publish blocker.
   */
  readonly issues: readonly LyricIssue[];
}

export function hasErrors(issues: readonly LyricIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
