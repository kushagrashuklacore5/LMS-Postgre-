const { systemKey } = require('../validation/studentSchema');

/**
 * Extra deterministic checks on an AI mapping proposal (used by ColumnMappingGuard):
 *
 *   screenProposalText()      model-written text (reasons, suggested names/labels) must not carry
 *                             instructions, SQL, code or markup. Any hit rejects the WHOLE proposal
 *                             (the import then falls back to manual mapping). Excel headers are not
 *                             screened: they are data the admin uploaded, and the prompt marks them so.
 *   checkNewFieldSuggestions() optional "suggestedNewFields": ideas for LMS fields that do not exist yet.
 *                             Display-only in this step: nothing creates a field or a column. Invalid
 *                             suggestions are dropped (with an error); the mapping itself is unaffected.
 */

const MAX_NEW_FIELD_SUGGESTIONS = 20;
const NEW_FIELD_KEYS = Object.freeze(['sourceColumn', 'name', 'label', 'dataType', 'confidence', 'reason']);
const MAX_LABEL_LENGTH = 60;
const MAX_SUGGESTION_REASON_LENGTH = 300;
const SAFE_FIELD_NAME = /^[a-z][a-z0-9_]{1,39}$/; // snake_case, no spaces/quotes/punctuation

// Instructions, SQL statements, code and markup have no place in a column mapping. The masked sample
// tokens (<NAME>, <EMAIL>, ...) are upper-case and are not markup.
const UNSAFE_TEXT = [
  /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(instructions?|rules?|prompt|guardrails?)\b/i,
  /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(drop|alter|truncate|create)\s+(table|column|database|schema|index|user)\b/i,
  /\bdelete\s+from\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+[\w"`]+\s+set\b/i,
  /\bselect\s+[\w*,\s]+\s+from\b/i,
  /;\s*--|\/\*|\*\//,
  /\b(exec|execute|eval)\s*\(/i,
  /<\s*\/?\s*[a-z][a-z0-9-]*(\s[^>]*)?>/, // HTML-like tags (lower-case); <NAME>-style tokens are allowed
  /javascript:|data:text\/html|https?:\/\//i,
  /```/,
];

function isUnsafeText(value) {
  return typeof value === 'string' && UNSAFE_TEXT.some((re) => re.test(value));
}

/** Every model-written string of a proposal (not the copied Excel headers). */
function modelTexts(proposal) {
  const out = [];
  const add = (where, v) => { if (typeof v === 'string') out.push([where, v]); };
  if (Array.isArray(proposal.mappings)) {
    proposal.mappings.forEach((m, i) => {
      if (!m || typeof m !== 'object') return;
      add(`mappings[${i}].reason`, m.reason);
      add(`mappings[${i}].targetField`, m.targetField);
      if (Array.isArray(m.candidateFields)) m.candidateFields.forEach((c, j) => add(`mappings[${i}].candidateFields[${j}]`, c));
    });
  }
  if (Array.isArray(proposal.suggestedNewFields)) {
    proposal.suggestedNewFields.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      for (const k of ['name', 'label', 'dataType', 'reason']) add(`suggestedNewFields[${i}].${k}`, s[k]);
    });
  }
  return out;
}

/** Proposal-level issues for unsafe model text (empty = clean). Messages never repeat the text. */
function screenProposalText(proposal) {
  return modelTexts(proposal)
    .filter(([, v]) => isUnsafeText(v))
    .map(([where]) => ({ code: 'UNSAFE_CONTENT', severity: 'error', message: `The AI response contains instructions, code or markup (${where}); it was not used.` }));
}

/**
 * suggestedNewFields: [{ sourceColumn, name, label, reason? }] for columns the AI left "unmapped".
 * Returns { accepted: [...], errors: [{ index, code, message }] }.
 */
function checkNewFieldSuggestions(list, { schema, unmappedColumns, existingCustomKeys = [] }) {
  const accepted = [];
  const errors = [];
  if (list === undefined || list === null) return { accepted, errors };
  if (!Array.isArray(list)) return { accepted, errors: [{ index: null, code: 'INVALID_NEW_FIELD_SUGGESTIONS', message: '"suggestedNewFields" must be an array; it was ignored.' }] };

  const existing = new Set([...schema.fields.map((f) => systemKey(f.name)), ...schema.systemFields.flatMap((f) => [f.name, ...f.aliases].map(systemKey))]);
  const seenNames = new Set();
  const seenColumns = new Set();
  list.slice(0, MAX_NEW_FIELD_SUGGESTIONS).forEach((s, index) => {
    const reject = (code, message) => errors.push({ index, code, message });
    if (!s || typeof s !== 'object' || Array.isArray(s)) return reject('MALFORMED_NEW_FIELD_SUGGESTION', 'A new-field suggestion must be an object.');
    const extra = Object.keys(s).filter((k) => !NEW_FIELD_KEYS.includes(k));
    if (extra.length) return reject('UNEXPECTED_PROPERTY', `Unexpected property in a new-field suggestion (allowed: ${NEW_FIELD_KEYS.join(', ')}).`);
    if (typeof s.sourceColumn !== 'string' || !unmappedColumns.has(s.sourceColumn)) {
      return reject('NEW_FIELD_SOURCE_NOT_UNMAPPED', 'A new field can only be suggested for a column the AI left unmapped.');
    }
    if (typeof s.name !== 'string' || !SAFE_FIELD_NAME.test(s.name)) {
      return reject('UNSAFE_NEW_FIELD_NAME', 'A suggested field name must be snake_case: a lower-case letter, then letters, digits or "_" (2-40 characters).');
    }
    if (existing.has(systemKey(s.name)) || existingCustomKeys.includes(s.name)) return reject('NEW_FIELD_ALREADY_EXISTS', 'The suggested name is an existing (built-in, custom or system-controlled) field.');
    const keyProblem = rules().checkKey(s.name, schema); // same rules as an admin approval (reserved / SQL words)
    if (keyProblem) return reject('UNSAFE_NEW_FIELD_NAME', keyProblem.message);
    if (typeof s.label !== 'string' || !s.label.trim() || s.label.length > MAX_LABEL_LENGTH || rules().checkLabel(s.label)) {
      return reject('INVALID_NEW_FIELD_LABEL', `A suggested field needs a plain-text label of at most ${MAX_LABEL_LENGTH} characters.`);
    }
    if (s.confidence !== undefined && s.confidence !== null && !(typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1)) {
      return reject('INVALID_CONFIDENCE', 'confidence must be a number between 0 and 1.');
    }
    if (s.reason !== undefined && s.reason !== null && (typeof s.reason !== 'string' || s.reason.length > MAX_SUGGESTION_REASON_LENGTH)) {
      return reject('INVALID_REASON', `reason must be a string of at most ${MAX_SUGGESTION_REASON_LENGTH} characters.`);
    }
    if (seenNames.has(s.name) || seenColumns.has(s.sourceColumn)) return reject('DUPLICATE_NEW_FIELD_SUGGESTION', 'Each new field and each column may be suggested only once.');
    seenNames.add(s.name);
    seenColumns.add(s.sourceColumn);
    accepted.push({
      sourceColumn: s.sourceColumn, name: s.name, label: s.label.trim(),
      dataType: rules().normalizeSuggestedType(s.dataType), // unknown/missing type -> "text" (never an arbitrary SQL type)
      confidence: typeof s.confidence === 'number' ? s.confidence : null,
      reason: typeof s.reason === 'string' ? s.reason : null,
    });
  });
  if (list.length > MAX_NEW_FIELD_SUGGESTIONS) {
    errors.push({ index: null, code: 'TOO_MANY_NEW_FIELD_SUGGESTIONS', message: `Only the first ${MAX_NEW_FIELD_SUGGESTIONS} new-field suggestions were considered.` });
  }
  return { accepted, errors };
}

/** Lazy: CustomFieldRules also uses isUnsafeText from this file. */
const rules = () => require('../customFields/CustomFieldRules');

module.exports = { screenProposalText, checkNewFieldSuggestions, isUnsafeText, NEW_FIELD_KEYS, SAFE_FIELD_NAME, MAX_NEW_FIELD_SUGGESTIONS };
