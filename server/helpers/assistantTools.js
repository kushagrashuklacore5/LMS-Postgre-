/**
 * Read-only tools for the help assistant (universalChatbot src/tools.py).
 *
 * The chatbot's model may ask for these; it never fetches data itself. Every tool reads through an
 * existing GET endpoint of this server, called with the signed-in user's own session token, so the
 * API gate (config/accessPolicy.js), school scope (helpers/schoolScope.js) and the controllers' own
 * checks decide exactly as they do for the user's screens. Relationship questions ("who teaches
 * Physics", "students of this class") are answered from endpoints the user could open directly.
 *
 * The model chooses only a tool name and validated arguments from the allowlists below: never a URL,
 * SQL, user id or school. A record id is accepted only when the user wrote it or an earlier answer in
 * this conversation showed it (helpers/assistantContext.js); names are resolved here, and several
 * matches are returned as a choice instead of a guess. Only the listed fields are returned: no emails,
 * passwords, tokens or fees.
 */

const MAX_CALLS = 3;
const MAX_TEXT = 300;
const MAX_PAGE = 20;
const MAX_CANDIDATES = 5;
const MAX_FANOUT = 10; // e.g. a teacher's classes read one by one
const CALL_TIMEOUT_MS = 15_000;
const CALL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LIVE_STATUSES = ["scheduled", "live", "completed", "cancelled", "failed"];

const policyRole = (role) => (role === "teacher" ? "mentor" : role);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const text = (v) => (typeof v === "string" && v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v);

/** Copy the listed fields that hold plain values (no nested objects), cutting long text. */
function pick(record, fields) {
  const out = {};
  for (const field of fields) {
    const value = record?.[field];
    if (value === undefined || value === null || typeof value === "object") continue;
    out[field] = text(value);
  }
  return out;
}

/* ================= reading this server's own endpoints as the user ================= */

async function getAsUser(ctx, path) {
  if (ctx.memo.has(path)) return ctx.memo.get(path); // one request never reads the same page twice
  const pending = (async () => {
    try {
      const response = await fetch(`${ctx.origin}/api${path}`, {
        headers: { Authorization: ctx.authorization },
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const body = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body };
    } catch (err) {
      console.error("Assistant tool: request failed:", err.message);
      return { ok: false, body: null };
    }
  })();
  ctx.memo.set(path, pending);
  return pending;
}

const rowsOf = (body) => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null);
const objectOf = (body) => {
  const value = body && !Array.isArray(body) && body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : body;
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
};

async function rowsFrom(ctx, path) {
  const { ok, body } = await getAsUser(ctx, path);
  return ok ? rowsOf(body) : null;
}

/* ================= record types: where each role reads them, and what is returned ================= */

const LIVE_CLASS_FIELDS = ["id", "title", "status", "courseTitle", "classLabel", "teacherName", "scheduledStartTime", "actualStartTime", "durationMinutes", "myStatus", "canJoin"];
const COURSE_FIELDS = ["id", "title", "category", "duration", "teacherName"];
const CLASSROOM_FIELDS = ["id", "name", "grade", "section", "studentCount", "classTeacherName", "role"];

// Course rows name their teacher differently per endpoint; internal fields start with "_" and are never returned.
const courseRow = (r) => ({ ...r, teacherName: r.teacherName ?? r.courseTeacherName ?? r.mentorName ?? undefined, _mentorId: r.mentorId });

async function adminCourses(ctx) {
  const rows = await rowsFrom(ctx, "/courses");
  if (!rows) return null;
  const mentors = (await rowsFrom(ctx, "/admin/mentors")) || [];
  const names = new Map(mentors.map((m) => [Number(m.id), m.name]));
  return rows.map((r) => ({ ...courseRow(r), teacherName: names.get(Number(r.mentorId)) }));
}

