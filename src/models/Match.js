const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const MODES = ['RATED', 'CASUAL', 'VS_COMPUTER', 'TOURNAMENT'];
const RESULTS = ['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'ABORTED'];
const STATUSES = ['ONGOING', 'COMPLETED', 'ABORTED'];
const TERMINATIONS = [
  'CHECKMATE', 'RESIGNATION', 'TIMEOUT', 'STALEMATE', 'AGREEMENT',
  'REPETITION', 'INSUFFICIENT_MATERIAL', 'FIFTY_MOVE', 'ABANDONED',
];

const sideSchema = new Schema(
  {
    // Null for the computer side
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    displayName: { type: String, required: true },
    ratingBefore: Number,
    ratingAfter: Number,
  },
  { _id: false },
);

// Match metadata for reporting/history. Written by the game server, never by clients.
const matchSchema = new Schema(
  {
    white: { type: sideSchema, required: true },
    black: { type: sideSchema, required: true },
    mode: { type: String, enum: MODES, required: true },
    timeControl: {
      initialSeconds: { type: Number, required: true },
      incrementSeconds: { type: Number, default: 0 },
      label: String,
    },
    status: { type: String, enum: STATUSES, default: 'ONGOING', index: true },
    result: { type: String, enum: RESULTS },
    termination: { type: String, enum: TERMINATIONS },
    winnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    moveCount: { type: Number, default: 0 },
    // Play coins each player put in (0 = free game). Winner gets the pot minus the platform fee.
    stakeCoins: { type: Number, default: 0 },
    payout: {
      winnerCoins: Number,
      feeCoins: Number,
      refunded: Boolean,
    },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', index: true },
    pgn: String,
    startedAt: { type: Date, required: true },
    endedAt: Date,
  },
  { timestamps: true },
);

matchSchema.index({ 'white.userId': 1, endedAt: -1 });
matchSchema.index({ 'black.userId': 1, endedAt: -1 });
matchSchema.index({ startedAt: -1 });
toJsonPlugin(matchSchema);

module.exports = model('Match', matchSchema);
Object.assign(module.exports, { MODES, RESULTS, STATUSES, TERMINATIONS });
