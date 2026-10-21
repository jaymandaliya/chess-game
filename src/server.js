const http = require('http');
const env = require('./config/env');
const { connectDb, disconnectDb } = require('./config/db');
const createApp = require('./app');
const { attachSocket } = require('./game/socket');
const { abortStaleMatches } = require('./game/gameManager');
const logger = require('./utils/logger');

async function main() {
  await connectDb();
  await abortStaleMatches();

  const server = http.createServer(createApp());
  const io = attachSocket(server);
  server.listen(env.port, () => logger.info(`API + game server listening on :${env.port}`));

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    io.close();
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