// A teacher's students: the students of each class they run or teach in, as the class page shows them.
async function teacherStudents(ctx) {
  const classes = await rowsFrom(ctx, "/classrooms/mentor/me");
  if (!classes) return null;
  const seen = new Map();
  for (const c of classes.slice(0, MAX_FANOUT)) {
    for (const s of (await rowsFrom(ctx, `/classrooms/${Number(c.id)}/students`)) || []) {
      if (!seen.has(s.id)) seen.set(s.id, { ...s, classroom: c.name });
    }
  }
  return [...seen.values()];
}

const TYPES = {
  students: {
    fields: ["id", "name", "grade", "rollNumber", "classroom"],
    sources: { admin: (ctx) => rowsFrom(ctx, "/admin/students"), mentor: teacherStudents },
  },
  teachers: { fields: ["id", "name"], sources: { admin: (ctx) => rowsFrom(ctx, "/admin/mentors") } },
  classrooms: {
    fields: CLASSROOM_FIELDS,
    sources: {
      admin: (ctx) => rowsFrom(ctx, "/admin/classrooms"),
      mentor: (ctx) => rowsFrom(ctx, "/classrooms/mentor/me"),
      student: async (ctx) => {
        const { ok, status, body } = await getAsUser(ctx, `/student/${Number(ctx.userId)}/classroom`);
        if (status === 404) return []; // "No classroom assigned"
        const own = ok ? objectOf(body) : null;
        return ok ? (own?.id ? [own] : []) : null;
      },
    },
  },
  courses: {
    fields: COURSE_FIELDS,
    sources: {
      admin: adminCourses,
      mentor: async (ctx) => (await rowsFrom(ctx, "/courses/mentor"))?.map(courseRow) ?? null,
      student: async (ctx) => (await rowsFrom(ctx, "/courses/student"))?.map(courseRow) ?? null,
    },
  },
  live_classes: {
    fields: LIVE_CLASS_FIELDS,
    filters: { status: LIVE_STATUSES },
    sources: {
      admin: (ctx) => rowsFrom(ctx, "/live-classes/school"),
      mentor: (ctx) => rowsFrom(ctx, "/live-classes/mine"),
      student: (ctx) => rowsFrom(ctx, "/live-classes/student"),
    },
  },
  announcements: {
    fields: ["id", "title", "priority", "type", "createdAt"],
    sources: Object.fromEntries(["admin", "mentor", "student", "accountant", "storekeeper"].map((r) => [r, (ctx) => rowsFrom(ctx, "/announcements")])),
  },
  calendar_events: {
    fields: ["id", "title", "startDate", "endDate"],
    sources: Object.fromEntries(["admin", "mentor", "student"].map((r) => [r, (ctx) => rowsFrom(ctx, "/calendar")])),
  },
  attendance: {
    fields: ["id", "date", "status", "classroomName"],
    filters: { status: ["present", "absent", "late", "excused"] },
    sources: { student: (ctx) => rowsFrom(ctx, "/attendance/student") },
  },
  results: {
    fields: ["id", "type", "term", "overallPercentage", "overallStatus", "classroomName", "createdAt"],
    sources: { student: (ctx) => rowsFrom(ctx, "/results/my-results") },
  },
  student_progress: {
    fields: ["id", "studentName", "courseTitle", "completionPercentage"],
    sources: {
      mentor: async (ctx) => (await rowsFrom(ctx, "/progress/mentor"))?.map((r) => ({
        id: `${Number(r.student?.id)}-${Number(r.course?.id)}`,
        studentName: r.student?.name,
        courseTitle: r.course?.title,
        completionPercentage: r.progress?.completionPercentage,
      })) ?? null,
    },
  },
};

const LISTABLE = Object.keys(TYPES);
const SEARCHABLE = ["students", "teachers", "classrooms", "courses", "live_classes", "announcements", "calendar_events"];

