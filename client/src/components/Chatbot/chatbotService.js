// Read-only data layer for the Student Portal chatbot (Phase 1).
//
// Pure functions only (no React, no Vite globals) so the logic can be tested
// with `node --test`. Authorization is always decided by the server; the
// role/session checks here only stop the chatbot from showing misleading
// output. Never log or render the token.
//
// Why the client checks token expiry itself: server/middleware/authMiddleware.js
// does not answer 401 for a missing or expired token on these routes. It
// continues as a "guest" user, so /results/my-results and /attendance/student
// would return 200 [] and an expired session would look like "no records".

export const ENDPOINTS = {
  results: '/results/my-results',
  attendance: '/attendance/student',
  classrooms: '/classrooms/student-classrooms',
  announcements: '/announcements',
};

const MAX_ROWS = 10;
const MAX_ANNOUNCEMENTS = 5;
const MAX_ANNOUNCEMENT_CHARS = 300;

// ─── First-visit auto-open (same namespacing style as core5_guidebot:<id>) ────
const STORAGE_PREFIX = 'core5_chatbot';

export const autoOpenKey = (userId) => `${STORAGE_PREFIX}:autoOpened:${userId}`;

/**
 * True only when storage works and this user has never had the chatbot opened.
 * If storage is unavailable we cannot remember the first visit, so we never
 * auto-open rather than auto-opening on every page load.
 */
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

// ─── Session ──────────────────────────────────────────────────────────────────
export function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload && typeof payload === 'object' ? payload : null;
  } catch (_error) {
    return null;
  }
}

/**
 * 'ok' | 'missing' | 'expired' | 'not_student'
 * Role comes from the auth context and, when present, the token's own claim.
 */
export function getSessionStatus(token, user, nowMs = Date.now()) {
  if (!token || !user) return 'missing';
  const payload = decodeJwtPayload(token);
  if (!payload) return 'missing';
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= nowMs) return 'expired';
  if (user.role !== 'student') return 'not_student';
  if (payload.role !== undefined && payload.role !== 'student') return 'not_student';
  return 'ok';
}

// ─── Fetching ─────────────────────────────────────────────────────────────────
/**
 * Resolves to { status: 'ok', data: [] } or { status: <error> } where error is
 * 'session_expired' | 'not_student' | 'unauthorized' | 'forbidden' |
 * 'server_error' | 'network_error' | 'bad_response'. Never throws.
 */
