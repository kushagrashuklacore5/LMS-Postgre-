/**
 * Security Phase 2: SuperAdmin Authentication & Role Enforcement Isolated Test Suite
 *
 * Exercises:
 *  1. Server auth middleware: Unsigned superadmin-<base64> mock tokens are rejected / never elevate to superadmin
 *  2. Superadmin management routes: Missing token returns 401
 *  3. Superadmin management routes: Forged superadmin-<base64> mock token returns 401
 *  4. Superadmin management routes: Malformed / wrong-secret JWT returns 401
 *  5. Superadmin management routes: Signed non-superadmin tokens (student, accountant, admin) return 403 Forbidden
 *  6. Superadmin management routes: Legitimate SuperAdmin token returns 200 OK
 *  7. Legitimate SuperAdmin authentication: POST /api/auth/login verifies bcrypt password and issues valid superadmin JWT
 *  8. Client UI verification: SuperAdminLogin.jsx contains no hardcoded credentials and no mock token minting
 *
 * Strict Isolation Rules:
 *  - Uses an isolated SQLite database in OS temp directory (via phase2c_test_fixture)
 *  - Zero writes to live database (data/lms_permanent.db)
 *  - Ephemeral test server on random high port (port 0)
 *  - Full cleanup on exit
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  createIsolatedDb,
  insert,
  signToken,
  request
} = require('./phase2c_test_fixture');

const DB_SWITCH_PATH = path.resolve(__dirname, '../config/database-switch.js');
const JWT_SECRET = process.env.JWT_SECRET || 'phase2_superadmin_test_secret_key';
process.env.JWT_SECRET = JWT_SECRET;

const results = [];
async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.error(`❌ [FAIL] ${name}\n      Error: ${err.message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('🔒 SUPERADMIN SECURITY PHASE 2: ISOLATED VERIFICATION');
  console.log('================================================================\n');

  // 1. Create isolated SQLite test database
  const fixture = await createIsolatedDb('security-phase2-superadmin');
  const db = fixture.db;
  console.log(`📁 Isolated DB created at: ${fixture.dbPath}\n`);

  let server;

  try {
    // Intercept database module cache
    require.cache[DB_SWITCH_PATH] = {
      id: DB_SWITCH_PATH,
      filename: DB_SWITCH_PATH,
      loaded: true,
      exports: db,
      children: [],
      paths: []
    };

    // Seed test users in isolated DB
    const hash = (pw) => bcrypt.hashSync(pw, 4);
    const SUPERADMIN_PW = 'SuperSecret@2026';
    const STUDENT_PW = 'StudentPass123';
    const ACCOUNTANT_PW = 'AcctPass123';
    const ADMIN_PW = 'AdminPass123';

    await insert(db, 'users', {
      id: 101,
      name: 'Legit Super Admin',
      email: 'legit.superadmin@example.com',
      password: hash(SUPERADMIN_PW),
      role: 'superadmin',
      university_id: 1
    });

    await insert(db, 'users', {
      id: 102,
      name: 'Legit Student',
      email: 'student@example.com',
      password: hash(STUDENT_PW),
      role: 'student',
      university_id: 1
    });

    await insert(db, 'users', {
      id: 103,
      name: 'Legit Accountant',
      email: 'accountant@example.com',
      password: hash(ACCOUNTANT_PW),
      role: 'accountant',
      university_id: 1
    });

    await insert(db, 'users', {
      id: 104,
      name: 'Legit Admin',
      email: 'admin@example.com',
      password: hash(ADMIN_PW),
      role: 'admin',
      university_id: 1
    });

    // Seed a university for testing getAllUniversities
    await insert(db, 'universities', {
      id: 1,
      name: 'Test University of Excellence',
      area: 'Main Campus',
      adminId: 104,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Set up Express test app mounting routes
    const authMiddleware = require('../middleware/authMiddleware');
    const authController = require('../controllers/auth-controller');
    const superadminRoutes = require('../routes/superadminRoutes');

    const app = express();
    app.use(express.json());

    // Inject database context into request
    app.use((req, res, next) => {
      req.tenant = { database: db };
      next();
    });

    // Mount auth routes
    app.post('/api/auth/login', authController.login);

    // Mount superadmin routes
    app.use('/api/superadmin', superadminRoutes);

    // Mount subscriptions routes
    app.use('/api/subscriptions', require('../routes/subscription-routes'));

    // Mount a generic test route using general authMiddleware
    app.get('/api/test-auth', authMiddleware, (req, res) => {
      res.json({ success: true, user: req.user });
    });

    // Start ephemeral test server
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    console.log(`🌐 Isolated test server listening on port ${port}\n`);

    // Prepare tokens
    const superadminToken = signToken(JWT_SECRET, {
      userId: 101,
      email: 'legit.superadmin@example.com',
      role: 'superadmin',
      universityId: 1
    });

    const studentToken = signToken(JWT_SECRET, {
      userId: 102,
      email: 'student@example.com',
      role: 'student',
      universityId: 1
    });

    const accountantToken = signToken(JWT_SECRET, {
      userId: 103,
      email: 'accountant@example.com',
      role: 'accountant',
      universityId: 1
    });

    const adminToken = signToken(JWT_SECRET, {
      userId: 104,
      email: 'admin@example.com',
      role: 'admin',
      universityId: 1
    });

    const wrongSecretToken = signToken('wrong_secret_key_123', {
      userId: 101,
      email: 'legit.superadmin@example.com',
      role: 'superadmin'
    });

    const forgedMockToken = 'superadmin-' + Buffer.from(JSON.stringify({
      role: 'superadmin',
      email: 'attacker@hacker.com',
      name: 'Attacker'
    })).toString('base64');

    // =========================================================================
    // SECTION 1: General Auth Middleware - Mock Token Rejection
    // =========================================================================
    console.log('--- 1. General authMiddleware Mock Token Handling ---');

    await runTest('1.1 Forged unsigned superadmin-<base64> token does NOT grant superadmin role in authMiddleware', async () => {
      const res = await request(server, 'GET', '/api/test-auth', { token: forgedMockToken });
      assert.strictEqual(res.statusCode, 200);
      assert.notStrictEqual(res.body.user.role, 'superadmin', 'Must not elevate to superadmin');
      assert.strictEqual(res.body.user.role, 'guest', 'Must fall through to guest user');
    });

    await runTest('1.2 Valid JWT correctly verified by authMiddleware', async () => {
      const res = await request(server, 'GET', '/api/test-auth', { token: superadminToken });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.user.role, 'superadmin');
      assert.strictEqual(res.body.user.userId, 101);
    });

    // =========================================================================
    // SECTION 2: SuperAdmin Management Endpoints - Missing & Malformed Tokens
    // =========================================================================
    console.log('\n--- 2. SuperAdmin Management Routes: Missing & Invalid Tokens ---');

    const managementEndpoints = [
      { method: 'GET', path: '/api/superadmin/universities' },
      { method: 'GET', path: '/api/superadmin/users' },
      { method: 'POST', path: '/api/superadmin/create-university', body: { name: 'New Uni' } },
      { method: 'POST', path: '/api/superadmin/create-user', body: { name: 'New User' } },
      { method: 'PUT', path: '/api/superadmin/users/102', body: { name: 'Updated' } },
      { method: 'DELETE', path: '/api/superadmin/users/999' },
      { method: 'DELETE', path: '/api/superadmin/universities/999' },
      { method: 'GET', path: '/api/superadmin/clients' },
      { method: 'POST', path: '/api/superadmin/create-client', body: { name: 'Client' } }
    ];

    for (const ep of managementEndpoints) {
      await runTest(`2.x Missing token rejected with 401 on ${ep.method} ${ep.path}`, async () => {
        const res = await request(server, ep.method, ep.path, { body: ep.body });
        assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, false);
      });
    }

    // =========================================================================
    // SECTION 3: SuperAdmin Management Endpoints - Forged Mock Token Rejection
    // =========================================================================
    console.log('\n--- 3. SuperAdmin Management Routes: Forged Mock Token Rejection ---');

    for (const ep of managementEndpoints) {
      await runTest(`3.x Forged mock token rejected with 401 on ${ep.method} ${ep.path}`, async () => {
        const res = await request(server, ep.method, ep.path, { token: forgedMockToken, body: ep.body });
        assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, false);
      });
    }

    // =========================================================================
    // SECTION 4: SuperAdmin Management Endpoints - Invalid Signature / Malformed
    // =========================================================================
    console.log('\n--- 4. SuperAdmin Management Routes: Invalid Signature Rejection ---');

    await runTest('4.1 Token signed with wrong secret rejected with 401 on GET /api/superadmin/universities', async () => {
      const res = await request(server, 'GET', '/api/superadmin/universities', { token: wrongSecretToken });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    await runTest('4.2 Malformed random string token rejected with 401 on GET /api/superadmin/users', async () => {
      const res = await request(server, 'GET', '/api/superadmin/users', { token: 'random_not_a_jwt_string' });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // =========================================================================
    // SECTION 5: Role Enforcement - Normal Signed Users Attempting SuperAdmin
    // =========================================================================
    console.log('\n--- 5. SuperAdmin Management Routes: Role Enforcement (403 Forbidden) ---');

    const nonSuperadminTokens = [
      { role: 'student', token: studentToken },
      { role: 'accountant', token: accountantToken },
      { role: 'admin', token: adminToken }
    ];

    for (const { role, token } of nonSuperadminTokens) {
      await runTest(`5.x Signed ${role} token rejected with 403 on GET /api/superadmin/universities`, async () => {
        const res = await request(server, 'GET', '/api/superadmin/universities', { token });
        assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.message.includes('SuperAdmin') || res.body.message.includes('Access denied'));
      });

      await runTest(`5.x Signed ${role} token rejected with 403 on GET /api/superadmin/users`, async () => {
        const res = await request(server, 'GET', '/api/superadmin/users', { token });
        assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, false);
      });

      await runTest(`5.x Signed ${role} token rejected with 403 on POST /api/superadmin/create-university`, async () => {
        const res = await request(server, 'POST', '/api/superadmin/create-university', {
          token,
          body: { name: 'Unauthorized Uni', email: 'unauth@uni.com' }
        });
        assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, false);
      });
    }

    // =========================================================================
    // SECTION 6: Legitimate SuperAdmin Authentication & Access Flow
    // =========================================================================
    console.log('\n--- 6. Legitimate SuperAdmin Authentication & Access ---');

    let issuedSuperadminToken = null;

    await runTest('6.1 SuperAdmin authenticates via POST /api/auth/login with valid credentials', async () => {
      const res = await request(server, 'POST', '/api/auth/login', {
        body: {
          email: 'legit.superadmin@example.com',
          password: SUPERADMIN_PW
        }
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.user.role, 'superadmin');
      assert.ok(res.body.token, 'Must return JWT token');

      // Verify the returned token is cryptographically valid
      const decoded = jwt.verify(res.body.token, JWT_SECRET);
      assert.strictEqual(decoded.role, 'superadmin');
      assert.strictEqual(decoded.userId, 101);
      issuedSuperadminToken = res.body.token;
    });

    await runTest('6.2 SuperAdmin authentication fails with wrong password (401)', async () => {
      const res = await request(server, 'POST', '/api/auth/login', {
        body: {
          email: 'legit.superadmin@example.com',
          password: 'WrongPassword@123'
        }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await runTest('6.3 SuperAdmin accesses GET /api/superadmin/universities with issued token', async () => {
      assert.ok(issuedSuperadminToken, 'Requires token from 6.1');
      const res = await request(server, 'GET', '/api/superadmin/universities', {
        token: issuedSuperadminToken
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data), 'Expected universities array');
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].name, 'Test University of Excellence');
    });

    await runTest('6.4 SuperAdmin accesses GET /api/superadmin/users with issued token', async () => {
      assert.ok(issuedSuperadminToken, 'Requires token from 6.1');
      const res = await request(server, 'GET', '/api/superadmin/users', {
        token: issuedSuperadminToken
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data), 'Expected users array');
      assert.ok(res.body.data.length >= 4, 'Expected seeded users');
    });

    // =========================================================================
    // SECTION 7: Client Code Static Verification
    // =========================================================================
    console.log('\n--- 7. Client Code Static Verification ---');

    await runTest('7.1 SuperAdminLogin.jsx contains no hardcoded credentials or mock token generation', async () => {
      const clientLoginPath = path.resolve(__dirname, '../../client/src/pages/superadmin/SuperAdminLogin.jsx');
      const content = fs.readFileSync(clientLoginPath, 'utf8');

      // Check for hard-coded credentials
      assert.ok(!content.includes('SUPERADMIN_EMAIL'), 'Must not define SUPERADMIN_EMAIL');
      assert.ok(!content.includes('SUPERADMIN_PASSWORD'), 'Must not define SUPERADMIN_PASSWORD');
      assert.ok(!content.includes('SuperAdmin@123'), 'Must not contain plaintext default password');
      assert.ok(!content.includes('superadmin@lms.com'), 'Must not contain hardcoded demo superadmin email');

      // Check for mock token minting
      assert.ok(!content.includes('superadmin-" + btoa'), 'Must not mint superadmin- mock tokens');
      assert.ok(!content.includes('"superadmin-id"'), 'Must not use hardcoded superadmin-id');

      // Check legitimate connection
      assert.ok(content.includes('fetch("/api/auth/login"'), 'Must post to /api/auth/login');
      assert.ok(content.includes('data.user.role !== "superadmin"'), 'Must verify user.role is superadmin');
    });

    // =========================================================================
    // SECTION 8: Internal & Debug Endpoints Hardening
    // =========================================================================
    console.log('\n--- 8. Internal & Debug Endpoints Hardening ---');

    await runTest('8.1 Unused unauthenticated GET /api/superadmin/internal/superadmins-test is removed (404)', async () => {
      const res = await request(server, 'GET', '/api/superadmin/internal/superadmins-test');
      assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
    });

    await runTest('8.2 Unused unauthenticated GET /api/superadmin/internal/debug is removed (404)', async () => {
      const res = await request(server, 'GET', '/api/superadmin/internal/debug');
      assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
    });

    await runTest('8.3 Unused unauthenticated GET /api/superadmin/internal/test-delete is removed (404)', async () => {
      const res = await request(server, 'GET', '/api/superadmin/internal/test-delete');
      assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
    });

    await runTest('8.4 Preserved GET /api/superadmin/internal/test works without logging or reflecting headers', async () => {
      const res = await request(server, 'GET', '/api/superadmin/internal/test');
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Internal portal API is working!');
      assert.strictEqual(res.body.headers, undefined, 'Must not echo headers');
    });

    await runTest('8.5 GET /api/superadmin/clients returns client list without plaintext passwords', async () => {
      const res = await request(server, 'GET', '/api/superadmin/clients', { token: superadminToken });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.ok(Array.isArray(res.body.clients), 'Expected clients array');
      for (const client of res.body.clients) {
        assert.strictEqual(client.password, undefined, 'Must never expose plaintext password in clients list');
        assert.ok(client.name, 'Client name preserved');
        assert.ok(client.email, 'Client email preserved');
      }
    });

    await runTest('8.6 POST /api/superadmin/create-client does not return plaintext password in client object', async () => {
      const res = await request(server, 'POST', '/api/superadmin/create-client', {
        token: superadminToken,
        body: { name: 'New Client Uni', email: 'client@uni.edu', password: 'SecretPassword123' }
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.client.password, undefined, 'Must never return plaintext password');
      assert.strictEqual(res.body.client.name, 'New Client Uni');
      assert.strictEqual(res.body.client.email, 'client@uni.edu');
    });

    await runTest('8.7 Unused GET /api/subscriptions/debug-feature-access is removed (404)', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/debug-feature-access');
      assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
    });

    await runTest('8.8 GET /api/subscriptions/check-feature-access rejects unauthenticated request with 401', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/check-feature-access');
      assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Authentication required');
    });

    await runTest('8.9 GET /api/subscriptions/check-feature-access rejects forged mock token with 401', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/check-feature-access', {
        token: forgedMockToken
      });
      assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, false);
    });

    await runTest('8.10 GET /api/subscriptions/check-feature-access evaluates legitimate student role correctly', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/check-feature-access', {
        token: studentToken
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.currentPlan !== undefined, 'Returns student currentPlan');
    });

    await runTest('8.11 GET /api/subscriptions/check-feature-access evaluates legitimate accountant role correctly', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/check-feature-access', {
        token: accountantToken
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.currentPlan !== undefined, 'Returns accountant currentPlan');
    });

    await runTest('8.12 GET /api/subscriptions/check-feature-access evaluates legitimate admin role correctly', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/check-feature-access', {
        token: adminToken
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.currentPlan !== undefined, 'Returns admin currentPlan');
    });

    await runTest('8.13 GET /api/subscriptions/check-feature-access evaluates legitimate SuperAdmin role correctly', async () => {
      const res = await request(server, 'GET', '/api/subscriptions/check-feature-access', {
        token: superadminToken
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.body.success, true);
    });

  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await fixture.cleanup();
    console.log('🧹 Isolated test cleanup complete.');
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n================================================================');
  console.log(`📊 TEST RESULTS: ${passed}/${results.length} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
