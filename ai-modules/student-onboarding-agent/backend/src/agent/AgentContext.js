const { randomUUID } = require('crypto');
const { ValidationError } = require('../errors');

const ALLOWED_FIELDS = ['requestId', 'source', 'students', 'metadata'];
const MAX_REQUEST_ID_LENGTH = 100;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Normalized state for one onboarding operation. Build it with
 * AgentContext.fromRequest(); the agent only accepts AgentContext instances.
 */
class AgentContext {
  constructor({ requestId, source, students, metadata }) {
    this.requestId = requestId;
    this.source = source; // { type, reference } | null
    this.students = students; // raw records as received; not yet validated
    this.validation = { errors: [], warnings: [] };
    this.status = 'received';
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
  }

  static fromRequest(input) {
    return validateRequest(input);
  }
}

/**
 * Validates raw input and returns an AgentContext. Throws ValidationError
 * listing every problem found.
 *
 * Input (all optional, but at least one of `source` or `students` is required):
 *   requestId  string, caller-supplied id; generated if omitted
 *   source     { type: string, reference?: string }  e.g. { type: 'excel', reference: 'batch.xlsx' }
 *   students   array of plain objects (raw student records, not yet validated)
 *   metadata   plain object, passed through untouched
 */
function validateRequest(input) {
  if (!isPlainObject(input)) {
    throw new ValidationError('Request body must be a JSON object (send Content-Type: application/json).');
  }

  const errors = [];

  const unknown = Object.keys(input).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (unknown.length > 0) {
    errors.push(`Unknown field(s): ${unknown.join(', ')}. Allowed: ${ALLOWED_FIELDS.join(', ')}.`);
  }

  const { requestId, source, students, metadata } = input;

  if (requestId !== undefined) {
    if (!isNonEmptyString(requestId)) {
      errors.push('"requestId" must be a non-empty string.');
    } else if (requestId.length > MAX_REQUEST_ID_LENGTH) {
      errors.push(`"requestId" must be at most ${MAX_REQUEST_ID_LENGTH} characters.`);
    }
  }

  if (source !== undefined) {
    if (!isPlainObject(source)) {
      errors.push('"source" must be an object.');
    } else {
      if (!isNonEmptyString(source.type)) {
        errors.push('"source.type" must be a non-empty string.');
      }
      if (source.reference !== undefined && typeof source.reference !== 'string') {
        errors.push('"source.reference" must be a string.');
      }
    }
  }

  if (students !== undefined) {
    if (!Array.isArray(students)) {
      errors.push('"students" must be an array.');
    } else {
      students.forEach((student, index) => {
        if (!isPlainObject(student)) {
          errors.push(`"students[${index}]" must be an object.`);
        }
      });
    }
  }

  if (metadata !== undefined && !isPlainObject(metadata)) {
    errors.push('"metadata" must be an object.');
  }

  if (source === undefined && students === undefined) {
    errors.push('Provide at least one of "source" or "students".');
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid onboarding request.', errors);
  }

  return new AgentContext({
    requestId: requestId || randomUUID(),
    source: source ? { type: source.type, reference: source.reference ?? null } : null,
    students: students || [],
    metadata: metadata || {},
  });
}

module.exports = { AgentContext };
