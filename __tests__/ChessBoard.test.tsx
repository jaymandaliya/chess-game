import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import ChessBoard from '../src/components/ChessBoard';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const settings = { boardTheme: 'green' as const, showLegalMoves: true, autoQueen: false };

function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const square = renderer.root.find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === 'function');
  act(() => square.props.onPress());
}

function render(props: Partial<React.ComponentProps<typeof ChessBoard>> = {}) {
  const onMove = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <ChessBoard fen={START} orientation="w" interactive lastMove={null} settings={settings} onMove={onMove} {...props} />,
    );
  });
  return { renderer, onMove };
}

test('tap a piece then a legal square sends the move', () => {
  const { renderer, onMove } = render();
  press(renderer, 'e2');
  press(renderer, 'e4');
  expect(onMove).toHaveBeenCalledWith('e2', 'e4');
});

test('illegal target just changes selection, no move sent', () => {
  const { renderer, onMove } = render();
  press(renderer, 'e2');
  press(renderer, 'e5');
  expect(onMove).not.toHaveBeenCalled();
});

test('cannot move when not interactive (opponent to move)', () => {
  const { renderer, onMove } = render({ interactive: false });
  press(renderer, 'e2');
  press(renderer, 'e4');
  expect(onMove).not.toHaveBeenCalled();
});

test('auto-queen promotes without asking', () => {
  const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
  const { renderer, onMove } = render({ fen, settings: { ...settings, autoQueen: true } });
  press(renderer, 'a7');
  press(renderer, 'a8');
  expect(onMove).toHaveBeenCalledWith('a7', 'a8', 'q');
});
