const express = require('express');
const { z } = require('zod');
const CoinPackage = require('../../models/CoinPackage');
const { audit } = require('../../services/auditService');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const { ok, created, findByIdOr404, escapeRegex } = require('../../utils/http');
const { listQuery, paginate } = require('../../utils/pagination');
const { idParam } = require('../schemas');

const router = express.Router();

const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9 &'-]+$/, 'Name may contain letters, numbers, spaces, & \' -');

const fields = {
  name: nameSchema,
  coins: z.number().int().min(1).max(10_000_000),
  bonusTournamentCoins: z.number().int().min(0).max(10_000_000),
  // ₹1 to ₹1,00,000
  pricePaise: z.number().int().min(100).max(10_000_000),
  tag: z.string().trim().max(20).nullable(),
  sortOrder: z.number().int().min(0).max(1000),
};

async function assertNameFree(name, exceptId) {
  const clash = await CoinPackage.findOne({ nameKey: name.trim().toLowerCase(), _id: { $ne: exceptId } });
  if (clash) throw AppError.conflict('A package with this name already exists', 'PACKAGE_NAME_TAKEN');
}

router.get(
  '/',
  validate({
    query: listQuery(['sortOrder', 'createdAt', 'pricePaise', 'coins', 'name'], {
      active: z.enum(['true', 'false']).optional(),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = {};
    if (q.active) filter.active = q.active === 'true';
    if (q.search) filter.name = new RegExp(escapeRegex(q.search), 'i');
    return ok(res, await paginate(CoinPackage, filter, q));
  },
);

router.post(
  '/',
  validate({
    body: z
      .object({
        ...fields,
        bonusTournamentCoins: fields.bonusTournamentCoins.optional(),
        tag: fields.tag.optional(),
        sortOrder: fields.sortOrder.optional(),
        active: z.boolean().optional(),
      })
      .strict(),
  }),
  async (req, res) => {
    const body = req.valid.body;
    await assertNameFree(body.name);
    const pkg = await CoinPackage.create({ ...body, tag: body.tag || undefined, createdBy: req.user._id, updatedBy: req.user._id });
    await audit(req, {
      action: 'PACKAGE_CREATED',
      targetType: 'COIN_PACKAGE',
      targetId: pkg._id,
      metadata: { name: pkg.name, coins: pkg.coins, bonusTournamentCoins: pkg.bonusTournamentCoins, pricePaise: pkg.pricePaise, active: pkg.active },
    });
    return created(res, pkg);
  },
);

router.patch(
  '/:id',
  validate({
    params: idParam,
    body: z
      .object(fields)
      .partial()
      .strict()
      .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update'),
  }),
  async (req, res) => {
    const pkg = await findByIdOr404(CoinPackage, req.valid.params.id, 'Coin package not found');
    const body = req.valid.body;
    if (body.name) await assertNameFree(body.name, pkg._id);

    const changes = {};
    for (const [key, value] of Object.entries(body)) {
      const next = value === null ? undefined : value;
      if (pkg[key] !== next) {
        changes[key] = { from: pkg[key] ?? null, to: next ?? null };
        pkg[key] = next;
      }
    }
    pkg.updatedBy = req.user._id;
    await pkg.save();

    // Existing orders keep their own price snapshot, so history is unaffected
    await audit(req, {
      action: changes.pricePaise ? 'PACKAGE_PRICE_CHANGED' : 'PACKAGE_UPDATED',
      targetType: 'COIN_PACKAGE',
      targetId: pkg._id,
      metadata: { name: pkg.name, changes },
    });
    return ok(res, pkg);
  },
);

router.patch(
  '/:id/status',
  validate({ params: idParam, body: z.object({ active: z.boolean() }).strict() }),
  async (req, res) => {
    const pkg = await findByIdOr404(CoinPackage, req.valid.params.id, 'Coin package not found');
    const previous = pkg.active;
    pkg.active = req.valid.body.active;
    pkg.updatedBy = req.user._id;
    await pkg.save();
    await audit(req, {
      action: pkg.active ? 'PACKAGE_ENABLED' : 'PACKAGE_DISABLED',
      targetType: 'COIN_PACKAGE',
      targetId: pkg._id,
      metadata: { name: pkg.name, from: previous, to: pkg.active },
    });
    return ok(res, pkg);
  },
);

module.exports = router;