export async function fetchStudentData(kind, { API, token, user, fetchImpl = globalThis.fetch, now } = {}) {
  const path = ENDPOINTS[kind];
  if (!path) return { status: 'bad_response' };

  const session = getSessionStatus(token, user, now);
  if (session === 'missing' || session === 'expired') return { status: 'session_expired' };
  if (session === 'not_student') return { status: 'not_student' };

  let res;
  try {
    res = await fetchImpl(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (_error) {
    return { status: 'network_error' };
  }

  if (res.status === 401) return { status: 'unauthorized' };
  if (res.status === 403) return { status: 'forbidden' };
  if (!res.ok) return { status: 'server_error' };

  let data;
  try {
    data = await res.json();
  } catch (_error) {
    return { status: 'bad_response' };
  }
  if (!Array.isArray(data)) return { status: 'bad_response' };
  return { status: 'ok', data };
}

// ─── Mapping API rows to card models (no invented values) ─────────────────────
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const statusOf = (v) => {
  const s = str(v);
  return s ? s.toUpperCase() : null;
};

const RESULT_TYPE_LABELS = {
  term_exam: 'Term exam',
  course_test: 'Course test',
  ai_assessment: 'Class test',
  assignment: 'Assignment',
};

export function mapResults(rows) {
  return (rows || []).map((r) => ({
    term: str(r?.term) || 'Untitled',
    typeLabel: RESULT_TYPE_LABELS[r?.type] || null,
    classroomName: str(r?.classroomName),
    percentage: num(r?.overallPercentage),
    status: statusOf(r?.overallStatus),
    comments: str(r?.comments),
    subjects: (Array.isArray(r?.subjects) ? r.subjects : []).map((s) => ({
      name: str(s?.name) || '—',
      marks: num(s?.marks),
      total: num(s?.total),
      status: statusOf(s?.status),
    })),
    date: str(r?.createdAt),
  }));
}

export function mapAttendance(rows) {
  return (rows || []).map((a) => ({
    date: str(a?.date),
    status: str(a?.status)?.toLowerCase() || null,
    classroomName: str(a?.classroomName),
  }));
}

export function summarizeAttendance(records) {
  const total = records.length;
  const present = records.filter((a) => a.status === 'present').length;
  const absent = records.filter((a) => a.status === 'absent').length;
  return {
    total,
    present,
    absent,
    other: total - present - absent,
    presentPct: total ? Math.round((present / total) * 100) : null,
  };
}

export function mapClassrooms(rows) {
  return (rows || []).map((c) => {
    const teacher = c?.classTeacher;
    const teacherName =
      (teacher && typeof teacher === 'object' ? str(teacher.name) : null) ||
      str(c?.classTeacherName) ||
      null;
    return {
      name: str(c?.name) || 'Unnamed classroom',
      grade: str(c?.grade),
      section: str(c?.section),
      teacherName,
      hasTimetable: Boolean(str(c?.timetable)),
    };
  });
}

export function mapAnnouncements(rows) {
  return (rows || []).map((a) => {
    const content = str(a?.content) || '';
    return {
      title: str(a?.title) || 'Untitled',
      content: content.length > MAX_ANNOUNCEMENT_CHARS ? `${content.slice(0, MAX_ANNOUNCEMENT_CHARS)}…` : content,
      priority: str(a?.priority)?.toLowerCase() || null,
      author: str(a?.createdByUserName),
      date: str(a?.createdAt),
    };
  });
}

// ─── HTML rendering (Student Portal card style; every dynamic value is escaped)
// Classes are full literal Tailwind strings so the Tailwind scanner keeps them.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BADGE_TONES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-[#2563eb] border-blue-200',
  neutral: 'bg-[#f7f8fc] text-[#7a809c] border-[#e6e8f1]',
};

const CARD_ACCENTS = {
  success: 'border-l-emerald-500',
  danger: 'border-l-red-500',
  info: 'border-l-[#2563eb]',
  neutral: 'border-l-[#c7cbe0]',
  gold: 'border-l-[#B99652]',
};

// `text` is escaped here; `tone` is always a key of BADGE_TONES.
export const badge = (text, tone) =>
  `<span class="inline-block px-1.5 py-0.5 border text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${BADGE_TONES[tone]}">${esc(text)}</span>`;

export const heading = (text) => `<div class="text-[13px] font-semibold text-[#141a33] mb-2">${esc(text)}</div>`;

// Cells are pre-rendered HTML; callers must escape any API text they put in them.
export const tbl = (headers, rows) => {
  const ths = headers.map((t) => `<th class="px-2 py-1.5 border border-[#e6e8f1] bg-[#f7f8fc] text-left text-[10px] font-semibold uppercase tracking-wide text-[#7a809c] whitespace-nowrap">${esc(t)}</th>`).join('');
  const trs = rows.map((row) => `<tr>${row.map((c) => `<td class="px-2 py-1.5 border border-[#e6e8f1] text-[12px] text-[#3a4160]">${c}</td>`).join('')}</tr>`).join('');
  return `<div class="overflow-x-auto mt-2"><table class="w-full border-collapse"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
};

// `titleHtml` and `bodyHtml` are pre-rendered; callers escape API text.
export const card = (titleHtml, bodyHtml, accent = 'info') =>
  `<div class="mt-2 bg-white border border-[#e6e8f1] border-l-[3px] ${CARD_ACCENTS[accent]} p-3"><div class="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-[#141a33]">${titleHtml}</div><div class="mt-1 text-[12px] leading-relaxed text-[#3a4160]">${bodyHtml}</div></div>`;

export const hint = (text) => `<div class="mt-2 text-[11px] text-[#7a809c]">${esc(text)}</div>`;
export const meta = (text) => `<div class="text-[11px] text-[#7a809c]">${text}</div>`;
const dash = '—';
const fmtDate = (d) => (d ? esc(String(d).slice(0, 10)) : dash);
const statusTone = (s) => (s === 'PASS' ? 'success' : s === 'FAIL' ? 'danger' : 'neutral');
const moreNote = (shown, total, page) =>
  total > shown ? hint(`Showing the latest ${shown} of ${total}. Open the ${page} page for the full list.`) : '';

export function renderResults(results) {
  if (!results.length) return 'No results have been published for you yet.';
  const shown = results.slice(0, MAX_ROWS);
  let h = heading('Your Results');
  shown.forEach((r) => {
    const tone = statusTone(r.status);
    const title =
      `<span>${esc(r.term)}</span>` +
      (r.percentage !== null ? badge(`${r.percentage}%`, tone) : '') +
      (r.status ? badge(r.status, tone) : '');
    const info = [r.typeLabel, r.classroomName, r.date ? String(r.date).slice(0, 10) : null].filter(Boolean).map(esc).join(' · ');
    const subjects = r.subjects.length
      ? tbl(['Subject', 'Marks', 'Total', 'Status'], r.subjects.map((s) => [
          esc(s.name),
          s.marks !== null ? `<b>${esc(s.marks)}</b>` : dash,
          s.total !== null ? esc(s.total) : dash,
          s.status ? badge(s.status, statusTone(s.status)) : dash,
        ]))
      : '';
    h += card(title, (info ? meta(info) : '') + subjects + (r.comments ? hint(`Teacher's comment: ${r.comments}`) : ''), tone === 'neutral' ? 'info' : tone);
  });
  return h + moreNote(shown.length, results.length, 'Results');
}

