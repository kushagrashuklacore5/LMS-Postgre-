const { isValidEmail } = require('../../validation/formats');
const { LmsAdapterError, ASSIGNMENT_OUTCOMES } = require('../../adapters/lms/LmsAdapter');
const {
  isPlainObject, invalidArguments, detail, checkKeys, checkRowNumber, approvedRowOrThrow, assertMatchesApproved,
} = require('./toolSupport');

const ARGUMENTS = ['rowNumber', 'email', 'className', 'section'];

/**
 * assignStudentToClassroom: asks the LMS to put an approved, created student
 * into the classroom named by className + section.
 *
 * Arguments: { rowNumber, email, className, section }, all required.
 * Business-level identifiers only: the student by email (the canonical unique
 * field), the classroom by its human-readable class and section. classroomId,
 * id and every other system field are rejected; the LMS adapter resolves the
 * classroom (case-insensitive exact match, zero or several matches reported,
 * decision OD-7), so no one, including an LLM, can supply or invent an ID.
 * At execution the arguments must equal the approved row exactly.
 */
function createAssignStudentToClassroomTool(schema) {
  return {
    description:
      'Assign one created student (identified by email) to the classroom named by className and section, ' +
      'from one row of an approved import. Never accepts classroom or database IDs.',
    access: 'create',
    inputContract: {
      rowNumber: 'integer >= 1: the Excel row of the approved import',
      email: 'string: the student email from that row',
      className: 'string: class/grade as approved (e.g. "10")',
      section: 'string: section as approved (e.g. "A")',
      rejected: 'classroomId, any other ID, and unknown fields',
    },

    validateInput(input) {
      if (!isPlainObject(input)) throw invalidArguments('assignStudentToClassroom', [detail(null, 'MALFORMED_ARGUMENTS', 'Arguments must be an object.')]);
      const details = [...checkKeys(schema, input, ARGUMENTS, 'arguments'), ...checkRowNumber(input.rowNumber)];
      const text = {};
      for (const f of ['email', 'className', 'section']) {
        const v = input[f];
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) details.push(detail(f, 'REQUIRED_FIELD_MISSING', `"${f}" is required.`));
        else if (typeof v !== 'string') details.push(detail(f, 'INVALID_FIELD_TYPE', `"${f}" must be text.`));
        else text[f] = v.trim();
      }
      if (text.email !== undefined && !isValidEmail(text.email)) details.push(detail('email', 'INVALID_EMAIL', '"email" is not a valid email address.'));
      if (details.length > 0) throw invalidArguments('assignStudentToClassroom', details);
      return Object.freeze({ rowNumber: input.rowNumber, email: text.email, className: text.className, section: text.section });
    },

    async execute(context, args) {
      const approved = approvedRowOrThrow(context, args.rowNumber);
      assertMatchesApproved(args, approved, ['email', 'className', 'section']);
      const response = await context.lms.assignStudentToClassroom({
        idempotencyKey: context.idempotencyKey('assignStudentToClassroom', args.rowNumber),
        studentEmail: args.email,
        className: args.className,
        section: args.section,
      });
      if (!response || !ASSIGNMENT_OUTCOMES.includes(response.outcome) || (response.assignmentRef !== null && typeof response.assignmentRef !== 'string')) {
        throw new LmsAdapterError('The LMS adapter returned an invalid assignStudentToClassroom response.', { code: 'BAD_ADAPTER_RESPONSE' });
      }
      return { outcome: response.outcome, assignmentRef: response.assignmentRef, replayed: response.replayed === true };
    },
  };
}

module.exports = { createAssignStudentToClassroomTool };
