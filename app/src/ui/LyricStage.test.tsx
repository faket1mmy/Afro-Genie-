import { render, screen } from '@testing-library/react-native';

import { parseElrc } from '@/lyrics/elrc/parse';
import type { LyricLine } from '@/lyrics/elrc/types';
import { LyricTimeline } from '@/lyrics/LyricTimeline';

import { LyricStage } from './LyricStage';
import { COLORS } from './theme';

function linesFrom(body: string): readonly LyricLine[] {
  return parseElrc(`[la:yor]\n[var:original]\n${body}`).document.lines;
}

const ORIGINAL = linesFrom(
  [
    '[00:08.000]<00:08.000>Ẹ <00:08.500>káàbọ̀ <00:09.000>sí <00:09.500>ilé <00:10.000>',
    '[00:10.000]<00:10.000>Ọ̀rẹ́ <00:10.500>mi <00:11.000>',
    '[00:11.000][break:00:20.000]',
    '[00:20.000]<00:20.000>Mo <00:20.500>ń <00:21.000>lọ <00:21.500>',
  ].join('\n'),
);

const ROMANISED = linesFrom(
  [
    '[00:08.000]<00:08.000>eh <00:08.500>kaa-baw <00:09.000>see <00:09.500>ee-leh <00:10.000>',
    '[00:10.000]<00:10.000>aw-reh <00:10.500>mee <00:11.000>',
    '[00:11.000][break:00:20.000]',
    '[00:20.000]<00:20.000>moh <00:20.500>n <00:21.000>law <00:21.500>',
  ].join('\n'),
);

const timeline = new LyricTimeline(ORIGINAL);

function renderAt(positionMs: number, dual = false): void {
  timeline.reset();
  render(
    <LyricStage
      lines={ORIGINAL}
      secondaryLines={dual ? ROMANISED : null}
      state={timeline.stateAt(positionMs)}
    />,
  );
}

describe('LyricStage', () => {
  it('shows a countdown and the upcoming line before the first lyric', () => {
    renderAt(3_000);
    expect(screen.getByTestId('countdown')).toBeTruthy();
    expect(screen.getByTestId('countdown-digits')).toHaveTextContent('5');
    // The point of the countdown is preparation, so the words you are about to
    // sing have to be on screen with it.
    expect(screen.getByText('káàbọ̀')).toBeTruthy();
  });

  it('drops the digits and says ready in the last moment', () => {
    renderAt(7_500);
    expect(screen.queryByTestId('countdown-digits')).toBeNull();
    expect(screen.getByText('ready')).toBeTruthy();
  });

  it('shows the active line and the next line while singing', () => {
    renderAt(8_200);
    expect(screen.getByTestId('lyric-active')).toBeTruthy();
    expect(screen.getByTestId('lyric-next')).toBeTruthy();
    expect(screen.getByText('Ọ̀rẹ́')).toBeTruthy();
  });

  it('colours sung words differently from unsung ones', () => {
    renderAt(9_100);
    const sung = screen.getByText('Ẹ');
    const unsung = screen.getByText('ilé');
    expect(flatten(sung.props.style).color).toBe(COLORS.lyricSung);
    expect(flatten(unsung.props.style).color).toBe(COLORS.lyricActive);
  });

  it('renders the secondary variant under the active line in dual mode', () => {
    renderAt(8_200, true);
    expect(screen.getByTestId('lyric-secondary')).toBeTruthy();
    expect(screen.getByText('kaa-baw')).toBeTruthy();
  });

  it('omits the secondary line when not in dual mode', () => {
    renderAt(8_200);
    expect(screen.queryByTestId('lyric-secondary')).toBeNull();
  });

  it('keeps the last sung line on screen during a break', () => {
    // Blanking here makes the screen flicker between lines and loses the
    // singer's place in the gap where they most need it.
    renderAt(15_000);
    expect(screen.getByTestId('countdown')).toBeTruthy();
    expect(screen.getByText('Mo')).toBeTruthy();
  });

  it('shows the previously sung line above the active one', () => {
    renderAt(10_400);
    expect(screen.getByTestId('lyric-past')).toBeTruthy();
    expect(screen.getByText('Ẹ')).toBeTruthy();
  });

  it('preserves diacritics through rendering', () => {
    renderAt(8_200);
    expect(screen.getByText('káàbọ̀')).toBeTruthy();
    expect(screen.getByText('Ẹ')).toBeTruthy();
  });

  it('renders an empty document without throwing', () => {
    const empty = new LyricTimeline([]);
    render(
      <LyricStage lines={[]} secondaryLines={null} state={empty.stateAt(0)} />,
    );
    expect(screen.queryByTestId('lyric-active')).toBeNull();
  });
});

function flatten(style: unknown): { color?: string } {
  if (Array.isArray(style)) {
    return style.reduce<{ color?: string }>(
      (accumulated, entry) => ({ ...accumulated, ...flatten(entry) }),
      {},
    );
  }
  if (style !== null && typeof style === 'object') {
    return style as { color?: string };
  }
  return {};
}
