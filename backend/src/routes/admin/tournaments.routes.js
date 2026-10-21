const express = require('express');
const { z } = require('zod');
const Tournament = require('../../models/Tournament');
const tournamentService = require('../../services/tournamentService');
const { audit } = require('../../services/auditService');
const validate = require('../../middleware/validate');
const { ok, created, findByIdOr404, escapeRegex } = require('../../utils/http');
const { listQuery, paginate } = require('../../utils/pagination');
const { TIME_CONTROLS } = require('../../game/gameManager');
const { idParam } = require('../schemas');

const router = express.Router();

router.get(
  '/',
  validate({ query: listQuery(['startsAt', 'createdAt'], { status: z.enum(Tournament.STATUSES).optional() }) }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = {};
    if (q.status) filter.status = q.status;
    if (q.search) filter.name = new RegExp(escapeRegex(q.search), 'i');
    const page = await paginate(Tournament, filter, q, { select: '-rounds' });
    return ok(res, { ...page, items: page.items.map((t) => ({ ...t.toJSON(), playerCount: t.players.length })) });
  },
);

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const t = await findByIdOr404(Tournament, req.valid.params.id, 'Tournament not found');
  return ok(res, { ...t.toJSON(), playerCount: t.players.length });
});

const createSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().max(300).optional(),
    entryFee: z.number().int().min(0).max(1_000_000),
    timeControl: z.enum(Object.keys(TIME_CONTROLS)),
    maxPlayers: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
    prizeSplit: z.array(z.number().int().min(0).max(100)).min(1).max(3),
    roundMinutes: z.number().int().min(3).max(120).default(10),
    startsAt: z.coerce.date(),
  })
  .strict()
  .refine((v) => v.prizeSplit.reduce((a, b) => a + b, 0) <= 100, { message: 'Prize split cannot exceed 100%', path: ['prizeSplit'] })
  .refine((v) => v.startsAt > new Date(Date.now() - 60_000), { message: 'Start time must be in the future', path: ['startsAt'] });

router.post('/', validate({ body: createSchema }), async (req, res) => {
  const body = req.valid.body;
  const [initialSeconds, incrementSeconds] = TIME_CONTROLS[body.timeControl];
  const t = await tournamentService.create(
    { ...body, timeControl: { initialSeconds, incrementSeconds, label: body.timeControl } },
    req.user,
  );
  await audit(req, {
    action: 'TOURNAMENT_CREATED',
    targetType: 'TOURNAMENT',
    targetId: t._id,
    metadata: { name: t.name, entryFee: t.entryFee, maxPlayers: t.maxPlayers, prizeSplit: t.prizeSplit },
  });
  return created(res, t);
});

router.post('/:id/start', validate({ params: idParam }), async (req, res) => ok(res, await tournamentService.startNow(req.valid.params.id, req)));

router.post(
  '/:id/cancel',
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(200) }).strict() }),
  async (req, res) => ok(res, await tournamentService.cancel(req.valid.params.id, req.valid.body.reason, req)),
);

module.exports = router;
