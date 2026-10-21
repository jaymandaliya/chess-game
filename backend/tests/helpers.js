const fs = require('fs');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const createApp = require('../src/app');
const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const { hashPassword } = require('../src/utils/password');
const settingsService = require('../src/services/settingsService');

const LOCAL_MONGOD = '/opt/homebrew/opt/mongodb-community/bin/mongod';

let replSet;
const app = createApp();

async function startDb() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: fs.existsSync(LOCAL_MONGOD) ? { systemBinary: LOCAL_MONGOD } : undefined,
  });
  // Separate database per Jest worker so parallel test files never share data
  await mongoose.connect(replSet.getUri(`chess_test_${process.env.JEST_WORKER_ID || 1}`));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function stopDb() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  // deleteMany on the raw driver collection bypasses the immutability hooks
  await Promise.all(collections.map((c) => c.deleteMany({})));
  settingsService.clearCache();
}

let counter = 0;
async function createUser({ role = 'PLAYER', password = 'Password123', ...rest } = {}) {
  counter += 1;
  const user = await User.create({
    email: `user${counter}@test.dev`,
    displayName: `User ${counter}`,
    role,
    passwordHash: await hashPassword(password),
    ...rest,
  });
  if (role === 'PLAYER') await Wallet.create({ userId: user._id });
  return user;
}

async function login(user, password = 'Password123') {
  const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

async function asUser(opts) {
  const user = await createUser(opts);
  const session = await login(user, opts && opts.password);
  return { user, token: session.accessToken, refreshToken: session.refreshToken };
}

function api() {
  return request(app);
}

module.exports = { app, api, startDb, stopDb, resetDb, createUser, login, asUser };
