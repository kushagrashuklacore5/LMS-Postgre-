// Run with: node --test src/components/Chatbot/   (from the client folder; Node 18+, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDPOINTS,
  autoOpenKey,
  detectIntent,
  fetchStudentData,
  getSessionStatus,
  handleMessage,
  mapAnnouncements,
  mapClassrooms,
  mapResults,
  markAutoOpened,
  renderAnnouncements,
  renderAttendance,
  renderClassrooms,
  renderResults,
  mapAttendance,
  shouldAutoOpen,
} from './chatbotService.js';

const NOW = Date.UTC(2026, 9, 14);
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeToken = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;

const STUDENT = { id: 30, name: 'Test Student', role: 'student' };
const VALID_TOKEN = makeToken({ userId: 30, role: 'student', universityId: 2, exp: NOW / 1000 + 3600 });
const API = 'http://localhost:5002/api';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const recordingFetch = (response) => {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (response instanceof Error) throw response;
    return response;
  };
  fn.calls = calls;
  return fn;
};

const ctx = (fetchImpl, overrides = {}) => ({ API, token: VALID_TOKEN, user: STUDENT, fetchImpl, now: NOW, ...overrides });

// ─── Role & session handling ─────────────────────────────────────────────────
test('session: valid student token is ok', () => {
  assert.equal(getSessionStatus(VALID_TOKEN, STUDENT, NOW), 'ok');
});

test('session: missing or malformed token', () => {
  assert.equal(getSessionStatus(null, STUDENT, NOW), 'missing');
  assert.equal(getSessionStatus('not-a-jwt', STUDENT, NOW), 'missing');
  assert.equal(getSessionStatus(VALID_TOKEN, null, NOW), 'missing');
});

test('session: expired token is detected client-side', () => {
  const expired = makeToken({ userId: 30, role: 'student', exp: NOW / 1000 - 1 });
  assert.equal(getSessionStatus(expired, STUDENT, NOW), 'expired');
});

test('session: non-student role in context or token is rejected', () => {
  assert.equal(getSessionStatus(VALID_TOKEN, { ...STUDENT, role: 'admin' }, NOW), 'not_student');
  const mentorToken = makeToken({ userId: 30, role: 'mentor', exp: NOW / 1000 + 3600 });
  assert.equal(getSessionStatus(mentorToken, STUDENT, NOW), 'not_student');
});

test('handleMessage: non-student never fetches', async () => {
  const f = recordingFetch(jsonResponse(200, []));
  const html = await handleMessage('show my results', ctx(f, { user: { ...STUDENT, role: 'admin' } }));
  assert.match(html, /only available to students/);
  assert.equal(f.calls.length, 0);
});

test('handleMessage: expired session does not fetch and does not claim "no records"', async () => {
  const f = recordingFetch(jsonResponse(200, []));
  const expired = makeToken({ userId: 30, role: 'student', exp: NOW / 1000 - 1 });
  const html = await handleMessage('show my attendance', ctx(f, { token: expired }));
  assert.match(html, /session has expired/);
  assert.doesNotMatch(html, /No attendance/);
  assert.equal(f.calls.length, 0);
});

// ─── API calls & error states ────────────────────────────────────────────────
test('fetch: calls the verified endpoint with a bearer token', async () => {
  for (const [kind, path] of Object.entries(ENDPOINTS)) {
    const f = recordingFetch(jsonResponse(200, []));
    const res = await fetchStudentData(kind, ctx(f));
    assert.deepEqual(res, { status: 'ok', data: [] });
    assert.equal(f.calls[0].url, `${API}${path}`);
    assert.equal(f.calls[0].opts.headers.Authorization, `Bearer ${VALID_TOKEN}`);
  }
});

test('fetch: maps HTTP and network failures to error states', async () => {
  const cases = [
    [jsonResponse(401, { message: 'Student not authenticated' }), 'unauthorized'],
    [jsonResponse(403, { message: 'Access denied' }), 'forbidden'],
    [jsonResponse(500, { message: 'Database error' }), 'server_error'],
    [jsonResponse(503, {}), 'server_error'],
    [jsonResponse(200, { message: 'not an array' }), 'bad_response'],
    [{ status: 200, ok: true, json: async () => { throw new SyntaxError('bad json'); } }, 'bad_response'],
    [new TypeError('Failed to fetch'), 'network_error'],
  ];
  for (const [response, expected] of cases) {
    const res = await fetchStudentData('results', ctx(recordingFetch(response)));
    assert.equal(res.status, expected);
  }
});

test('handleMessage: error replies never fabricate data and never contain the token', async () => {
  for (const status of [401, 403, 500]) {
    const html = await handleMessage('show my results', ctx(recordingFetch(jsonResponse(status, {}))));
    assert.doesNotMatch(html, /Your Results/);
    assert.ok(!html.includes(VALID_TOKEN));
  }
  const html = await handleMessage('show my results', ctx(recordingFetch(new TypeError('x'))));
  assert.match(html, /couldn&#39;t reach the server/);
});

// ─── Response mapping ────────────────────────────────────────────────────────
test('mapResults: keeps API values and does not invent pass/fail', () => {
  const [r] = mapResults([
    {
      type: 'term_exam', term: 'Final Term', classroomName: 'Grade 12 - E', overallPercentage: 91.67, overallStatus: 'PASS',
      comments: 'Excellent', createdAt: '2026-05-01 10:00:00',
      subjects: [{ name: 'Maths', marks: 95, total: 100 }],
    },
  ]);
  assert.equal(r.term, 'Final Term');
  assert.equal(r.typeLabel, 'Term exam');
  assert.equal(r.percentage, 91.67);
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.subjects[0], { name: 'Maths', marks: 95, total: 100, status: null });

  const [empty] = mapResults([{ term: 'Quiz', overallPercentage: null, subjects: 'garbage' }]);
  assert.equal(empty.percentage, null);
  assert.equal(empty.status, null);
  assert.deepEqual(empty.subjects, []);
});

