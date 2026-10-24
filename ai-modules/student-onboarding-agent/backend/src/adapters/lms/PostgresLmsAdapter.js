const crypto = require('crypto');
const { LmsAdapter, LmsAdapterError } = require('./LmsAdapter');
const { isValidEmail } = require('../../validation/formats');
const { KEY_PATTERN, normalizeValue } = require('../../customFields/CustomFieldRules');

/**
 * The real LMS adapter (Step 9B) for the current LMS runtime: its PostgreSQL database, through the
 * host's database interface `sql` ({ get, all, run, transaction } with ? placeholders; every
 * statement issued while transaction(fn) runs uses that transaction). Implements exactly the two
 * interface methods; there is nothing generic here.
 *
 * - One adapter per import execution, built for ONE verified admin actor
 *   { userId, role: 'admin', universityId } taken from a validated JWT.
 *   Every transaction re-checks the actor against the LMS: the user exists, is
 *   an admin, belongs to exactly that university, and the university exists.
 *   (This rejects the LMS's "universityId || 1" default when it does not match.)
 * - Each operation is one transaction of the LMS's "writer" kind (one at a time, as with the old
 *   BEGIN IMMEDIATE), so the quota count and the insert cannot interleave with another import.
 * - Durable idempotency in soa_idempotency_keys, written in the same transaction as the insert.
 * - Tenant, role, password, studentId, classroom IDs and every other system
 *   value come from here, never from the request.
 * - Writes are inserts only, with one exception: a new classroom assignment
 *   also adds 1 to classrooms.studentCount (the counter the LMS displays),
 *   in the same transaction. Nothing is ever decremented or deleted.
 * - Errors are LmsAdapterError with fixed, safe messages. No SQL, paths,
 *   secrets or stack traces.
 */

const IDEMPOTENCY_TABLE = 'soa_idempotency_keys';

/** Student limits by universities.subscriptionPlan, as in server/helpers/quotaHelper.js (checkAdminStudentQuota). */
const DEFAULT_STUDENT_LIMITS = Object.freeze({ free: 10, standard: 100, professional: Infinity });

const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{1,200}$/;
const BCRYPT_ALPHABET = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const STUDENT_ID_ATTEMPTS = 20;

const internals = new WeakMap(); // adapter -> { sql, actor, creationFields, limits, studentIdPrefix }

class PostgresLmsAdapter extends LmsAdapter {
  /**
   * @param sql     the LMS database interface (see above)
   * @param actor   { userId, role: 'admin', universityId } from a verified JWT
   * @param schema  compiled student schema (defines the accepted creation fields)
   */
  constructor({ sql, actor, schema, studentLimits = DEFAULT_STUDENT_LIMITS, studentIdPrefix = '2026' } = {}) {
    super('postgres-lms');
    if (!sql || ['get', 'all', 'run', 'transaction'].some((m) => typeof sql[m] !== 'function')) {
      throw new TypeError('PostgresLmsAdapter requires the LMS database interface { get, all, run, transaction }.');
    }
    if (!schema || !Array.isArray(schema.fields)) throw new TypeError('PostgresLmsAdapter requires the compiled student schema.');
    if (!/^\d{1,6}$/.test(studentIdPrefix)) throw new TypeError('studentIdPrefix must be 1-6 digits.');
    internals.set(this, {
      sql,
      actor: checkActorShape(actor),
      creationFields: schema.fields.filter((f) => !f.classroomAssignment).map((f) => f.name),
      limits: { ...DEFAULT_STUDENT_LIMITS, ...studentLimits },
      studentIdPrefix,
    });
  }

