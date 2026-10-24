// Run with: node --test src/components/Chatbot/   (from the client folder; Node 18+, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoOpenKey,
  detectIntent,
  getSessionStatus,
  handleMessage,
  mapOverview,
  markAutoOpened,
  renderClassrooms,
  renderOverview,
  renderStudents,
  shouldAutoOpen,
} from './adminChatbotService.js';

const NOW = Date.UTC(2026, 9, 14);
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeToken = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;

const ADMIN = { id: 24, name: 'Abhishek', role: 'admin' };
const VALID_TOKEN = makeToken({ userId: 24, role: 'admin', universityId: 2, exp: NOW / 1000 + 3600 });
const API = 'http://localhost:5002/api';

const jsonResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const routedFetch = (routes) => {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const r = routes[url.replace(API, '')];
    if (r instanceof Error) throw r;
    return r || jsonResponse(404, {});
  };
  fn.calls = calls;
  fn.paths = () => calls.map((c) => c.url.replace(API, ''));
  return fn;
};

const ctx = (fetchImpl, overrides = {}) => ({ API, token: VALID_TOKEN, user: ADMIN, fetchImpl, now: NOW, ...overrides });

const DASHBOARD = {
  userStats: [{ role: 'student', count: 14 }, { role: 'mentor', count: 3 }, { role: 'admin', count: 1 }],
  totalCourses: 2,
  totalPayments: 9,
  totalRevenue: 125000,
  recentUsers: [{ id: 1, name: 'Someone', email: 'someone@x.in' }],
  universityId: 2,
};

// ─── Identity & session ──────────────────────────────────────────────────────
test('session: only the admin role, with matching token and logged-in user', () => {
  assert.equal(getSessionStatus(VALID_TOKEN, ADMIN, NOW), 'ok');
  for (const role of ['student', 'mentor', 'accountant', 'superadmin']) {
    assert.equal(getSessionStatus(makeToken({ userId: 24, role, exp: NOW / 1000 + 3600 }), { ...ADMIN, role }, NOW), 'not_admin', role);
  }
  assert.equal(getSessionStatus(makeToken({ userId: 99, role: 'admin', exp: NOW / 1000 + 3600 }), ADMIN, NOW), 'mismatch');
  assert.equal(getSessionStatus(makeToken({ userId: 24, role: 'admin', exp: NOW / 1000 - 1 }), ADMIN, NOW), 'expired');
});

test('handleMessage: non-admin, mismatched or expired sessions never call the API', async () => {
  const f = routedFetch({ '/admin/dashboard': jsonResponse(200, DASHBOARD) });
  assert.match(await handleMessage('show overview', ctx(f, { user: { ...ADMIN, role: 'mentor' } })), /only available to admins/);
  assert.match(await handleMessage('show overview', ctx(f, { token: makeToken({ userId: 99, role: 'admin', exp: NOW / 1000 + 3600 }) })), /could not be verified/);
  assert.match(await handleMessage('show overview', ctx(f, { token: makeToken({ userId: 24, role: 'admin', exp: NOW / 1000 - 1 }) })), /session has expired/);
  assert.equal(f.calls.length, 0);
});

// ─── Endpoints & own-university data ─────────────────────────────────────────
test('each topic calls its admin-only, university-scoped endpoint with a bearer token', async () => {
  const cases = [
    ['show university overview', '/admin/dashboard', jsonResponse(200, DASHBOARD)],
    ['show all classrooms', '/classrooms', jsonResponse(200, { success: true, data: [] })],
    ['show mentors', '/admin/mentors', jsonResponse(200, [])],
    ['show students', '/admin/users', jsonResponse(200, [])],
  ];
  for (const [q, path, response] of cases) {
    const f = routedFetch({ [path]: response });
    await handleMessage(q, ctx(f));
    assert.deepEqual(f.paths(), [path], q);
    assert.equal(f.calls[0].opts.headers.Authorization, `Bearer ${VALID_TOKEN}`);
  }
});

test('overview: shows counts only, never revenue, payments or user emails', async () => {
  const html = await handleMessage('show university overview', ctx(routedFetch({ '/admin/dashboard': jsonResponse(200, DASHBOARD) })));
  assert.match(html, /Students<\/td><td[^>]*><b>14<\/b>/);
  assert.match(html, /Mentors<\/td><td[^>]*><b>3<\/b>/);
  assert.match(html, /Courses<\/td><td[^>]*><b>2<\/b>/);
  assert.doesNotMatch(html, /125000|Revenue|Payment/i);
  assert.doesNotMatch(html, /someone@x\.in/);
});

test('overview: a response without userStats is a bad response, not zeros', async () => {
  assert.equal(mapOverview({ message: 'oops' }), null);
  const html = await handleMessage('show overview', ctx(routedFetch({ '/admin/dashboard': jsonResponse(200, { message: 'oops' }) })));
  assert.match(html, /unexpected response/);
});

