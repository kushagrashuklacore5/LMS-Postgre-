const crypto = require('crypto');
const { ValidationError } = require('../errors');
const { buildSetupEmail } = require('./setupEmail');

/**
 * Step 11: one-time password-setup links for students created by an import.
 *
 * Token rules:
 *   - 32 random bytes (crypto.randomBytes), base64url, sent ONLY inside the email link;
 *   - only its SHA-256 is stored (soa_student_setup_tokens.token_hash);
 *   - tied to one user_id + university_id; single-use (used_at); expiring (expires_at);
 *   - issuing a new link revokes the student's older unused links.
 *
 * Email rules:
 *   - a student whose live link was already sent is not emailed again ("already_sent");
 *   - at most maxInvitesPerDay links per student per 24 h ("rate_limited");
 *   - a failed email revokes its link and reports "email_failed" (retry later);
 *     the student record is never touched by email failure.
 *
 * Nothing here returns or logs a token, a password, a hash, SMTP details or a stack.
 * The only write to an LMS table is users.password, in completeSetup(), for the
 * one student the token belongs to.
 */

const TOKEN_TABLE = 'soa_student_setup_tokens';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_OPTIONS = Object.freeze({
  tokenTtlMs: 72 * 60 * 60 * 1000, // 72 hours
  maxInvitesPerDay: 5,
  pendingTimeoutMs: 5 * 60 * 1000, // an unfinished send older than this is treated as failed
  minPasswordLength: 8, // the LMS's existing reset-password rule
  maxPasswordBytes: 72, // bcrypt ignores anything longer; refuse instead of silently truncating
  emailConcurrency: 4,
});

const LINK_ERRORS = Object.freeze({
  LINK_INVALID: [400, 'This setup link is not valid. Ask your school to send a new one.'],
  LINK_EXPIRED: [410, 'This setup link has expired. Ask your school to send a new one.'],
  LINK_USED: [409, 'This setup link has already been used. Log in with your password.'],
  PASSWORD_TOO_SHORT: [400, 'The password must be at least 8 characters long.'],
  PASSWORD_TOO_LONG: [400, 'The password is too long (at most 72 bytes).'],
  SETUP_NOT_READY: [503, 'Password setup is not available right now.'],
  INVALID_REQUEST: [400, 'Send only the setup token and the new password.'],
});

function setupError(code) {
  const [statusCode, message] = LINK_ERRORS[code] || [500, 'An unexpected error occurred.'];
  return new ValidationError(message, [], { code, statusCode });
}

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const safeCode = (err, fallback) => (err && typeof err.code === 'string' && /^[A-Z][A-Z0-9_]{2,40}$/.test(err.code) ? err.code : fallback);

class StudentSetupService {
  /**
   * @param sql           the LMS database interface { get, all, run, transaction } (? placeholders, promises)
   * @param hashPassword  async (plain) => bcrypt hash — the LMS's own hashing (injected by the LMS)
   * @param emailAdapter  { send({ to, subject, text, html }) } — resolves on success, throws on failure
   * @param setupUrl      absolute URL of the client's password-setup page; the token goes in the #fragment
   */
  constructor({ sql, hashPassword, emailAdapter = null, setupUrl = null, appName = 'Core5 LMS', now = Date.now, options = {} } = {}) {
    if (!sql || ['get', 'all', 'run', 'transaction'].some((m) => typeof sql[m] !== 'function')) {
      throw new TypeError('StudentSetupService requires the LMS database interface { get, all, run, transaction }.');
    }
    if (typeof hashPassword !== 'function') throw new TypeError('StudentSetupService requires the LMS hashPassword function.');
    this.sql = sql;
    this.hashPassword = hashPassword;
    this.emailAdapter = emailAdapter && typeof emailAdapter.send === 'function' ? emailAdapter : null;
    this.setupUrl = normalizeSetupUrl(setupUrl);
    this.appName = appName;
    this.now = now;
    this.options = Object.freeze({ ...DEFAULT_OPTIONS, ...options });
  }

