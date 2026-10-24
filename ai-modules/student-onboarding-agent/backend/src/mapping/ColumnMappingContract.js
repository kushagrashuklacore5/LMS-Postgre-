/**
 * Provider-independent contract for Excel-column → canonical-field mapping
 * proposals (Step 6A). A proposal will later come from an LLM (Step 6B), but
 * nothing here knows about any provider.
 *
 * Proposal (what a proposer may send):
 *   {
 *     mappings: [
 *       { sourceColumn: 'Student Name', status: 'mapped', targetField: 'fullName',
 *         confidence: 0.97, reason: 'Contains full names' },
 *       { sourceColumn: 'ID', status: 'ambiguous', candidateFields: [], reason: 'Could be several things' },
 *       { sourceColumn: 'Remarks', status: 'unmapped', reason: 'No canonical field' },
 *     ]
 *   }
 *
 * Every Excel header must appear exactly once. Allowed and forbidden targets
 * are derived from config/studentSchema.json (via the compiled schema); this
 * file hard-codes no field names.
 */

/** Statuses a proposer may use. */
const PROPOSAL_STATUSES = Object.freeze(['mapped', 'unmapped', 'ambiguous']);

/** Statuses in a guard result: 'rejected' is assigned only by the guard. */
const RESULT_STATUSES = Object.freeze([...PROPOSAL_STATUSES, 'rejected']);

// suggestedNewFields (optional): ideas for fields the LMS does not have yet; display-only (see ProposalSafety.js).
const PROPOSAL_KEYS = Object.freeze(['mappings', 'suggestedNewFields']);
const MAPPING_KEYS = Object.freeze(['sourceColumn', 'status', 'targetField', 'candidateFields', 'confidence', 'reason']);

/** Bounds free text coming from a model; the reason is advisory only. */
const MAX_REASON_LENGTH = 500;

/** Importable canonical fields, in schema order. */
function getMappingTargets(schema) {
  return schema.fields.map((f) => ({
    field: f.name,
    type: f.type,
    required: f.required,
    description: f.description,
    mappingHints: [...f.mappingHints],
  }));
}

/** System-controlled names and aliases that can never be targets. */
function getForbiddenTargets(schema) {
  return schema.systemFields.flatMap((f) => [f.name, ...f.aliases]);
}

/**
 * A plain-JSON description of the contract, derived only from the schema.
 * Intended as the input a Step 6B prompt builder can hand to a model.
 * Deterministic: same schema, same output.
 */
function describeMappingContract(schema) {
  return {
    schemaVersion: schema.version,
    statuses: [...PROPOSAL_STATUSES],
    targets: getMappingTargets(schema),
    forbiddenTargets: getForbiddenTargets(schema),
    rules: [
      'Return exactly one entry per Excel column, using the column name exactly as given.',
      'status "mapped": targetField must be one of targets[].field; confidence (0 to 1) is required.',
      'status "ambiguous": the column could mean several things; do not set targetField. candidateFields may list possible targets.',
      'status "unmapped": no canonical field fits; do not set targetField.',
      'Never use a forbidden target. Never map two columns to the same targetField.',
      `reason is optional plain text, at most ${MAX_REASON_LENGTH} characters.`,
      'suggestedNewFields is optional: for an "unmapped" column worth keeping, suggest { sourceColumn, name (snake_case), label, dataType (text|number|date|boolean), confidence, reason }. It is only an idea for an administrator; nothing is created.',
      'Confidence is advisory only; it never makes a mapping safe by itself.',
    ],
    outputShape: {
      mappings: [
        { sourceColumn: '<Excel column>', status: 'mapped', targetField: '<target field>', confidence: 0.9, reason: '<why>' },
        { sourceColumn: '<Excel column>', status: 'ambiguous', candidateFields: ['<target field>'], reason: '<why>' },
        { sourceColumn: '<Excel column>', status: 'unmapped', reason: '<why>' },
      ],
      suggestedNewFields: [{ sourceColumn: '<an unmapped Excel column>', name: '<snake_case_name>', label: '<Readable label>', dataType: 'text', confidence: 0.8, reason: '<why>' }],
    },
  };
}

module.exports = {
  PROPOSAL_STATUSES,
  RESULT_STATUSES,
  PROPOSAL_KEYS,
  MAPPING_KEYS,
  MAX_REASON_LENGTH,
  getMappingTargets,
  getForbiddenTargets,
  describeMappingContract,
};
