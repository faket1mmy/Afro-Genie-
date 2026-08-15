/**
 * Parser for the eLRC dialect documented in `docs/LYRIC_FORMAT.md`.
 *
 * Design notes:
 *
 * - Parsing is **lenient but loud**. It always returns a document so the admin
 *   UI can show a half-broken file rather than a stack trace, and it reports
 *   every problem it found. Publishing gates on `hasErrors()` (SPEC §6.8).
 * - Source order is authoritative. Lines are never reordered, because line
 *   indices carry meaning across variants (SPEC §5) and a silent sort would
 *   desynchronise a translation from its original.
 * - Everything is integer milliseconds by the time it leaves this module.
 */

import { parseTimestamp } from './timestamp';
import type {
  LyricIssue,
  LyricIssueCode,
  LyricLine,
  LyricLineKind,
  LyricMetadata,
  LyricParseResult,
  LyricVariant,
  LyricWord,
} from './types';
import { isLyricVariant } from './types';

/**
 * How long the final line is assumed to last when the file gives no explicit
 * end marker and no `[length:]` tag. Only affects the tail of the last line.
 */
const DEFAULT_FINAL_LINE_MS = 3_000;

/** A gap shorter than this between lines is not worth a countdown. */
export const DEFAULT_BREAK_THRESHOLD_MS = 5_000;

interface PendingWord {
  readonly startMs: number;
  readonly text: string;
  readonly trailingSpace: string;
}

interface PendingLine {
  readonly kind: LyricLineKind;
  readonly startMs: number;
  /** Set when the source carried an explicit end marker. */
  readonly explicitEndMs: number | null;
  readonly words: readonly PendingWord[];
  readonly sourceLine: number;
}

class IssueLog {
  private readonly issues: LyricIssue[] = [];

  error(code: LyricIssueCode, message: string, sourceLine?: number): void {
    this.push('error', code, message, sourceLine);
  }

  warn(code: LyricIssueCode, message: string, sourceLine?: number): void {
    this.push('warning', code, message, sourceLine);
  }

  private push(
    severity: 'error' | 'warning',
    code: LyricIssueCode,
    message: string,
    sourceLine?: number,
  ): void {
    this.issues.push(
      sourceLine === undefined
        ? { severity, code, message }
        : { severity, code, message, sourceLine },
    );
  }

  drain(): readonly LyricIssue[] {
    return this.issues;
  }
}

export function parseElrc(source: string): LyricParseResult {
  const log = new IssueLog();
  const rawLines = source.replace(/^﻿/, '').split(/\r\n|\r|\n/);

  const tags = new Map<string, string>();
  const pending: PendingLine[] = [];

  rawLines.forEach((rawLine, zeroBased) => {
    const sourceLine = zeroBased + 1;
    const text = rawLine.trimEnd();
    if (text.trim().length === 0) {
      return;
    }
    const brackets = readLeadingBrackets(text);
    if (brackets === null) {
      log.error(
        'line-without-timestamp',
        `Line does not begin with a '[' group: ${truncate(text)}`,
        sourceLine,
      );
      return;
    }

    const timestamps = brackets.groups.filter(
      (group) => parseTimestamp(group) !== null,
    );
    if (timestamps.length === 0) {
      readMetadata(brackets.groups, text, tags, log, sourceLine);
      return;
    }
    if (timestamps.length > 1) {
      // Classic LRC lets one text line carry several timestamps. We reject it:
      // it makes "line index" ambiguous, and line indices must line up across
      // variants (SPEC §5).
      log.error(
        'repeated-timestamps',
        'A line may carry exactly one timestamp; repeated timestamps make line indices ambiguous across variants',
        sourceLine,
      );
      return;
    }

    const startMs = parseTimestamp(timestamps[0] ?? '');
    if (startMs === null) {
      return;
    }

    const line = readTimedLine(
      startMs,
      brackets.groups,
      brackets.rest,
      log,
      sourceLine,
    );
    if (line !== null) {
      pending.push(line);
    }
  });

  const metadata = buildMetadata(tags, log);
  const lines = resolveLines(pending, metadata.offsetMs, metadata.lengthMs, log);

  if (lines.length === 0) {
    log.error('no-lines', 'Document contains no timed lines');
  }

  return { document: { metadata, lines }, issues: log.drain() };
}