export function renderAttendance(records) {
  if (!records.length) return 'No attendance has been recorded for you yet.';
  const s = summarizeAttendance(records);
  let summary = `<div class="flex flex-wrap items-center gap-1.5"><span><b>${s.total}</b> days</span>${badge(`${s.present} Present (${s.presentPct}%)`, 'success')}${badge(`${s.absent} Absent`, 'danger')}`;
  if (s.other) summary += badge(`${s.other} Other`, 'neutral');
  summary += '</div>';
  const shown = records.slice(0, MAX_ROWS);
  const rows = shown.map((a) => [
    fmtDate(a.date),
    a.status ? badge(a.status, a.status === 'present' ? 'success' : a.status === 'absent' ? 'danger' : 'neutral') : dash,
    a.classroomName ? esc(a.classroomName) : dash,
  ]);
  return `${heading('Your Attendance')}${card('Summary', summary, 'info')}${tbl(['Date', 'Status', 'Class'], rows)}${moreNote(shown.length, records.length, 'Attendance')}`;
}

export function renderClassrooms(classrooms) {
  if (!classrooms.length) return 'You are not assigned to a classroom yet. Please contact your school admin.';
  let h = heading(`Your Classroom${classrooms.length > 1 ? 's' : ''}`);
  classrooms.forEach((c) => {
    const details = [c.grade ? `Grade <b>${esc(c.grade)}</b>` : null, c.section ? `Section <b>${esc(c.section)}</b>` : null].filter(Boolean).join(' · ');
    h += card(
      esc(c.name),
      (details ? meta(details) : '') +
        `<div class="mt-1">Class teacher: <b>${c.teacherName ? esc(c.teacherName) : 'Not assigned'}</b></div>` +
        `<div class="mt-1 flex flex-wrap items-center gap-1.5">Timetable: ${c.hasTimetable ? badge('Uploaded', 'success') : badge('Not uploaded yet', 'neutral')}</div>` +
        (c.hasTimetable ? hint('Open the Timetable page to view it.') : ''),
      'gold'
    );
  });
  return h;
}

export function renderAnnouncements(items) {
  if (!items.length) return 'There are no announcements for you right now.';
  const shown = items.slice(0, MAX_ANNOUNCEMENTS);
  let h = heading('Announcements');
  shown.forEach((a) => {
    const urgent = a.priority === 'high' || a.priority === 'urgent';
    const info = [a.author ? `By ${a.author}` : null, a.date ? String(a.date).slice(0, 10) : null].filter(Boolean).map(esc).join(' · ');
    h += card(
      `<span>${esc(a.title)}</span>` + (a.priority && a.priority !== 'normal' ? badge(a.priority, urgent ? 'danger' : 'info') : ''),
      esc(a.content).replace(/\n/g, '<br>') + (info ? hint(info) : ''),
      urgent ? 'danger' : 'info'
    );
  });
  return h + (items.length > shown.length ? hint(`Showing the latest ${shown.length} of ${items.length}. Use the bell icon for the full list.`) : '');
}

const ERROR_MESSAGES = {
  session_expired: 'Your session has expired. Please log out and log in again to continue.',
  unauthorized: 'Your session is no longer valid. Please log out and log in again to continue.',
  not_student: 'This assistant is only available to students.',
  forbidden: "You don't have permission to view this information.",
  server_error: "The server couldn't load your {what} right now. Please try again in a moment.",
  network_error: "I couldn't reach the server to load your {what}. Please check your connection and try again.",
  bad_response: 'The server sent an unexpected response for your {what}, so there is nothing reliable to show.',
};