  async createStudent(request) {
    const ctx = internals.get(this);
    const { idempotencyKey, student, customFields } = readCreateRequest(request, ctx.creationFields);

    return inTransaction(ctx.sql, async () => {
      const plan = await verifyActor(ctx);
      const replay = await findIdempotent(ctx, idempotencyKey, 'createStudent');
      if (replay) return { studentRef: replay.studentRef, created: false };

      // Emails are unique across the whole LMS (users.email UNIQUE); compare ignoring case.
      if (await ctx.sql.get('SELECT 1 AS x FROM users WHERE lower(email) = lower(?) LIMIT 1', [student.email])) {
        throw new LmsAdapterError('A user with this email already exists in the LMS.', { code: 'STUDENT_ALREADY_EXISTS' });
      }

      // Quota, counted inside the writer transaction, so concurrent imports cannot overshoot.
      const limit = Object.prototype.hasOwnProperty.call(ctx.limits, plan) ? ctx.limits[plan] : ctx.limits.free;
      const { n } = await ctx.sql.get("SELECT COUNT(*) AS n FROM users WHERE university_id = ? AND role = 'student'", [ctx.actor.universityId]);
      if (n >= limit) {
        throw new LmsAdapterError('The school has reached its student limit for its plan.', { code: 'QUOTA_EXCEEDED' });
      }

      const studentId = await allocateStudentId(ctx);
      const { lastID: userId } = await ctx.sql.run(
        "INSERT INTO users (name, email, password, role, isApproved, university_id, created_by) VALUES (?, ?, ?, 'student', 1, ?, ?)",
        [student.fullName, student.email, unusablePasswordHash(), ctx.actor.universityId, ctx.actor.userId]
      );
      // grade '' as the LMS does for "not given"; rollNumber NULL: section is never written here (LMS bug not reproduced).
      await ctx.sql.run("INSERT INTO students (userId, studentId, grade, rollNumber, totalFees, feesPaid, pendingFees) VALUES (?, ?, '', NULL, 0, 0, 0)", [userId, studentId]);
      // Admin-approved custom fields (migration 003): same transaction, so a bad field/value creates nothing.
      if (customFields) await writeCustomValues(ctx, userId, customFields);

      const result = { studentRef: `lms-student:${studentId}` };
      await recordIdempotent(ctx, idempotencyKey, 'createStudent', result);
      return { ...result, created: true };
    });
  }

  async assignStudentToClassroom(request) {
    const ctx = internals.get(this);
    const { idempotencyKey, studentEmail, className, section } = readAssignRequest(request);

    return inTransaction(ctx.sql, async () => {
      await verifyActor(ctx);
      const replay = await findIdempotent(ctx, idempotencyKey, 'assignStudentToClassroom');
      if (replay) return { outcome: 'assigned', assignmentRef: replay.assignmentRef, replayed: true };

      // Only students of the actor's own university; another tenant's student is simply "not found".
      const students = await ctx.sql.all("SELECT id FROM users WHERE lower(email) = lower(?) AND role = 'student' AND university_id = ?",
        [studentEmail, ctx.actor.universityId]);
      if (students.length === 0) throw new LmsAdapterError('No student with this email exists in this school.', { code: 'STUDENT_NOT_FOUND' });
      if (students.length > 1) throw new LmsAdapterError('More than one student matches this email (differing only in case).', { code: 'STUDENT_AMBIGUOUS' });

      // Classroom by tenant + grade + section, ignoring case and surrounding spaces. Never by ID.
      const classrooms = await ctx.sql.all(
        "SELECT id FROM classrooms WHERE university_id = ? AND lower(trim(grade)) = lower(trim(?)) AND lower(trim(coalesce(section, ''))) = lower(trim(?))",
        [ctx.actor.universityId, className, section]
      );
      // Not recorded as idempotent: a retry after the school fixes its classrooms is evaluated afresh.
      if (classrooms.length === 0) return { outcome: 'classroom_not_found', assignmentRef: null, replayed: false };
      if (classrooms.length > 1) return { outcome: 'classroom_ambiguous', assignmentRef: null, replayed: false };

      const studentUserId = students[0].id;
      const classroomId = classrooms[0].id;
      // student_classroom_assignment is what the LMS reads; users.classroom_id is not used.
      const existing = await ctx.sql.get('SELECT id FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [studentUserId, classroomId]);
      let assignmentId;
      if (existing) {
        assignmentId = existing.id; // already assigned: no new row, so no counter change
      } else {
        assignmentId = (await ctx.sql.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [studentUserId, classroomId])).lastID;
        // classrooms.studentCount is the stored counter the LMS displays (admin and mentor classroom
        // lists read it directly). +1 for exactly this new row, in the same transaction. Deliberately
        // not a recount: that would rewrite drift caused by other LMS code, and could decrease it.
        const bumped = await ctx.sql.run('UPDATE classrooms SET studentCount = COALESCE(studentCount, 0) + 1 WHERE id = ? AND university_id = ?',
          [classroomId, ctx.actor.universityId]);
        if (Number(bumped.changes) !== 1) {
          throw new LmsAdapterError('The LMS could not complete the request.', { code: 'LMS_UNAVAILABLE' });
        }
      }

      const result = { assignmentRef: `lms-assignment:${assignmentId}` };
      await recordIdempotent(ctx, idempotencyKey, 'assignStudentToClassroom', result);
      return { outcome: 'assigned', ...result, replayed: false };
    });
  }
}

// ---- module-private helpers (not methods: the adapter's surface stays exactly two methods) ----

