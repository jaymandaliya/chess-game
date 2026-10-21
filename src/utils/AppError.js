class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', code = 'BAD_REQUEST') {
    return new AppError(400, code, message);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Permission denied', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  static unprocessable(message = 'Validation failed', code = 'VALIDATION_ERROR', details) {
    return new AppError(422, code, message, details);
  }
}

module.exports = AppError;
