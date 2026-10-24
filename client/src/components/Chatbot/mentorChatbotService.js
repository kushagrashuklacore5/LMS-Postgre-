// Read-only data layer for the Mentor Portal chatbot (Phase 2).
//
// Pure functions only (no React, no Vite globals) so the logic can be tested
// with `node --test`. Never log or render the token.
//
// Own-data rule: the chatbot only ever shows data that belongs to the mentor
// who is logged in. Identity is the signed `userId` inside the JWT, and it must
// match the auth context's user id.
//
// Why classrooms are filtered here: GET /classrooms/my-classrooms reads
// `req.user.id`, but authMiddleware sets `req.user.userId`, so the endpoint
// falls back to every classroom of the university
// (server/controllers/classroomController.js:53-99). Until the backend is
// fixed, the chatbot keeps only classrooms whose class teacher is this mentor,
// and only asks for students/results of those classrooms.
// GET /courses/mentor is already scoped on the server by the token's userId
// (server/controllers/course-controller.js:326-332).

import { badge, card, decodeJwtPayload, esc, heading, hint, meta, tbl } from './chatbotService.js';

export { esc };

export const ENDPOINTS = {
  classrooms: '/classrooms/my-classrooms',
  classroomStudents: (id) => `/classrooms/${encodeURIComponent(id)}/students`,
  classroomResults: (id) => `/results/classroom/${encodeURIComponent(id)}`,
  courses: '/courses/mentor',
};

const MAX_ROWS = 15;
const MAX_CLASSROOMS_PER_ANSWER = 3;
const STORAGE_PREFIX = 'core5_chatbot_mentor';

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
/** The logged-in mentor's id, only when the token and the auth context agree. */
export function getOwnUserId(token, user) {
  const payload = decodeJwtPayload(token);
  const tokenId = payload?.userId;
  const contextId = user?.id ?? user?.userId;
  if (tokenId === undefined || tokenId === null || tokenId === '') return null;
  if (contextId === undefined || contextId === null || contextId === '') return null;
  return String(tokenId) === String(contextId) ? String(tokenId) : null;
}

/** 'ok' | 'missing' | 'expired' | 'not_mentor' | 'mismatch' */
export function getSessionStatus(token, user, nowMs = Date.now()) {
  if (!token || !user) return 'missing';
  const payload = decodeJwtPayload(token);
  if (!payload) return 'missing';
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= nowMs) return 'expired';
  if (user.role !== 'mentor') return 'not_mentor';
  if (payload.role !== undefined && payload.role !== 'mentor') return 'not_mentor';
  if (!getOwnUserId(token, user)) return 'mismatch';
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

/** Teacher ids a classroom row names, from either column the schema uses. */
const teacherIdsOf = (c) =>
  [c?.classTeacher && typeof c.classTeacher === 'object' ? c.classTeacher.id : c?.classTeacher, c?.classTeacherId]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(String);

/** Accepts `[...]` or `{ success, data: [...] }`; anything else is null (bad response). */
const unwrapList = (raw) => (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null);

export function mapClassrooms(rows) {
  return (rows || []).map((c) => ({
    id: c?.id,
    name: str(c?.name) || 'Unnamed classroom',
    grade: str(c?.grade),
    section: str(c?.section),
    studentCount: num(c?.studentCount),
    teacherIds: teacherIdsOf(c),
  }));
}

/** Only classrooms whose class teacher is the logged-in mentor. */
export function ownClassrooms(classrooms, ownId) {
  if (!ownId) return [];
  return classrooms.filter((c) => c.id !== undefined && c.id !== null && c.teacherIds.includes(String(ownId)));
}

export function mapStudents(rows) {
  return (rows || []).map((s) => ({
    name: str(s?.name) || 'Unnamed student',
    rollNumber: str(s?.rollNumber),
  }));
}

export function mapClassroomResults(rows) {
  return (rows || []).map((item) => {
    const latest = item?.latestResult || (Array.isArray(item?.results) ? item.results[0] : null) || null;
    return {
      studentName: str(item?.student?.name) || 'Student',
      term: latest ? str(latest.term) : null,
      percentage: latest ? num(latest.overallPercentage) : null,
      status: latest ? str(latest.overallStatus)?.toUpperCase() || null : null,
      resultCount: Array.isArray(item?.results) ? item.results.length : 0,
    };
  });
}