function checkActorShape(actor) {
  if (!actor || typeof actor !== 'object') throw new LmsAdapterError('A verified admin actor is required.', { code: 'ACTOR_NOT_AUTHORIZED' });
  if (actor.role !== 'admin' || !Number.isInteger(actor.userId) || actor.userId < 1) {
    throw new LmsAdapterError('Only a verified admin can run onboarding imports.', { code: 'ACTOR_NOT_AUTHORIZED' });
  }
  if (!Number.isInteger(actor.universityId) || actor.universityId < 1) {
    throw new LmsAdapterError('The admin has no valid school (tenant).', { code: 'TENANT_INVALID' });
  }
  return Object.freeze({ userId: actor.userId, role: 'admin', universityId: actor.universityId });
}

/** Re-checks the actor against the LMS inside the transaction; returns the school's plan. */
async function verifyActor(ctx) {
  const user = await ctx.sql.get('SELECT role, university_id FROM users WHERE id = ?', [ctx.actor.userId]);
  if (!user || user.role !== 'admin') {
    throw new LmsAdapterError('Only a verified admin can run onboarding imports.', { code: 'ACTOR_NOT_AUTHORIZED' });
  }
  if (user.university_id === null || Number(user.university_id) !== ctx.actor.universityId) {
    throw new LmsAdapterError('The admin does not belong to this school (tenant).', { code: 'TENANT_INVALID' });
  }
  const school = await ctx.sql.get('SELECT subscriptionPlan FROM universities WHERE id = ?', [ctx.actor.universityId]);
  if (!school) throw new LmsAdapterError('The admin\'s school does not exist.', { code: 'TENANT_INVALID' });
  return school.subscriptionPlan || 'free';
}

async function findIdempotent(ctx, key, operation) {
  const row = await ctx.sql.get(`SELECT operation, result_json FROM ${IDEMPOTENCY_TABLE} WHERE university_id = ? AND idempotency_key = ?`,
    [ctx.actor.universityId, key]);
  if (!row) return null;
  if (row.operation !== operation) {
    throw new LmsAdapterError('This idempotency key was already used for a different operation.', { code: 'IDEMPOTENCY_KEY_CONFLICT' });
  }
  return JSON.parse(row.result_json);
}

async function recordIdempotent(ctx, key, operation, result) {
  await ctx.sql.run(`INSERT INTO ${IDEMPOTENCY_TABLE} (university_id, idempotency_key, operation, result_json, created_by) VALUES (?, ?, ?, ?, ?)`,
    [ctx.actor.universityId, key, operation, JSON.stringify(result), ctx.actor.userId]);
}

/** "<prefix>" + 6 digits from crypto.randomInt, unique in students.studentId (same shape as the LMS's IDs). */
async function allocateStudentId(ctx) {
  for (let i = 0; i < STUDENT_ID_ATTEMPTS; i++) {
    const candidate = ctx.studentIdPrefix + String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    if (!(await ctx.sql.get('SELECT 1 AS x FROM students WHERE studentId = ?', [candidate]))) return candidate;
  }
  throw new LmsAdapterError('Could not allocate a unique student ID.', { code: 'LMS_UNAVAILABLE' });
}

/**
 * A random, valid bcrypt-format value that is the hash of NO known password:
 * cost 10, random 22-char salt, random 31-char digest. The LMS's
 * bcrypt.compare() returns false for every input (it never throws on this
 * format), so the account cannot be logged into until a password is set
 * through the reset/onboarding flow. No secret exists at any point, and it
 * costs nothing (a real bcrypt hash would cost ~70 ms per student).
 */
function unusablePasswordHash() {
  const random = (n) => {
    const bytes = crypto.randomBytes(n);
    let out = '';
    for (let i = 0; i < n; i++) out += BCRYPT_ALPHABET[bytes[i] % 64];
    return out;
  };
  // Salt's last char must be one of ".Oeu" to be canonical (only its top 2 bits are used).
  return `$2a$10$${random(21)}${'.Oeu'[crypto.randomBytes(1)[0] % 4]}${random(31)}`;
}

/** One transaction; any failure rolls back and becomes a safe LmsAdapterError. */
async function inTransaction(sql, work) {
  try {
    return await sql.transaction(work);
  } catch (err) {
    throw safeError(err);
  }
}

function safeError(err) {
  if (err instanceof LmsAdapterError) return err;
  const code = err && typeof err.code === 'string' ? err.code : '';
  if (code === '23505' && /users_email/i.test(String(err.constraint || err.message || ''))) {
    return new LmsAdapterError('A user with this email already exists in the LMS.', { code: 'STUDENT_ALREADY_EXISTS' });
  }
  // lock timeout, serialization failure, deadlock: another writer held the database
  if (['55P03', '40001', '40P01'].includes(code)) {
    return new LmsAdapterError('The LMS database is busy. Try again.', { code: 'LMS_BUSY' });
  }
  return new LmsAdapterError('The LMS could not complete the request.', { code: 'LMS_UNAVAILABLE' });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function invalid(message) {
  return new LmsAdapterError(message, { code: 'INVALID_REQUEST' });
}

function readKey(key) {
  if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) throw invalid('idempotencyKey must be 1-200 characters of letters, digits, ":", ".", "_" or "-".');
  return key;
}

