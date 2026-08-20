import { formatTimestamp, parseTimestamp } from './timestamp';

describe('parseTimestamp', () => {
  it.each([
    ['00:00.000', 0],
    ['00:12.340', 12_340],
    ['01:05.500', 65_500],
    ['12:34.567', 754_567],
    ['99:59.999', 5_999_999],
  ])('parses millisecond form %s', (input, expected) => {
    expect(parseTimestamp(input)).toBe(expected);
  });

  it('treats the fraction as a decimal, not a raw millisecond count', () => {
    // The classic-LRC trap: `.5` is half a second, not five milliseconds.
    expect(parseTimestamp('00:01.5')).toBe(1_500);
    expect(parseTimestamp('00:01.50')).toBe(1_500);
    expect(parseTimestamp('00:01.500')).toBe(1_500);
    expect(parseTimestamp('00:01.05')).toBe(1_050);
    expect(parseTimestamp('00:01.005')).toBe(1_005);
  });

  it('accepts a missing fraction', () => {
    expect(parseTimestamp('02:03')).toBe(123_000);
  });

  it('reads mm:ss:xx as hh:mm:ss rather than guessing a centisecond fraction', () => {
    // Ambiguous by construction, so the hours reading wins and `.` is the only
    // fraction separator. Getting this backwards misplaces a line by an hour.
    expect(parseTimestamp('00:12:34')).toBe(754_000);
  });

  it('accepts an hours field for long recordings', () => {
    expect(parseTimestamp('01:02:03.400')).toBe(3_723_400);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseTimestamp('  00:10.000 ')).toBe(10_000);
  });

  it.each([
    'ti:Song',
    '',
    'abc',
    '00:60.000', // 60 seconds is not a valid seconds field
    '00:-1.000',
    '1234:00.000',
    '00:12.3456',
  ])('rejects %s', (input) => {
    expect(parseTimestamp(input)).toBeNull();
  });
});

describe('formatTimestamp', () => {
  it.each([
    [0, '00:00.000'],
    [12_340, '00:12.340'],
    [65_500, '01:05.500'],
    [754_567, '12:34.567'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatTimestamp(input)).toBe(expected);
  });

  it('clamps negatives to zero', () => {
    expect(formatTimestamp(-500)).toBe('00:00.000');
  });

  it('round-trips through parseTimestamp', () => {
    for (const ms of [0, 1, 999, 1_000, 61_234, 754_567]) {
      expect(parseTimestamp(formatTimestamp(ms))).toBe(ms);
    }
  });
});
