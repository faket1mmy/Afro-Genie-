import { parseElrc } from './parse';
import type { LyricDocument, LyricVariant } from './types';
import { validateVariantSet } from './validate';

function doc(variant: LyricVariant, language: string, body: string): LyricDocument {
  return parseElrc(`[la:${language}]\n[var:${variant}]\n${body}`).document;
}

const ORIGINAL = [
  '[00:01.000]<00:01.000>Ẹ <00:01.500>ma <00:02.000>',
  '[00:03.000][break:00:08.000]',
  '[00:08.000]<00:08.000>Bí <00:08.500>ó <00:09.000>',
].join('\n');

const TRANSLATED = [
  '[00:01.000]<00:01.000>Do <00:01.500>not <00:02.000>',
  '[00:03.000][break:00:08.000]',
  '[00:08.000]<00:08.000>As <00:08.500>it <00:09.000>',
].join('\n');

function set(
  entries: readonly [LyricVariant, string, string][],
): ReadonlyMap<LyricVariant, LyricDocument> {
  return new Map(
    entries.map(([variant, language, body]) => [
      variant,
      doc(variant, language, body),
    ]),
  );
}

describe('validateVariantSet', () => {
  it('accepts variants that line up', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', ORIGINAL],
        ['translated', 'eng', TRANSLATED],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues).toEqual([]);
  });

  it('accepts differing word counts between variants', () => {
    // An English gloss almost never has the same number of words as the Yoruba
    // it glosses. Only line indices have to match.
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', '[00:01.000]<00:01.000>Ẹ <00:01.500>ma <00:02.000>'],
        [
          'translated',
          'eng',
          '[00:01.000]<00:01.000>Do <00:01.300>not <00:01.600>do <00:01.800>that <00:02.000>',
        ],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues).toEqual([]);
  });

  it('rejects a variant that dropped a line', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', ORIGINAL],
        [
          'translated',
          'eng',
          '[00:01.000]<00:01.000>Do <00:01.500>not <00:02.000>',
        ],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['line-count-mismatch']);
  });

  it('reports a dropped line once, not once per line after it', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', ORIGINAL],
        ['translated', 'eng', '[00:08.000]<00:08.000>As <00:09.000>'],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues).toHaveLength(1);
  });

  it('rejects a variant retimed away from the reference', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', ORIGINAL],
        [
          'translated',
          'eng',
          [
            '[00:01.000]<00:01.000>Do <00:01.500>not <00:02.000>',
            '[00:03.000][break:00:08.000]',
            '[00:09.500]<00:09.500>As <00:10.000>it <00:10.500>',
          ].join('\n'),
        ],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['line-timing-mismatch']);
  });

  it('tolerates rounding-scale timing differences', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', '[00:01.000]<00:01.000>Ẹ <00:02.000>'],
        ['translated', 'eng', '[00:01.005]<00:01.005>Do <00:02.000>'],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues).toEqual([]);
  });

  it('rejects a line whose kind changed between variants', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([
        ['original', 'yor', '[00:01.000][bg]<00:01.000>ooh <00:02.000>'],
        ['translated', 'eng', '[00:01.000]<00:01.000>ooh <00:02.000>'],
      ]),
      audioDurationMs: 12_000,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['line-count-mismatch']);
  });

  it('rejects lyrics that run past the end of the audio', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([['original', 'yor', ORIGINAL]]),
      audioDurationMs: 5_000,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['duration-mismatch']);
  });

  it('allows lyrics to end just inside the tolerance', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([['original', 'yor', ORIGINAL]]),
      audioDurationMs: 8_600,
    });
    expect(issues).toEqual([]);
  });

  it('reports a missing reference variant', () => {
    const issues = validateVariantSet({
      reference: 'original',
      documents: set([['translated', 'eng', TRANSLATED]]),
      audioDurationMs: 12_000,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['line-count-mismatch']);
  });
});
