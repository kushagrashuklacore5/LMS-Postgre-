const { systemKey } = require('../validation/studentSchema');

/**
 * Deterministic rules for admin-approved custom student fields (migration 003). Single source of truth,
 * used for AI suggestions, admin approval and imported values. Never trusts the AI or the client:
 *
 *   key       [a-z][a-z0-9_]{1,39}; not a schema field, system field/alias, LMS column or SQL keyword.
 *             Keys are DATA (a row value), never an identifier in SQL.
 *   label     1-60 plain characters; no markup, URLs, instructions or SQL.
 *   dataType  text | number | date | boolean. An AI suggestion with another type falls back to "text";
 *             an admin request with another type is refused.
 *   values    normalized per type to text (or null); an invalid value is a blocking row error.
 */
const DATA_TYPES = Object.freeze(['text', 'number', 'date', 'boolean']);
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_LABEL = 60;
const MAX_TEXT_VALUE = 500;
const CUSTOM_PREFIX = 'custom:'; // mapping target of a custom field: "custom:transport_route"

// Columns of the LMS tables a student lives in, plus words no field should be called.
const RESERVED = new Set([
  'id', 'name', 'email', 'password', 'role', 'isapproved', 'universityid', 'createdat', 'updatedat', 'classroomid',
  'subscriptionplan', 'createdby', 'userid', 'studentid', 'grade', 'rollnumber', 'totalfees', 'feespaid', 'pendingfees',
  'select', 'insert', 'update', 'delete', 'drop', 'alter', 'create', 'table', 'from', 'where', 'union', 'join', 'exec',
  'execute', 'pragma', 'attach', 'detach', 'vacuum', 'replace', 'truncate', 'grant', 'revoke', 'sqlitemaster', 'rowid',
  'oid', 'null', 'true', 'false', 'admin', 'tenant', 'school', 'university', 'token', 'secret', 'apikey', 'custom',
]);

function protectedKeys(schema) {
  const keys = new Set(RESERVED);
  for (const f of schema.fields) keys.add(systemKey(f.name));
  for (const f of schema.systemFields) for (const n of [f.name, ...f.aliases]) keys.add(systemKey(n));
  return keys;
}

/** "Transport Route" -> "transport_route" (a proposal only; it is validated like any other key). */
function keyFromLabel(label) {
  const k = String(label || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '');
  return k.slice(0, 40).replace(/_+$/, '');
}

/** null when valid, else { code, message }. */
function checkKey(key, schema) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    return { code: 'INVALID_FIELD_KEY', message: 'The field key must be 2-40 characters: a lower-case letter, then lower-case letters, digits or "_".' };
  }
  if (protectedKeys(schema).has(systemKey(key))) {
    return { code: 'PROTECTED_FIELD_KEY', message: 'This key is a built-in, system or reserved name and cannot be a custom field.' };
  }
  return null;
}

function checkLabel(label) {
  if (typeof label !== 'string' || !label.trim() || label.trim().length > MAX_LABEL) {
    return { code: 'INVALID_FIELD_LABEL', message: `The label must be 1-${MAX_LABEL} characters.` };
  }
  const { isUnsafeText } = require('../mapping/ProposalSafety'); // lazy: ProposalSafety also uses these rules
  if (/[<>`]/.test(label) || isUnsafeText(label) || /[\u0000-\u001f]/.test(label)) {
    return { code: 'UNSAFE_FIELD_LABEL', message: 'The label must be plain text (no markup, links, code or instructions).' };
  }
  return null;
}

function checkDataType(dataType) {
  return DATA_TYPES.includes(dataType) ? null : { code: 'INVALID_FIELD_TYPE', message: `The type must be one of: ${DATA_TYPES.join(', ')}.` };
}

/** AI-suggested type: anything outside the closed set safely becomes "text". */
const normalizeSuggestedType = (t) => (DATA_TYPES.includes(t) ? t : 'text');

/**
 * Validates a field definition (admin approval). Returns { field: { key, label, dataType } } or { errors }.
 */
function validateFieldDefinition({ key, label, dataType }, schema) {
  const errors = [checkKey(key, schema), checkLabel(label), checkDataType(dataType)].filter(Boolean);
  return errors.length ? { errors } : { field: { key, label: label.trim(), dataType } };
}

/**
 * One imported cell -> stored text by type. Returns { value } (string or null) or { error: code }.
 * Excel dates arrive from the parser as "YYYY-MM-DDT00:00:00.000Z".
 */
function normalizeValue(dataType, raw) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
  if (dataType === 'text') {
    const t = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'boolean' ? String(raw) : null;
    if (t === null) return { error: 'INVALID_CUSTOM_FIELD_VALUE' };
    return t.length > MAX_TEXT_VALUE ? { error: 'CUSTOM_FIELD_VALUE_TOO_LONG' } : { value: t };
  }
  if (dataType === 'number') {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    return Number.isFinite(n) ? { value: String(n) } : { error: 'INVALID_CUSTOM_FIELD_VALUE' };
  }
  if (dataType === 'date') {
    const m = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(T00:00:00(\.000)?Z)?$/.exec(raw.trim()) : null;
    if (!m) return { error: 'INVALID_CUSTOM_FIELD_VALUE' };
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? { value: `${m[1]}-${m[2]}-${m[3]}` } : { error: 'INVALID_CUSTOM_FIELD_VALUE' };
  }
  if (dataType === 'boolean') {
    const s = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(s)) return { value: 'true' };
    if (['false', 'no', 'n', '0'].includes(s)) return { value: 'false' };
    return { error: 'INVALID_CUSTOM_FIELD_VALUE' };
  }
  return { error: 'INVALID_FIELD_TYPE' };
}

const isCustomTarget = (t) => typeof t === 'string' && t.startsWith(CUSTOM_PREFIX);
const customKeyOf = (t) => (isCustomTarget(t) ? t.slice(CUSTOM_PREFIX.length) : null);
const customTarget = (key) => `${CUSTOM_PREFIX}${key}`;

module.exports = {
  DATA_TYPES, KEY_PATTERN, MAX_LABEL, CUSTOM_PREFIX,
  keyFromLabel, checkKey, checkLabel, checkDataType, normalizeSuggestedType, validateFieldDefinition, normalizeValue,
  isCustomTarget, customKeyOf, customTarget, protectedKeys,
};
