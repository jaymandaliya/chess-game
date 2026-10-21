const { Chess } = require('chess.js');

// Small negamax engine for "play vs computer". Level 1 is deliberately weak (shallow + noise).
const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;
const LEVELS = {
  1: { depth: 1, noise: 120 },
  2: { depth: 2, noise: 30 },
  3: { depth: 3, noise: 0 },
};

function positional(type, color, row, col) {
  const centre = 7 - (Math.abs(row - 3.5) + Math.abs(col - 3.5));
  if (type === 'p') {
    const advance = color === 'w' ? 6 - row : row - 1;
    return advance * 8 + (col >= 2 && col <= 5 ? advance * 3 : 0);
  }
  if (type === 'n' || type === 'b') return centre * 5;
  if (type === 'q') return centre * 2;
  return 0;
}

// Material + simple positional score from White's point of view
function evaluate(chess) {
  let score = 0;
  const board = chess.board();
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const value = VALUES[piece.type] + positional(piece.type, piece.color, row, col);
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
}

function orderMoves(moves) {
  return moves.sort((a, b) => {
    const av = a.captured ? VALUES[a.captured] * 10 - VALUES[a.piece] : 0;
    const bv = b.captured ? VALUES[b.captured] * 10 - VALUES[b.piece] : 0;
    return bv - av;
  });
}

function negamax(chess, depth, alpha, beta, sign) {
  if (depth === 0) return sign * evaluate(chess);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return chess.isCheck() ? -MATE - depth : 0;
  if (chess.isDraw()) return 0;

  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    const score = -negamax(chess, depth - 1, -beta, -alpha, -sign);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseMove(fen, level = 2) {
  const { depth, noise } = LEVELS[level] || LEVELS[2];
  const chess = new Chess(fen);
  const sign = chess.turn() === 'w' ? 1 : -1;
  let best = null;
  let bestScore = -Infinity;
  for (const m of orderMoves(chess.moves({ verbose: true }))) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    let score = -negamax(chess, depth - 1, -Infinity, Infinity, -sign);
    chess.undo();
    if (noise) score += (Math.random() * 2 - 1) * noise;
    if (score > bestScore) {
      bestScore = score;
      best = { from: m.from, to: m.to, promotion: m.promotion };
    }
  }
  return best;
}

module.exports = { chooseMove, evaluate, LEVELS };