/** The label people use for a record: what name search and follow-ups ("the first one") refer to. */
const labelOf = (r) => String(r.name ?? r.title ?? r.label ?? r.studentName ?? r.date ?? r.id ?? "");

async function authorizedRows(ctx, type) {
  const source = TYPES[type].sources[policyRole(ctx.role)];
  if (!source) return { error: "This information is not available for your role." };
  const rows = await source(ctx);
  if (!rows) return { error: "This information is not available to you right now." };
  return { rows: [...rows].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)) };
}

const publicRecord = (type, row) => pick(row, TYPES[type].fields);

function applyFilters(type, rows, args) {
  let out = rows;
  const needle = args.name_contains?.trim().toLowerCase();
  if (needle) out = out.filter((r) => labelOf(r).toLowerCase().includes(needle));
  if (args.status) out = out.filter((r) => String(r.status).toLowerCase() === args.status);
  return out;
}

/* ================= name and reference resolution ================= */

/**
 * One record of `type` for this user: by an allowed id, by name, or the only one they have.
 * Returns { record } | { ambiguous: candidates } | { notFound } | { error }.
 */
async function resolve(ctx, type, { record_id: id, name }) {
  const { rows, error } = await authorizedRows(ctx, type);
  if (error) return { error };
  if (id !== undefined) {
    const row = rows.find((r) => Number(r.id) === id);
    return row ? { record: row } : { notFound: true };
  }
  if (name) {
    const wanted = name.trim().toLowerCase();
    const exact = rows.filter((r) => labelOf(r).toLowerCase() === wanted);
    const matches = exact.length ? exact : rows.filter((r) => labelOf(r).toLowerCase().includes(wanted));
    if (matches.length === 1) return { record: matches[0] };
    if (matches.length === 0) return { notFound: true };
    return { ambiguous: matches.slice(0, MAX_CANDIDATES).map((r) => publicRecord(type, r)), matches: matches.length };
  }
  if (rows.length === 1) return { record: rows[0] }; // "my class" when the user has exactly one
  if (rows.length === 0) return { notFound: true };
  return { ambiguous: rows.slice(0, MAX_CANDIDATES).map((r) => publicRecord(type, r)), matches: rows.length };
}

const NOT_FOUND = "No matching record was found among the records you can see.";
const unresolved = (type, r) =>
  r.error ? { ok: false, error: r.error }
    : r.notFound ? { ok: true, data: { record_type: type, status: "not_found", message: NOT_FOUND } }
      : { ok: true, data: { record_type: type, status: "ambiguous", matches: r.matches, candidates: r.ambiguous, message: "Several records match; ask the user which one they mean." } };

/* ================= relationships (each through an endpoint the user may open) ================= */

const detailOf = async (ctx, path) => {
  const { ok, body } = await getAsUser(ctx, path);
  return ok ? objectOf(body) : null;
};

