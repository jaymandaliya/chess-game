// Idempotent: safe to run more than once.
// Creates the first super admin and default coin packages; adds sample players/matches outside production.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDb, disconnectDb } = require('../src/config/db');
const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const CoinPackage = require('../src/models/CoinPackage');
const Match = require('../src/models/Match');
const { hashPassword } = require('../src/utils/password');

// Price ladder: bigger packs give more coins per rupee, plus tournament-only bonus coins.
// Edit live values from the admin panel; this only creates missing packages.
const PACKAGES = [
  { name: 'Starter', pricePaise: 9900, coins: 100, bonusTournamentCoins: 30, sortOrder: 1 },
  { name: 'Pro', pricePaise: 29900, coins: 400, bonusTournamentCoins: 100, tag: 'POPULAR', sortOrder: 2 },
  { name: 'Elite', pricePaise: 49900, coins: 700, bonusTournamentCoins: 200, sortOrder: 3 },
  { name: 'Master', pricePaise: 99900, coins: 1500, bonusTournamentCoins: 500, tag: 'BEST VALUE', sortOrder: 4 },
];
const LEGACY_PACKAGES = ['pawn', 'knight', 'champion', 'grandmaster'];

const SAMPLE_PLAYERS = ['Vikash Kumar', 'Priya Sharma', 'Arjun Patel', 'Neha Singh', 'Rohan Mehta', 'Ananya Rao'];
const TIME_CONTROLS = [
  { initialSeconds: 180, incrementSeconds: 2, label: '3+2' },
  { initialSeconds: 300, incrementSeconds: 0, label: '5+0' },
  { initialSeconds: 600, incrementSeconds: 0, label: '10+0' },
];
const TERMINATIONS = ['CHECKMATE', 'RESIGNATION', 'TIMEOUT'];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function elo(rating, opponent, score) {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(rating + 32 * (score - expected));
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, skipping admin');
    return;
  }
  if (await User.exists({ email })) {
    console.log(`Admin ${email} already exists`);
    return;
  }
  await User.create({ email, displayName: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await hashPassword(password) });
  console.log(`Created super admin ${email}`);
}

async function seedPackages() {
  // Packages from the first version are switched off (kept for order history)
  const legacy = await CoinPackage.updateMany({ nameKey: { $in: LEGACY_PACKAGES }, active: true }, { active: false });
  if (legacy.modifiedCount) console.log(`Disabled ${legacy.modifiedCount} legacy packages`);
  for (const pkg of PACKAGES) {
    const nameKey = pkg.name.toLowerCase();
    if (await CoinPackage.exists({ nameKey })) continue;
    await CoinPackage.create(pkg);
    console.log(`Created package ${pkg.name}`);
  }
}

async function seedSampleData() {
  if (await User.exists({ email: 'player1@example.com' })) {
    console.log('Sample data already present');
    return;
  }
  const passwordHash = await hashPassword('Player123');
  const players = [];
  for (let i = 0; i < SAMPLE_PLAYERS.length; i += 1) {
    const daysAgo = Math.floor(Math.random() * 60);
    const user = await User.create({
      email: `player${i + 1}@example.com`,
      displayName: SAMPLE_PLAYERS[i],
      passwordHash,
      lastActiveAt: new Date(Date.now() - daysAgo * 86400000),
      createdAt: new Date(Date.now() - (daysAgo + 10) * 86400000),
    });
    await Wallet.create({ userId: user._id, balance: 0 });
    players.push(user);
  }

  const ratings = new Map(players.map((p) => [String(p._id), 1200]));
  const peaks = new Map(ratings);
  const start = Date.now() - 30 * 86400000;
  for (let i = 0; i < 60; i += 1) {
    const [white, black] = [...players].sort(() => Math.random() - 0.5);
    const roll = Math.random();
    const result = roll < 0.45 ? 'WHITE_WIN' : roll < 0.85 ? 'BLACK_WIN' : 'DRAW';
    const whiteScore = result === 'WHITE_WIN' ? 1 : result === 'DRAW' ? 0.5 : 0;
    const wBefore = ratings.get(String(white._id));
    const bBefore = ratings.get(String(black._id));
    const wAfter = elo(wBefore, bBefore, whiteScore);
    const bAfter = elo(bBefore, wBefore, 1 - whiteScore);
    ratings.set(String(white._id), wAfter);
    ratings.set(String(black._id), bAfter);
    peaks.set(String(white._id), Math.max(peaks.get(String(white._id)), wAfter));
    peaks.set(String(black._id), Math.max(peaks.get(String(black._id)), bAfter));

    const tc = pick(TIME_CONTROLS);
    const startedAt = new Date(start + i * 12 * 3600000);
    await Match.create({
      white: { userId: white._id, displayName: white.displayName, ratingBefore: wBefore, ratingAfter: wAfter },
      black: { userId: black._id, displayName: black.displayName, ratingBefore: bBefore, ratingAfter: bAfter },
      mode: 'RATED',
      timeControl: tc,
      status: 'COMPLETED',
      result,
      termination: result === 'DRAW' ? 'AGREEMENT' : pick(TERMINATIONS),
      winnerId: result === 'WHITE_WIN' ? white._id : result === 'BLACK_WIN' ? black._id : undefined,
      moveCount: 20 + Math.floor(Math.random() * 60),
      startedAt,
      endedAt: new Date(startedAt.getTime() + tc.initialSeconds * 1500),
    });
  }

  for (const p of players) {
    await User.updateOne({ _id: p._id }, { rating: ratings.get(String(p._id)), peakRating: peaks.get(String(p._id)) });
  }
  console.log(`Created ${players.length} sample players (password Player123) and 60 matches`);
}

// Production runs with autoIndex off, so unique indexes (emails, refresh tokens, ledger idempotency keys)
// are created here. Runs on every deploy (Railway pre-deploy) and is a no-op when they already exist.
async function ensureIndexes() {
  const dir = path.join(__dirname, '../src/models');
  for (const file of fs.readdirSync(dir)) if (file !== 'plugins.js') require(path.join(dir, file));
  for (const model of Object.values(mongoose.models)) await model.createIndexes();
  console.log(`Indexes ensured for ${Object.keys(mongoose.models).length} collections`);
}

async function main() {
  await connectDb();
  await ensureIndexes();
  await seedAdmin();
  await seedPackages();
  if (!env.isProd && process.env.SEED_SAMPLE_DATA === 'true') await seedSampleData();
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