test('mapClassrooms: teacher name from classTeacher object, timetable flag', () => {
  const [c] = mapClassrooms([
    { id: 8, name: 'Grade 12 - E', grade: '12', section: 'E', timetable: '/uploads/t.pdf', classTeacher: { name: 'Rishi', email: 'r@x' } },
  ]);
  assert.deepEqual(c, { name: 'Grade 12 - E', grade: '12', section: 'E', teacherName: 'Rishi', hasTimetable: true });
  const [none] = mapClassrooms([{ name: 'Grade 1 - C', classTeacher: 7, timetable: null }]);
  assert.equal(none.teacherName, null);
  assert.equal(none.hasTimetable, false);
});

test('mapAnnouncements: truncates long content', () => {
  const [a] = mapAnnouncements([{ title: 'T', content: 'x'.repeat(400), priority: 'HIGH', createdByUserName: 'Admin' }]);
  assert.equal(a.content.length, 301);
  assert.equal(a.priority, 'high');
  assert.equal(a.author, 'Admin');
});

test('renderers: empty states are explicit', () => {
  assert.match(renderResults([]), /No results/);
  assert.match(renderAttendance([]), /No attendance/);
  assert.match(renderClassrooms([]), /not assigned to a classroom/);
  assert.match(renderAnnouncements([]), /no announcements/);
});

test('renderAttendance: summary counts only real rows', () => {
  const html = renderAttendance(mapAttendance([
    { date: '2026-04-30', status: 'present', classroomName: 'Grade 12 - E' },
    { date: '2026-04-29', status: 'absent', classroomName: 'Grade 12 - E' },
  ]));
  assert.match(html, /<b>2<\/b> days/);
  assert.match(html, /1 Present \(50%\)/);
  assert.match(html, /1 Absent/);
});

test('renderers: API text is HTML-escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const outputs = [
    renderAnnouncements(mapAnnouncements([{ title: evil, content: evil, createdByUserName: evil }])),
    renderClassrooms(mapClassrooms([{ name: evil, grade: evil, classTeacher: { name: evil } }])),
    renderResults(mapResults([{ term: evil, comments: evil, overallStatus: evil, subjects: [{ name: evil }] }])),
    renderAttendance(mapAttendance([{ date: evil, status: evil, classroomName: evil }])),
  ];
  for (const html of outputs) {
    assert.ok(!html.includes('<img'), html);
    assert.ok(html.includes('&lt;img'));
  }
});

test('handleMessage: classroom answer shows teacher name from the API', async () => {
  const f = recordingFetch(jsonResponse(200, [{ name: 'Grade 12 - E', grade: '12', section: 'E', classTeacher: { name: 'Rishi' }, timetable: null }]));
  const html = await handleMessage('what is my timetable?', ctx(f));
  assert.equal(f.calls[0].url, `${API}/classrooms/student-classrooms`);
  assert.match(html, /Grade 12 - E/);
  assert.match(html, /Class teacher: <b>Rishi<\/b>/);
  assert.match(html, /Not uploaded yet/);
});

// ─── Intents ─────────────────────────────────────────────────────────────────
test('detectIntent: supported, unsupported and privacy-blocked', () => {
  assert.equal(detectIntent('Show my exam results'), 'RESULTS');
  assert.equal(detectIntent('Show my attendance'), 'ATTENDANCE');
  assert.equal(detectIntent('Show my classroom and timetable'), 'CLASSROOMS');
  assert.equal(detectIntent('who is my class teacher'), 'CLASSROOMS');
  assert.equal(detectIntent('Show latest announcements'), 'ANNOUNCEMENTS');
  assert.equal(detectIntent('hi'), 'HELP');
  assert.equal(detectIntent('what are my fees'), 'UNSUPPORTED_FEES');
  assert.equal(detectIntent('show other student marks'), 'PRIVACY');
  assert.equal(detectIntent('who is the topper'), 'PRIVACY');
  assert.equal(detectIntent('asdfgh'), 'UNKNOWN');
});

test('handleMessage: unsupported and privacy intents do not call any API', async () => {
  const f = recordingFetch(jsonResponse(200, []));
  assert.match(await handleMessage('show my fee status', ctx(f)), /Fees &amp; Payments/);
  assert.match(await handleMessage('show other student marks', ctx(f)), /only show your own/);
  assert.equal(f.calls.length, 0);
});

// ─── First-visit behaviour ───────────────────────────────────────────────────
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};

test('auto-open: first visit only, per user', () => {
  const s = memoryStorage();
  assert.equal(shouldAutoOpen(s, 30), true);
  assert.equal(markAutoOpened(s, 30), true);
  assert.equal(shouldAutoOpen(s, 30), false);
  assert.equal(shouldAutoOpen(s, 31), true);
  assert.equal(s._m.get(autoOpenKey(30)), '1');
  assert.equal(autoOpenKey(30), 'core5_chatbot:autoOpened:30');
});

test('auto-open: never auto-opens when storage is unavailable or user unknown', () => {
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(shouldAutoOpen(throwing, 30), false);
  assert.equal(markAutoOpened(throwing, 30), false);
  assert.equal(shouldAutoOpen(null, 30), false);
  assert.equal(shouldAutoOpen(memoryStorage(), undefined), false);
});
