// Read-only data layer for the Admin Portal chatbot.
//
// Pure functions only (no React, no Vite globals) so the logic can be tested
// with `node --test`. Never log or render the token.
//
// Own-data rule for admins: only the admin's own university. Every endpoint
// used here is admin-only on the server (adminOnly) and filtered by the
// university in the admin's signed token:
//   GET /admin/dashboard  server/controllers/user-controller.js:256-324
//   GET /classrooms       server/controllers/classroomController.js:204-253
//   GET /admin/mentors    server/controllers/adminController.js:350-365
//   GET /admin/users      server/controllers/user-controller.js:8-30 (students picked by role)
// GET /admin/students is not used: it selects a column that does not exist
// (u.createdAt; the users table has created_at) and answers 500.
// Money figures (revenue, payments, fees) are deliberately not shown.

import { badge, card, decodeJwtPayload, esc, heading, hint, meta, tbl } from './chatbotService.js';

export { esc };

export const ENDPOINTS = {
  overview: '/admin/dashboard',
  classrooms: '/classrooms',
  mentors: '/admin/mentors',
  users: '/admin/users',
};

const MAX_ROWS = 15;
const STORAGE_PREFIX = 'core5_chatbot_admin';

// ─── First-visit auto-open ────────────────────────────────────────────────────
export const autoOpenKey = (userId) => `${STORAGE_PREFIX}:autoOpened:${userId}`;

export function shouldAutoOpen(storage, userId) {
  if (!storage || userId === undefined || userId === null || userId === '') return false;
  try {
    return storage.getItem(autoOpenKey(userId)) === null;
  } catch (_error) {
    return false;
  }
}

export function markAutoOpened(storage, userId) {
  if (!storage || userId === undefined || userId === null || userId === '') return false;
  try {
    storage.setItem(autoOpenKey(userId), '1');
    return true;
  } catch (_error) {
    return false;
  }
}

// ─── Identity & session ───────────────────────────────────────────────────────
/** 'ok' | 'missing' | 'expired' | 'not_admin' | 'mismatch' */
export function getSessionStatus(token, user, nowMs = Date.now()) {
  if (!token || !user) return 'missing';
  const payload = decodeJwtPayload(token);
  if (!payload) return 'missing';
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= nowMs) return 'expired';
  if (user.role !== 'admin') return 'not_admin';
  if (payload.role !== undefined && payload.role !== 'admin') return 'not_admin';
  const tokenId = payload.userId;
  const contextId = user.id ?? user.userId;
  if (tokenId === undefined || tokenId === null || contextId === undefined || contextId === null) return 'mismatch';
  if (String(tokenId) !== String(contextId)) return 'mismatch';
  return 'ok';
}

// ─── Fetching ─────────────────────────────────────────────────────────────────
/** Resolves to { status: 'ok', data } or { status: <error> }. Never throws. */
export async function fetchWithAuth(url, token, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (_error) {
    return { status: 'network_error' };
  }
  if (res.status === 401) return { status: 'unauthorized' };
  if (res.status === 403) return { status: 'forbidden' };
  if (!res.ok) return { status: 'server_error' };
  try {
    return { status: 'ok', data: await res.json() };
  } catch (_error) {
    return { status: 'bad_response' };
  }
}

// ─── Mapping (no invented values) ─────────────────────────────────────────────
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Accepts `[...]` or `{ success, data: [...] }`; anything else is null (bad response). */
const unwrapList = (raw) => (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null);

const ROLE_LABELS = {
  student: 'Students',
  mentor: 'Mentors',
  admin: 'Admins',
  accountant: 'Accountants',
  storekeeper: 'Storekeepers',
  vendor: 'Vendors',
};

/** Returns null when the response does not have the dashboard shape. */
export function mapOverview(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.userStats)) return null;
  const counts = raw.userStats
    .map((r) => ({ role: str(r?.role), count: num(r?.count) }))
    .filter((r) => r.role && r.count !== null);
  return { counts, totalCourses: num(raw.totalCourses) };
}

export function mapClassrooms(rows) {
  return (rows || []).map((c) => ({
    name: str(c?.name) || 'Unnamed classroom',
    grade: str(c?.grade),
    section: str(c?.section),
    teacherName: c?.classTeacher && typeof c.classTeacher === 'object' ? str(c.classTeacher.name) : null,
    studentCount: num(c?.studentCount),
  }));
}

export function mapMentors(rows) {
  return (rows || []).map((m) => ({ name: str(m?.name) || 'Unnamed mentor' }));
}

