/**
 * Login Rate Limiter Test Suite
 *
 * Exercises the REAL login route (routes/auth-routes.js: loginRateLimiter + login handler).
 *
 * Isolation is the same as test_security_phase1_login.js: before anything loads,
 * an isolated temporary database (an EMPTY clone of the real schema; the project
 * database is opened read-only for its table definitions only, no rows are read or
 * copied, nothing is written) is placed in Node's module cache where the login
 * handler looks for its database. The last test proves the project database module
 * was never loaded. All identities and passwords are test-only values.
 *
 * Limits are set small and windows short through the limiter's own environment
 * settings, for THIS process only, so exhaustion and expiry can be tested in seconds.
 * Client IPs are simulated with X-Forwarded-For on a test app that trusts the proxy header.
 */

const path = require('path');
const http = require('http');
const cp = require('child_process');
const express = require('express');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { createIsolatedDb, insert } = require('./phase2c_test_fixture');

process.env.JWT_SECRET = 'test-login-rate-limiter-secret';
const ACCOUNT_LIMIT = 3;
const IP_LIMIT = 8;
const WINDOW_MS = 2000;
const BLOCK_MS = 2000;
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT = String(ACCOUNT_LIMIT);
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = String(IP_LIMIT);
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = String(WINDOW_MS);
process.env.LOGIN_RATE_LIMIT_BLOCK_MS = String(BLOCK_MS);

const DB_SWITCH_PATH = require.resolve('../config/database-switch');
const isLiveDbModule = (cacheKey) => /[\\/]config[\\/](sqlite-db|postgres-db)\.js$/i.test(cacheKey);

const logLines = [];
const say = console.log.bind(console);
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => logLines.push(args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })())).join(' '));
}
const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(String(reason && reason.message ? reason.message : reason)));
process.on('uncaughtException', (err) => unhandled.push(String(err && err.message ? err.message : err)));

