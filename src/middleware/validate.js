const AppError = require('../utils/AppError');

// Validated, coerced values are placed on req.valid.{params,query,body}
function validate(schemas) {
  return (req, res, next) => {
    req.valid = req.valid || {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        throw AppError.unprocessable('Validation failed', 'VALIDATION_ERROR', details);
      }
      req.valid[part] = result.data;
    }
    next();
  };
}

module.exports = validate;