export function mapCourses(rows) {
  return (rows || []).map((c) => ({
    title: str(c?.title) || 'Untitled course',
    category: str(c?.category),
    enrolled: Array.isArray(c?.students) ? c.students.length : null,
  }));
}

// ─── Rendering (Student Portal card style; every API value escaped) ───────────
const dash = '—';
const statusTone = (s) => (s === 'PASS' ? 'success' : s === 'FAIL' ? 'danger' : 'neutral');
const classDetails = (c) =>
  [c.grade ? `Grade <b>${esc(c.grade)}</b>` : null, c.section ? `Section <b>${esc(c.section)}</b>` : null].filter(Boolean).join(' · ');

export function renderClassrooms(classrooms) {
  if (!classrooms.length) {
    return 'You are not the class teacher of any classroom yet. Please contact your school admin if this is wrong.';
  }
  let h = heading(`Your Classrooms (${classrooms.length})`);
  classrooms.forEach((c) => {
    const details = classDetails(c);
    h += card(
      esc(c.name),
      (details ? meta(details) : '') + (c.studentCount !== null ? `<div class="mt-1">Students: <b>${esc(c.studentCount)}</b></div>` : ''),
      'gold'
    );
  });
  return h + hint('Only classrooms where you are the class teacher are shown.');
}

export function renderStudents(classroomName, students) {
  if (!students.length) return card(esc(classroomName), 'No students are enrolled in this classroom yet.', 'neutral');
  const shown = students.slice(0, MAX_ROWS);
  const body =
    meta(`<b>${students.length}</b> student${students.length === 1 ? '' : 's'}`) +
    tbl(['Student', 'Roll No'], shown.map((s) => [`<b>${esc(s.name)}</b>`, s.rollNumber ? esc(s.rollNumber) : dash])) +
    (students.length > shown.length ? hint(`Showing ${shown.length} of ${students.length}. Open My Classroom for the full list.`) : '');
  return card(esc(classroomName), body, 'gold');
}

export function renderClassroomResults(classroomName, results) {
  if (!results.length) return card(esc(classroomName), 'No results have been published for this classroom yet.', 'neutral');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const noResult = results.filter((r) => !r.status).length;
  const summary =
    `<div class="flex flex-wrap items-center gap-1.5"><span><b>${results.length}</b> students</span>` +
    badge(`${passed} Passed`, 'success') +
    badge(`${failed} Failed`, 'danger') +
    (noResult ? badge(`${noResult} No result`, 'neutral') : '') +
    '</div>';
  const shown = results.slice(0, MAX_ROWS);
  const rows = shown.map((r) => [
    `<b>${esc(r.studentName)}</b>`,
    r.term ? esc(r.term) : dash,
    r.percentage !== null ? esc(`${r.percentage}%`) : dash,
    r.status ? badge(r.status, statusTone(r.status)) : dash,
  ]);
  return card(
    esc(classroomName),
    summary +
      tbl(['Student', 'Latest result', 'Score', 'Status'], rows) +
      (results.length > shown.length ? hint(`Showing ${shown.length} of ${results.length}. Open Class Results for the full list.`) : ''),
    'info'
  );
}

export function renderCourses(courses) {
  if (!courses.length) return 'You are not the mentor of any course yet.';
  let h = heading(`Your Courses (${courses.length})`);
  courses.forEach((c) => {
    const details = [c.category ? `Category: <b>${esc(c.category)}</b>` : null, c.enrolled !== null ? `Enrolled students: <b>${esc(c.enrolled)}</b>` : null]
      .filter(Boolean)
      .join(' · ');
    h += card(esc(c.title), details ? meta(details) : '', 'info');
  });
  return h;
}

// ─── Intents ──────────────────────────────────────────────────────────────────
const has = (m, ...words) => words.some((w) => m.includes(w));

const WRITE_ACTIONS = [
  'create announcement', 'post announcement', 'publish announcement', 'new announcement', 'send announcement',
  'schedule live class', 'create live class', 'start meeting', 'create meeting',
  'add result', 'post result', 'enter marks', 'update mark', 'edit mark',
  'mark attendance', 'take attendance',
  'add student', 'remove student', 'assign student', 'delete student',
  'create course', 'new course', 'delete course',
];

