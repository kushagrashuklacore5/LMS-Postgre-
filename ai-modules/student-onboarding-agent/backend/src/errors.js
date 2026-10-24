/**
 * Raised when caller-supplied input is invalid. The HTTP layer maps it to
 * `statusCode` (400 by default); `details` lists each problem so callers can
 * fix all of them at once. `code` lets clients tell failure kinds apart
 * (e.g. DUPLICATE_HEADER vs EMPTY_FILE).
 */
class ValidationError extends Error {
  constructor(message, details = [], { code = 'VALIDATION_ERROR', statusCode = 400 } = {}) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

module.exports = { ValidationError };
