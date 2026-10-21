// Exposes `id` instead of `_id`, drops `__v` and any hidden fields from API output
function toJsonPlugin(schema, { hide = [] } = {}) {
  schema.set('toJSON', {
    virtuals: false,
    transform(doc, ret) {
      if (ret._id !== undefined) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      delete ret.__v;
      for (const field of hide) delete ret[field];
      return ret;
    },
  });
}

// Ledger and audit records may only be inserted, never changed or removed
function immutablePlugin(schema, modelName) {
  const blocked = [
    'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete',
  ];
  for (const op of blocked) {
    schema.pre(op, function block(next) {
      next(new Error(`${modelName} records are immutable`));
    });
  }
  schema.pre('save', function blockUpdate(next) {
    if (!this.isNew) return next(new Error(`${modelName} records are immutable`));
    next();
  });
}

module.exports = { toJsonPlugin, immutablePlugin };
