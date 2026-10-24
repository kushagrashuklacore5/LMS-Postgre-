const fs = require('fs');
const path = require('path');

/**
 * Loads config/studentSchema.json (the single source of truth for canonical
 * student fields) and compiles it into the rules the validator applies.
 *
 * The schema is checked strictly: an unknown type, format, normalization step
 * or validation key throws, so a typo in the JSON can never silently switch a
 * rule off.
 */

const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, '../../../config/studentSchema.json');

const TYPES = ['string', 'date'];
const NORMALIZATION_STEPS = ['trim', 'emptyToNull'];
const FORMATS = ['email', 'phone', 'date'];
const VALIDATION_KEYS = ['format', 'allowedValues', 'allowedValuesCaseInsensitive', 'errorCode'];
const COMPARISONS = ['caseInsensitive', 'exact'];

function loadStudentSchema(filePath = DEFAULT_SCHEMA_PATH) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read student schema at ${filePath}: ${err.message}`);
  }
  return compileStudentSchema(raw);
}

function compileStudentSchema(raw) {
  const fail = (msg) => {
    throw new Error(`Invalid student schema: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('root must be an object.');
  if (typeof raw.version !== 'string') fail('"version" must be a string.');
  if (!raw.importFields || typeof raw.importFields !== 'object' || Object.keys(raw.importFields).length === 0) {
    fail('"importFields" must be a non-empty object.');
  }

  const fields = Object.entries(raw.importFields).map(([name, def]) => {
    const where = `importFields.${name}`;
    if (!TYPES.includes(def.type)) fail(`${where}.type must be one of ${TYPES.join(', ')}.`);
    if (typeof def.required !== 'boolean') fail(`${where}.required must be a boolean.`);
    if (def.origin !== 'import') fail(`${where}.origin must be "import".`);
    if (typeof def.unique !== 'boolean') fail(`${where}.unique must be a boolean.`);
    if (typeof def.classroomAssignment !== 'boolean') fail(`${where}.classroomAssignment must be a boolean.`);
    if (typeof def.description !== 'string' || def.description.trim() === '') {
      fail(`${where}.description must be a non-empty string.`);
    }
    const hints = def.mappingHints || [];
    if (!Array.isArray(hints) || hints.some((h) => typeof h !== 'string' || h === '')) {
      fail(`${where}.mappingHints must be an array of strings.`);
    }

    const normalization = def.normalization || [];
    if (!Array.isArray(normalization) || normalization.some((s) => !NORMALIZATION_STEPS.includes(s))) {
      fail(`${where}.normalization may only contain ${NORMALIZATION_STEPS.join(', ')}.`);
    }
    if (def.required && normalization.includes('emptyToNull')) {
      fail(`${where}: a required field cannot use emptyToNull.`);
    }

    const validation = def.validation || {};
    const unknownKeys = Object.keys(validation).filter((k) => !VALIDATION_KEYS.includes(k));
    if (unknownKeys.length > 0) fail(`${where}.validation has unknown key(s): ${unknownKeys.join(', ')}.`);
    if (validation.format !== undefined && !FORMATS.includes(validation.format)) {
      fail(`${where}.validation.format must be one of ${FORMATS.join(', ')}.`);
    }
    if ((def.type === 'date') !== (validation.format === 'date')) {
      fail(`${where}: type "date" and validation.format "date" must be used together.`);
    }

    let allowed = null;
    let caseInsensitive = false;
    if (validation.allowedValues !== undefined) {
      const values = validation.allowedValues;
      if (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== 'string' || v === '')) {
        fail(`${where}.validation.allowedValues must be a non-empty array of strings.`);
      }
      if (typeof validation.errorCode !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(validation.errorCode)) {
        fail(`${where}.validation.errorCode (UPPER_SNAKE_CASE) is required with allowedValues.`);
      }
      caseInsensitive = validation.allowedValuesCaseInsensitive === true;
      // lookup key -> canonical spelling
      allowed = new Map(values.map((v) => [caseInsensitive ? v.toLowerCase() : v, v]));
      if (allowed.size !== values.length) fail(`${where}.validation.allowedValues contains duplicates.`);
    } else if (validation.errorCode !== undefined || validation.allowedValuesCaseInsensitive !== undefined) {
      fail(`${where}.validation: errorCode/allowedValuesCaseInsensitive require allowedValues.`);
    }

    return {
      name,
      description: def.description,
      mappingHints: [...hints], // non-binding examples for the mapping prompt only
      type: def.type,
      required: def.required,
      unique: def.unique,
      classroomAssignment: def.classroomAssignment, // true: input for classroom assignment, not for student creation
      trim: normalization.includes('trim'),
      emptyToNull: normalization.includes('emptyToNull'),
      format: validation.format || null,
      allowed, // Map: lookup key -> canonical spelling, or null
      allowedCaseInsensitive: caseInsensitive,
      allowedValues: validation.allowedValues || null,
      errorCode: validation.errorCode || null,
    };
  });

  const fieldNames = new Set(fields.map((f) => f.name));

  const systemFields = []; // [{ name, aliases }] in schema order
  const systemLookup = new Map(); // comparison key -> schema name
  for (const [name, def] of Object.entries(raw.systemControlledFields || {})) {
    const aliases = def.aliases || [];
    if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string' || a === '')) {
      fail(`systemControlledFields.${name}.aliases must be an array of strings.`);
    }
    for (const n of [name, ...aliases]) systemLookup.set(systemKey(n), name);
    systemFields.push({ name, aliases: [...aliases] });
  }
  for (const f of fields) {
    if (systemLookup.has(systemKey(f.name))) fail(`"${f.name}" is both an import field and system-controlled.`);
  }

  const dup = raw.duplicateDetection || {};
  const uniqueFields = dup.uniqueFields || [];
  if (!COMPARISONS.includes(dup.comparison)) fail(`duplicateDetection.comparison must be one of ${COMPARISONS.join(', ')}.`);
  const flaggedUnique = fields.filter((f) => f.unique).map((f) => f.name);
  if (uniqueFields.length !== flaggedUnique.length || uniqueFields.some((n) => !flaggedUnique.includes(n))) {
    fail('duplicateDetection.uniqueFields must list exactly the import fields with unique: true.');
  }
  for (const n of uniqueFields) if (!fieldNames.has(n)) fail(`duplicateDetection.uniqueFields: unknown field "${n}".`);

  const classroomInputFields = fields.filter((f) => f.classroomAssignment).map((f) => f.name);
  const declared = (raw.classroomAssignment && raw.classroomAssignment.inputFields) || [];
  if (declared.length !== classroomInputFields.length || declared.some((n) => !classroomInputFields.includes(n))) {
    fail('classroomAssignment.inputFields must list exactly the import fields with classroomAssignment: true.');
  }

  return Object.freeze({
    version: raw.version,
    fields,
    fieldNames,
    systemFields,
    systemLookup, // systemKey(name or alias) -> schema name
    uniqueFields,
    caseInsensitiveUnique: dup.comparison === 'caseInsensitive',
    classroomInputFields, // ['className', 'section']
  });
}

/** Comparison key for system field names: ignores case, '_' and '-'. */
function systemKey(name) {
  return name.toLowerCase().replace(/[_-]/g, '');
}

module.exports = { loadStudentSchema, compileStudentSchema, systemKey, DEFAULT_SCHEMA_PATH };