const RELATIONS = {
  courses: {
    teacher: {
      type: "teachers",
      rows: async (ctx, id) => {
        const course = await detailOf(ctx, `/courses/${id}`);
        if (!course) return null;
        const name = course.mentorName ?? course.mentor?.name;
        return name ? [{ id: Number(course.mentorId) || undefined, name }] : [];
      },
    },
    live_classes: { type: "live_classes", rows: (ctx, id) => rowsFrom(ctx, `/live-classes/course/${id}`) },
    students: {
      type: "students",
      roles: ["admin", "mentor"],
      rows: async (ctx, id) => (await rowsFrom(ctx, `/courses/${id}/students`))?.map((s) => ({ id: s.studentId ?? s.id, name: s.name })) ?? null,
    },
    classrooms: {
      type: "classrooms",
      roles: ["admin", "mentor"],
      rows: async (ctx, id) => (await rowsFrom(ctx, `/courses/${id}/classrooms`))?.map((c) => ({ id: c.id, name: c.label ?? c.name, grade: c.grade, section: c.section })) ?? null,
    },
    assessments: {
      type: "assessments",
      fields: ["id", "title", "startTime", "endTime", "isPublished"],
      rows: (ctx, id) => rowsFrom(ctx, `/assessments/course/${id}`),
    },
    progress: {
      type: "progress",
      roles: ["student"],
      fields: ["courseId", "completionPercentage", "completedChapters", "totalChapters", "completedMaterials", "totalMaterials", "completedAssessments", "totalAssessments"],
      rows: async (ctx, id) => {
        const p = await detailOf(ctx, `/progress/${id}`);
        return p ? [p] : null;
      },
    },
  },
  classrooms: {
    students: {
      type: "students",
      roles: ["admin", "mentor"],
      rows: (ctx, id) => rowsFrom(ctx, `/classrooms/${id}/students`),
    },
    courses: { type: "courses", rows: async (ctx, id) => (await rowsFrom(ctx, `/courses/classroom/${id}`))?.map(courseRow) ?? null },
    teacher: {
      type: "teachers",
      rows: async (ctx, id) => {
        const room = await detailOf(ctx, `/classrooms/${id}`);
        if (!room) return null;
        return room.classTeacherName ? [{ id: Number(room.classTeacher) || undefined, name: room.classTeacherName }] : [];
      },
    },
  },
  teachers: {
    courses: {
      type: "courses",
      roles: ["admin"],
      rows: async (ctx, id) => (await adminCourses(ctx))?.filter((c) => Number(c._mentorId) === id) ?? null,
    },
    classrooms: {
      type: "classrooms",
      roles: ["admin"],
      rows: async (ctx, id) => (await rowsFrom(ctx, "/admin/classrooms"))?.filter((c) => Number(c.classTeacher) === id) ?? null,
    },
  },
  students: {
    classrooms: { type: "classrooms", roles: ["admin"], rows: (ctx, id) => rowsFrom(ctx, `/admin/students/${id}/classrooms`) },
  },
};

const relationFields = (relation) => relation.fields ?? TYPES[relation.type]?.fields ?? ["id", "name"];

/* ================= argument checks (strict allowlists; the model's arguments are untrusted) ================= */

const ARGS = {
  getRecordCount: ["record_type", "name_contains", "status"],
  listRecords: ["record_type", "name_contains", "status", "page", "page_size"],
  getRecordDetails: ["record_type", "record_id"],
  searchRecords: ["query", "record_type"],
  resolveRecordReference: ["record_type", "name"],
  getRelatedRecords: ["record_type", "relation", "record_id", "name", "page", "page_size"],
};

const validName = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 60;

/** Returns an error text or null. `allowedIds(type)` lists the ids this conversation may use. */
function invalidArgs(name, args, allowedIds = () => new Set()) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  if (Object.keys(args).some((k) => !ARGS[name].includes(k))) return "unknown argument";
  const type = args.record_type;
  if (name === "searchRecords") {
    if (!validName(args.query)) return "invalid search text";
    if (type !== undefined && !SEARCHABLE.includes(type)) return "unsupported record type";
    return null;
  }
  if (!Object.hasOwn(TYPES, type)) return "unsupported record type";
  if (args.name_contains !== undefined && !validName(args.name_contains)) return "invalid name filter";
  if (args.name !== undefined && !validName(args.name)) return "invalid name";
  if (args.status !== undefined && !(TYPES[type].filters?.status || []).includes(args.status)) return "unsupported filter";
  if (args.page !== undefined && !isInt(args.page, 1, 50)) return "invalid page";
  if (args.page_size !== undefined && !isInt(args.page_size, 1, MAX_PAGE)) return "invalid page size";
  if (args.record_id !== undefined) {
    if (!isInt(args.record_id, 1, 1e9)) return "invalid record id";
    if (!allowedIds(type).has(args.record_id)) return "record id not given by the user";
  }
  if (name === "getRecordDetails" && args.record_id === undefined) return "record id required";
  if (name === "resolveRecordReference" && args.name === undefined) return "name required";
  if (name === "getRelatedRecords") {
    if (!Object.hasOwn(RELATIONS[type] || {}, args.relation)) return "unsupported relation";
    if (args.record_id !== undefined && args.name !== undefined) return "give an id or a name, not both";
  }
  return null;
}

