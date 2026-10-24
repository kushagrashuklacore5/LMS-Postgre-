const { ValidationError } = require('../../errors');
const { validateFieldDefinition, checkLabel, checkDataType, KEY_PATTERN } = require('../../customFields/CustomFieldRules');

/**
 * Admin-approved custom student field DEFINITIONS (migration 003) for ONE verified admin of ONE school.
 *
 * - Every query is scoped by the actor's university_id; another school's fields do not exist here.
 * - The actor is re-checked against the LMS inside every write transaction (admin, same school).
 * - The field key is DATA in a parameterized statement - never an SQL identifier. No column is ever
 *   added to any table; a field is one row in soa_custom_fields. No SQL text comes from the AI or client.
 * - Writes: insert a field (ensureField); rename its label / change its type while it holds NO value
 *   (updateField); retire it (retireField: kept with its values, no longer offered for new imports); and
 *   remove a field THIS approval just created and that holds no value (compensation when the import job
 *   could not record the approval). Nothing else is ever deleted.
 * Values are written by PostgresLmsAdapter.createStudent, in the same transaction as the student.
 * `sql` is the LMS database interface { get, all, run, transaction } (? placeholders, promises).
 */
const TABLES = Object.freeze(['soa_custom_fields', 'soa_custom_field_values']);

class PostgresCustomFieldStore {
  constructor({ sql, actor, schema, now = () => Date.now() }) {
    this.sql = sql;
    this.actor = actor;
    this.schema = schema;
    this.now = now;
  }

  /** Migration 003 applied? */
  async isReady() {
    const { n } = await this.sql.get(`SELECT COUNT(*) AS n FROM information_schema.tables
                                      WHERE table_schema = current_schema() AND table_name IN (${TABLES.map(() => '?').join(', ')})`, TABLES);
    return n === TABLES.length;
  }

  async requireReady() {
    if (!(await this.isReady())) {
      throw new ValidationError('Custom student fields are not available yet (a database update is pending).', [], { code: 'CUSTOM_FIELDS_NOT_READY', statusCode: 503 });
    }
  }

  /**
   * Creates the field for this school, or returns the existing field with the same key and type.
   * Validated again here (never trusting the caller). Atomic: one transaction, one row.
   * Returns { field: { id, key, label, dataType }, created }.
   */
  async ensureField(definition) {
    await this.requireReady();
    const checked = validateFieldDefinition(definition, this.schema);
    if (checked.errors) throw new ValidationError('The field definition is not valid.', checked.errors, { code: 'INVALID_FIELD_DEFINITION' });
    const { key, label, dataType } = checked.field;
    return this.sql.transaction(async () => {
      await this.verifyActor();
      const existing = await this.sql.get('SELECT id, field_key, label, data_type, retired_at FROM soa_custom_fields WHERE university_id = ? AND field_key = ?',
        [this.actor.universityId, key]);
      if (existing) {
        if (existing.retired_at !== null && existing.retired_at !== undefined) {
          // Reactivate the retired field so the school can use it again!
          const sameType = existing.data_type === dataType;
          const nextType = sameType ? existing.data_type : dataType;
          if (!sameType) {
            const { n: used } = await this.sql.get('SELECT COUNT(*) AS n FROM soa_custom_field_values WHERE field_id = ? AND university_id = ?', [existing.id, this.actor.universityId]);
            if (used > 0) {
              throw new ValidationError(`This retired field holds values of type "${existing.data_type}". Keep type "${existing.data_type}" or use another key.`, [], { code: 'FIELD_KEY_CONFLICT', statusCode: 409 });
            }
          }
          await this.sql.run('UPDATE soa_custom_fields SET retired_at = NULL, retired_by = NULL, label = ?, data_type = ?, updated_at = ? WHERE id = ? AND university_id = ?',
            [label.trim(), nextType, this.now(), existing.id, this.actor.universityId]);
          return { field: { id: existing.id, key, label: label.trim(), dataType: nextType }, created: false };
        }
        if (existing.data_type !== dataType) {
          throw new ValidationError(`This school already has a field "${key}" of type ${existing.data_type}.`, [], { code: 'FIELD_KEY_CONFLICT', statusCode: 409 });
        }
        return { field: view(existing), created: false };
      }
      const { lastID: id } = await this.sql.run('INSERT INTO soa_custom_fields (university_id, field_key, label, data_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [this.actor.universityId, key, label, dataType, this.actor.userId, this.now()]);
      return { field: { id, key, label, dataType }, created: true };
    });
  }

  /** Compensation only: removes a field of this school that has no value at all. Returns true if removed. */
  removeUnusedField(fieldId) {
    return this.sql.transaction(async () => (await this.sql.run(`DELETE FROM soa_custom_fields WHERE id = ? AND university_id = ?
      AND NOT EXISTS (SELECT 1 FROM soa_custom_field_values v WHERE v.field_id = soa_custom_fields.id)`, [fieldId, this.actor.universityId])).changes === 1);
  }

  /** This school's field definitions (active and retired), with how many values each holds. */
  async listFields() {
    if (!(await this.isReady())) return [];
    const rows = await this.sql.all(`SELECT f.id, f.field_key, f.label, f.data_type, f.created_at, f.updated_at, f.retired_at,
        (SELECT COUNT(*) FROM soa_custom_field_values v WHERE v.field_id = f.id AND v.university_id = f.university_id) AS value_count
      FROM soa_custom_fields f WHERE f.university_id = ? ORDER BY f.id`, [this.actor.universityId]);
    return rows.map((r) => ({
      ...view(r), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), retired: r.retired_at !== null, retiredAt: iso(r.retired_at),
      valueCount: r.value_count, hasValues: r.value_count > 0,
    }));
  }

