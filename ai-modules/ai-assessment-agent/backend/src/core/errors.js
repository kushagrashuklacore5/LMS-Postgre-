/**
 * The only error type the assessment agent raises on purpose. `code` is a
 * stable machine-readable string, `message` is fixed text safe to show a user,
 * `statusCode` is the HTTP status the HTTP layer maps it to, and `details`
 * lists per-field problems ({ field, code }) so a client can fix all of them
 * at once. Messages never contain SQL, stack traces or other users' data.
 */
class AssessmentError extends Error {
  constructor(code, message, { statusCode = 400, details = [] } = {}) {
    super(message);
    this.name = 'AssessmentError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const notFound = () => new AssessmentError('NOT_FOUND', 'Assessment not found.', { statusCode: 404 });
const forbidden = (message = 'You do not have access to this action.') => new AssessmentError('FORBIDDEN', message, { statusCode: 403 });

module.exports = { AssessmentError, notFound, forbidden };
