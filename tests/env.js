process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.PAYMENT_PROVIDER = 'mock';
// Replaced by the in-memory replica set URI in helpers.startDb()
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/unused';
