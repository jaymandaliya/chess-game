const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const logger = require('./utils/logger');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : false, credentials: true }));
  if (!env.isTest) app.use(pinoHttp({ logger }));

  app.use(
    express.json({
      limit: '100kb',
      // Webhook signatures are computed over the exact raw bytes
      verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/v1/payments/webhook')) req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());

  app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
