/**
 * Deny by default: every registered API route is closed unless it is on the public list.
 * Covers SEC-001/SEC-002 (generic unauthenticated routes), SEC-003 (guest access),
 * SEC-013 (subscription and payment routes), SEC-015 (export) and SEC-016 (debug endpoints).
 *
 * The route list is read from the running app (nested routers and generated routes
 * included), so a route added later is tested automatically.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');
const { listRoutes } = require('../helpers/routeInventory');
const { findAccess, PUBLIC } = require('../../config/accessPolicy');

// The complete, intentional list of endpoints that work without signing in.
// Adding a public endpoint means adding it here, in review, on purpose.
const EXPECTED_PUBLIC = [
  'POST /auth/login',
  'POST /auth/register',
  'POST /password-reset/send-otp',
  'POST /password-reset/verify-otp',
  'POST /password-reset/reset-password',
  'GET /password-reset/check-cooldown',
  'POST /student-setup/check',
  'POST /student-setup/complete',
  'POST /superadmin/login',
  'POST /superadmin/refresh-token',
  'POST /demo-requests',
  'POST /live-classes/webhooks/jaas', // the meeting provider; refused without a valid HMAC signature
  'POST /translate',
  'POST /translation/translate',
  'POST /translation/translate-batch',
  'GET /translation/languages',
  'GET /language/supported',
].sort();

// Paths that used to be reachable (several of them without any login) and must be gone.
const REMOVED_ENDPOINTS = [
  ['POST', '/api/bulk/users'],
  ['POST', '/api/bulk/payments'],
  ['GET', '/api/users/export'],
  ['GET', '/api/payments/export'],
  ['PUT', '/api/vendors/1'],
  ['DELETE', '/api/vendors/1'],
  ['PUT', '/api/inventory/1'],
  ['DELETE', '/api/inventory/1'],
  ['PUT', '/api/transactions/1'],
  ['DELETE', '/api/transactions/1'],
  ['DELETE', '/api/progress/1'],
  ['PUT', '/api/certificates/1'],
  ['PUT', '/api/requirement_items/1'],
  ['GET', '/api/test-endpoint'],
  ['GET', '/api/test'],
  ['GET', '/api/test-rate-limit'],
  ['GET', '/api/superadmin/internal/debug'],
  ['GET', '/api/superadmin/internal/test'],
  ['GET', '/api/superadmin/internal/superadmins-test'],
  ['GET', '/api/superadmin/internal/test-delete'],
  ['GET', '/api/superadmin/clients'],
  ['POST', '/api/superadmin/create-client'],
  ['GET', '/api/requirements/test'],
  ['GET', '/api/requirements/debug/database'],
  ['PATCH', '/api/requirements/1/status-test'],
  ['POST', '/api/subscriptions/test-upgrade'],
  ['GET', '/api/subscriptions/debug-feature-access'],
  ['POST', '/api/classrooms/debug/create-test-assignment'],
  ['GET', '/api/classrooms/test-assignment'],
];

const concrete = (routePath) => routePath.replace(/:\w+/g, '1');

describe('route coverage (deny by default)', () => {
  let ctx;
  let routes;
  before(async () => {
    ctx = await startTestApp();
    routes = listRoutes(ctx.app)
      .filter((route) => route.path.startsWith('/api'))
      .map((route) => ({ ...route, apiPath: route.path.slice('/api'.length) || '/' }));
  });
  after(async () => { await ctx.stop(); });

  it('finds the registered routes (sanity check on the inventory itself)', () => {
    assert.ok(routes.length > 300, `only ${routes.length} routes found`);
    for (const expected of ['POST /api/auth/login', 'GET /api/users/:id', 'GET /api/assessment-agent/teacher/assessments', 'POST /api/onboarding/imports']) {
      assert.ok(routes.some((route) => `${route.method} ${route.path}` === expected), `missing ${expected}`);
    }
  });

  it('the public endpoints are exactly the intended list', () => {
    const actual = [...new Set(routes.filter((route) => findAccess(route.method, route.apiPath) === PUBLIC).map((route) => `${route.method} ${route.apiPath}`))].sort();
    assert.deepEqual(actual, EXPECTED_PUBLIC);
  });

  it('every other route answers 401 without credentials, for every HTTP method', async () => {
    const closed = routes.filter((route) => findAccess(route.method, route.apiPath) !== PUBLIC);
    assert.ok(closed.length > 300);
    const open = [];
    for (const route of closed) {
      const response = await ctx.api(route.method, concrete(route.path), route.method === 'GET' ? {} : { body: {} });
      if (response.status !== 401) open.push(`${route.method} ${route.path} -> ${response.status}`);
    }
    assert.deepEqual(open, []);
  });

  it('every other route answers 401 to a forged token', async () => {
    const forgedTokens = [
      'not-a-jwt',
      `superadmin-${Buffer.from(JSON.stringify({ email: 'attacker@example.com' })).toString('base64')}`,
    ];
    const closed = routes.filter((route) => findAccess(route.method, route.apiPath) !== PUBLIC);
    const open = [];
    for (const route of closed) {
      for (const token of forgedTokens) {
        const response = await ctx.api(route.method, concrete(route.path), { token, ...(route.method === 'GET' ? {} : { body: {} }) });
        if (response.status !== 401) open.push(`${route.method} ${route.path} -> ${response.status}`);
      }
    }
    assert.deepEqual(open, []);
  });

  it('a path with no rule is refused even for a signed-in admin or the platform owner', async () => {
    for (const as of ['adminA', 'superadmin']) {
      for (const url of ['/api/not-a-real-area', '/api/internal/anything', '/api/assignments', '/api/users-backup']) {
        const response = await ctx.api('GET', url, { as });
        assert.equal(response.status, 403, `${as} GET ${url}`);
      }
    }
  });

  it('removed generic, bulk, export, debug and test endpoints stay removed for every role', async () => {
    const reachable = [];
    for (const as of ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA', 'superadmin']) {
      for (const [method, url] of REMOVED_ENDPOINTS) {
        const response = await ctx.api(method, url, { as, ...(method === 'GET' ? {} : { body: { role: 'admin', name: 'x' } }) });
        if (![403, 404].includes(response.status)) reachable.push(`${as} ${method} ${url} -> ${response.status}`);
      }
    }
    assert.deepEqual(reachable, []);
  });

  it('removed endpoints changed nothing in the database', async () => {
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM vendors')).n, 0);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM payments')).n, 2);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM certificates')).n, 2);
  });

  it('unknown API paths answer with JSON, not a stack trace or an HTML page', async () => {
    const response = await ctx.api('GET', '/api/courses/1000/nothing-here/at-all', { as: 'adminA' });
    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(/at .*\.js:\d+|node_modules|SQLITE|does not exist|syntax error/.test(response.text), false);
  });

  it('CORS allows listed origins only and never a wildcard with credentials', async () => {
    const preflight = (origin) =>
      fetch(`${ctx.base}/api/courses`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
    const allowed = await preflight('http://localhost:5173');
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const stranger = await preflight('https://evil.example');
    assert.equal(stranger.headers.get('access-control-allow-origin'), null);
    const plain = await fetch(`${ctx.base}/health`, { headers: { Origin: 'https://evil.example' } });
    assert.notEqual(plain.headers.get('access-control-allow-origin'), '*');
  });

  it('security headers are present on API responses', async () => {
    const response = await ctx.api('GET', '/api/courses', { as: 'adminA' });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-powered-by'), null);
  });
});