interface LeadingBrackets {
  readonly groups: readonly string[];
  /** Everything after the last leading bracket group. */
  readonly rest: string;
}

/**
 * Reads the run of `[...]` groups at the start of a line. Returns `null` when
 * the line does not start with `[`.
 */
function readLeadingBrackets(text: string): LeadingBrackets | null {
  if (!text.startsWith('[')) {
    return null;
  }
  const groups: string[] = [];
  let cursor = 0;
  while (cursor < text.length && text[cursor] === '[') {
    const close = text.indexOf(']', cursor);
    if (close === -1) {
      break;
    }
    groups.push(text.slice(cursor + 1, close));
    cursor = close + 1;
  }
  if (groups.length === 0) {
    return null;
  }
  return { groups, rest: text.slice(cursor) };
}

function readMetadata(
  groups: readonly string[],
  text: string,
  tags: Map<string, string>,
  log: IssueLog,
  sourceLine: number,
): void {
  for (const group of groups) {
    const separator = group.indexOf(':');
    if (separator <= 0) {
      log.warn(
        'malformed-tag',
        `Ignoring malformed tag '[${group}]'`,
        sourceLine,
      );
      continue;
    }
    const key = group.slice(0, separator).trim().toLowerCase();
    const value = group.slice(separator + 1).trim();
    if (!/^[a-z_][a-z0-9_-]*$/.test(key)) {
      log.warn(
        'malformed-tag',
        `Ignoring malformed tag '[${group}]'`,
        sourceLine,
      );
      continue;
    }
    tags.set(key, value);
  }
  const trailing = text.slice(text.lastIndexOf(']') + 1).trim();
  if (trailing.length > 0) {
    log.warn(
      'malformed-tag',
      `Ignoring text after metadata tags: ${truncate(trailing)}`,
      sourceLine,
    );
  }
}

const WORD_MARKER = /<([^>]*)>/g;

function readTimedLine(
  startMs: number,
  groups: readonly string[],
  rest: string,
  log: IssueLog,
  sourceLine: number,
): PendingLine | null {
  let kind: LyricLineKind = 'lead';
  let breakEndMs: number | null = null;

  for (const group of groups) {
    if (parseTimestamp(group) !== null) {
      continue;
    }
    const marker = group.trim().toLowerCase();
    // `[bg]` and `[bg:]` both mark a backing/ad-lib line (SPEC §5).
    if (marker === 'bg' || marker === 'bg:') {
      kind = 'backing';
      continue;
    }
    if (marker === 'break' || marker === 'break:') {
      kind = 'break';
      continue;
    }
    if (marker.startsWith('break:')) {
      kind = 'break';
      const end = parseTimestamp(group.slice(group.indexOf(':') + 1));
      if (end === null) {
        log.error(
          'malformed-timestamp',
          `Break end '[${group}]' is not a timestamp`,
          sourceLine,
        );
      } else {
        breakEndMs = end;
      }
      continue;
    }
    log.warn('unknown-marker', `Ignoring unknown marker '[${group}]'`, sourceLine);
  }

  if (kind === 'break') {
    if (rest.trim().length > 0) {
      log.warn(
        'break-with-content',
        'Break lines carry no text; the trailing content was dropped',
        sourceLine,
      );
    }
    return {
      kind,
      startMs,
      explicitEndMs: breakEndMs,
      words: [],
      sourceLine,
    };
  }

  const parsed = readWords(startMs, rest, log, sourceLine);
  if (parsed === null) {
    return null;
  }
  return {
    kind,
    startMs,
    explicitEndMs: parsed.explicitEndMs,
    words: parsed.words,
    sourceLine,
  };
}

