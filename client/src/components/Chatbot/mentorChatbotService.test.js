// Run with: node --test src/components/Chatbot/   (from the client folder; Node 18+, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoOpenKey,
  detectIntent,
  getOwnUserId,
  getSessionStatus,
  handleMessage,
  mapClassroomResults,
  mapClassrooms,
  markAutoOpened,
  ownClassrooms,
  renderClassroomResults,
  renderStudents,
  shouldAutoOpen,
} from './mentorChatbotService.js';

const NOW = Date.UTC(2026, 9, 14);
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeToken = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;

const MENTOR = { id: 31, name: 'Rishi Teacher', role: 'mentor' };
const VALID_TOKEN = makeToken({ userId: 31, role: 'mentor', universityId: 2, exp: NOW / 1000 + 3600 });
const API = 'http://localhost:5002/api';

const jsonResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const routedFetch = (routes) => {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const path = url.replace(API, '');
    if (path in routes) {
      const r = routes[path];
      if (r instanceof Error) throw r;
      return r;
    }
    return jsonResponse(404, { message: 'not found' });
  };
  fn.calls = calls;
  fn.paths = () => calls.map((c) => c.url.replace(API, ''));
  return fn;
};

const ctx = (fetchImpl, overrides = {}) => ({ API, token: VALID_TOKEN, user: MENTOR, fetchImpl, now: NOW, ...overrides });

// What /classrooms/my-classrooms currently returns: every classroom of the university.
const UNIVERSITY_CLASSROOMS = {
  success: true,
  data: [
    { id: 8, name: 'Grade 12 - E', grade: '12', section: 'E', studentCount: 2, classTeacher: { id: 31, name: 'Rishi Teacher' } },
    { id: 9, name: 'Grade 11 - D', grade: '11', section: 'D', studentCount: 1, classTeacher: null, classTeacherId: 31 },
    { id: 4, name: 'Grade 1 - C', grade: '1', section: 'C', studentCount: 5, classTeacher: { id: 40, name: 'Other Teacher' } },
    { id: 5, name: 'Grade 2 - A', grade: '2', section: 'A', studentCount: 3, classTeacher: null },
  ],
};

// ─── Identity & session ──────────────────────────────────────────────────────
test('session: valid mentor token passes and own id comes from the token', () => {
  assert.equal(getSessionStatus(VALID_TOKEN, MENTOR, NOW), 'ok');
  assert.equal(getOwnUserId(VALID_TOKEN, MENTOR), '31');
});

test('session: only the mentor role is accepted', () => {
  for (const role of ['student', 'admin', 'teacher', 'accountant']) {
    const token = makeToken({ userId: 31, role, exp: NOW / 1000 + 3600 });
    assert.equal(getSessionStatus(token, { ...MENTOR, role }, NOW), 'not_mentor', role);
  }
  const adminToken = makeToken({ userId: 31, role: 'admin', exp: NOW / 1000 + 3600 });
  assert.equal(getSessionStatus(adminToken, MENTOR, NOW), 'not_mentor');
});

test('session: expired and missing tokens', () => {
  assert.equal(getSessionStatus(makeToken({ userId: 31, role: 'mentor', exp: NOW / 1000 - 1 }), MENTOR, NOW), 'expired');
  assert.equal(getSessionStatus(null, MENTOR, NOW), 'missing');
});

test('session: token user and logged-in user must be the same person', () => {
  const otherToken = makeToken({ userId: 40, role: 'mentor', exp: NOW / 1000 + 3600 });
  assert.equal(getSessionStatus(otherToken, MENTOR, NOW), 'mismatch');
  assert.equal(getOwnUserId(otherToken, MENTOR), null);
});

test('handleMessage: mismatched or non-mentor sessions never call the API', async () => {
  const f = routedFetch({ '/classrooms/my-classrooms': jsonResponse(200, UNIVERSITY_CLASSROOMS) });
  const otherToken = makeToken({ userId: 40, role: 'mentor', exp: NOW / 1000 + 3600 });
  assert.match(await handleMessage('show my classrooms', ctx(f, { token: otherToken })), /could not be verified/);
  assert.match(await handleMessage('show my classrooms', ctx(f, { user: { ...MENTOR, role: 'admin' } })), /only available to mentors/);
  assert.equal(f.calls.length, 0);
});

// ─── Own-data rule ───────────────────────────────────────────────────────────
test('ownClassrooms: keeps only classrooms where this mentor is class teacher', () => {
  const own = ownClassrooms(mapClassrooms(UNIVERSITY_CLASSROOMS.data), '31');
  assert.deepEqual(own.map((c) => c.id), [8, 9]);
  assert.deepEqual(ownClassrooms(mapClassrooms(UNIVERSITY_CLASSROOMS.data), null), []);
});