  /**
   * Sends a setup link to each student (by opaque studentRef) of the actor's school.
   * Never throws: returns Map(studentRef -> { status, code? }) with status one of
   * sent | already_sent | in_progress | rate_limited | account_already_set_up | email_failed.
   */
  async inviteStudents({ actor, studentRefs }) {
    const refs = [...new Set((studentRefs || []).filter((r) => typeof r === 'string'))];
    const out = new Map();
    const preflight = !this.setupUrl ? 'SETUP_URL_NOT_CONFIGURED' : !this.emailAdapter ? 'EMAIL_NOT_CONFIGURED' : null;
    if (preflight) {
      for (const ref of refs) out.set(ref, { status: 'email_failed', code: preflight });
      return out;
    }
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const ref = refs[next++];
        out.set(ref, await this.inviteOne(actor, ref));
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.options.emailConcurrency, refs.length) }, worker));
    return new Map(refs.map((r) => [r, out.get(r)]));
  }

  async inviteOne(actor, studentRef) {
    let reservation;
    try {
      reservation = await this.reserve(actor, studentRef);
    } catch (err) {
      return { status: 'email_failed', code: safeCode(err, 'SETUP_FAILED') };
    }
    if (!reservation.token) return reservation.outcome;

    const link = `${this.setupUrl}#token=${reservation.token}`;
    const message = buildSetupEmail({
      appName: this.appName,
      studentName: reservation.student.name,
      schoolName: reservation.schoolName,
      link,
      expiresAt: reservation.expiresAt,
    });
    let emailError = null;
    try {
      await this.emailAdapter.send({ to: reservation.student.email, ...message });
    } catch (err) {
      emailError = safeCode(err, 'EMAIL_SEND_FAILED');
    }
    try {
      await this.finish(reservation.id, emailError);
    } catch (err) {
      // The email went out (or not) but the status could not be recorded; the link stays pending
      // and is treated as failed after pendingTimeoutMs, so a retry can send a fresh one.
      return { status: 'email_failed', code: emailError || 'SETUP_STATUS_NOT_RECORDED' };
    }
    return emailError ? { status: 'email_failed', code: emailError } : { status: 'sent' };
  }

  /** One transaction: decide whether to send, and if so store a new token hash (pending). */
  reserve(actor, studentRef) {
    const now = this.now();
    return this.withTransaction(async (db) => {
      const student = await db.get(`SELECT u.id AS userId, u.name, u.email, s2.name AS schoolName
                                      FROM students s JOIN users u ON u.id = s.userId JOIN universities s2 ON s2.id = u.university_id
                                     WHERE s.studentId = ? AND u.university_id = ? AND u.role = 'student'`, [refToStudentId(studentRef), actor.universityId]);
      if (!student) return { outcome: { status: 'email_failed', code: 'STUDENT_NOT_FOUND' } };

      const used = await db.get(`SELECT 1 AS x FROM ${TOKEN_TABLE} WHERE user_id = ? AND used_at IS NOT NULL LIMIT 1`, [student.userId]);
      if (used) return { outcome: { status: 'account_already_set_up' } };

      const live = await db.get(`SELECT email_status, created_at FROM ${TOKEN_TABLE}
                                  WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
                                  ORDER BY id DESC LIMIT 1`, [student.userId, now]);
      if (live && live.email_status === 'sent') return { outcome: { status: 'already_sent' } };
      if (live && live.email_status === 'pending' && live.created_at > now - this.options.pendingTimeoutMs) {
        return { outcome: { status: 'in_progress' } };
      }

      const { n: recent } = await db.get(`SELECT COUNT(*) AS n FROM ${TOKEN_TABLE} WHERE user_id = ? AND created_at > ?`, [student.userId, now - DAY_MS]);
      if (recent >= this.options.maxInvitesPerDay) return { outcome: { status: 'rate_limited' } };

      await db.run(`UPDATE ${TOKEN_TABLE} SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL`, [now, student.userId]);
      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = now + this.options.tokenTtlMs;
      const { lastID } = await db.run(`INSERT INTO ${TOKEN_TABLE} (user_id, university_id, token_hash, created_by, created_at, expires_at, email_status)
                                       VALUES (?, ?, ?, ?, ?, ?, 'pending')`, [student.userId, actor.universityId, sha256(token), actor.userId, now, expiresAt]);
      return {
        id: lastID,
        token,
        expiresAt,
        student: { name: student.name, email: student.email },
        schoolName: student.schoolName,
      };
    });
  }

  async finish(id, emailError) {
    const now = this.now();
    await this.withTransaction(async (db) => {
      if (emailError) {
        await db.run(`UPDATE ${TOKEN_TABLE} SET email_status = 'failed', email_error = ?, revoked_at = COALESCE(revoked_at, ?) WHERE id = ?`, [emailError, now, id]);
      } else {
        await db.run(`UPDATE ${TOKEN_TABLE} SET email_status = 'sent' WHERE id = ?`, [id]);
      }
    });
  }

  /** Is this link usable? Resolves to { valid: true, expiresAt } or rejects with a safe LINK_* error. */
  async checkToken(token) {
    const row = await this.readToken(token);
    return { valid: true, expiresAt: new Date(row.expires_at).toISOString() };
  }

  /** Sets the student's own password and burns the token, atomically. */
  async completeSetup({ token, password }) {
    if (typeof password !== 'string') throw setupError('INVALID_REQUEST');
    if (password.length < this.options.minPasswordLength) throw setupError('PASSWORD_TOO_SHORT');
    if (Buffer.byteLength(password, 'utf8') > this.options.maxPasswordBytes) throw setupError('PASSWORD_TOO_LONG');
    const row = await this.readToken(token); // fail fast before hashing

    const hash = await this.hashPassword(password);
    if (typeof hash !== 'string' || !BCRYPT_PATTERN.test(hash)) throw new Error('hashPassword did not return a bcrypt hash');

    const now = this.now();
    await this.withTransaction(async (db) => {
      const burn = await db.run(`UPDATE ${TOKEN_TABLE} SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`, [now, row.id, now]);
      if (burn.changes !== 1) throw setupError(await this.classify(db, row.id, now)); // raced: used/expired/revoked meanwhile
      const upd = await db.run(`UPDATE users SET password = ?, updated_at = utc_now_text() WHERE id = ? AND university_id = ? AND role = 'student'`,
        [hash, row.user_id, row.university_id]);
      if (upd.changes !== 1) throw setupError('LINK_INVALID');
      await db.run(`UPDATE ${TOKEN_TABLE} SET revoked_at = ? WHERE user_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL`, [now, row.user_id, row.id]);
    });
    return { passwordSet: true };
  }

  async readToken(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw setupError('LINK_INVALID');
    const now = this.now();
    await this.requireReady();
    const row = await this.sql.get(`SELECT t.id, t.user_id, t.university_id, t.expires_at, t.used_at, t.revoked_at
                                      FROM ${TOKEN_TABLE} t JOIN users u ON u.id = t.user_id
                                     WHERE t.token_hash = ? AND u.university_id = t.university_id AND u.role = 'student'`, [sha256(token)]);
    if (!row || row.revoked_at !== null) throw setupError('LINK_INVALID');
    if (row.used_at !== null) throw setupError('LINK_USED');
    if (row.expires_at <= now) throw setupError('LINK_EXPIRED');
    return row;
  }

  async classify(db, id, now) {
    const r = await db.get(`SELECT used_at, revoked_at, expires_at FROM ${TOKEN_TABLE} WHERE id = ?`, [id]);
    if (!r || r.revoked_at !== null) return 'LINK_INVALID';
    if (r.used_at !== null) return 'LINK_USED';
    return r.expires_at <= now ? 'LINK_EXPIRED' : 'LINK_INVALID';
  }

  async requireReady() {
    const ready = await this.sql.get('SELECT to_regclass(?) AS t', [TOKEN_TABLE]);
    if (!ready || !ready.t) throw setupError('SETUP_NOT_READY');
  }

  /** fn(db) inside one writer transaction; db is { get, all, run } of that transaction. */
  async withTransaction(fn) {
    await this.requireReady();
    return this.sql.transaction(() => fn(this.sql));
  }
}

function refToStudentId(ref) {
  const m = /^lms-student:(\d{1,20})$/.exec(ref);
  return m ? m[1] : null;
}

function normalizeSetupUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.hash || url.search) return null;
  return url.toString();
}

function createStudentSetupService({ sql, ...rest }) {
  return new StudentSetupService({ sql, ...rest });
}

module.exports = { StudentSetupService, createStudentSetupService, TOKEN_TABLE, DEFAULT_OPTIONS, sha256 };