/* ================= the tools ================= */

const page = (rows, args) => {
  const number = args.page ?? 1;
  const size = args.page_size ?? 10;
  return { total: rows.length, page: number, page_size: size, has_more: number * size < rows.length, slice: rows.slice((number - 1) * size, number * size) };
};

const TOOLS = {
  async getRecordCount(ctx, args) {
    const { rows, error } = await authorizedRows(ctx, args.record_type);
    if (error) return { ok: false, error };
    const filters = pick(args, ["name_contains", "status"]);
    return { ok: true, data: { record_type: args.record_type, count: applyFilters(args.record_type, rows, args).length, ...filters } };
  },

  async listRecords(ctx, args) {
    const { rows, error } = await authorizedRows(ctx, args.record_type);
    if (error) return { ok: false, error };
    const { slice, ...pageInfo } = page(applyFilters(args.record_type, rows, args), args);
    return { ok: true, data: { record_type: args.record_type, ...pageInfo, records: slice.map((r) => publicRecord(args.record_type, r)) } };
  },

  async getRecordDetails(ctx, args) {
    const type = args.record_type;
    const id = args.record_id;
    const DETAIL_PATHS = { courses: `/courses/${id}`, live_classes: `/live-classes/${id}`, announcements: `/announcements/${id}`, classrooms: `/classrooms/${id}` };
    const DETAIL_FIELDS = {
      courses: ["id", "title", "description", "category", "duration", "teacherName"],
      live_classes: [...LIVE_CLASS_FIELDS, "description", "actualEndTime"],
      announcements: ["id", "title", "content", "priority", "type", "createdAt"],
      classrooms: ["id", "name", "grade", "section", "studentCount", "classTeacherName"],
    };
    let record;
    if (DETAIL_PATHS[type]) {
      const found = await detailOf(ctx, DETAIL_PATHS[type]);
      if (found) {
        record = { ...pick({ ...found, teacherName: found.mentorName }, DETAIL_FIELDS[type]) };
        if (type === "courses" && Array.isArray(found.students)) record.studentCount = found.students.length;
      }
    } else {
      // No detail page for this type: the row from the user's own authorized list.
      const r = await resolve(ctx, type, { record_id: id });
      if (r.error) return { ok: false, error: r.error };
      if (r.record) record = publicRecord(type, r.record);
    }
    if (!record || record.id === undefined) return { ok: false, error: "This record was not found or is not available to you." };
    return { ok: true, data: { record_type: type, ...record } };
  },

  async searchRecords(ctx, args) {
    const needle = args.query.trim().toLowerCase();
    const types = args.record_type ? [args.record_type] : SEARCHABLE.filter((t) => TYPES[t].sources[policyRole(ctx.role)]);
    const results = [];
    let matches = 0;
    for (const type of types) {
      const { rows } = await authorizedRows(ctx, type);
      const hits = (rows || []).filter((r) => labelOf(r).toLowerCase().includes(needle));
      matches += hits.length;
      results.push(...hits.slice(0, MAX_CANDIDATES).map((r) => ({ record_type: type, ...publicRecord(type, r) })));
    }
    if (!types.length) return { ok: false, error: "This information is not available for your role." };
    return { ok: true, data: { query: args.query, matches, shown: results.length, records: results.slice(0, 15) } };
  },

  async resolveRecordReference(ctx, args) {
    const r = await resolve(ctx, args.record_type, { name: args.name });
    if (!r.record) return unresolved(args.record_type, r);
    return { ok: true, data: { record_type: args.record_type, status: "resolved", record: publicRecord(args.record_type, r.record) } };
  },

  async getRelatedRecords(ctx, args) {
    const relation = RELATIONS[args.record_type][args.relation];
    if (relation.roles && !relation.roles.includes(policyRole(ctx.role))) {
      return { ok: false, error: "This information is not available for your role." };
    }
    const r = await resolve(ctx, args.record_type, args);
    if (!r.record) return unresolved(args.record_type, r);
    // The relation is read for a record the user could already see, through an endpoint they could open.
    const rows = await relation.rows(ctx, Number(r.record.id));
    if (!rows) return { ok: false, error: "This information is not available to you right now." };
    const { slice, ...pageInfo } = page(rows, args);
    return {
      ok: true,
      data: {
        record_type: args.record_type,
        of: publicRecord(args.record_type, r.record),
        relation: args.relation,
        related_type: relation.type,
        ...pageInfo,
        records: slice.map((row) => pick(row, relationFields(relation))),
      },
    };
  },
};

