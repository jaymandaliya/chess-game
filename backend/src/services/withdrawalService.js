const crypto = require('crypto');
const Withdrawal = require('../models/Withdrawal');
const KycProfile = require('../models/KycProfile');
const walletService = require('./walletService');
const { getSettings } = require('./settingsService');
const { audit } = require('./auditService');
const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');

function newRequestNumber() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `WD-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// What the app needs to show the withdraw screen
async function config(userId) {
  const [settings, kyc, balances] = await Promise.all([getSettings(), KycProfile.findOne({ userId }), walletService.getBalances(userId)]);
  return {
    enabled: settings.withdrawalsEnabled,
    coinValuePaise: settings.coinValuePaise,
    minCoins: settings.minWithdrawalCoins,
    tdsPercent: settings.withdrawalTdsPercent,
    kycStatus: kyc ? kyc.status : 'NOT_SUBMITTED',
    balance: balances.play,
  };
}

// Money is computed by the server from the current settings; the request only carries a coin count
function quote(coins, settings) {
  const grossPaise = coins * settings.coinValuePaise;
  const tdsPaise = Math.round((grossPaise * settings.withdrawalTdsPercent) / 100);
  return { coinValuePaise: settings.coinValuePaise, grossPaise, tdsPercent: settings.withdrawalTdsPercent, tdsPaise, netPaise: grossPaise - tdsPaise };
}

async function request(user, coins, req) {
  const settings = await getSettings();
  if (!settings.withdrawalsEnabled) throw AppError.forbidden('Withdrawals are not available right now', 'WITHDRAWALS_DISABLED');
  const kyc = await KycProfile.findOne({ userId: user._id });
  if (!kyc || kyc.status !== 'APPROVED') throw AppError.forbidden('Complete KYC verification before withdrawing', 'KYC_REQUIRED');
  if (coins < settings.minWithdrawalCoins) {
    throw AppError.unprocessable(`Minimum withdrawal is ${settings.minWithdrawalCoins} coins`, 'BELOW_MINIMUM');
  }

  const requestNumber = newRequestNumber();
  const q = quote(coins, settings);
  const withdrawal = await withTransaction(async (session) => {
    await walletService.debit(
      {
        userId: user._id,
        amount: coins,
        type: 'WITHDRAWAL',
        refType: 'WITHDRAWAL',
        refId: requestNumber,
        idempotencyKey: `withdrawal:${requestNumber}`,
        description: `Withdrawal ${requestNumber}`,
      },
      session,
    );
    const [created] = await Withdrawal.create(
      [{
        requestNumber,
        userId: user._id,
        coins,
        ...q,
        payoutMethod: kyc.payoutMethod,
        payoutTo: kyc.payoutMethod === 'UPI' ? kyc.upiMasked : `${kyc.bankAccountMasked} · ${kyc.ifsc}`,
        status: 'PENDING',
      }],
      { session },
    );
    return created;
  });
  await audit(req, { action: 'WITHDRAWAL_REQUESTED', targetType: 'WITHDRAWAL', targetId: withdrawal._id, metadata: { coins, netPaise: q.netPaise } });
  return withdrawal;
}

// PAY: staff confirm the money was sent (payout reference). REJECT: coins go back to the player.
async function review(req, id, { action, payoutReference, reason }) {
  return withTransaction(async (session) => {
    const w = await Withdrawal.findOne({ _id: id }).session(session);
    if (!w) throw AppError.notFound('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
    if (w.status !== 'PENDING') throw AppError.conflict('This withdrawal has already been processed', 'WITHDRAWAL_PROCESSED');

    if (action === 'PAY') {
      w.status = 'PAID';
      w.payoutReference = payoutReference;
    } else {
      await walletService.credit(
        {
          userId: w.userId,
          amount: w.coins,
          type: 'WITHDRAWAL_REVERSAL',
          refType: 'WITHDRAWAL',
          refId: w.requestNumber,
          idempotencyKey: `withdrawal-reversal:${w.requestNumber}`,
          description: `Withdrawal ${w.requestNumber} rejected`,
        },
        session,
      );
      w.status = 'REJECTED';
      w.rejectionReason = reason;
    }
    w.reviewedAt = new Date();
    w.reviewedBy = req.user._id;
    await w.save({ session });
    await audit(
      req,
      {
        action: action === 'PAY' ? 'WITHDRAWAL_PAID' : 'WITHDRAWAL_REJECTED',
        targetType: 'WITHDRAWAL',
        targetId: w._id,
        metadata: { requestNumber: w.requestNumber, coins: w.coins, netPaise: w.netPaise, payoutReference, reason },
      },
      session,
    );
    return w;
  });
}

module.exports = { config, quote, request, review };
