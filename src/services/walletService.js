const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');

function assertPositiveInt(amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Invalid coin amount: ${amount}`);
}

// Must be called inside a transaction (session) so balance and ledger change together
async function credit({ userId, amount, type, refType, refId, idempotencyKey, description }, session) {
  assertPositiveInt(amount);
  if (!session) throw new Error('walletService.credit requires a session');
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true },
  );
  await Transaction.create(
    [{ userId, type, amount, balanceAfter: wallet.balance, refType, refId, idempotencyKey, description }],
    { session },
  );
  return wallet;
}

async function debit({ userId, amount, type, refType, refId, idempotencyKey, description }, session) {
  assertPositiveInt(amount);
  if (!session) throw new Error('walletService.debit requires a session');
  const wallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true, session },
  );
  if (!wallet) throw AppError.conflict('Insufficient coin balance', 'INSUFFICIENT_BALANCE');
  await Transaction.create(
    [{ userId, type, amount: -amount, balanceAfter: wallet.balance, refType, refId, idempotencyKey, description }],
    { session },
  );
  return wallet;
}

async function getBalance(userId) {
  const wallet = await Wallet.findOne({ userId });
  return wallet ? wallet.balance : 0;
}

module.exports = { credit, debit, getBalance };
