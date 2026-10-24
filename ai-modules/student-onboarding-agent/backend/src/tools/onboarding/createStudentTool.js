const { StudentDataValidator } = require('../../validation/StudentDataValidator');
const { KEY_PATTERN } = require('../../customFields/CustomFieldRules');
const { LmsAdapterError } = require('../../adapters/lms/LmsAdapter');
const {
  isPlainObject, invalidArguments, detail, checkKeys, checkRowNumber, approvedRowOrThrow, assertMatchesApproved,
} = require('./toolSupport');

/**
 * createStudent: creates ONE student through the LMS adapter.
 *
 * Arguments: { rowNumber, student }
 *   rowNumber  Excel row of the approved import this student comes from
 *   student    canonical student fields meant for creation: every schema
 *              import field NOT flagged classroomAssignment (fullName, email,
 *              parentName, phone, dob, admissionDate, bloodGroup, address)
 *
 * Rejected, never silently dropped: system-controlled fields (id, password,
 * role, studentId, universityId, classroomId, fees, status, timestamps, ... in
 * any spelling), classroom fields (className, section: see
 * assignStudentToClassroom), unknown fields. Field rules (required, email,
 * phone, date, blood group, types) come from StudentDataValidator.
 * At execution the arguments must equal the approved row exactly.
 */
function createCreateStudentTool(schema) {
  const validator = new StudentDataValidator(schema);
  const creationFields = schema.fields.filter((f) => !f.classroomAssignment).map((f) => f.name);

  return {
    description:
      'Create one student in the LMS from one row of an approved import. Accepts only canonical student ' +
      'creation fields; never IDs, passwords, roles, approval flags, tenant, classroom, fee or status fields.',
    access: 'create',
    inputContract: {
      rowNumber: 'integer >= 1: the Excel row of the approved import',
      student: {
        fields: schema.fields.filter((f) => !f.classroomAssignment).map((f) => ({ name: f.name, type: f.type, required: f.required })),
        rejected: 'system-controlled fields, classroom fields and unknown fields',
      },
    },

    validateInput(input) {
      if (!isPlainObject(input)) throw invalidArguments('createStudent', [detail(null, 'MALFORMED_ARGUMENTS', 'Arguments must be an object { rowNumber, student }.')]);
      const details = [...checkKeys(schema, input, ['rowNumber', 'student', 'customFields'], 'arguments'), ...checkRowNumber(input.rowNumber)];
      const custom = input.customFields;
      if (custom !== undefined && (!isPlainObject(custom) || Object.entries(custom).some(([k, v]) => !KEY_PATTERN.test(k) || !(v === null || typeof v === 'string')))) {
        details.push(detail('customFields', 'INVALID_CUSTOM_FIELDS', '"customFields" must map approved custom field keys to text values.'));
      }
      if (!isPlainObject(input.student)) {
        details.push(detail('student', 'MALFORMED_ARGUMENTS', '"student" must be an object of canonical student fields.'));
        throw invalidArguments('createStudent', details);
      }
      details.push(...checkKeys(schema, input.student, creationFields, 'student', schema.classroomInputFields));
      if (details.length > 0) throw invalidArguments('createStudent', details);

      // Field rules from the schema, via the Step 5 validator (single source of truth).
      const result = validator.validate([{ rowNumber: input.rowNumber, values: input.student }]).rows[0];
      if (result.errors.length > 0) {
        throw invalidArguments('createStudent', result.errors.map((e) => detail(e.field, e.code, e.message)));
      }
      const student = {};
      for (const f of creationFields) student[f] = result.data[f];
      return Object.freeze({ rowNumber: input.rowNumber, student: Object.freeze(student), ...(custom ? { customFields: Object.freeze({ ...custom }) } : {}) });
    },

    async execute(context, args) {
      const approved = approvedRowOrThrow(context, args.rowNumber);
      assertMatchesApproved(args.student, approved, creationFields);
      // Custom values must be exactly the approved row's (same keys, same values): nothing else can be written.
      const approvedCustom = typeof context.approvedCustom === 'function' ? context.approvedCustom(args.rowNumber) || {} : {};
      const given = args.customFields || {};
      assertMatchesApproved(given, approvedCustom, [...new Set([...Object.keys(approvedCustom), ...Object.keys(given)])]);
      const response = await context.lms.createStudent({
        idempotencyKey: context.idempotencyKey('createStudent', args.rowNumber),
        student: args.student,
        ...(Object.keys(given).length ? { customFields: given } : {}),
      });
      if (!response || typeof response.studentRef !== 'string' || response.studentRef === '' || typeof response.created !== 'boolean') {
        throw new LmsAdapterError('The LMS adapter returned an invalid createStudent response.', { code: 'BAD_ADAPTER_RESPONSE' });
      }
      return { studentRef: response.studentRef, created: response.created };
    },
  };
}

module.exports = { createCreateStudentTool };