/**
 * What this role can read through the tools: the record types it has a source for, and the relations it may
 * follow from them. Sent to the chatbot so the model is only offered these (found live: a teacher asking for
 * "my students" got admin-only relations chosen and the answer "not available for your role"). It narrows what
 * the model sees; every call is still checked here and by the endpoints.
 */
function capabilitiesFor(role) {
  const r = policyRole(role);
  const record_types = LISTABLE.filter((t) => TYPES[t].sources[r]);
  const relations = {};
  for (const [type, rels] of Object.entries(RELATIONS)) {
    if (!record_types.includes(type)) continue;
    const allowed = Object.entries(rels).filter(([, rel]) => !rel.roles || rel.roles.includes(r)).map(([name]) => name);
    if (allowed.length) relations[type] = allowed;
  }
  return { record_types, relations };
}

// Tools the assistant runs itself (they need no school data); skipped here, not refused.
const ASSISTANT_TOOLS = new Set(["searchKnowledgeBase"]);

/**
 * Runs the model's tool calls for the signed-in user.
 * ctx = { origin, authorization, role, userId, allowedIds(type) -> Set }.
 * Unknown or invalid calls get ok:false and are never executed.
 */
async function runToolCalls(ctx, calls) {
  if (!Array.isArray(calls) || calls.length === 0 || calls.length > MAX_CALLS) {
    throw Object.assign(new Error("invalid tool calls"), { status: 502 });
  }
  const run = { ...ctx, memo: new Map(), allowedIds: ctx.allowedIds || (() => new Set()) };
  const results = [];
  const seen = new Set();
  const done = new Set();
  for (const call of calls) {
    if (!call || typeof call !== "object" || !CALL_ID.test(String(call.id)) || seen.has(call.id)) {
      throw Object.assign(new Error("invalid tool call id"), { status: 502 });
    }
    seen.add(call.id);
    if (ASSISTANT_TOOLS.has(call.name)) continue;
    if (!Object.hasOwn(TOOLS, call.name)) {
      results.push({ id: call.id, ok: false, error: "unknown tool" });
      continue;
    }
    const problem = invalidArgs(call.name, call.args, run.allowedIds);
    if (problem) {
      results.push({ id: call.id, ok: false, error: problem });
      continue;
    }
    const key = `${call.name}:${JSON.stringify(call.args)}`;
    if (done.has(key)) {
      results.push({ id: call.id, ok: false, error: "repeated call" });
      continue;
    }
    done.add(key);
    const { ok, data, error } = await TOOLS[call.name](run, call.args);
    results.push(ok ? { id: call.id, ok: true, data } : { id: call.id, ok: false, error });
  }
  return results;
}

module.exports = { runToolCalls, invalidArgs, capabilitiesFor, labelOf, TYPES, RELATIONS, LISTABLE, SEARCHABLE, MAX_CALLS, LIVE_STATUSES };