/** Students out of the university's user list (already filtered by university on the server). */
export function mapStudents(rows) {
  return (rows || [])
    .filter((u) => u?.role === 'student')
    .map((s) => ({
      name: str(s?.name) || 'Unnamed student',
      grade: str(s?.grade),
      studentId: str(s?.studentId),
    }));
}

// ─── Rendering (Student Portal card style; every API value escaped) ───────────
const dash = '—';

export function renderOverview(o) {
  const byRole = Object.fromEntries(o.counts.map((r) => [r.role, r.count]));
  const rows = [
    ...Object.keys(ROLE_LABELS).filter((role) => role in byRole).map((role) => [esc(ROLE_LABELS[role]), `<b>${esc(byRole[role])}</b>`]),
    ...o.counts.filter((r) => !(r.role in ROLE_LABELS)).map((r) => [esc(r.role), `<b>${esc(r.count)}</b>`]),
  ];
  if (o.totalCourses !== null) rows.push(['Courses', `<b>${esc(o.totalCourses)}</b>`]);
  if (!rows.length) return 'There is no data for your university yet.';
  return heading('Your University Overview') + card('Totals', tbl(['Item', 'Count'], rows), 'gold') + hint('Counts are for your university only.');
}

export function renderClassrooms(classrooms) {
  if (!classrooms.length) return 'Your university has no classrooms yet.';
  const shown = classrooms.slice(0, MAX_ROWS);
  const rows = shown.map((c) => [
    `<b>${esc(c.name)}</b>`,
    [c.grade, c.section].filter(Boolean).map(esc).join(' · ') || dash,
    c.teacherName ? esc(c.teacherName) : badge('Not assigned', 'neutral'),
    c.studentCount !== null ? esc(c.studentCount) : dash,
  ]);
  const unassigned = classrooms.filter((c) => !c.teacherName).length;
  return (
    heading(`Classrooms (${classrooms.length})`) +
    (unassigned ? meta(`${badge(`${unassigned} without a class teacher`, 'danger')}`) : '') +
    tbl(['Classroom', 'Grade · Section', 'Class teacher', 'Students'], rows) +
    (classrooms.length > shown.length ? hint(`Showing ${shown.length} of ${classrooms.length}. Open Classrooms for the full list.`) : '')
  );
}

export function renderMentors(mentors) {
  if (!mentors.length) return 'Your university has no mentors yet.';
  const shown = mentors.slice(0, MAX_ROWS);
  return (
    heading(`Mentors (${mentors.length})`) +
    tbl(['Mentor'], shown.map((m) => [`<b>${esc(m.name)}</b>`])) +
    (mentors.length > shown.length ? hint(`Showing ${shown.length} of ${mentors.length}. Open Users for the full list.`) : '')
  );
}

export function renderStudents(students) {
  if (!students.length) return 'Your university has no students yet.';
  const shown = students.slice(0, MAX_ROWS);
  return (
    heading(`Students (${students.length})`) +
    tbl(['Student', 'Grade', 'Student ID'], shown.map((s) => [`<b>${esc(s.name)}</b>`, s.grade ? esc(s.grade) : dash, s.studentId ? esc(s.studentId) : dash])) +
    (students.length > shown.length ? hint(`Showing the newest ${shown.length} of ${students.length}. Open Users for the full list.`) : '')
  );
}

// ─── Intents ──────────────────────────────────────────────────────────────────
const has = (m, ...words) => words.some((w) => m.includes(w));

// A request to change something: a write verb as a whole word, unless the
// message clearly asks to read ("show classrooms without a teacher assigned").
const WRITE_VERB = /\b(create|add|delete|remove|update|edit|approve|reject|assign|publish|import|post|send|reset|change|modify)\b/;
const READ_LEAD = /^\s*(show|list|view|see|display|how|what|who|which|give|tell|get|find|are|is|do)\b/;

const SECRETS = ['password', 'token', 'credential', 'secret', 'bank account'];
const MONEY = ['revenue', 'payment', 'fee', 'income', 'collection', 'salary', 'expense', 'invoice', 'amount'];
const OTHER_SCOPE = ['other university', 'other universities', 'all universities', 'every university', 'other school', 'other institute', 'super admin', 'superadmin'];