export function errorMessage(status, what) {
  return esc((ERROR_MESSAGES[status] || ERROR_MESSAGES.server_error).replace('{what}', what));
}

// ─── Intents (keyword-based, as in the prototype) ─────────────────────────────
const has = (m, ...words) => words.some((w) => m.includes(w));

const PRIVACY_BLOCKED = ['other student', 'class average', 'topper', 'rank', 'all student', 'who scored', 'everyone', "'s marks", "'s result"];

export function detectIntent(message) {
  const m = ` ${String(message || '').toLowerCase().trim()} `;
  if (has(m, ...PRIVACY_BLOCKED)) return 'PRIVACY';
  if (has(m, 'announc', 'notice', 'notification')) return 'ANNOUNCEMENTS';
  if (has(m, 'attend', 'present', 'absent')) return 'ATTENDANCE';
  if (has(m, 'timetable', 'time table', 'classroom', 'class room', 'class teacher', 'my class', 'section', 'schedule')) return 'CLASSROOMS';
  if (has(m, 'result', 'mark', 'score', 'grade', 'exam', 'percent', ' pass', ' fail', 'performance', 'report card')) return 'RESULTS';
  if (has(m, 'fee', ' pay', 'paid', 'due', 'installment', 'receipt')) return 'UNSUPPORTED_FEES';
  if (has(m, 'course', 'subject', 'enrol')) return 'UNSUPPORTED_COURSES';
  if (has(m, 'event', 'calendar', 'holiday')) return 'UNSUPPORTED_EVENTS';
  if (has(m, 'live class', 'live session', 'meeting')) return 'UNSUPPORTED_LIVE';
  if (has(m, 'assess', 'quiz', ' test', 'assignment')) return 'UNSUPPORTED_TESTS';
  if (/\b(hi|hello|hey|help|start)\b/.test(m) || has(m, 'what can', 'assist')) return 'HELP';
  return 'UNKNOWN';
}

const UNSUPPORTED = {
  UNSUPPORTED_FEES: 'I can’t show fee details yet. Please open <b>Fees &amp; Payments</b> from the sidebar.',
  UNSUPPORTED_COURSES: 'I can’t list courses yet. Please open <b>Courses</b> from the sidebar.',
  UNSUPPORTED_EVENTS: 'I can’t show calendar events yet. Please open <b>Calendar</b> from the sidebar.',
  UNSUPPORTED_LIVE: 'I can’t show live classes yet. Please check your <b>Courses</b> page.',
  UNSUPPORTED_TESTS: 'I can’t show tests or assignments yet. Please open <b>My Tests</b> or <b>Assignments</b> from the sidebar. Graded tests also appear under <b>Results</b>.',
};

const TOPICS_HTML = '<b>Results</b>, <b>Attendance</b>, <b>My Classroom</b> (with timetable) and <b>Announcements</b>';

export const HELP_HTML =
  `I can help with your ${TOPICS_HTML}. Use the buttons below or type a question.` +
  hint('I only show your own information, read-only.');

const FETCHERS = {
  RESULTS: { kind: 'results', what: 'results', map: mapResults, render: renderResults },
  ATTENDANCE: { kind: 'attendance', what: 'attendance', map: mapAttendance, render: renderAttendance },
  CLASSROOMS: { kind: 'classrooms', what: 'classroom details', map: mapClassrooms, render: renderClassrooms },
  ANNOUNCEMENTS: { kind: 'announcements', what: 'announcements', map: mapAnnouncements, render: renderAnnouncements },
};

/**
 * Answers one message. Returns an HTML string built only from escaped values.
 * ctx: { API, token, user, fetchImpl?, now? }
 */
export async function handleMessage(message, ctx) {
  const session = getSessionStatus(ctx?.token, ctx?.user, ctx?.now);
  if (session === 'not_student') return errorMessage('not_student');

  const intent = detectIntent(message);
  if (intent === 'PRIVACY') {
    return 'I can only show your own information. Please contact your teacher or admin for questions about other students.';
  }
  if (UNSUPPORTED[intent]) return UNSUPPORTED[intent];
  if (intent === 'HELP') return HELP_HTML;

  const f = FETCHERS[intent];
  if (!f) {
    return `Sorry, I didn’t understand that. You can ask about your ${TOPICS_HTML}.`;
  }

  const res = await fetchStudentData(f.kind, ctx);
  if (res.status !== 'ok') return errorMessage(res.status, f.what);
  return f.render(f.map(res.data));
}