const SECRETS = ['password', 'token', 'credential', 'salary', 'bank account'];
const OTHER_SCOPE = ['other teacher', 'other mentor', 'other class', 'all classes', 'all classrooms', 'whole school', 'every class', 'entire school'];

export function detectIntent(message) {
  const m = ` ${String(message || '').toLowerCase().trim()} `;
  if (has(m, ...WRITE_ACTIONS)) return 'UNSUPPORTED_WRITE';
  if (has(m, ...SECRETS)) return 'PRIVACY';
  if (has(m, ...OTHER_SCOPE)) return 'OTHER_SCOPE';
  if (has(m, 'result', 'mark', 'score', 'exam', 'performance', 'pass rate', 'fail rate', ' pass', ' fail')) return 'RESULTS';
  if (has(m, 'student', 'pupil', 'roster', 'enrolled', 'who is in my class')) return 'STUDENTS';
  if (has(m, 'classroom', 'class room', 'my class', 'section', 'classes i teach', 'assigned class')) return 'CLASSROOMS';
  if (has(m, 'course', 'subject', 'curriculum', 'syllabus')) return 'COURSES';
  if (has(m, 'live class', 'live session', 'meeting', 'jitsi')) return 'UNSUPPORTED_LIVE';
  if (has(m, 'fee', 'payment', 'due', 'installment')) return 'UNSUPPORTED_FEES';
  if (has(m, 'attend')) return 'UNSUPPORTED_ATTENDANCE';
  if (has(m, 'announc', 'notice', 'circular')) return 'UNSUPPORTED_ANNOUNCEMENTS';
  if (/\b(hi|hello|hey|help|start)\b/.test(m) || has(m, 'what can', 'assist')) return 'HELP';
  return 'UNKNOWN';
}

const TOPICS_HTML = '<b>My Classrooms</b>, <b>My Students</b>, <b>Class Results</b> and <b>My Courses</b>';

export const HELP_HTML =
  `I can show your ${TOPICS_HTML}. Use the buttons below or type a question.` +
  hint('I only show classrooms where you are the class teacher and courses you mentor, read-only.');

const FIXED_REPLIES = {
  UNSUPPORTED_WRITE: 'I am a <b>read-only</b> assistant. To post announcements, mark attendance, add results or schedule classes, please use the pages in the left sidebar.',
  PRIVACY: 'Passwords, tokens and financial credentials are never available through the assistant.',
  OTHER_SCOPE: 'I can only show your own classrooms and courses. Please contact your school admin for other classes or teachers.',
  UNSUPPORTED_LIVE: 'I can’t show live classes yet. Please open <b>Courses</b> from the sidebar.',
  UNSUPPORTED_FEES: 'I can’t show fee details yet. Please open <b>Fee Status</b> from the sidebar.',
  UNSUPPORTED_ATTENDANCE: 'I can’t show attendance yet. Please open <b>Attendance</b> from the sidebar.',
  UNSUPPORTED_ANNOUNCEMENTS: 'Please use the <b>announcement bell</b> at the top of the page to see announcements.',
};

const ERROR_MESSAGES = {
  session_expired: 'Your session has expired. Please log out and log in again to continue.',
  mismatch: 'Your session could not be verified. Please log out and log in again to continue.',
  unauthorized: 'Your session is no longer valid. Please log out and log in again to continue.',
  not_mentor: 'This assistant is only available to mentors.',
  forbidden: "You don't have permission to view this information.",
  server_error: "The server couldn't load your {what} right now. Please try again in a moment.",
  network_error: "I couldn't reach the server to load your {what}. Please check your connection and try again.",
  bad_response: 'The server sent an unexpected response for your {what}, so there is nothing reliable to show.',
};

