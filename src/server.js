const env = require('./config/env');
const { connectDb, disconnectDb } = require('./config/db');
const createApp = require('./app');
const logger = require('./utils/logger');

async function main() {
  await connectDb();
  const server = createApp().listen(env.port, () => logger.info(`API listening on :${env.port}`));

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
