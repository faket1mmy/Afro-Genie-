/**
 * Timestamp parsing and formatting for the eLRC dialect.
 *
 * Accepted forms (fraction optional, 1-3 digits):
 *   mm:ss            ->  m minutes, s seconds
 *   mm:ss.xx         ->  centiseconds (classic LRC)
 *   mm:ss.xxx        ->  milliseconds (what our pipeline emits)
 *   hh:mm:ss.xxx     ->  for songs over an hour; tolerated, not emitted
 *
 * The fraction separator is `.` only. Some taggers write `mm:ss:xx`, but that
 * cannot be told apart from `hh:mm:ss` — `00:12:34` would be either 12.34s or
 * 12m34s — so we reject the colon form rather than guess wrong by an hour.
 *
 * Everything downstream works in integer milliseconds. Sub-millisecond
 * precision is deliberately discarded: the sync budget is ±20ms (SPEC §3) and
 * carrying floats through the timeline only invites rounding drift.
 */

const TIMESTAMP_PATTERN =
  /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]?\d)(?:\.(\d{1,3}))?$/;

/**
 * Parses `mm:ss.xxx` into milliseconds, or returns `null` if the text is not a
 * well-formed timestamp.
 */
export function parseTimestamp(raw: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const [, hoursRaw, minutesRaw, secondsRaw, fractionRaw] = match;
  // `minutesRaw` and `secondsRaw` are guaranteed by the pattern; the optional
  // groups are not.
  const hours = hoursRaw === undefined ? 0 : Number(hoursRaw);
  const minutes = Number(minutesRaw ?? '0');
  const seconds = Number(secondsRaw ?? '0');
  const fraction = parseFraction(fractionRaw);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction;
}

/**
 * `.5` means 500ms, `.50` means 500ms, `.500` means 500ms. Left-aligned, as in
 * decimal fractions of a second — not right-aligned as a raw ms count.
 */
function parseFraction(fractionRaw: string | undefined): number {
  if (fractionRaw === undefined || fractionRaw.length === 0) {
    return 0;
  }
  return Math.round(Number(fractionRaw) * 10 ** (3 - fractionRaw.length));
}

/** Formats milliseconds as `mm:ss.xxx`, the form our pipeline writes. */
export function formatTimestamp(totalMs: number): string {
  const clamped = Math.max(0, Math.round(totalMs));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