interface ParsedWords {
  readonly words: readonly PendingWord[];
  readonly explicitEndMs: number | null;
}

function readWords(
  lineStartMs: number,
  rest: string,
  log: IssueLog,
  sourceLine: number,
): ParsedWords | null {
  if (rest.trim().length === 0) {
    log.error('empty-line-content', 'Timed line has no text', sourceLine);
    return null;
  }

  interface Segment {
    readonly startMs: number;
    readonly raw: string;
  }
  const segments: Segment[] = [];
  let explicitEndMs: number | null = null;
  let cursor = 0;
  let sawMarker = false;
  // Text accumulates into `buffer` and belongs to `pendingStart` — the onset of
  // the most recent marker, or the line's own start for text that precedes the
  // first marker.
  let pendingStart = lineStartMs;
  let buffer = '';

  WORD_MARKER.lastIndex = 0;
  for (
    let match = WORD_MARKER.exec(rest);
    match !== null;
    match = WORD_MARKER.exec(rest)
  ) {
    const stampMs = parseTimestamp(match[1] ?? '');
    if (stampMs === null) {
      log.error(
        'malformed-timestamp',
        `Word marker '<${match[1] ?? ''}>' is not a timestamp`,
        sourceLine,
      );
      continue;
    }
    sawMarker = true;
    buffer += rest.slice(cursor, match.index);
    if (buffer.trim().length > 0) {
      segments.push({ startMs: pendingStart, raw: buffer });
    }
    buffer = '';
    pendingStart = stampMs;
    cursor = match.index + match[0].length;
  }

  buffer += rest.slice(cursor);
  if (buffer.trim().length > 0) {
    segments.push({ startMs: pendingStart, raw: buffer });
  } else if (sawMarker) {
    // A trailing marker with no text after it is the line's end marker.
    explicitEndMs = pendingStart;
  }

  if (!sawMarker) {
    log.warn(
      'line-level-only',
      'Line has no word-level timestamps; the whole line will highlight at once',
      sourceLine,
    );
  }

  const words: PendingWord[] = [];
  let previousStart = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    const text = segment.raw.trim();
    if (text.length === 0) {
      continue;
    }
    if (segment.startMs < previousStart) {
      log.error(
        'non-monotonic-words',
        `Word '${truncate(text)}' starts before the previous word`,
        sourceLine,
      );
    }
    previousStart = segment.startMs;
    const trailingSpace = /\s$/.test(segment.raw) ? ' ' : '';
    words.push({ startMs: segment.startMs, text, trailingSpace });
  }

  if (words.length === 0) {
    log.error('empty-line-content', 'Timed line has no text', sourceLine);
    return null;
  }
  const firstWord = words[0];
  if (firstWord !== undefined && firstWord.startMs < lineStartMs) {
    log.error(
      'non-monotonic-words',
      'First word starts before the line timestamp',
      sourceLine,
    );
  }
  if (explicitEndMs !== null) {
    const lastWord = words.at(-1);
    if (lastWord !== undefined && explicitEndMs < lastWord.startMs) {
      log.error(
        'non-monotonic-words',
        'Line end marker precedes the last word',
        sourceLine,
      );
      explicitEndMs = null;
    }
  }

  return { words, explicitEndMs };
}

