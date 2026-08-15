import { parseElrc } from './parse';
import { hasErrors } from './types';
import type { LyricIssueCode } from './types';

const HEADER = ['[ti:Test Song]', '[ar:Test Artist]', '[la:yor]', '[var:original]'].join(
  '\n',
);

function codes(issues: readonly { code: LyricIssueCode }[]): LyricIssueCode[] {
  return issues.map((issue) => issue.code);
}

describe('parseElrc — metadata', () => {
  it('reads the documented header tags', () => {
    const { document, issues } = parseElrc(
      `${HEADER}\n[al:Test Album]\n[length:03:20.000]\n[00:01.000]<00:01.000>hello`,
    );
    expect(hasErrors(issues)).toBe(false);
    expect(document.metadata).toMatchObject({
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      language: 'yor',
      variant: 'original',
      lengthMs: 200_000,
      offsetMs: 0,
    });
  });

  it('keeps unmodelled tags so ingestion can round-trip them', () => {
    const { document } = parseElrc(
      `${HEADER}\n[by:A Transcriber]\n[00:01.000]<00:01.000>hello`,
    );
    expect(document.metadata.extra).toEqual({ by: 'A Transcriber' });
  });

  it('applies [offset:] to every timestamp', () => {
    const { document } = parseElrc(
      `${HEADER}\n[offset:250]\n[00:10.000]<00:10.000>a <00:10.500>b <00:11.000>`,
    );
    const line = document.lines[0];
    expect(line?.startMs).toBe(10_250);
    expect(line?.words.map((word) => word.startMs)).toEqual([10_250, 10_750]);
    expect(line?.endMs).toBe(11_250);
  });

  it('applies a negative [offset:]', () => {
    const { document } = parseElrc(
      `${HEADER}\n[offset:-400]\n[00:10.000]<00:10.000>a <00:11.000>`,
    );
    expect(document.lines[0]?.startMs).toBe(9_600);
  });

  it('errors when the language tag is missing', () => {
    const { issues } = parseElrc('[var:original]\n[00:01.000]<00:01.000>hi');
    expect(codes(issues)).toContain('missing-language');
    expect(hasErrors(issues)).toBe(true);
  });

  it('errors when the variant tag is missing', () => {
    const { issues } = parseElrc('[la:yor]\n[00:01.000]<00:01.000>hi');
    expect(codes(issues)).toContain('missing-variant');
  });

  it('errors on an unrecognised variant', () => {
    const { issues } = parseElrc(
      '[la:yor]\n[var:phonetic]\n[00:01.000]<00:01.000>hi',
    );
    expect(codes(issues)).toContain('missing-variant');
  });
});

describe('parseElrc — words', () => {
  it('parses word-level timestamps and derives word ends', () => {
    const { document, issues } = parseElrc(
      `${HEADER}\n[00:12.340]<00:12.340>Ẹ <00:12.610>ma <00:12.880>wo <00:13.400>mi <00:13.900>`,
    );
    expect(hasErrors(issues)).toBe(false);
    const line = document.lines[0];
    expect(line?.text).toBe('Ẹ ma wo mi');
    expect(line?.words).toEqual([
      { startMs: 12_340, endMs: 12_610, text: 'Ẹ', trailingSpace: ' ' },
      { startMs: 12_610, endMs: 12_880, text: 'ma', trailingSpace: ' ' },
      { startMs: 12_880, endMs: 13_400, text: 'wo', trailingSpace: ' ' },
      { startMs: 13_400, endMs: 13_900, text: 'mi', trailingSpace: ' ' },
    ]);
    expect(line?.endMs).toBe(13_900);
  });

  it('preserves Yoruba diacritics and combining tone marks byte for byte', () => {
    // SPEC §1: font and pipeline must not silently drop tone marks. If the
    // parser normalises or strips them, nothing downstream can put them back.
    const text = 'Ẹ̀ ṣé ń lọ ọ̀rẹ́ ǹjẹ́';
    const { document } = parseElrc(
      `${HEADER}\n[00:01.000]<00:01.000>Ẹ̀ <00:01.200>ṣé <00:01.400>ń <00:01.600>lọ <00:01.800>ọ̀rẹ́ <00:02.000>ǹjẹ́ <00:02.400>`,
    );
    expect(document.lines[0]?.text).toBe(text);
    expect([...(document.lines[0]?.text ?? '')].length).toBe([...text].length);
  });

  it('gives text before the first marker the line start time', () => {
    const { document } = parseElrc(
      `${HEADER}\n[00:05.000]Bí <00:05.400>ó <00:05.800>`,
    );
    expect(document.lines[0]?.words).toEqual([
      { startMs: 5_000, endMs: 5_400, text: 'Bí', trailingSpace: ' ' },
      { startMs: 5_400, endMs: 5_800, text: 'ó', trailingSpace: ' ' },
    ]);
  });

  it('falls back to the next line start when there is no end marker', () => {
    const { document } = parseElrc(
      `${HEADER}\n[00:01.000]<00:01.000>one\n[00:04.000]<00:04.000>two <00:05.000>`,
    );
    expect(document.lines[0]?.endMs).toBe(4_000);
    expect(document.lines[0]?.words[0]?.endMs).toBe(4_000);
  });

  it('uses [length:] for the final line when no end marker is given', () => {
    const { document } = parseElrc(
      `${HEADER}\n[length:00:30.000]\n[00:01.000]<00:01.000>only`,
    );
    expect(document.lines[0]?.endMs).toBe(30_000);
  });

  it('warns but still parses a line with no word timestamps', () => {
    const { document, issues } = parseElrc(
      `${HEADER}\n[00:01.000]a whole line at once\n[00:04.000]<00:04.000>next <00:05.000>`,
    );
    expect(codes(issues)).toContain('line-level-only');
    expect(hasErrors(issues)).toBe(false);
    const line = document.lines[0];
    expect(line?.words).toHaveLength(1);
    expect(line?.words[0]).toMatchObject({
      startMs: 1_000,
      endMs: 4_000,
      text: 'a whole line at once',
    });
  });

  it('errors when words run backwards', () => {
    const { issues } = parseElrc(
      `${HEADER}\n[00:10.000]<00:10.000>a <00:09.000>b <00:11.000>`,
    );
    expect(codes(issues)).toContain('non-monotonic-words');
    expect(hasErrors(issues)).toBe(true);
  });

  it('errors when the end marker precedes the last word', () => {
    const { issues } = parseElrc(
      `${HEADER}\n[00:10.000]<00:10.000>a <00:12.000>b <00:11.000>`,
    );
    expect(codes(issues)).toContain('non-monotonic-words');
  });

  it('errors on an empty timed line', () => {
    const { issues } = parseElrc(`${HEADER}\n[00:10.000]`);
    expect(codes(issues)).toContain('empty-line-content');
  });
});

