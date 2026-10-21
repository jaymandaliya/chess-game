const { Server } = require('socket.io');
const { z } = require('zod');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { verifyAccessToken } = require('../services/tokenService');
const { getSettings } = require('../services/settingsService');
const manager = require('./gameManager');

const square = z.string().regex(/^[a-h][1-8]$/);
const schemas = {
  queueJoin: z.object({ timeControl: z.enum(Object.keys(manager.TIME_CONTROLS)) }),
  computer: z.object({ level: z.number().int().min(1).max(3).default(2), color: z.enum(['white', 'black', 'random']).default('random') }),
  gameId: z.object({ gameId: z.string().min(1).max(64) }),
  move: z.object({
    gameId: z.string().min(1).max(64),
    from: square,
    to: square,
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
  }),
  drawResponse: z.object({ gameId: z.string().min(1).max(64), accept: z.boolean() }),
};

function socketError(code, message) {
  const err = new Error(message);
  err.data = { code };
  return err;
}

// Every event replies through the ack callback: { ok: true, data } or { ok: false, code, message }
function handler(schema, fn) {
  return async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const parsed = schema ? schema.safeParse(payload ?? {}) : { success: true, data: payload };
      if (!parsed.success) throw AppError.unprocessable('Invalid payload');
      const data = await fn(parsed.data);
      reply({ ok: true, data: data ?? null });
    } catch (err) {
      if (err instanceof AppError) {
        reply({ ok: false, code: err.code, message: err.message });
      } else {
        logger.error({ err }, 'Socket handler error');
        reply({ ok: false, code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
      }
    }
  };
}

async function assertNotMaintenance() {
  const settings = await getSettings();
  if (settings.maintenanceMode) throw new AppError(503, 'MAINTENANCE', 'The platform is under maintenance');
}

function attachSocket(httpServer, options = {}) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins.length ? env.corsOrigins : false, credentials: true },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  // Same access token as the REST API: { auth: { token } }
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(socketError('UNAUTHORIZED', 'Authentication required'));
      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch (err) {
        const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
        return next(socketError(code, 'Invalid access token'));
      }
      const user = await User.findById(payload.sub);
      if (!user || user.status !== 'ACTIVE') return next(socketError('UNAUTHORIZED', 'Account is not active'));
      if (user.role !== 'PLAYER') return next(socketError('FORBIDDEN', 'Only players can play'));
      socket.data.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    const userId = String(user._id);
    socket.join(`user:${userId}`);
    manager.onConnect(socket, user);

    // Re-read the rating at the moment of joining, so it reflects the last finished game
    const freshUser = async () => (await User.findById(userId)) || user;

    socket.on('queue:join', handler(schemas.queueJoin, async ({ timeControl }) => {
      await assertNotMaintenance();
      manager.joinQueue(await freshUser(), timeControl);
      return { timeControl };
    }));
    socket.on('queue:leave', handler(null, async () => ({ left: manager.leaveQueue(userId) })));

    socket.on('game:computer', handler(schemas.computer, async (opts) => {
      await assertNotMaintenance();
      const game = await manager.startComputerGame(await freshUser(), opts);
      return { gameId: game.id };
    }));

    socket.on('game:move', handler(schemas.move, ({ gameId, ...move }) => manager.move(userId, gameId, move)));
    socket.on('game:resign', handler(schemas.gameId, ({ gameId }) => manager.resign(userId, gameId)));
    socket.on('game:abort', handler(schemas.gameId, ({ gameId }) => manager.abort(userId, gameId)));
    socket.on('game:offerDraw', handler(schemas.gameId, ({ gameId }) => manager.offerDraw(userId, gameId)));
    socket.on('game:respondDraw', handler(schemas.drawResponse, ({ gameId, accept }) => manager.respondDraw(userId, gameId, accept)));
    socket.on('game:sync', handler(schemas.gameId, ({ gameId }) => manager.sync(userId, gameId)));

    socket.on('disconnect', () => {
      manager.onDisconnect(user).catch((err) => logger.error({ err }, 'disconnect handling failed'));
    });
  });

  manager.init(io, options);
  return io;
}

module.exports = { attachSocket };