export function errorMessage(status, what = 'data') {
  return esc((ERROR_MESSAGES[status] || ERROR_MESSAGES.server_error).replace('{what}', what));
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────
async function loadOwnClassrooms(ctx, ownId) {
  const res = await fetchWithAuth(`${ctx.API}${ENDPOINTS.classrooms}`, ctx.token, ctx.fetchImpl);
  if (res.status !== 'ok') return { status: res.status };
  const list = unwrapList(res.data);
  if (!list) return { status: 'bad_response' };
  const all = mapClassrooms(list);
  return { status: 'ok', all, own: ownClassrooms(all, ownId) };
}

/**
 * True when `name` appears in the message as a whole name, so "Grade 12 - B"
 * is not found inside "Grade 12 - BCA-A".
 */
export function mentions(message, name) {
  if (!name) return false;
  const m = String(message).toLowerCase();
  const n = name.toLowerCase();
  const isWordChar = (ch) => /[a-z0-9]/.test(ch || '');
  for (let i = m.indexOf(n); i !== -1; i = m.indexOf(n, i + 1)) {
    if (!isWordChar(m[i - 1]) && !isWordChar(m[i + n.length])) return true;
  }
  return false;
}

/**
 * Picks the classrooms a students/results question is about. Returns
 * { refuse: true } when the message names any classroom that is not the mentor's.
 */
export function pickClassrooms(message, all, own) {
  const ownIds = new Set(own.map((c) => String(c.id)));
  const named = all.filter((c) => mentions(message, c.name));
  if (named.some((c) => !ownIds.has(String(c.id)))) return { refuse: true };
  return { targets: named.length ? named : own };
}

/** Answers one message. Returns an HTML string built only from escaped values. */
export async function handleMessage(message, ctx) {
  const session = getSessionStatus(ctx?.token, ctx?.user, ctx?.now);
  if (session === 'not_mentor') return errorMessage('not_mentor');
  if (session === 'mismatch') return errorMessage('mismatch');

  const intent = detectIntent(message);
  if (FIXED_REPLIES[intent]) return FIXED_REPLIES[intent];
  if (intent === 'HELP') return HELP_HTML;
  if (intent === 'UNKNOWN') return `Sorry, I didn’t understand that. You can ask about your ${TOPICS_HTML}.`;

  if (session !== 'ok') return errorMessage('session_expired');
  const ownId = getOwnUserId(ctx.token, ctx.user);

  if (intent === 'COURSES') {
    const res = await fetchWithAuth(`${ctx.API}${ENDPOINTS.courses}`, ctx.token, ctx.fetchImpl);
    if (res.status !== 'ok') return errorMessage(res.status, 'courses');
    const list = unwrapList(res.data);
    if (!list) return errorMessage('bad_response', 'courses');
    return renderCourses(mapCourses(list));
  }

  const loaded = await loadOwnClassrooms(ctx, ownId);
  if (loaded.status !== 'ok') return errorMessage(loaded.status, 'classrooms');
  if (intent === 'CLASSROOMS') return renderClassrooms(loaded.own);

  if (!loaded.own.length) return renderClassrooms([]);
  const pick = pickClassrooms(message, loaded.all, loaded.own);
  if (pick.refuse) return FIXED_REPLIES.OTHER_SCOPE;
  const targets = pick.targets.slice(0, MAX_CLASSROOMS_PER_ANSWER);

  const isResults = intent === 'RESULTS';
  let h = heading(isResults ? 'Class Results' : 'My Students');
  for (const c of targets) {
    const url = `${ctx.API}${isResults ? ENDPOINTS.classroomResults(c.id) : ENDPOINTS.classroomStudents(c.id)}`;
    const res = await fetchWithAuth(url, ctx.token, ctx.fetchImpl);
    const what = isResults ? `results for ${c.name}` : `students in ${c.name}`;
    if (res.status !== 'ok') {
      h += card(esc(c.name), errorMessage(res.status, what), 'danger');
      continue;
    }
    if (!Array.isArray(res.data)) {
      h += card(esc(c.name), errorMessage('bad_response', what), 'danger');
      continue;
    }
    h += isResults ? renderClassroomResults(c.name, mapClassroomResults(res.data)) : renderStudents(c.name, mapStudents(res.data));
  }
  if (pick.targets.length > targets.length) {
    h += hint(`Showing ${targets.length} of your ${pick.targets.length} classrooms. Name a classroom to see it, e.g. "results for ${pick.targets[targets.length].name}".`);
  }
  return h;
}
