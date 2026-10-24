/**
 * Security Phase 1: Login Hardening Test Suite
 *
 * Exercises the ACTUAL register/login handlers in controllers/auth-controller.js.
 *
 * Isolation: login() always reads `config/database-switch` (it ignores req.tenant),
 * and loading that module opens the project database. So before the controller
 * is loaded, this suite puts an isolated temporary database in Node's module
 * cache under that path. The temporary database is an EMPTY clone of the real
 * schema (see phase2c_test_fixture.js: the project database is opened read-only
 * and only its table definitions are read; no rows are copied, nothing is written).
 * Test 0 proves the project database module was never loaded.
 * All identities and passwords below are test-only values.
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createIsolatedDb, insert, all, get, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-security-phase1-login-secret';
process.env.JWT_SECRET = JWT_SECRET;

const DB_SWITCH_PATH = require.resolve('../config/database-switch');
const LIVE_DB_MODULE_PATHS = [require.resolve('../config/sqlite-db')]; // the module that opens data/lms_permanent.db

// Capture everything the application logs, so credential leaks can be asserted
const logLines = [];
const say = console.log.bind(console);
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => logLines.push(args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })())).join(' '));
}

const PW = {
  student: 'Correct-Student-Pw-91',
  admin: 'Correct-Admin-Pw-27',
  demoAdmin: 'Correct-DemoAdmin-Pw-64',
  demoStudent: 'Correct-DemoStudent-Pw-38',
  vendorBcrypt: 'Correct-VendorB-Pw-15',
  vendorSha: 'Correct-VendorS-Pw-72',
  wrong: 'Wrong-Password-Attempt-00',
  register: 'Registered-User-Pw-53',
  staff: 'Correct-Staff-Pw-46',
  legacyPlain: 'Legacy-Plain-Stored-Pw-80',
  realRoute: 'Real-Route-User-Pw-19'
};
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
// Matches the module that opens data/lms_permanent.db under any path spelling or letter case
const isLiveDbModule = (cacheKey) => /[\\/]config[\\/](sqlite-db|postgres-db)\.js$/i.test(cacheKey);
// Emails the old code special-cased (passwordless login and/or auto-creation)
const DEMO_EXISTING = ['admin@gmail.com', 'student@gmail.com'];
const DEMO_ABSENT = ['superadmin@core5.com', 'portal@core5.co.in', 'mentor@gmail.com', 'storekeeper@demo.com', 'accountant@demo.com', 'accountant@test.com'];

// Errors thrown inside a handler's async database callback surface here; in the real server they are fatal
const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(String(reason && reason.message ? reason.message : reason)));
process.on('uncaughtException', (err) => unhandled.push(String(err && err.message ? err.message : err)));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    say(`✅ [PASS] ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    say(`❌ [FAIL] ${name}\n      - ${String(e.message).slice(0, 600)}`);
  }
}

async function main() {
  say('================================================================');
  say('🧪 SECURITY PHASE 1: LOGIN HARDENING');
  say('================================================================');

  const fixture = await createIsolatedDb('security-phase1-login');
  const db = fixture.db;
  let server;

  try {
    // Substitute the database module BEFORE the controller is loaded
    require.cache[DB_SWITCH_PATH] = { id: DB_SWITCH_PATH, filename: DB_SWITCH_PATH, loaded: true, exports: db, children: [], paths: [] };
    const authController = require('../controllers/auth-controller');

    const hash = (pw) => bcrypt.hashSync(pw, 4); // low cost: test speed only
    const seedUser = (id, email, role, pw, universityId) =>
      insert(db, 'users', { id, name: `Test ${role} ${id}`, email, password: hash(pw), role, university_id: universityId });
    await seedUser(1, 'legit.student@phase1.test', 'student', PW.student, 7);
    await seedUser(2, 'legit.admin@phase1.test', 'admin', PW.admin, 7);
    await seedUser(3, 'admin@gmail.com', 'admin', PW.demoAdmin, 1);
    await seedUser(4, 'student@gmail.com', 'student', PW.demoStudent, 1);
    await seedUser(5, 'superadmin.real@phase1.test', 'superadmin', PW.admin, null);
    await seedUser(6, 'legit.mentor@phase1.test', 'mentor', PW.staff, 7);
    await seedUser(7, 'legit.accountant@phase1.test', 'accountant', PW.staff, 7);
    await seedUser(8, 'legit.storekeeper@phase1.test', 'storekeeper', PW.staff, 7);
    // Accounts whose stored password is NOT a bcrypt hash: they must be refused cleanly, never matched as text
    await insert(db, 'users', { id: 9, name: 'Plaintext Stored', email: 'plaintext.stored@phase1.test', password: PW.legacyPlain, role: 'student', university_id: 7 });
    await insert(db, 'users', { id: 10, name: 'Sha Stored', email: 'sha.stored@phase1.test', password: crypto.createHash('sha256').update(PW.legacyPlain).digest('hex'), role: 'student', university_id: 7 });
    // Same email in users AND vendors, with different passwords: the users row decides
    await seedUser(11, 'both.tables@phase1.test', 'student', PW.student, 7);
    await insert(db, 'vendors', { id: 3, name: 'Shadow Vendor', email: 'both.tables@phase1.test', password: hash(PW.vendorBcrypt), university_id: 7 });
    await insert(db, 'vendors', { id: 1, name: 'Bcrypt Vendor', email: 'vendor.bcrypt@phase1.test', password: hash(PW.vendorBcrypt), university_id: 7 });
    await insert(db, 'vendors', { id: 2, name: 'Sha Vendor', email: 'vendor.sha@phase1.test', password: crypto.createHash('sha256').update(PW.vendorSha).digest('hex'), university_id: 7 });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.tenant = { database: db }; next(); });
    app.post('/api/auth/login', authController.login);
    app.post('/api/auth/register', authController.register);
    // The real router, exactly as server.js mounts it: rate limiters + handlers
    app.use('/real/api/auth', require('../routes/auth-routes'));
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    say(`Isolated test database: ${fixture.dbPath}\n`);

    const issuedTokens = [];
    // A handler that throws inside its database callback never answers; report that instead of hanging
    const noResponse = () => new Promise(resolve => setTimeout(() => resolve({ statusCode: 0, body: null, rawBody: 'NO RESPONSE (handler threw without answering)' }), 4000).unref());
    const login = async (body) => {
      const res = await Promise.race([request(server, 'POST', '/api/auth/login', { body }), noResponse()]);
      if (res.body && res.body.token) issuedTokens.push(res.body.token);
      return res;
    };
    const register = (body) => Promise.race([request(server, 'POST', '/api/auth/register', { body }), noResponse()]);
    const realRoute = async (action, body) => {
      const res = await Promise.race([request(server, 'POST', `/real/api/auth/${action}`, { body }), noResponse()]);
      if (res.body && res.body.token) issuedTokens.push(res.body.token);
      return res;
    };
    const userCount = async () => (await get(db, 'SELECT COUNT(*) n FROM users')).n;
    const assertRefused = (res, label) => {
      assert.ok(res.statusCode === 401 || res.statusCode === 400, `${label}: expected 401/400, got ${res.statusCode}: ${res.rawBody}`);
      assert.ok(!res.body || res.body.token === undefined, `${label}: no token may be issued`);
      assert.ok(!res.body || res.body.user === undefined, `${label}: no user object may be returned`);
    };

    await test('0. isolation: the controller is wired to the temporary database; the project database module was never loaded', async () => {
      assert.strictEqual(require(DB_SWITCH_PATH), db);
      for (const p of LIVE_DB_MODULE_PATHS) assert.strictEqual(require.cache[p], undefined, `${path.basename(p)} must not be loaded`);
      assert.deepStrictEqual(Object.keys(require.cache).filter(isLiveDbModule), [], 'no project database module may be loaded');
      assert.notStrictEqual(path.resolve(fixture.dbPath), path.resolve(__dirname, '../data/lms_permanent.db'));
    });

    await test('1. a legitimate account with the correct password logs in and gets a correctly signed token', async () => {
      for (const [email, pw, id, role] of [['legit.student@phase1.test', PW.student, 1, 'student'], ['legit.admin@phase1.test', PW.admin, 2, 'admin'], ['superadmin.real@phase1.test', PW.admin, 5, 'superadmin']]) {
        const res = await login({ email, password: pw });
        assert.strictEqual(res.statusCode, 200, `${email}: ${res.rawBody}`);
        assert.strictEqual(res.body.user.id, id);
        assert.strictEqual(res.body.user.role, role);
        assert.strictEqual(res.body.user.password, undefined, 'password hash must not be returned');
        const claims = jwt.verify(res.body.token, JWT_SECRET, { algorithms: ['HS256'] });
        assert.strictEqual(claims.userId, id);
        assert.strictEqual(claims.role, role);
        assert.ok(claims.exp > claims.iat, 'token must expire');
      }
      const upper = await login({ email: '  LEGIT.Student@Phase1.Test ', password: PW.student });
      assert.strictEqual(upper.statusCode, 200, 'email is still trimmed and lower-cased');
      const claims = jwt.verify((await login({ email: 'legit.student@phase1.test', password: PW.student })).body.token, JWT_SECRET);
      assert.strictEqual(claims.universityId, 7, 'university claim still comes from the account');
    });

    await test('2. an incorrect, empty or missing password is refused for every kind of account', async () => {
      for (const email of ['legit.student@phase1.test', 'legit.admin@phase1.test', 'superadmin.real@phase1.test', 'vendor.bcrypt@phase1.test', 'vendor.sha@phase1.test']) {
        assertRefused(await login({ email, password: PW.wrong }), `${email} wrong password`);
        assertRefused(await login({ email, password: '' }), `${email} empty password`);
        assertRefused(await login({ email }), `${email} missing password`);
        assertRefused(await login({ email, password: null }), `${email} null password`);
        assertRefused(await login({ email, password: { $ne: '' } }), `${email} non-string password`);
      }
      assertRefused(await login({ email: 'legit.admin@phase1.test', password: PW.student }), 'another account\'s password');
      assertRefused(await login({ email: 'nobody@phase1.test', password: PW.wrong }), 'unknown email');
    });

    await test('3. an existing demo email cannot bypass password verification', async () => {
      for (const email of DEMO_EXISTING) {
        assertRefused(await login({ email, password: PW.wrong }), `${email} wrong password`);
        assertRefused(await login({ email }), `${email} no password`);
        assertRefused(await login({ email, password: '' }), `${email} empty password`);
        assertRefused(await login({ email: email.toUpperCase(), password: PW.wrong }), `${email} upper-cased`);
      }
      const ok = await login({ email: 'admin@gmail.com', password: PW.demoAdmin });
      assert.strictEqual(ok.statusCode, 200, 'with its real password it is an ordinary account');
      assert.strictEqual(ok.body.user.role, 'admin');
    });

    await test('4. a demo email with no account is NOT auto-created and gets no token', async () => {
      const before = await userCount();
      for (const email of DEMO_ABSENT) {
        assertRefused(await login({ email, password: PW.wrong }), `${email} any password`);
        assertRefused(await login({ email }), `${email} no password`);
        assert.strictEqual(await get(db, 'SELECT id FROM users WHERE email = ?', [email]), undefined, `${email} must not be created`);
      }
      assert.strictEqual(await userCount(), before, 'login must never insert users');
      assert.strictEqual((await get(db, "SELECT COUNT(*) n FROM users WHERE role = 'superadmin'")).n, 1, 'no superadmin may appear');
    });

    await test('5. vendor login still works with the correct password (bcrypt and legacy SHA-256)', async () => {
      const b = await login({ email: 'vendor.bcrypt@phase1.test', password: PW.vendorBcrypt });
      assert.strictEqual(b.statusCode, 200, b.rawBody);
      assert.strictEqual(b.body.user.role, 'vendor');
      const s = await login({ email: 'vendor.sha@phase1.test', password: PW.vendorSha });
      assert.strictEqual(s.statusCode, 200, s.rawBody);
      assert.strictEqual(jwt.verify(s.body.token, JWT_SECRET).role, 'vendor');
    });

    await test('6. public registration always creates a student, whatever role is submitted', async () => {
      const attempts = ['admin', 'superadmin', 'mentor', 'accountant', 'storekeeper', 'vendor', 'ADMIN', ['admin'], { role: 'admin' }, 1, true];
      for (let i = 0; i < attempts.length; i++) {
        const email = `escalate${i}@phase1.test`;
        const res = await register({ name: `Escalate ${i}`, email, password: PW.register, role: attempts[i], isApproved: 1, university_id: 1 });
        assert.strictEqual(res.statusCode, 201, `${JSON.stringify(attempts[i])}: ${res.rawBody}`);
        assert.strictEqual(res.body.user.role, 'student', `response role for submitted ${JSON.stringify(attempts[i])}`);
        const row = await get(db, 'SELECT role, password FROM users WHERE email = ?', [email]);
        assert.strictEqual(row.role, 'student', `stored role for submitted ${JSON.stringify(attempts[i])}`);
        assert.notStrictEqual(row.password, PW.register, 'password must be stored hashed');
        assert.ok(bcrypt.compareSync(PW.register, row.password), 'stored hash must verify');
      }
      const privileged = await all(db, "SELECT email FROM users WHERE email LIKE 'escalate%' AND role <> 'student'");
      assert.deepStrictEqual(privileged, [], 'no privileged account may exist');

      const logged = await login({ email: 'escalate0@phase1.test', password: PW.register });
      assert.strictEqual(logged.statusCode, 200);
      assert.strictEqual(jwt.verify(logged.body.token, JWT_SECRET).role, 'student', 'token role for a self-registered user');
    });

    await test('7. ordinary registration still works: default student role, duplicate refused, required fields enforced', async () => {
      const ok = await register({ name: 'Plain User', email: '  Plain.User@Phase1.Test ', password: PW.register });
      assert.strictEqual(ok.statusCode, 201, ok.rawBody);
      assert.strictEqual(ok.body.user.role, 'student');
      assert.strictEqual(ok.body.user.email, 'plain.user@phase1.test');
      assert.strictEqual((await register({ name: 'Plain User', email: 'plain.user@phase1.test', password: PW.register })).statusCode, 400, 'duplicate email');
      assert.strictEqual((await register({ email: 'missing.name@phase1.test', password: PW.register })).statusCode, 400, 'missing name');
      assert.strictEqual((await register({ name: 'No Password', email: 'missing.pw@phase1.test' })).statusCode, 400, 'missing password');
    });

    await test('8. no password, password hash or issued token appears anywhere in the application logs', async () => {
      assert.ok(issuedTokens.length >= 8, 'tokens were issued during this run');
      const joined = logLines.join('\n');
      for (const [label, pw] of Object.entries(PW)) assert.ok(!joined.includes(pw), `password "${label}" was written to the logs`);
      for (const token of issuedTokens) {
        assert.ok(!joined.includes(token), 'a full token was written to the logs');
        assert.ok(!joined.includes(token.split('.')[2]), 'a token signature was written to the logs');
      }
      for (const row of await all(db, 'SELECT password FROM users')) assert.ok(!joined.includes(row.password), 'a password hash was written to the logs');
      assert.ok(!/password\s*[=:]\s*\S/i.test(joined), 'a "password=<value>" style log line exists');
    });

    await test('9. staff roles (mentor, accountant, storekeeper) log in through the same password check', async () => {
      for (const [email, id, role] of [['legit.mentor@phase1.test', 6, 'mentor'], ['legit.accountant@phase1.test', 7, 'accountant'], ['legit.storekeeper@phase1.test', 8, 'storekeeper']]) {
        const ok = await login({ email, password: PW.staff });
        assert.strictEqual(ok.statusCode, 200, `${email}: ${ok.rawBody}`);
        assert.strictEqual(ok.body.user.id, id);
        assert.strictEqual(jwt.verify(ok.body.token, JWT_SECRET).role, role);
        assertRefused(await login({ email, password: PW.wrong }), `${email} wrong password`);
      }
    });

    await test('10. token and response keep their exact shape: claims, 7-day expiry, HS256, response keys', async () => {
      const res = await login({ email: 'legit.student@phase1.test', password: PW.student });
      const decoded = jwt.decode(res.body.token, { complete: true });
      assert.strictEqual(decoded.header.alg, 'HS256');
      assert.deepStrictEqual(Object.keys(decoded.payload).sort(), ['email', 'exp', 'iat', 'name', 'role', 'subscriptionPlan', 'universityId', 'userId']);
      assert.strictEqual(decoded.payload.exp - decoded.payload.iat, SEVEN_DAYS_SECONDS, 'token lifetime must stay 7 days');
      assert.strictEqual(decoded.payload.email, 'legit.student@phase1.test');
      assert.strictEqual(decoded.payload.subscriptionPlan, 'free');
      assert.deepStrictEqual(Object.keys(res.body).sort(), ['message', 'token', 'user']);
      assert.deepStrictEqual(Object.keys(res.body.user).sort(), ['email', 'id', 'isApproved', 'name', 'role', 'subscriptionPlan']);
      assert.strictEqual(res.body.message, 'Login successful');

      const vendor = await login({ email: 'vendor.bcrypt@phase1.test', password: PW.vendorBcrypt });
      const vClaims = jwt.decode(vendor.body.token);
      assert.deepStrictEqual(Object.keys(vClaims).sort(), ['email', 'exp', 'iat', 'name', 'role', 'universityId', 'userId']);
      assert.strictEqual(vClaims.exp - vClaims.iat, SEVEN_DAYS_SECONDS);
      assert.deepStrictEqual(Object.keys(vendor.body.user).sort(), ['email', 'id', 'name', 'role', 'university_id']);
      assert.strictEqual(vendor.body.user.university_id, 7);
    });

    await test('11. a stored password that is not a bcrypt hash is refused cleanly, never matched as plain text', async () => {
      assertRefused(await login({ email: 'plaintext.stored@phase1.test', password: PW.legacyPlain }), 'plaintext-stored account with its literal stored value');
      assertRefused(await login({ email: 'sha.stored@phase1.test', password: PW.legacyPlain }), 'sha-stored user account');
      assertRefused(await login({ email: 'plaintext.stored@phase1.test', password: PW.wrong }), 'plaintext-stored account, wrong password');
    });

    await test('12. an email present in both users and vendors is decided by the users row only', async () => {
      const asUser = await login({ email: 'both.tables@phase1.test', password: PW.student });
      assert.strictEqual(asUser.statusCode, 200, asUser.rawBody);
      assert.strictEqual(asUser.body.user.role, 'student');
      assertRefused(await login({ email: 'both.tables@phase1.test', password: PW.vendorBcrypt }), 'vendor password on a users-table email');
    });

    await test('13. malformed login input (non-string or blank email) gets a controlled 400, not a server error', async () => {
      for (const email of [123, true, ['legit.student@phase1.test'], { $gt: '' }, '   ', '']) {
        const res = await login({ email, password: PW.student });
        assert.strictEqual(res.statusCode, 400, `email ${JSON.stringify(email)}: got ${res.statusCode}: ${res.rawBody}`);
        assert.strictEqual(res.body.token, undefined);
      }
      assert.strictEqual((await login({})).statusCode, 400, 'empty body');
    });

    await test('14. malformed registration input gets a controlled 400 and creates nothing', async () => {
      const before = await userCount();
      const bad = [
        { name: 'Num Pw', email: 'numpw@phase1.test', password: 12345678 },
        { name: 'Obj Pw', email: 'objpw@phase1.test', password: { a: 1 } },
        { name: 'Arr Pw', email: 'arrpw@phase1.test', password: ['x'] },
        { name: 'Bool Pw', email: 'boolpw@phase1.test', password: true },
        { name: 'Obj Email', email: { a: 1 }, password: PW.register },
        { name: 'Num Email', email: 42, password: PW.register },
        { name: { first: 'x' }, email: 'objname@phase1.test', password: PW.register },
        { name: '   ', email: 'blankname@phase1.test', password: PW.register },
        { name: 'Blank Email', email: '   ', password: PW.register }
      ];
      for (const body of bad) {
        const res = await register(body);
        assert.strictEqual(res.statusCode, 400, `${JSON.stringify(body.name)}: got ${res.statusCode}: ${res.rawBody}`);
      }
      assert.strictEqual(await userCount(), before, 'no account may be created from malformed input');
    });

    await test('15. registration ignores submitted approval/university fields (current behaviour recorded: approved, schema-default university)', async () => {
      const res = await register({ name: 'Field Stuffer', email: 'field.stuffer@phase1.test', password: PW.register, role: 'admin', isApproved: 0, university_id: 99, universityId: 99, id: 1, subscriptionPlan: 'premium' });
      assert.strictEqual(res.statusCode, 201, res.rawBody);
      const row = await get(db, 'SELECT id, role, isApproved, university_id, subscriptionPlan FROM users WHERE email = ?', ['field.stuffer@phase1.test']);
      assert.strictEqual(row.role, 'student');
      assert.notStrictEqual(row.id, 1, 'a submitted id must not be used');
      assert.notStrictEqual(row.university_id, 99, 'a submitted university must not be used');
      assert.strictEqual(row.subscriptionPlan, 'free', 'a submitted plan must not be used');
      // Known gap, NOT changed in this phase: self-registered students are auto-approved into the schema-default university
      assert.strictEqual(row.isApproved, 1);
      assert.strictEqual(row.university_id, 1);
    });

    await test('16. the REAL route (rate limiters + handlers, as server.js mounts it) enforces the same rules', async () => {
      const reg = await realRoute('register', { name: 'Real Route', email: 'real.route@phase1.test', password: PW.realRoute, role: 'superadmin' });
      assert.strictEqual(reg.statusCode, 201, reg.rawBody);
      assert.strictEqual((await get(db, 'SELECT role FROM users WHERE email = ?', ['real.route@phase1.test'])).role, 'student');

      const ok = await realRoute('login', { email: 'real.route@phase1.test', password: PW.realRoute });
      assert.strictEqual(ok.statusCode, 200, ok.rawBody);
      assert.strictEqual(jwt.verify(ok.body.token, JWT_SECRET).role, 'student');

      assertRefused(await realRoute('login', { email: 'real.route@phase1.test', password: PW.wrong }), 'real route wrong password');
      assertRefused(await realRoute('login', { email: 'real.route@phase1.test' }), 'real route missing password');
      assertRefused(await realRoute('login', { email: 'admin@gmail.com', password: PW.wrong }), 'real route demo email');
      const before = await userCount();
      assertRefused(await realRoute('login', { email: 'superadmin@core5.com', password: PW.wrong }), 'real route absent demo superadmin');
      assert.strictEqual(await userCount(), before, 'real route login must not create accounts');
      assert.strictEqual((await realRoute('register', { name: 'Bad', email: 'bad.real@phase1.test', password: 999 })).statusCode, 400);

      const joined = logLines.join('\n');
      assert.ok(/Login attempt - IP/.test(joined), 'the login rate limiter really ran');
      for (const pw of [PW.realRoute, PW.wrong]) assert.ok(!joined.includes(pw), 'a password reached the logs through the real route');
      assert.ok(!joined.includes(ok.body.token), 'a token reached the logs through the real route');
    });

    await test('17. final log sweep: still no password, hash or token in any log line after every test above', async () => {
      const joined = logLines.join('\n');
      for (const [label, pw] of Object.entries(PW)) assert.ok(!joined.includes(pw), `password "${label}" was written to the logs`);
      for (const token of issuedTokens) assert.ok(!joined.includes(token) && !joined.includes(token.split('.')[2]), 'a token was written to the logs');
      for (const row of await all(db, 'SELECT password FROM users UNION ALL SELECT password FROM vendors')) assert.ok(!joined.includes(row.password), 'a stored password value was written to the logs');
    });

    await test('18. none of the requests above made a handler throw outside its error handling', async () => {
      assert.deepStrictEqual(unhandled, [], 'unhandled errors were raised inside request handlers');
    });

    await test('19. isolation held to the end: the project database module was never loaded by anything in this run', async () => {
      assert.strictEqual(require(DB_SWITCH_PATH), db);
      assert.deepStrictEqual(Object.keys(require.cache).filter(isLiveDbModule), []);
    });
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }

  const failed = results.filter(r => !r.ok).length;
  say(`\n📊 SECURITY PHASE 1 SUMMARY: ${results.length - failed} / ${results.length} TESTS PASSED`);
  process.exit(failed > 0 || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  say('❌ Suite crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