/** Defence in depth: the tools already validated, but the adapter accepts only canonical creation fields. */
function readCreateRequest(request, creationFields) {
  if (!isPlainObject(request) || Object.keys(request).some((k) => !['idempotencyKey', 'student', 'customFields'].includes(k))) {
    throw invalid('createStudent accepts only { idempotencyKey, student, customFields? }.');
  }
  const idempotencyKey = readKey(request.idempotencyKey);
  const { student } = request;
  if (!isPlainObject(student)) throw invalid('student must be an object.');
  const unexpected = Object.keys(student).filter((k) => !creationFields.includes(k));
  if (unexpected.length > 0) throw invalid('student contains fields that cannot be set through onboarding.');
  const fullName = typeof student.fullName === 'string' ? student.fullName.trim() : '';
  // Stored lower-case, exactly like LMS registration; LMS login lower-cases the typed email and
  // compares exactly, so a mixed-case address ("A.B@X.com" from Excel) could otherwise never log in.
  const email = typeof student.email === 'string' ? student.email.trim().toLowerCase() : '';
  if (fullName === '' || email === '' || !isValidEmail(email)) throw invalid('student.fullName and a valid student.email are required.');
  // Only name and email are persisted: the current LMS has no columns for the optional fields (Step 9A).
  return { idempotencyKey, student: { fullName, email }, customFields: readCustomFields(request.customFields) };
}

/** Optional { <safe key>: text | null }. Keys are looked up per school inside the transaction. */
function readCustomFields(value) {
  if (value === undefined) return null;
  if (!isPlainObject(value)) throw invalid('customFields must be an object.');
  const entries = Object.entries(value);
  if (entries.length > 50 || entries.some(([k, v]) => !KEY_PATTERN.test(k) || !(v === null || typeof v === 'string'))) {
    throw invalid('customFields must map custom field keys to text values.');
  }
  return entries.length ? Object.fromEntries(entries) : null;
}

/** Writes custom values for a just-created student. Field keys are parameters, never SQL identifiers. */
async function writeCustomValues(ctx, userId, customFields) {
  for (const [key, value] of Object.entries(customFields)) {
    // Only THIS school's ACTIVE fields (a field retired after the import was approved receives nothing).
    const field = await ctx.sql.get('SELECT id, data_type FROM soa_custom_fields WHERE university_id = ? AND field_key = ? AND retired_at IS NULL',
      [ctx.actor.universityId, key]);
    if (!field) throw new LmsAdapterError('A custom field of this import does not exist for this school.', { code: 'CUSTOM_FIELD_NOT_FOUND' });
    if (value === null) continue;
    const normalized = normalizeValue(field.data_type, value); // re-checked here, by the stored type
    if (normalized.error || normalized.value === null) throw new LmsAdapterError('A custom field value is not valid for its type.', { code: 'INVALID_CUSTOM_FIELD_VALUE' });
    await ctx.sql.run('INSERT INTO soa_custom_field_values (university_id, user_id, field_id, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [ctx.actor.universityId, userId, field.id, normalized.value, ctx.actor.userId, Date.now()]);
  }
}

function readAssignRequest(request) {
  const keys = ['idempotencyKey', 'studentEmail', 'className', 'section'];
  if (!isPlainObject(request) || Object.keys(request).some((k) => !keys.includes(k))) {
    throw invalid('assignStudentToClassroom accepts only { idempotencyKey, studentEmail, className, section }.');
  }
  const idempotencyKey = readKey(request.idempotencyKey);
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const studentEmail = text(request.studentEmail);
  const className = text(request.className);
  const section = text(request.section);
  if (!isValidEmail(studentEmail) || className === '' || section === '') {
    throw invalid('A valid studentEmail, className and section are required.');
  }
  return { idempotencyKey, studentEmail, className, section };
}

/** Builds the adapter for one execution. Returns { adapter, close } (close is a no-op: the host owns the pool). */
function openPostgresLmsAdapter({ sql, actor, schema, ...options }) {
  const adapter = new PostgresLmsAdapter({ sql, actor, schema, ...options });
  return { adapter, close: () => {} };
}

module.exports = { PostgresLmsAdapter, openPostgresLmsAdapter, DEFAULT_STUDENT_LIMITS, IDEMPOTENCY_TABLE };