test('classrooms: other teachers’ and unassigned classrooms are never shown', async () => {
  const f = routedFetch({ '/classrooms/my-classrooms': jsonResponse(200, UNIVERSITY_CLASSROOMS) });
  const html = await handleMessage('show my classrooms', ctx(f));
  assert.match(html, /Grade 12 - E/);
  assert.match(html, /Grade 11 - D/);
  assert.doesNotMatch(html, /Grade 1 - C/);
  assert.doesNotMatch(html, /Grade 2 - A/);
  assert.doesNotMatch(html, /Other Teacher/);
  assert.deepEqual(f.paths(), ['/classrooms/my-classrooms']);
});

test('students: only own classroom ids are ever requested', async () => {
  const f = routedFetch({
    '/classrooms/my-classrooms': jsonResponse(200, UNIVERSITY_CLASSROOMS),
    '/classrooms/8/students': jsonResponse(200, [{ id: 30, name: 'Rashmi Shetty', email: 'r@x.in', rollNumber: 'A' }]),
    '/classrooms/9/students': jsonResponse(200, []),
  });
  const html = await handleMessage('show my students', ctx(f));
  assert.deepEqual(f.paths(), ['/classrooms/my-classrooms', '/classrooms/8/students', '/classrooms/9/students']);
  assert.match(html, /Rashmi Shetty/);
  assert.doesNotMatch(html, /r@x\.in/, 'student emails are not shown');
  assert.match(html, /No students are enrolled/);
});

test('naming another teacher’s classroom is refused without fetching it', async () => {
  const f = routedFetch({ '/classrooms/my-classrooms': jsonResponse(200, UNIVERSITY_CLASSROOMS) });
  for (const q of ['show students of Grade 1 - C', 'results for grade 1 - c']) {
    assert.match(await handleMessage(q, ctx(f)), /only show your own classrooms/);
  }
  assert.ok(f.paths().every((p) => p === '/classrooms/my-classrooms'));
});

test('a classroom name that starts with one of your own names is still refused', async () => {
  // Found in the browser: "Grade 12 - B" (own) is a prefix of "Grade 12 - BCA-A" (another teacher's).
  const data = {
    success: true,
    data: [
      { id: 9, name: 'Grade 12 - B', classTeacher: { id: 31 } },
      { id: 12, name: 'Grade 12 - BCA-A', classTeacher: { id: 51 } },
    ],
  };
  const f = routedFetch({ '/classrooms/my-classrooms': jsonResponse(200, data) });
  for (const q of ['show students of Grade 12 - BCA-A', 'results for grade 12 - bca-a', 'Grade 12 - B and Grade 12 - BCA-A students']) {
    assert.match(await handleMessage(q, ctx(f)), /only show your own classrooms/, q);
  }
  assert.ok(f.paths().every((p) => p === '/classrooms/my-classrooms'));

  const g = routedFetch({ '/classrooms/my-classrooms': jsonResponse(200, data), '/classrooms/9/students': jsonResponse(200, [{ name: 'Aarav' }]) });
  assert.match(await handleMessage('students of Grade 12 - B', ctx(g)), /Aarav/);
  assert.deepEqual(g.paths(), ['/classrooms/my-classrooms', '/classrooms/9/students']);
});

test('naming one of your own classrooms narrows the answer to it', async () => {
  const f = routedFetch({
    '/classrooms/my-classrooms': jsonResponse(200, UNIVERSITY_CLASSROOMS),
    '/results/classroom/9': jsonResponse(200, []),
  });
  const html = await handleMessage('results for Grade 11 - D', ctx(f));
  assert.deepEqual(f.paths(), ['/classrooms/my-classrooms', '/results/classroom/9']);
  assert.match(html, /No results have been published/);
});

test('mentor with no own classroom gets an explicit empty state and no roster calls', async () => {
  const f = routedFetch({ '/classrooms/my-classrooms': jsonResponse(200, { success: true, data: [UNIVERSITY_CLASSROOMS.data[2]] }) });
  assert.match(await handleMessage('show my students', ctx(f)), /not the class teacher of any classroom/);
  assert.deepEqual(f.paths(), ['/classrooms/my-classrooms']);
});