export function detectIntent(message) {
  const m = ` ${String(message || '').toLowerCase().trim()} `;
  if (has(m, ...SECRETS)) return 'PRIVACY';
  if (has(m, ...OTHER_SCOPE)) return 'OTHER_SCOPE';
  if (WRITE_VERB.test(m) && !READ_LEAD.test(m)) return 'UNSUPPORTED_WRITE';
  if (has(m, ...MONEY)) return 'UNSUPPORTED_MONEY';
  if (has(m, 'classroom', 'class room', 'section', 'class teacher')) return 'CLASSROOMS';
  if (has(m, 'mentor', 'teacher', 'faculty', 'staff')) return 'MENTORS';
  if (has(m, 'student', 'pupil', 'learner')) return 'STUDENTS';
  if (has(m, 'overview', 'summary', 'total', 'how many', 'count', 'dashboard', 'statistic', 'stats')) return 'OVERVIEW';
  if (has(m, 'announc', 'notice')) return 'UNSUPPORTED_ANNOUNCEMENTS';
  if (has(m, 'calendar', 'event', 'holiday')) return 'UNSUPPORTED_CALENDAR';
  if (/\b(hi|hello|hey|help|start)\b/.test(m) || has(m, 'what can', 'assist')) return 'HELP';
  return 'UNKNOWN';
}

const TOPICS_HTML = '<b>Overview</b>, <b>Classrooms</b>, <b>Mentors</b> and <b>Students</b>';

export const HELP_HTML =
  `I can show your university’s ${TOPICS_HTML}. Use the buttons below or type a question.` +
  hint('Read-only, and only for your own university.');

const FIXED_REPLIES = {
  PRIVACY: 'Passwords, tokens and other credentials are never available through the assistant.',
  OTHER_SCOPE: 'I can only show data for your own university.',
  UNSUPPORTED_WRITE: 'I am a <b>read-only</b> assistant. To add, edit, approve or delete anything, please use the pages in the left sidebar.',
  UNSUPPORTED_MONEY: 'I don’t show fee or payment figures. Please open <b>Fee Structure</b> from the sidebar, or ask your accountant.',
  UNSUPPORTED_ANNOUNCEMENTS: 'Please use the <b>announcement bell</b> at the top of the page to see announcements.',
  UNSUPPORTED_CALENDAR: 'I can’t show calendar events yet. Please open <b>Calendar</b> from the sidebar.',
};

const ERROR_MESSAGES = {
  session_expired: 'Your session has expired. Please log out and log in again to continue.',
  mismatch: 'Your session could not be verified. Please log out and log in again to continue.',
  unauthorized: 'Your session is no longer valid. Please log out and log in again to continue.',
  not_admin: 'This assistant is only available to admins.',
  forbidden: "You don't have permission to view this information.",
  server_error: "The server couldn't load your {what} right now. Please try again in a moment.",
  network_error: "I couldn't reach the server to load your {what}. Please check your connection and try again.",
  bad_response: 'The server sent an unexpected response for your {what}, so there is nothing reliable to show.',
};

export function errorMessage(status, what = 'data') {
  return esc((ERROR_MESSAGES[status] || ERROR_MESSAGES.server_error).replace('{what}', what));
}

const LISTS = {
  CLASSROOMS: { endpoint: ENDPOINTS.classrooms, what: 'classrooms', map: mapClassrooms, render: renderClassrooms },
  MENTORS: { endpoint: ENDPOINTS.mentors, what: 'mentors', map: mapMentors, render: renderMentors },
  STUDENTS: { endpoint: ENDPOINTS.users, what: 'students', map: mapStudents, render: renderStudents },
};

/** Answers one message. Returns an HTML string built only from escaped values. */
export async function handleMessage(message, ctx) {
  const session = getSessionStatus(ctx?.token, ctx?.user, ctx?.now);
  if (session === 'not_admin') return errorMessage('not_admin');
  if (session === 'mismatch') return errorMessage('mismatch');

  const intent = detectIntent(message);
  if (FIXED_REPLIES[intent]) return FIXED_REPLIES[intent];
  if (intent === 'HELP') return HELP_HTML;
  if (intent === 'UNKNOWN') return `Sorry, I didn’t understand that. You can ask about your university’s ${TOPICS_HTML}.`;

  if (session !== 'ok') return errorMessage('session_expired');

  if (intent === 'OVERVIEW') {
    const res = await fetchWithAuth(`${ctx.API}${ENDPOINTS.overview}`, ctx.token, ctx.fetchImpl);
    if (res.status !== 'ok') return errorMessage(res.status, 'overview');
    const overview = mapOverview(res.data);
    return overview ? renderOverview(overview) : errorMessage('bad_response', 'overview');
  }

  const l = LISTS[intent];
  const res = await fetchWithAuth(`${ctx.API}${l.endpoint}`, ctx.token, ctx.fetchImpl);
  if (res.status !== 'ok') return errorMessage(res.status, l.what);
  const list = unwrapList(res.data);
  if (!list) return errorMessage('bad_response', l.what);
  return l.render(l.map(list));
}