function buildMetadata(
  tags: Map<string, string>,
  log: IssueLog,
): LyricMetadata {
  const extra: Record<string, string> = {};
  let title: string | undefined;
  let artist: string | undefined;
  let album: string | undefined;
  let language: string | undefined;
  let variant: LyricVariant | undefined;
  let lengthMs: number | undefined;
  let offsetMs = 0;

  for (const [key, value] of tags) {
    switch (key) {
      case 'ti':
        title = value;
        break;
      case 'ar':
        artist = value;
        break;
      case 'al':
        album = value;
        break;
      case 'la':
        language = value.toLowerCase();
        break;
      case 'var':
        if (isLyricVariant(value.toLowerCase())) {
          variant = value.toLowerCase() as LyricVariant;
        } else {
          log.error(
            'missing-variant',
            `Unknown lyric variant '${value}'; expected original, romanised or translated`,
          );
        }
        break;
      case 'length': {
        const parsed = parseTimestamp(value);
        if (parsed === null) {
          log.warn('malformed-timestamp', `Ignoring '[length:${value}]'`);
        } else {
          lengthMs = parsed;
        }
        break;
      }
      case 'offset': {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          log.warn('malformed-tag', `Ignoring '[offset:${value}]'`);
        } else {
          offsetMs = Math.round(parsed);
        }
        break;
      }
      default:
        extra[key] = value;
        break;
    }
  }

  if (language === undefined) {
    log.error('missing-language', "Missing '[la:]' tag (ISO 639-3 language)");
  }
  if (variant === undefined && !tags.has('var')) {
    log.error('missing-variant', "Missing '[var:]' tag");
  }

  return {
    ...(title === undefined ? {} : { title }),
    ...(artist === undefined ? {} : { artist }),
    ...(album === undefined ? {} : { album }),
    ...(language === undefined ? {} : { language }),
    ...(variant === undefined ? {} : { variant }),
    ...(lengthMs === undefined ? {} : { lengthMs }),
    offsetMs,
    extra,
  };
}

function resolveLines(
  pending: readonly PendingLine[],
  offsetMs: number,
  lengthMs: number | undefined,
  log: IssueLog,
): readonly LyricLine[] {
  const lines: LyricLine[] = [];

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    if (current === undefined) {
      continue;
    }
    const next = pending[index + 1];
    const startMs = current.startMs + offsetMs;

    if (next !== undefined && next.startMs < current.startMs) {
      log.error(
        'non-monotonic-lines',
        'Line starts before the line above it; source order is authoritative and must be chronological',
        next.sourceLine,
      );
    }

    const endMs = resolveEndMs(current, next, offsetMs, lengthMs, log);
    const words = resolveWords(current.words, offsetMs, endMs);

    lines.push({
      index,
      kind: current.kind,
      startMs,
      endMs: Math.max(startMs, endMs),
      words,
      text: words.map((word) => word.text + word.trailingSpace).join('').trim(),
      sourceLine: current.sourceLine,
    });
  }

  return lines;
}

function resolveEndMs(
  current: PendingLine,
  next: PendingLine | undefined,
  offsetMs: number,
  lengthMs: number | undefined,
  log: IssueLog,
): number {
  if (current.explicitEndMs !== null) {
    return current.explicitEndMs + offsetMs;
  }
  if (next !== undefined) {
    return next.startMs + offsetMs;
  }
  if (current.kind === 'break') {
    // A break that ends the file has nothing to run up against.
    log.error(
      'unterminated-break',
      'Final break has no end marker; give it an explicit `[break:mm:ss.xxx]`',
      current.sourceLine,
    );
    return current.startMs + offsetMs;
  }
  if (lengthMs !== undefined) {
    return Math.max(lengthMs, current.startMs + offsetMs);
  }
  const lastWordStart = current.words.at(-1)?.startMs ?? current.startMs;
  return lastWordStart + offsetMs + DEFAULT_FINAL_LINE_MS;
}

function resolveWords(
  pending: readonly PendingWord[],
  offsetMs: number,
  lineEndMs: number,
): readonly LyricWord[] {
  return pending.map((word, index) => {
    const startMs = word.startMs + offsetMs;
    const nextStart = pending[index + 1]?.startMs;
    const endMs =
      nextStart === undefined ? lineEndMs : nextStart + offsetMs;
    return {
      startMs,
      endMs: Math.max(startMs, endMs),
      text: word.text,
      trailingSpace: word.trailingSpace,
    };
  });
}

function truncate(text: string, max = 40): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
