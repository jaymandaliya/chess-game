import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Chess, Square } from 'chess.js';
import { boardThemes, colors } from '../theme';
import { PlayerSettings } from '../api/types';

type Color = 'w' | 'b';
type Promotion = 'q' | 'r' | 'b' | 'n';

// Solid glyphs for both sides (coloured by style). U+FE0E forces text rendering instead of emoji on Android.
const GLYPHS: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const glyph = (type: string) => `${GLYPHS[type]}︎`;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

interface Props {
  fen: string;
  orientation: Color;
  interactive: boolean;
  lastMove?: { from: string; to: string } | null;
  settings: Pick<PlayerSettings, 'boardTheme' | 'showLegalMoves' | 'autoQueen'>;
  onMove(from: string, to: string, promotion?: Promotion): void;
}

export default function ChessBoard({ fen, orientation, interactive, lastMove, settings, onMove }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.min(width, 520);
  const square = size / 8;
  const theme = boardThemes[settings.boardTheme] ?? boardThemes.green;
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = chess.board();
  const myColor = chess.turn();

  const targets = useMemo(() => {
    if (!selected) return new Map<string, { capture: boolean; promotion: boolean }>();
    const moves = chess.moves({ square: selected, verbose: true });
    return new Map(moves.map((m) => [m.to, { capture: Boolean(m.captured), promotion: Boolean(m.promotion) }]));
  }, [chess, selected]);

  const checkSquare = useMemo(() => {
    if (!chess.isCheck()) return null;
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === chess.turn()) return `${FILES[c]}${8 - r}`;
      }
    }
    return null;
  }, [chess, board]);

  function onSquare(sq: Square) {
    if (!interactive) return;
    const piece = chess.get(sq);
    if (selected && targets.has(sq)) {
      const target = targets.get(sq)!;
      setSelected(null);
      if (target.promotion) {
        if (settings.autoQueen) onMove(selected, sq, 'q');
        else setPendingPromotion({ from: selected, to: sq });
      } else {
        onMove(selected, sq);
      }
      return;
    }
    setSelected(piece && piece.color === myColor && sq !== selected ? sq : null);
  }

  const rows = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      {rows.map((r, ri) => (
        <View key={r} style={styles.row}>
          {cols.map((c, ci) => {
            const sq = `${FILES[c]}${8 - r}` as Square;
            const piece = board[r][c];
            const isLight = (r + c) % 2 === 0;
            const target = settings.showLegalMoves ? targets.get(sq) : undefined;
            const highlighted = sq === selected || sq === lastMove?.from || sq === lastMove?.to;
            return (
              <Pressable
                key={sq}
                accessibilityLabel={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
                onPress={() => onSquare(sq)}
                style={[
                  { width: square, height: square, backgroundColor: isLight ? theme.light : theme.dark },
                  highlighted && styles.highlight,
                  sq === checkSquare && styles.check,
                ]}
              >
                {piece ? (
                  <Text
                    style={[
                      styles.piece,
                      { fontSize: square * 0.78, lineHeight: square },
                      piece.color === 'w' ? styles.white : styles.black,
                    ]}
                  >
                    {glyph(piece.type)}
                  </Text>
                ) : null}
                {target ? (
                  <View
                    pointerEvents="none"
                    style={
                      target.capture
                        ? [styles.captureRing, { borderRadius: square / 2 }]
                        : [styles.dot, { width: square * 0.3, height: square * 0.3, borderRadius: square * 0.15, top: square * 0.35, left: square * 0.35 }]
                    }
                  />
                ) : null}
                {ci === 0 ? <Text style={[styles.coord, styles.rank, { color: isLight ? theme.dark : theme.light }]}>{8 - r}</Text> : null}
                {ri === 7 ? <Text style={[styles.coord, styles.file, { color: isLight ? theme.dark : theme.light }]}>{FILES[c]}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <Modal transparent visible={pendingPromotion !== null} animationType="fade" onRequestClose={() => setPendingPromotion(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPendingPromotion(null)}>
          <View style={styles.promotion}>
            {(['q', 'r', 'b', 'n'] as Promotion[]).map((p) => (
              <Pressable
                key={p}
                accessibilityLabel={`Promote to ${p}`}
                style={styles.promotionChoice}
                onPress={() => {
                  if (pendingPromotion) onMove(pendingPromotion.from, pendingPromotion.to, p);
                  setPendingPromotion(null);
                }}
              >
                <Text style={[styles.piece, { fontSize: 44 }, myColor === 'w' ? styles.white : styles.black]}>{glyph(p)}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  piece: { textAlign: 'center', includeFontPadding: false },
  white: { color: '#ffffff', textShadowColor: '#000000', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
  black: { color: '#1b1b1b', textShadowColor: '#ffffff88', textShadowRadius: 1, textShadowOffset: { width: 0, height: 0 } },
  highlight: { backgroundColor: '#f6f669cc' },
  check: { backgroundColor: '#e05252' },
  dot: { position: 'absolute', backgroundColor: '#00000033' },
  captureRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 4, borderColor: '#00000033' },
  coord: { position: 'absolute', fontSize: 10, fontWeight: '700' },
  rank: { top: 2, left: 3 },
  file: { bottom: 1, right: 4 },
  backdrop: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
  promotion: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 8, gap: 8 },
  promotionChoice: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, borderRadius: 8 },
});