describe('parseElrc — markers', () => {
  it('marks [bg] lines as backing', () => {
    const { document } = parseElrc(
      `${HEADER}\n[00:01.000][bg]<00:01.000>ooh <00:02.000>\n[00:03.000]<00:03.000>lead <00:04.000>`,
    );
    expect(document.lines[0]?.kind).toBe('backing');
    expect(document.lines[1]?.kind).toBe('lead');
  });

  it('accepts the [bg:] spelling from the spec', () => {
    const { document } = parseElrc(
      `${HEADER}\n[00:01.000][bg:]<00:01.000>ooh <00:02.000>`,
    );
    expect(document.lines[0]?.kind).toBe('backing');
  });

  it('marks [break] lines and ends them at the next line', () => {
    const { document, issues } = parseElrc(
      `${HEADER}\n[00:10.000][break]\n[00:22.000]<00:22.000>back <00:23.000>`,
    );
    expect(hasErrors(issues)).toBe(false);
    expect(document.lines[0]).toMatchObject({
      kind: 'break',
      startMs: 10_000,
      endMs: 22_000,
      words: [],
    });
  });

  it('accepts an explicit break end for an outro', () => {
    const { document, issues } = parseElrc(
      `${HEADER}\n[00:05.000]<00:05.000>last <00:06.000>\n[00:06.000][break:00:20.000]`,
    );
    expect(hasErrors(issues)).toBe(false);
    expect(document.lines[1]).toMatchObject({ endMs: 20_000, kind: 'break' });
  });

  it('errors on a trailing break with no end', () => {
    const { issues } = parseElrc(
      `${HEADER}\n[00:05.000]<00:05.000>last <00:06.000>\n[00:06.000][break]`,
    );
    expect(codes(issues)).toContain('unterminated-break');
  });

  it('warns about unknown markers rather than failing', () => {
    const { document, issues } = parseElrc(
      `${HEADER}\n[00:01.000][shout]<00:01.000>hi <00:02.000>`,
    );
    expect(codes(issues)).toContain('unknown-marker');
    expect(hasErrors(issues)).toBe(false);
    expect(document.lines).toHaveLength(1);
  });
});

describe('parseElrc — structural rules', () => {
  it('rejects repeated timestamps on one line', () => {
    // Classic LRC allows this as a compression trick, but it makes "line index"
    // ambiguous, and line indices must match across variants (SPEC §5).
    const { issues, document } = parseElrc(
      `${HEADER}\n[00:10.000][00:40.000]<00:10.000>chorus <00:12.000>`,
    );
    expect(codes(issues)).toContain('repeated-timestamps');
    expect(document.lines).toHaveLength(0);
  });

  it('numbers lines by source order, starting at zero', () => {
    const { document } = parseElrc(
      `${HEADER}\n[00:01.000]<00:01.000>a <00:02.000>\n[00:03.000][break]\n[00:05.000]<00:05.000>b <00:06.000>`,
    );
    expect(document.lines.map((line) => line.index)).toEqual([0, 1, 2]);
  });

  it('errors when lines are out of chronological order', () => {
    const { issues } = parseElrc(
      `${HEADER}\n[00:10.000]<00:10.000>a <00:11.000>\n[00:05.000]<00:05.000>b <00:06.000>`,
    );
    expect(codes(issues)).toContain('non-monotonic-lines');
  });

  it('errors on a document with no timed lines', () => {
    const { issues } = parseElrc(HEADER);
    expect(codes(issues)).toContain('no-lines');
  });

  it('records source line numbers for diagnostics', () => {
    const { document } = parseElrc(
      `${HEADER}\n[00:01.000]<00:01.000>a <00:02.000>`,
    );
    expect(document.lines[0]?.sourceLine).toBe(5);
  });

  it('handles CRLF, a BOM and blank lines', () => {
    const source =
      '﻿[la:yor]\r\n[var:original]\r\n\r\n[00:01.000]<00:01.000>a <00:02.000>\r\n';
    const { document, issues } = parseElrc(source);
    expect(hasErrors(issues)).toBe(false);
    expect(document.metadata.language).toBe('yor');
    expect(document.lines).toHaveLength(1);
  });

  it('reports a line that does not start with a bracket', () => {
    const { issues } = parseElrc(`${HEADER}\nno timestamp here`);
    expect(codes(issues)).toContain('line-without-timestamp');
  });
});