// ─── Results & courses ───────────────────────────────────────────────────────
test('results: maps the classroom results contract and summarises pass/fail', () => {
  const rows = mapClassroomResults([
    { student: { id: 30, name: 'Rashmi' }, results: [{}, {}], latestResult: { term: 'Final', overallPercentage: 91.5, overallStatus: 'PASS' } },
    { student: { id: 26, name: 'Aman' }, results: [], latestResult: null },
  ]);
  assert.deepEqual(rows[0], { studentName: 'Rashmi', term: 'Final', percentage: 91.5, status: 'PASS', resultCount: 2 });
  assert.equal(rows[1].status, null);
  const html = renderClassroomResults('Grade 12 - E', rows);
  assert.match(html, /1 Passed/);
  assert.match(html, /0 Failed/);
  assert.match(html, /1 No result/);
});

test('courses: uses the server-scoped endpoint and invents no category', async () => {
  const f = routedFetch({ '/courses/mentor': jsonResponse(200, [{ id: 4, title: 'Maths 12', students: [{}, {}] }]) });
  const html = await handleMessage('list my courses', ctx(f));
  assert.deepEqual(f.paths(), ['/courses/mentor']);
  assert.match(html, /Maths 12/);
  assert.match(html, /Enrolled students: <b>2<\/b>/);
  assert.doesNotMatch(html, /General/);
});

// ─── Error states ────────────────────────────────────────────────────────────
test('errors: HTTP, network and shape failures never show data', async () => {
  const cases = [
    [jsonResponse(401, {}), /no longer valid/],
    [jsonResponse(403, {}), /permission/],
    [jsonResponse(500, {}), /couldn&#39;t load your classrooms/],
    [jsonResponse(200, { message: 'not a list' }), /unexpected response/],
    [new TypeError('Failed to fetch'), /couldn&#39;t reach the server/],
  ];
  for (const [response, expected] of cases) {
    const html = await handleMessage('show my classrooms', ctx(routedFetch({ '/classrooms/my-classrooms': response })));
    assert.match(html, expected);
    assert.doesNotMatch(html, /Your Classrooms/);
    assert.ok(!html.includes(VALID_TOKEN));
  }
});

test('errors: a failing roster call is reported per classroom', async () => {
  const f = routedFetch({
    '/classrooms/my-classrooms': jsonResponse(200, UNIVERSITY_CLASSROOMS),
    '/classrooms/8/students': jsonResponse(500, {}),
    '/classrooms/9/students': jsonResponse(200, [{ name: 'Kiran' }]),
  });
  const html = await handleMessage('show my students', ctx(f));
  assert.match(html, /couldn&#39;t load your students in Grade 12 - E/);
  assert.match(html, /Kiran/);
});

test('rendering: API text is HTML-escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = renderStudents(evil, [{ name: evil, rollNumber: evil }]) + renderClassroomResults(evil, mapClassroomResults([{ student: { name: evil }, latestResult: { term: evil, overallStatus: evil } }]));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

// ─── Intents ─────────────────────────────────────────────────────────────────
test('intents: read-only topics, write requests and scope guards', () => {
  assert.equal(detectIntent('show my classrooms'), 'CLASSROOMS');
  assert.equal(detectIntent('who are the students in my class?'), 'STUDENTS');
  assert.equal(detectIntent('show results of my students'), 'RESULTS');
  assert.equal(detectIntent('list all my courses'), 'COURSES');
  assert.equal(detectIntent('help'), 'HELP');
  assert.equal(detectIntent('post announcement for tomorrow'), 'UNSUPPORTED_WRITE');
  assert.equal(detectIntent('mark attendance present'), 'UNSUPPORTED_WRITE');
  assert.equal(detectIntent('show admin password'), 'PRIVACY');
  assert.equal(detectIntent('show all classrooms in the school'), 'OTHER_SCOPE');
  assert.equal(detectIntent('show other teacher results'), 'OTHER_SCOPE');
});

test('handleMessage: write, privacy and scope requests make no API calls', async () => {
  const f = routedFetch({});
  for (const q of ['post announcement for tomorrow', 'show admin password', 'show all classrooms', 'any live class today']) {
    await handleMessage(q, ctx(f));
  }
  assert.equal(f.calls.length, 0);
});

// ─── First-visit behaviour ───────────────────────────────────────────────────
test('auto-open: mentor key is per user and separate from the student key', () => {
  assert.equal(autoOpenKey(31), 'core5_chatbot_mentor:autoOpened:31');
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  assert.equal(shouldAutoOpen(s, 31), true);
  markAutoOpened(s, 31);
  assert.equal(shouldAutoOpen(s, 31), false);
  assert.equal(shouldAutoOpen(s, 32), true);
});
