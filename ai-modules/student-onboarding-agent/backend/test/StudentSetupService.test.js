'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createLmsTestDatabase } = require('./fixtures/lmsTestDatabase');
const { StudentSetupService, TOKEN_TABLE, sha256 } = require('../src/onboarding/StudentSetupService');
const { FakeEmailAdapter } = require('../src/onboarding/FakeEmailAdapter');
const { buildSetupEmail } = require('../src/onboarding/setupEmail');

const SETUP_URL = 'https://app.example.test/setup-password';
const HOUR = 60 * 60 * 1000;
const ADMIN1 = Object.freeze({ userId: 1, role: 'admin', universityId: 1 });
const ADMIN2 = Object.freeze({ userId: 2, role: 'admin', universityId: 2 });

// Fake bcrypt: deterministic, bcrypt-format output; records calls.
function fakeHasher() {
  const calls = [];
  const fn = async (plain) => {
    calls.push(plain);
    return '$2b$10$' + crypto.createHash('sha256').update(plain).digest('base64').replace(/[^A-Za-z0-9]/g, '.').padEnd(53, 'x').slice(0, 53);
  };
  fn.calls = calls;
  return fn;
}

async function setup({ migrate = true, setupUrl = SETUP_URL, email = new FakeEmailAdapter(), options } = {}) {
  const db = await createLmsTestDatabase();
  if (!migrate) await db.exec(`DROP TABLE ${TOKEN_TABLE}`); // the schema before migration 002
  const add = async (id, name, mail, school, studentId) => {
    await db.run("INSERT INTO users (id, name, email, password, role, university_id, created_by) VALUES (?, ?, ?, '$2b$10$unusableunusableunusableunusableunusableunusableunusa', 'student', ?, 1)", [id, name, mail, school]);
    await db.run('INSERT INTO students (userId, studentId) VALUES (?, ?)', [id, studentId]);
  };
  await add(101, 'Asha <b>Rao</b>', 'asha@example.test', 1, '2026000101');
  await add(102, 'Vik Das', 'vik@example.test', 1, '2026000102');
  await add(201, 'Other School', 'other@example.test', 2, '2026000201');
  let clock = Date.UTC(2026, 8, 28, 10, 0, 0);
  const hash = fakeHasher();
  const service = new StudentSetupService({
    sql: db.sql,
    hashPassword: hash,
    emailAdapter: email,
    setupUrl,
    now: () => clock,
    options,
  });
  return { db, service, email, hash, advance: (ms) => { clock += ms; }, pwd: async (id) => (await db.get('SELECT password FROM users WHERE id = ?', [id])).password };
}
const A = 'lms-student:2026000101';
const B = 'lms-student:2026000102';
const OTHER = 'lms-student:2026000201';
const codeOf = async (fn) => { try { await fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };
const asyncCodeOf = async (p) => { try { await p; } catch (e) { return e.code; } return 'NO_ERROR'; };

describe('StudentSetupService: token generation and storage', () => {
  it('emails each student a unique 32-byte base64url token in the link fragment', async () => {
    const t = await setup();
    const out = await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A, B, A] });
    assert.deepEqual([...out.entries()], [[A, { status: 'sent' }], [B, { status: 'sent' }]]);
    assert.equal(t.email.sent.length, 2);
    const ta = t.email.lastTokenFor('asha@example.test');
    const tb = t.email.lastTokenFor('vik@example.test');
    assert.match(ta, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(ta, tb);
    assert.ok(t.email.sent[0].text.includes(`${SETUP_URL}#token=`), 'token only in the #fragment');
    assert.equal(Buffer.from(ta, 'base64url').length, 32);
  });

  it('stores only the SHA-256 of the token, tied to the student and school', async () => {
    const t = await setup();
    await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] });
    const token = t.email.lastTokenFor('asha@example.test');
    const rows = await t.db.all(`SELECT * FROM ${TOKEN_TABLE}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token_hash, sha256(token));
    assert.deepEqual([rows[0].user_id, rows[0].university_id, rows[0].created_by, rows[0].email_status], [101, 1, 1, 'sent']);
    assert.equal(rows[0].expires_at - rows[0].created_at, 72 * HOUR);
    assert.ok(!JSON.stringify(rows).includes(token), 'plaintext token is not stored');
  });

  it('the email escapes names and carries no secret other than the link', () => {
    const m = buildSetupEmail({ appName: 'Core5 LMS', studentName: '<script>x</script>', schoolName: 'A & B\nSchool', link: 'https://h/p#token=abc', expiresAt: 0 });
    assert.ok(!m.html.includes('<script>'));
    assert.ok(m.html.includes('&lt;script&gt;'));
    assert.ok(m.text.includes('A & B School'), 'newlines collapsed');
    assert.doesNotMatch(m.text + m.html, /password is|temporary password|\$2[aby]\$/i, 'no password is ever sent');
  });
});

describe('StudentSetupService: setting the password', () => {
  let t;
  let token;
  beforeEach(async () => {
    t = await setup();
    await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A, B] });
    token = t.email.lastTokenFor('asha@example.test');
  });

  it('a valid link sets the password (LMS hashing) for that student only', async () => {
    const before = await t.pwd(102);
    assert.equal((await t.service.checkToken(token)).valid, true);
    assert.deepEqual(await t.service.completeSetup({ token, password: 'correct horse 9' }), { passwordSet: true });
    assert.deepEqual(t.hash.calls, ['correct horse 9']);
    assert.match(await t.pwd(101), /^\$2b\$10\$/);
    assert.equal(await t.pwd(101), await fakeHasher()('correct horse 9'));
    assert.equal(await t.pwd(102), before, 'the other student is untouched');
  });

  it('is single-use', async () => {
    await t.service.completeSetup({ token, password: 'first-password' });
    const after = await t.pwd(101);
    assert.equal(await asyncCodeOf(t.service.completeSetup({ token, password: 'second-password' })), 'LINK_USED');
    assert.equal(await codeOf(async () => await t.service.checkToken(token)), 'LINK_USED');
    assert.equal(await t.pwd(101), after);
  });

  it('expires', async () => {
    const before = await t.pwd(101);
    t.advance(72 * HOUR);
    assert.equal(await codeOf(async () => await t.service.checkToken(token)), 'LINK_EXPIRED');
    assert.equal(await asyncCodeOf(t.service.completeSetup({ token, password: 'late-password' })), 'LINK_EXPIRED');
    assert.equal(await t.pwd(101), before);
    assert.equal(t.hash.calls.length, 0, 'nothing hashed for a dead link');
  });

  it('rejects wrong, malformed, superseded and re-homed tokens', async () => {
    assert.equal(await codeOf(async () => await t.service.checkToken(crypto.randomBytes(32).toString('base64url'))), 'LINK_INVALID');
    for (const bad of [undefined, null, 42, '', 'abc', `${token}x`, token.slice(1), `${token.slice(0, 42)}=`]) {
      assert.equal(await codeOf(async () => await t.service.checkToken(bad)), 'LINK_INVALID', String(bad));
    }
    // a newer link (e.g. after expiry) supersedes the old one
    t.advance(73 * HOUR);
    await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] });
    const fresh = t.email.lastTokenFor('asha@example.test');
    assert.notEqual(fresh, token);
    assert.equal(await codeOf(async () => await t.service.checkToken(token)), 'LINK_INVALID');
    // a student moved to another school (or no longer a student) cannot use the link
    await t.db.run('UPDATE users SET university_id = 2 WHERE id = 101');
    assert.equal(await codeOf(async () => await t.service.checkToken(fresh)), 'LINK_INVALID');
    await t.db.run("UPDATE users SET university_id = 1, role = 'admin' WHERE id = 101");
    assert.equal(await asyncCodeOf(t.service.completeSetup({ token: fresh, password: 'some-password' })), 'LINK_INVALID');
  });

  it('enforces the LMS password rule (8+) and the bcrypt 72-byte limit, before touching the token', async () => {
    assert.equal(await asyncCodeOf(t.service.completeSetup({ token, password: 'short' })), 'PASSWORD_TOO_SHORT');
    assert.equal(await asyncCodeOf(t.service.completeSetup({ token, password: 'é'.repeat(37) })), 'PASSWORD_TOO_LONG');
    assert.equal(await asyncCodeOf(t.service.completeSetup({ token, password: 12345678 })), 'INVALID_REQUEST');
    assert.equal((await t.service.checkToken(token)).valid, true, 'still usable');
  });

  it('completing setup revokes the student\'s other outstanding links', async () => {
    // simulate a second outstanding link for the same student
    const extra = crypto.randomBytes(32).toString('base64url');
    await t.db.run(`INSERT INTO ${TOKEN_TABLE} (user_id, university_id, token_hash, created_by, created_at, expires_at, email_status) VALUES (101, 1, ?, 1, 0, 9e15, 'sent')`, [sha256(extra)]);
    await t.service.completeSetup({ token, password: 'first-password' });
    assert.equal(await codeOf(async () => await t.service.checkToken(extra)), 'LINK_INVALID');
  });
});

describe('StudentSetupService: email delivery, retries and limits', () => {
  it('email failure: student untouched, link revoked, safe email_failed; a retry sends a new link', async () => {
    const t = await setup();
    t.email.failRecipient('asha@example.test');
    const out = await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A, B] });
    assert.deepEqual(out.get(A), { status: 'email_failed', code: 'EMAIL_SEND_FAILED' });
    assert.deepEqual(out.get(B), { status: 'sent' });
    assert.ok(await t.db.get('SELECT 1 AS x FROM users WHERE id = 101'), 'student record not rolled back');
    const failed = await t.db.get(`SELECT email_status, email_error, revoked_at FROM ${TOKEN_TABLE} WHERE user_id = 101`);
    assert.equal(failed.email_status, 'failed');
    assert.equal(failed.email_error, 'EMAIL_SEND_FAILED', 'code only, never the SMTP message');
    assert.notEqual(failed.revoked_at, null);

    t.email.failFor.clear();
    const retry = await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A, B] });
    assert.deepEqual([retry.get(A), retry.get(B)], [{ status: 'sent' }, { status: 'already_sent' }]);
    assert.equal(t.email.sent.filter((m) => m.to === 'vik@example.test').length, 1, 'no duplicate email');
    assert.equal((await t.service.checkToken(t.email.lastTokenFor('asha@example.test'))).valid, true);
  });

  it('duplicate protection: already_sent while a link is live; resend after expiry; account_already_set_up after use', async () => {
    const t = await setup();
    await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] });
    for (let i = 0; i < 3; i++) assert.deepEqual((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A), { status: 'already_sent' });
    assert.equal(t.email.sent.length, 1);
    t.advance(72 * HOUR);
    assert.deepEqual((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A), { status: 'sent' });
    await t.service.completeSetup({ token: t.email.lastTokenFor('asha@example.test'), password: 'my-password-1' });
    t.advance(100 * HOUR);
    assert.deepEqual((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A), { status: 'account_already_set_up' });
    assert.equal(t.email.sent.length, 2);
  });

  it('rate limit: at most 5 links per student per 24 h, even when every send fails', async () => {
    const t = await setup();
    t.email.failRecipient('asha@example.test');
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A).status);
    assert.deepEqual(statuses, ['email_failed', 'email_failed', 'email_failed', 'email_failed', 'email_failed', 'rate_limited', 'rate_limited', 'rate_limited']);
    assert.equal(t.email.failures.length, 5);
    t.advance(24 * HOUR + 1);
    t.email.failFor.clear();
    assert.equal((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A).status, 'sent');
  });

  it('an unfinished send blocks duplicates (in_progress) until it goes stale', async () => {
    const t = await setup();
    await t.db.run(`INSERT INTO ${TOKEN_TABLE} (user_id, university_id, token_hash, created_by, created_at, expires_at, email_status) VALUES (101, 1, 'h', 1, ?, ?, 'pending')`, [Date.UTC(2026, 8, 28, 10, 0, 0), Date.UTC(2026, 8, 28, 10, 0, 0) + 72 * HOUR]);
    assert.equal((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A).status, 'in_progress');
    t.advance(5 * 60 * 1000 + 1);
    assert.equal((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] })).get(A).status, 'sent');
    assert.notEqual((await t.db.get(`SELECT revoked_at FROM ${TOKEN_TABLE} WHERE token_hash = 'h'`)).revoked_at, null);
  });

  it('tenant: an admin cannot invite another school\'s student', async () => {
    const t = await setup();
    assert.deepEqual((await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [OTHER, 'lms-student:999', 'nonsense'] })).get(OTHER), { status: 'email_failed', code: 'STUDENT_NOT_FOUND' });
    assert.equal((await t.service.inviteStudents({ actor: ADMIN2, studentRefs: [OTHER] })).get(OTHER).status, 'sent');
    assert.equal(t.email.sent.length, 1);
  });

  it('not configured / not migrated: every row reports email_failed and nothing is stored', async () => {
    for (const [opts, code] of [[{ setupUrl: null }, 'SETUP_URL_NOT_CONFIGURED'], [{ setupUrl: 'https://h/p?x=1' }, 'SETUP_URL_NOT_CONFIGURED'],
      [{ setupUrl: 'javascript:alert(1)' }, 'SETUP_URL_NOT_CONFIGURED'], [{ email: null }, 'EMAIL_NOT_CONFIGURED'], [{ migrate: false }, 'SETUP_NOT_READY']]) {
      const t = await setup(opts);
      const out = await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A] });
      assert.deepEqual(out.get(A), { status: 'email_failed', code }, code);
      if (opts.migrate !== false) assert.equal((await t.db.get(`SELECT COUNT(*) AS n FROM ${TOKEN_TABLE}`)).n, 0);
    }
    const t = await setup({ migrate: false });
    assert.equal(await codeOf(async () => await t.service.checkToken(crypto.randomBytes(32).toString('base64url'))), 'SETUP_NOT_READY');
  });

  it('no secret leakage: outcomes and stored errors carry codes only', async () => {
    const t = await setup();
    t.email.failRecipient('vik@example.test');
    const out = await t.service.inviteStudents({ actor: ADMIN1, studentRefs: [A, B] });
    const token = t.email.lastTokenFor('asha@example.test');
    const everything = JSON.stringify([...out.entries()]) + JSON.stringify(await t.db.all(`SELECT * FROM ${TOKEN_TABLE}`));
    assert.ok(!everything.includes(token));
    assert.doesNotMatch(everything, /smtp|secret-user|mailbox|\$2[aby]\$|@example/i);
    for (const v of out.values()) assert.deepEqual(Object.keys(v).sort(), v.code ? ['code', 'status'] : ['status']);
  });
});