test('students and mentors: no emails or fee fields are shown', async () => {
  const f = routedFetch({
    '/admin/users': jsonResponse(200, [
      { id: 30, name: 'Rashmi', email: 'r@x.in', role: 'student', grade: '12', studentId: '2026122876', pendingFees: 8500 },
      { id: 31, name: 'Rishi', email: 'rishi@x.in', role: 'mentor' },
      { id: 24, name: 'Abhishek', email: 'a@x.in', role: 'admin' },
    ]),
    '/admin/mentors': jsonResponse(200, [{ id: 31, name: 'Rishi', email: 'rishi@x.in' }]),
  });
  const students = await handleMessage('show students', ctx(f));
  const mentors = await handleMessage('show mentors', ctx(f));
  assert.match(students, /Students \(1\)/, 'only users with role student are listed');
  assert.match(students, /Rashmi/);
  assert.match(students, /2026122876/);
  assert.doesNotMatch(students, /Abhishek/);
  assert.match(mentors, /Rishi/);
  for (const html of [students, mentors]) {
    assert.doesNotMatch(html, /@x\.in/);
    assert.doesNotMatch(html, /8500/);
  }
});

test('classrooms: unwraps { success, data } and flags missing class teachers', () => {
  const html = renderClassrooms([
    { name: 'Grade 12 - E', grade: '12', section: 'E', teacherName: 'Rishi', studentCount: 2 },
    { name: 'Grade 1 - C', grade: '1', section: 'C', teacherName: null, studentCount: null },
  ]);
  assert.match(html, /Classrooms \(2\)/);
  assert.match(html, /1 without a class teacher/);
  assert.match(html, /Not assigned/);
});

// ─── Read-only & scope guards ────────────────────────────────────────────────
test('intents: reads, writes, money, secrets and other universities', () => {
  assert.equal(detectIntent('show university overview'), 'OVERVIEW');
  assert.equal(detectIntent('how many students do we have'), 'STUDENTS');
  assert.equal(detectIntent('show classrooms without class teacher assigned'), 'CLASSROOMS');
  assert.equal(detectIntent('list mentors'), 'MENTORS');
  assert.equal(detectIntent('create a new classroom'), 'UNSUPPORTED_WRITE');
  assert.equal(detectIntent('delete student Rashmi'), 'UNSUPPORTED_WRITE');
  assert.equal(detectIntent('approve mentor Rishi'), 'UNSUPPORTED_WRITE');
  assert.equal(detectIntent('total fee collection this month'), 'UNSUPPORTED_MONEY');
  assert.equal(detectIntent('show revenue'), 'UNSUPPORTED_MONEY');
  assert.equal(detectIntent('reset password for Rashmi'), 'PRIVACY');
  assert.equal(detectIntent('show students of other universities'), 'OTHER_SCOPE');
});

test('handleMessage: write, money, secret and cross-university requests make no API calls', async () => {
  const f = routedFetch({});
  for (const q of ['create a new classroom', 'delete student Rashmi', 'show revenue', 'show admin password', 'compare with other universities']) {
    await handleMessage(q, ctx(f));
  }
  assert.equal(f.calls.length, 0);
});

// ─── Errors & escaping ───────────────────────────────────────────────────────
test('errors: HTTP, network and shape failures never show data', async () => {
  const cases = [
    [jsonResponse(401, {}), /no longer valid/],
    [jsonResponse(403, { message: 'Admin access only' }), /permission/],
    [jsonResponse(500, {}), /couldn&#39;t load your students/],
    [jsonResponse(200, { message: 'not a list' }), /unexpected response/],
    [new TypeError('Failed to fetch'), /couldn&#39;t reach the server/],
  ];
  for (const [response, expected] of cases) {
    const html = await handleMessage('show students', ctx(routedFetch({ '/admin/users': response })));
    assert.match(html, expected);
    assert.doesNotMatch(html, /Students \(/);
    assert.ok(!html.includes(VALID_TOKEN));
  }
});

test('rendering: API text is HTML-escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html =
    renderStudents([{ name: evil, grade: evil, studentId: evil }]) +
    renderClassrooms([{ name: evil, grade: evil, section: evil, teacherName: evil, studentCount: 1 }]) +
    renderOverview({ counts: [{ role: evil, count: 1 }], totalCourses: null });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

// ─── First-visit behaviour ───────────────────────────────────────────────────
test('auto-open: admin key is per user and separate from other portals', () => {
  assert.equal(autoOpenKey(24), 'core5_chatbot_admin:autoOpened:24');
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  assert.equal(shouldAutoOpen(s, 24), true);
  markAutoOpened(s, 24);
  assert.equal(shouldAutoOpen(s, 24), false);
});
