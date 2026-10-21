const { z } = require('zod');

const baseListQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

// Builds a list query schema; sortBy is restricted to the given fields
function listQuery(sortFields, extra = {}) {
  return z.object({
    ...baseListQuery,
    sortBy: z.enum(sortFields).default(sortFields[0]),
    ...extra,
  });
}

function dateRange(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return range;
}

async function paginate(Model, filter, q, { populate, select } = {}) {
  const order = q.sortOrder === 'asc' ? 1 : -1;
  let find = Model.find(filter)
    .sort({ [q.sortBy]: order, _id: order })
    .skip((q.page - 1) * q.limit)
    .limit(q.limit);
  if (populate) find = find.populate(populate);
  if (select) find = find.select(select);
  const [items, total] = await Promise.all([find, Model.countDocuments(filter)]);
  return {
    items,
    pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  };
}

module.exports = { listQuery, dateRange, paginate };