  /** ACTIVE fields of this school only: the targets offered to the mapper for a new import (compact). */
  async listActiveTargets() {
    if (!(await this.isReady())) return [];
    const rows = await this.sql.all('SELECT id, field_key, label, data_type FROM soa_custom_fields WHERE university_id = ? AND retired_at IS NULL ORDER BY id', [this.actor.universityId]);
    return rows.map(view);
  }

  /**
   * Admin edit: { label?, dataType? }. The key never changes (values stay attached). A type change is
   * refused once the field holds a value (no silent conversion).
   */
  async updateField(key, changes) {
    await this.requireReady();
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some((k) => !['label', 'dataType'].includes(k)) || Object.keys(changes).length === 0) {
      throw new ValidationError('Send { label } and/or { dataType }.', [], { code: 'INVALID_REQUEST' });
    }
    const errors = [changes.label !== undefined ? checkLabel(changes.label) : null, changes.dataType !== undefined ? checkDataType(changes.dataType) : null].filter(Boolean);
    if (errors.length) throw new ValidationError('The field definition is not valid.', errors, { code: 'INVALID_FIELD_DEFINITION' });
    return this.sql.transaction(async () => {
      await this.verifyActor();
      const row = await this.findOwn(key);
      if (changes.dataType !== undefined && changes.dataType !== row.data_type) {
        const { n: used } = await this.sql.get('SELECT COUNT(*) AS n FROM soa_custom_field_values WHERE field_id = ? AND university_id = ?', [row.id, this.actor.universityId]);
        if (used > 0) {
          throw new ValidationError('The type cannot change: this field already holds values. Create a new field instead.', [], { code: 'TYPE_CHANGE_REFUSED', statusCode: 409 });
        }
      }
      await this.sql.run('UPDATE soa_custom_fields SET label = ?, data_type = ?, updated_at = ? WHERE id = ? AND university_id = ?',
        [changes.label !== undefined ? changes.label.trim() : row.label, changes.dataType !== undefined ? changes.dataType : row.data_type, this.now(), row.id, this.actor.universityId]);
      return (await this.listFields()).find((f) => f.id === row.id);
    });
  }

  /** Retire (never delete): values are kept and stay readable; the field is no longer offered for imports. */
  async retireField(key) {
    await this.requireReady();
    return this.sql.transaction(async () => {
      await this.verifyActor();
      const row = await this.findOwn(key);
      if (row.retired_at === null) {
        await this.sql.run('UPDATE soa_custom_fields SET retired_at = ?, retired_by = ? WHERE id = ? AND university_id = ? AND retired_at IS NULL',
          [this.now(), this.actor.userId, row.id, this.actor.universityId]);
      }
      return (await this.listFields()).find((f) => f.id === row.id);
    });
  }

  /** Reactivate / unretire a retired field so it can be used in new imports again. */
  async unretireField(key) {
    await this.requireReady();
    return this.sql.transaction(async () => {
      await this.verifyActor();
      const row = await this.findOwn(key);
      if (row.retired_at !== null) {
        await this.sql.run('UPDATE soa_custom_fields SET retired_at = NULL, retired_by = NULL, updated_at = ? WHERE id = ? AND university_id = ? AND retired_at IS NOT NULL',
          [this.now(), row.id, this.actor.universityId]);
      }
      return (await this.listFields()).find((f) => f.id === row.id);
    });
  }

  /** A field of THIS school by key, or 404 (another school's field "does not exist"). */
  async findOwn(key) {
    const row = typeof key === 'string' && KEY_PATTERN.test(key)
      ? await this.sql.get('SELECT id, field_key, label, data_type, retired_at FROM soa_custom_fields WHERE university_id = ? AND field_key = ?', [this.actor.universityId, key])
      : null;
    if (!row) throw new ValidationError('Custom field not found.', [], { code: 'FIELD_NOT_FOUND', statusCode: 404 });
    return row;
  }

  /**
   * Custom values of one student of THIS school, by the onboarding reference "lms-student:<studentId>".
   * Another school's (or an unknown) student is "not found".
   */
  async getStudentValues(studentRef) {
    await this.requireReady();
    const m = /^lms-student:([A-Za-z0-9-]{1,40})$/.exec(String(studentRef || ''));
    const student = m ? await this.sql.get(`SELECT u.id FROM students s JOIN users u ON u.id = s.userId
      WHERE s.studentId = ? AND u.role = 'student' AND u.university_id = ?`, [m[1], this.actor.universityId]) : null;
    if (!student) throw new ValidationError('Student not found.', [], { code: 'STUDENT_NOT_FOUND', statusCode: 404 });
    return this.valuesOf(student.id);
  }

  /**
   * A STUDENT's own custom values (the actor is the student). Checked against the LMS: the user exists, is a
   * student of exactly this school. Returns [] before migration 003. Never another user's values.
   */
  async getOwnValues() {
    const user = await this.sql.get('SELECT role, university_id FROM users WHERE id = ?', [this.actor.userId]);
    if (!user || user.role !== 'student' || Number(user.university_id) !== this.actor.universityId) {
      throw new ValidationError('Your account does not match this school.', [], { code: 'TENANT_MISMATCH', statusCode: 403 });
    }
    return (await this.isReady()) ? this.valuesOf(this.actor.userId) : [];
  }

  /** Values of one user of this school; retired fields are included (historical data), flagged. */
  async valuesOf(userId) {
    const rows = await this.sql.all(`SELECT f.field_key, f.label, f.data_type, f.retired_at, v.value FROM soa_custom_field_values v
      JOIN soa_custom_fields f ON f.id = v.field_id AND f.university_id = v.university_id
      WHERE v.university_id = ? AND v.user_id = ? ORDER BY f.id`, [this.actor.universityId, userId]);
    return rows.map((r) => ({ key: r.field_key, label: r.label, dataType: r.data_type, value: r.value, retired: r.retired_at !== null }));
  }

  async verifyActor() {
    const user = await this.sql.get('SELECT role, university_id FROM users WHERE id = ?', [this.actor.userId]);
    if (!user || user.role !== 'admin' || Number(user.university_id) !== this.actor.universityId) {
      throw new ValidationError('Your account does not match this school.', [], { code: 'TENANT_MISMATCH', statusCode: 403 });
    }
  }
}

const view = (r) => ({ id: r.id, key: r.field_key, label: r.label, dataType: r.data_type });
const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());

/** The store for one request: { store, close } (close is a no-op: the host owns the pool). */
function openCustomFieldStore({ sql, actor, schema, now }) {
  if (!sql || typeof sql.get !== 'function') {
    throw new ValidationError('Onboarding is not available.', [], { code: 'LMS_NOT_READY', statusCode: 503 });
  }
  return { store: new PostgresCustomFieldStore({ sql, actor, schema, ...(now ? { now } : {}) }), close: () => {} };
}

module.exports = { PostgresCustomFieldStore, openCustomFieldStore, CUSTOM_FIELD_TABLES: TABLES };
