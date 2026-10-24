const { ValidationError } = require('../errors');

/**
 * Import job lifecycle.
 *
 *   received ─┬─> parsed ──> mapped ─┬─> needs_review ──> mapped (after a decision / re-validation)
 *             │                      └─> validated ─────> mapped (mapping changed again)
 *             └─> failed (file could not be parsed)            └──> approved (final; nothing leaves it)
 *
 * received      job created, file not parsed yet
 * parsed        workbook parsed into headers + rows
 * mapped        a column mapping is in place; canonical rows are being (re)built and validated
 * needs_review  blocking issues remain (unresolved columns or invalid rows)
 * validated     final validation passed; approval-ready
 * approved      frozen; the input for Step 8
 * failed        the file could not be parsed; nothing can continue
 */
const JOB_STATES = Object.freeze(['received', 'parsed', 'mapped', 'needs_review', 'validated', 'approved', 'failed']);

const TRANSITIONS = Object.freeze({
  received: ['parsed', 'failed'],
  parsed: ['mapped'],
  mapped: ['needs_review', 'validated'],
  needs_review: ['mapped'],
  validated: ['mapped', 'approved'],
  approved: [],
  failed: [],
});

function canTransition(from, to) {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new ValidationError(`An import job cannot move from "${from}" to "${to}".`, [], {
      code: 'INVALID_STATE_TRANSITION',
      statusCode: 409,
    });
  }
}

module.exports = { JOB_STATES, TRANSITIONS, canTransition, assertTransition };