const GOOD = 'Correct-Limiter-Pw-73';
const BAD = 'Wrong-Limiter-Pw-00';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    say(`✅ [PASS] ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    say(`❌ [FAIL] ${name}\n      - ${String(e.message).slice(0, 500)}`);
  }
}

async function main() {
  say('================================================================');
  say('🧪 LOGIN RATE LIMITER');
  say('================================================================');

  const fixture = await createIsolatedDb('login-rate-limiter');
  const db = fixture.db;
  let server;

  try {
    require.cache[DB_SWITCH_PATH] = { id: DB_SWITCH_PATH, filename: DB_SWITCH_PATH, loaded: true, exports: db, children: [], paths: [] };
    const limiter = require('../middleware/loginRateLimiter');
    const authRoutes = require('../routes/auth-routes');

    const hashed = bcrypt.hashSync(GOOD, 4); // low cost: test speed only
    const accounts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(n => `acct.${n}@limiter.test`);
    for (let i = 0; i < accounts.length; i++) {
      await insert(db, 'users', { id: i + 1, name: `Limiter ${i + 1}`, email: accounts[i], password: hashed, role: 'student', university_id: 7 });
    }
    const [A, B, C, D, E, F, G, H, I, J] = accounts;

    const app = express();
    app.set('trust proxy', true); // test app only: lets X-Forwarded-For stand in for different client IPs
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.post('/api/test-server-error', limiter.loginRateLimiter, (req, res) => {
      res.status(500).json({ success: false, message: 'Database connection failed' });
    });
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    say(`Isolated test database: ${fixture.dbPath}`);
    say(`Test limits: ${ACCOUNT_LIMIT} per account, ${IP_LIMIT} per IP, window ${WINDOW_MS} ms, block ${BLOCK_MS} ms\n`);

    const tokens = [];
    const makeRequest = (targetPath, ip, body) => new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1', port: server.address().port, path: targetPath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'X-Forwarded-For': ip }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { /* non-JSON body */ }
          if (parsed && parsed.token) tokens.push(parsed.token);
          resolve({ status: res.statusCode, body: parsed, raw, retryAfter: res.headers['retry-after'] });
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(new Error(`no response from ${targetPath}`)));
      req.end(payload);
    });
    const login = (ip, body) => makeRequest('/api/auth/login', ip, body);
    const ok = (ip, email) => login(ip, { email, password: GOOD });
    const bad = (ip, email) => login(ip, { email, password: BAD });

    await test('0. configuration is read from the limiter\'s environment settings', async () => {
      assert.strictEqual(limiter.CONFIG.MAX_FAILED_ATTEMPTS_PER_ACCOUNT, ACCOUNT_LIMIT);
      assert.strictEqual(limiter.CONFIG.MAX_FAILED_ATTEMPTS_PER_IP, IP_LIMIT);
      assert.strictEqual(limiter.CONFIG.ATTEMPT_WINDOW_MS, WINDOW_MS);
      assert.strictEqual(limiter.CONFIG.BLOCK_DURATION_MS, BLOCK_MS);
    });

    await test('1. defaults without any setting are 5 per account / 50 per IP / 15-minute window and block; invalid values fall back', async () => {
      const readConfig = (extraEnv) => {
        const env = { ...process.env, ...extraEnv };
        for (const key of Object.keys(env)) if (key.startsWith('LOGIN_RATE_LIMIT_') && !(key in extraEnv)) delete env[key];
        const out = cp.execFileSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./middleware/loginRateLimiter').CONFIG))"], { cwd: path.join(__dirname, '..'), env });
        return JSON.parse(out.toString());
      };
      const defaults = readConfig({});
      assert.strictEqual(defaults.MAX_FAILED_ATTEMPTS_PER_ACCOUNT, 5);
      assert.strictEqual(defaults.MAX_FAILED_ATTEMPTS_PER_IP, 50);
      assert.strictEqual(defaults.ATTEMPT_WINDOW_MS, 15 * 60 * 1000);
      assert.strictEqual(defaults.BLOCK_DURATION_MS, 15 * 60 * 1000);
      const invalid = readConfig({ LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT: '0', LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP: '-4', LOGIN_RATE_LIMIT_WINDOW_MS: 'abc', LOGIN_RATE_LIMIT_BLOCK_MS: '' });
      assert.deepStrictEqual(invalid, defaults, 'zero, negative, non-numeric and empty values must not disable the limiter');
    });

    await test('2. successful logins are never counted as failures (many more than either limit)', async () => {
      for (let i = 0; i < IP_LIMIT + ACCOUNT_LIMIT + 4; i++) {
        const res = await ok('10.0.0.1', A);
        assert.strictEqual(res.status, 200, `login ${i + 1}: ${res.raw}`);
        assert.ok(res.body.token, 'token returned');
        assert.strictEqual(res.body.attemptInfo, undefined, 'a successful response must not carry failure counters');
        assert.deepStrictEqual(Object.keys(res.body).sort(), ['message', 'token', 'user'], 'success response shape is unchanged');
      }
      assert.strictEqual(await limiter.isUserBlocked('10.0.0.1', A), null);
    });

    await test('3. wrong passwords are counted; the account is blocked after its limit, even for the correct password', async () => {
      for (let i = 1; i <= ACCOUNT_LIMIT; i++) {
        const res = await bad('10.0.0.2', B);
        assert.strictEqual(res.status, 401, `failure ${i}: ${res.raw}`);
        assert.strictEqual(res.body.attemptInfo.emailAttempts, i, 'account failure count');
        assert.strictEqual(res.body.attemptInfo.ipAttempts, i, 'IP failure count');
        assert.strictEqual(res.body.attemptInfo.maxAttempts, ACCOUNT_LIMIT);
        assert.strictEqual(res.body.attemptInfo.remainingAttempts, ACCOUNT_LIMIT - i);
      }
      const blocked = await ok('10.0.0.2', B);
      assert.strictEqual(blocked.status, 429, blocked.raw);
      assert.strictEqual(blocked.body.blocked, true);
      assert.strictEqual(blocked.body.blockType, 'account');
      assert.strictEqual(blocked.body.token, undefined, 'no token while blocked');
      assert.ok(blocked.body.remainingTime >= 1 && blocked.body.remainingTime <= Math.ceil(BLOCK_MS / 1000));
      assert.strictEqual(blocked.retryAfter, String(blocked.body.remainingTime));
      const state = await limiter.isUserBlocked('10.0.0.2', B);
      assert.strictEqual(state.blockReason, 'account_limit');
    });

    await test('4. an account block follows the account across IPs but does not block the IP or other accounts', async () => {
      assert.strictEqual((await ok('10.0.0.99', B)).status, 429, 'same account from another IP is still blocked');
      assert.strictEqual((await ok('10.0.0.2', C)).status, 200, 'a different account from the same IP still logs in');
      assert.strictEqual((await ok('10.0.0.2', '  ' + B.toUpperCase() + ' ')).status, 429, 'letter case / spaces do not dodge the block');
    });

    await test('5. a successful login clears that account\'s failure count', async () => {
      for (let i = 1; i < ACCOUNT_LIMIT; i++) assert.strictEqual((await bad('10.0.0.3', D)).status, 401);
      assert.strictEqual((await ok('10.0.0.3', D)).status, 200);
      const afterReset = await bad('10.0.0.3', D);
      assert.strictEqual(afterReset.status, 401);
      assert.strictEqual(afterReset.body.attemptInfo.emailAttempts, 1, 'count restarts at 1 after a success');
      assert.strictEqual((await ok('10.0.0.3', D)).status, 200, 'account is not blocked');
    });

    await test('6. differently written emails count against the same account', async () => {
      const variants = [E.toUpperCase(), `  ${E}  `, E.replace('acct', 'ACCT')];
      for (let i = 0; i < ACCOUNT_LIMIT; i++) {
        const res = await bad('10.0.0.4', variants[i % variants.length]);
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.attemptInfo.emailAttempts, i + 1);
      }
      assert.strictEqual((await ok('10.0.0.4', E)).status, 429);
    });

    await test('7. malformed requests get 400, never count against an account, but do count against the IP', async () => {
      for (const body of [{ email: F }, { email: F, password: '' }, { email: F, password: null }, { email: F, password: 12345 }]) {
        const res = await login('10.0.0.5', body);
        assert.strictEqual(res.status, 400, res.raw);
        assert.strictEqual(res.body.attemptInfo, undefined);
      }
      for (const body of [{ password: GOOD }, { email: 42, password: GOOD }, { email: { a: 1 }, password: GOOD }]) {
        assert.strictEqual((await login('10.0.0.5', body)).status, 400);
      }
      // 7 malformed requests from this IP (limit 8): the account has no failures recorded
      const first = await bad('10.0.0.6', F);
      assert.strictEqual(first.body.attemptInfo.emailAttempts, 1, 'malformed requests added nothing to the account');
      assert.strictEqual((await ok('10.0.0.6', F)).status, 200);
      // ...but the 8th rejected request from 10.0.0.5 reaches the IP limit
      assert.strictEqual((await login('10.0.0.5', { email: F })).status, 400);
      const ipBlocked = await ok('10.0.0.5', F);
      assert.strictEqual(ipBlocked.status, 429, ipBlocked.raw);
      assert.strictEqual(ipBlocked.body.blockType, 'ip');
    });

    await test('8. IP exhaustion: failures spread over many accounts block the IP, and only that IP', async () => {
      for (let i = 1; i <= IP_LIMIT; i++) {
        const res = await bad('10.0.0.7', `unknown${i}@limiter.test`); // each email is far below the account limit
        assert.strictEqual(res.status, 401, `failure ${i}: ${res.raw}`);
        assert.strictEqual(res.body.attemptInfo.ipAttempts, i);
        assert.strictEqual(res.body.attemptInfo.emailAttempts, 1);
      }
      const blocked = await ok('10.0.0.7', G);
      assert.strictEqual(blocked.status, 429, 'a valid login from the blocked IP is refused');
      assert.strictEqual(blocked.body.blockType, 'ip');
      assert.strictEqual((await limiter.isUserBlocked('10.0.0.7')).blockReason, 'ip_limit');
      assert.strictEqual((await ok('10.0.0.8', G)).status, 200, 'the same account from another IP is unaffected');
    });

    await test('9. a successful login does NOT clear the IP counter (one valid account cannot reset guessing against others)', async () => {
      for (let i = 1; i < IP_LIMIT; i++) assert.strictEqual((await bad('10.0.0.9', `spray${i}@limiter.test`)).status, 401);
      assert.strictEqual((await ok('10.0.0.9', H)).status, 200);
      const last = await bad('10.0.0.9', 'spray.last@limiter.test');
      assert.strictEqual(last.status, 401);
      assert.strictEqual(last.body.attemptInfo.ipAttempts, IP_LIMIT, 'IP count continued across the successful login');
      assert.strictEqual((await ok('10.0.0.9', H)).status, 429);
    });

    await test('10. window: failures older than the window are forgotten, and the window is not extended by later failures', async () => {
      const first = await bad('10.0.0.10', I);
      assert.strictEqual(first.body.attemptInfo.emailAttempts, 1);
      await sleep(WINDOW_MS * 0.6);
      assert.strictEqual((await bad('10.0.0.10', I)).body.attemptInfo.emailAttempts, 2);
      await sleep(WINDOW_MS * 0.6); // now past the window that started at the FIRST failure
      const fresh = await bad('10.0.0.10', I);
      assert.strictEqual(fresh.status, 401, 'not blocked: the first window has ended');
      assert.strictEqual(fresh.body.attemptInfo.emailAttempts, 1, 'a new window starts at 1');
      assert.strictEqual(fresh.body.attemptInfo.ipAttempts, 1);
    });

    await test('11. block: it ends by itself after the block duration and the account can log in again', async () => {
      for (let i = 0; i < ACCOUNT_LIMIT; i++) await bad('10.0.0.11', J);
      assert.strictEqual((await ok('10.0.0.11', J)).status, 429);
      await sleep(BLOCK_MS + 250);
      const after = await ok('10.0.0.11', J);
      assert.strictEqual(after.status, 200, after.raw);
      assert.strictEqual(await limiter.isUserBlocked('10.0.0.11', J), null);
      const again = await bad('10.0.0.11', J);
      assert.strictEqual(again.body.attemptInfo.emailAttempts, 1, 'counting starts fresh after a block');
    });

    await test('12. attempts made while blocked are refused without extending the block', async () => {
      for (let i = 0; i < ACCOUNT_LIMIT; i++) await bad('10.0.0.12', A);
      const start = Date.now();
      while (Date.now() - start < BLOCK_MS * 0.7) {
        assert.strictEqual((await bad('10.0.0.12', A)).status, 429);
        await sleep(150);
      }
      await sleep(BLOCK_MS * 0.3 + 300);
      assert.strictEqual((await ok('10.0.0.12', A)).status, 200, 'the block ended on schedule despite attempts during it');
    });

    await test('13. reset: resetUserRateLimit lifts an account block and an IP block immediately', async () => {
      for (let i = 0; i < ACCOUNT_LIMIT; i++) await bad('10.0.0.13', C);
      assert.strictEqual((await ok('10.0.0.13', C)).status, 429);
      assert.strictEqual(await limiter.resetUserRateLimit('10.0.0.13', C.toUpperCase()), true);
      assert.strictEqual((await ok('10.0.0.13', C)).status, 200, 'account usable right after reset');

      for (let i = 1; i <= IP_LIMIT; i++) await bad('10.0.0.14', `reset${i}@limiter.test`);
      assert.strictEqual((await ok('10.0.0.14', C)).status, 429);
      await limiter.resetUserRateLimit('10.0.0.14');
      assert.strictEqual((await ok('10.0.0.14', C)).status, 200, 'IP usable right after reset');
    });

    await test('14. server fault (HTTP 5xx) does not increase account or IP failure counters', async () => {
      const testEmail = 'server-error-test@limiter.test';
      const testIp = '10.0.0.55';
      // Send multiple requests that return HTTP 500 (more than ACCOUNT_LIMIT = 3)
      for (let i = 0; i < ACCOUNT_LIMIT + 2; i++) {
        const res500 = await makeRequest('/api/test-server-error', testIp, { email: testEmail, password: BAD });
        assert.strictEqual(res500.status, 500);
      }
      // Verify neither the account nor the IP is blocked
      assert.strictEqual(await limiter.isUserBlocked(testIp, testEmail), null);
      // The first subsequent wrong password should show attempt count 1, not 6
      const firstBad = await bad(testIp, testEmail);
      assert.strictEqual(firstBad.status, 401);
      assert.strictEqual(firstBad.body.attemptInfo.emailAttempts, 1, '5xx responses did not count against account');
      assert.strictEqual(firstBad.body.attemptInfo.ipAttempts, 1, '5xx responses did not count against IP');
      // Clean up the 1 failure counter
      await limiter.resetUserRateLimit(testIp, testEmail);
    });

    await test('15. no password or token appears in any log line; the limiter logged only IPs and normalized emails', async () => {
      const joined = logLines.join('\n');
      assert.ok(/Failed login - IP: 10\.0\.0\.2, Email: acct\.b@limiter\.test/.test(joined), 'limiter logging ran');
      assert.ok(!joined.includes(GOOD) && !joined.includes(BAD), 'a password was written to the logs');
      assert.ok(tokens.length > 10, 'tokens were issued');
      for (const token of tokens) assert.ok(!joined.includes(token) && !joined.includes(token.split('.')[2]), 'a token was written to the logs');
      assert.ok(!joined.includes(hashed), 'a password hash was written to the logs');
      assert.ok(!/\[object Object\]/.test(joined), 'a non-text request value was written to the logs');
    });

    await test('16. no request made the limiter or the handler throw', async () => {
      assert.deepStrictEqual(unhandled, []);
      assert.ok(!logLines.some(l => l.includes('Rate limiting middleware error')), 'the limiter hit its own error path');
    });

    await test('17. isolation held to the end: the project database module was never loaded', async () => {
      assert.strictEqual(require(DB_SWITCH_PATH), db);
      assert.deepStrictEqual(Object.keys(require.cache).filter(isLiveDbModule), []);
    });
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }

  const failed = results.filter(r => !r.ok).length;
  say(`\n📊 LOGIN RATE LIMITER SUMMARY: ${results.length - failed} / ${results.length} TESTS PASSED`);
  process.exit(failed > 0 || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  say('❌ Suite crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
