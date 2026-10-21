const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const STATUSES = ['REGISTRATION', 'RUNNING', 'COMPLETED', 'CANCELLED'];
const PAIRING_STATUSES = ['WAITING', 'PLAYING', 'DONE'];

const entrantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true },
    rating: Number,
    seed: Number,
    joinedAt: { type: Date, default: Date.now },
    eliminatedInRound: Number,
  },
  { _id: false },
);

const sideSchema = new Schema({ userId: Schema.Types.ObjectId, displayName: String, seed: Number }, { _id: false });

// One knockout pairing. A null side is a bye. Draws are replayed; the games list keeps every attempt.
const pairingSchema = new Schema({
  a: { type: sideSchema, default: null },
  b: { type: sideSchema, default: null },
  status: { type: String, enum: PAIRING_STATUSES, default: 'WAITING' },
  readyUserIds: [Schema.Types.ObjectId],
  gameIds: [String],
  currentGameId: String,
  draws: { type: Number, default: 0 },
  winnerId: { type: Schema.Types.ObjectId, default: null },
  decidedBy: { type: String, enum: ['GAME', 'BYE', 'FORFEIT', 'TIEBREAK'] },
});

const roundSchema = new Schema(
  {
    number: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    pairings: [pairingSchema],
  },
  { _id: false },
);

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    entryFee: { type: Number, required: true, min: 0, validate: Number.isInteger }, // tournament coins
    timeControl: {
      initialSeconds: { type: Number, required: true },
      incrementSeconds: { type: Number, default: 0 },
      label: { type: String, required: true },
    },
    maxPlayers: { type: Number, required: true, enum: [4, 8, 16, 32] },
    prizeSplit: { type: [Number], required: true }, // percent of net pool: [1st, 2nd, 3rd/4th shared]
    feePercent: { type: Number, required: true },
    roundMinutes: { type: Number, default: 10 }, // time to play each round before forfeits apply
    startsAt: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: 'REGISTRATION', index: true },
    players: [entrantSchema],
    rounds: [roundSchema],
    prizePool: { type: Number, default: 0 },
    feeCoins: { type: Number, default: 0 },
    payouts: [{ _id: false, userId: Schema.Types.ObjectId, displayName: String, place: Number, coins: Number }],
    winnerId: Schema.Types.ObjectId,
    cancelReason: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
  },
  { timestamps: true },
);

tournamentSchema.index({ status: 1, startsAt: 1 });
tournamentSchema.index({ 'players.userId': 1 });
toJsonPlugin(tournamentSchema);

module.exports = model('Tournament', tournamentSchema);
Object.assign(module.exports, { STATUSES, PAIRING_STATUSES });
