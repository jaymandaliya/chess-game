const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');

function assertPositiveInt(amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Invalid coin amount: ${amount}`);
}

// Must be called inside a transaction (session) so balance and ledger change together.
// coinType PLAY → wallet.balance, TOURNAMENT → wallet.tournamentBalance
async function credit({ userId, amount, coinType = 'PLAY', type, refType, refId, idempotencyKey, description }, session) {
  assertPositiveInt(amount);
  if (!session) throw new Error('walletService.credit requires a session');
  const field = Wallet.balanceField(coinType);
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { [field]: amount } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true },
  );
  await Transaction.create(
    [{ userId, coinType, type, amount, balanceAfter: wallet[field], refType, refId, idempotencyKey, description }],
    { session },
  );
  return wallet;
}

async function debit({ userId, amount, coinType = 'PLAY', type, refType, refId, idempotencyKey, description }, session) {
  assertPositiveInt(amount);
  if (!session) throw new Error('walletService.debit requires a session');
  const field = Wallet.balanceField(coinType);
  const wallet = await Wallet.findOneAndUpdate(
    { userId, [field]: { $gte: amount } },
    { $inc: { [field]: -amount } },
    { new: true, session },
  );
  if (!wallet) {
    const label = coinType === 'TOURNAMENT' ? 'tournament coins' : 'coins';
    throw AppError.conflict(`Not enough ${label}`, 'INSUFFICIENT_BALANCE');
  }
  await Transaction.create(
    [{ userId, coinType, type, amount: -amount, balanceAfter: wallet[field], refType, refId, idempotencyKey, description }],
    { session },
  );
  return wallet;
}

async function getBalances(userId) {
  const wallet = await Wallet.findOne({ userId });
  return { play: wallet ? wallet.balance : 0, tournament: wallet ? wallet.tournamentBalance || 0 : 0 };
}

async function getBalance(userId, coinType = 'PLAY') {
  const balances = await getBalances(userId);
  return coinType === 'TOURNAMENT' ? balances.tournament : balances.play;
}

module.exports = { credit, debit, getBalance, getBalances };
