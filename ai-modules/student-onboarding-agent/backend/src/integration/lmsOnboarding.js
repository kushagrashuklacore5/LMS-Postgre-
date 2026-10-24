const multer = require('multer');
const { ValidationError } = require('../errors');
const { loadImportConfig, loadLlmConfig, loadMappingConfig, loadImportJobConfig } = require('../config');
const { loadStudentSchema } = require('../validation/studentSchema');
const { ExcelImportService } = require('../import/ExcelImportService');
const { InMemoryImportJobStore } = require('../import/ImportJobStore');
const { ImportJobService } = require('../import/ImportJobService');
const { ColumnMappingService } = require('../mapping/ColumnMappingService');
const { createLLMProvider } = require('../llm/createLLMProvider');
const { openPostgresLmsAdapter } = require('../adapters/lms/PostgresLmsAdapter');
const { openCustomFieldStore } = require('../adapters/lms/PostgresCustomFieldStore');
const { createApprovedImportExecutor, InMemoryExecutionStore } = require('../execution/ApprovedImportExecutor');
const { setStudentPasswordByAdmin } = require('../onboarding/tempAdminPasswordSetup');
const { buildImportTemplate, TEMPLATE_FILE_NAME } = require('../import/ImportTemplate');

/**
 * Step 9D: the LMS-facing HTTP layer of the Student Onboarding Agent.
 *
 * The LMS mounts the router behind its own authMiddleware + requireTenant:
 *   app.use('/api/onboarding', requireAuth, requireTenant, createLmsOnboardingRouter({ express, sql }))
 * where `sql` is the LMS database interface { get, all, run, transaction } (? placeholders, promises).
 *
 * Inside, every request additionally:
 *   - must come from role 'admin';
 *   - is checked read-only against the LMS DB: the user exists, is an admin and
 *     belongs to exactly req.user.universityId (a token claiming another school is refused);
 *   - may only touch import jobs created by the same school (others are "not found").
 *
 * The actor { userId, role: 'admin', universityId } is built from req.user ONLY.
 * Clients send a file, mapping decisions and optionally expectedVersion; any
 * other field (universityId, userId, role, canonicalRows, approval flags, IDs) is rejected.
 * Responses carry statuses, row numbers, codes and opaque LMS refs: no passwords,
 * hashes, SQL, stack traces or student values.
 */
function createLmsOnboardingRouter({ express, sql, env = process.env, llmProvider, now, setupService = null, skipSetupEmails = false, tempPasswordSetup = null } = {}) {
  if (!express || typeof express.Router !== 'function') throw new TypeError('createLmsOnboardingRouter requires the host app\'s express.');
  if (!sql || ['get', 'all', 'run', 'transaction'].some((m) => typeof sql[m] !== 'function')) {
    throw new TypeError('createLmsOnboardingRouter requires the LMS database interface { get, all, run, transaction }.');
  }

  const schema = loadStudentSchema();
  const importConfig = loadImportConfig(env);
  const provider = llmProvider !== undefined ? llmProvider : createLLMProvider(loadLlmConfig(env)).provider;
  const jobService = new ImportJobService({
    schema,
    store: new InMemoryImportJobStore(loadImportJobConfig(env)),
    importService: new ExcelImportService({ maxRows: importConfig.maxRows }),
    mappingService: new ColumnMappingService({ schema, llmProvider: provider, samplesPerColumn: loadMappingConfig(env).samplesPerColumn, timeoutMs: loadLlmConfig(env).timeoutMs }),
    minLlmConfidence: loadMappingConfig(env).minConfidence,
    ...(now ? { now } : {}),
  });
  const executionStore = new InMemoryExecutionStore(); // shared: repeat/in-progress protection across requests
  const jobOwners = new Map(); // jobId -> universityId (jobs are private to the school that created them)
  const setupVerifications = new Map(); // jobId -> { verified, updatedAt } (admin's manual Yes/No; in memory like the jobs)
  const verificationOf = (jobId) => setupVerifications.get(jobId) || { verified: null, updatedAt: null };

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: importConfig.maxFileBytes, files: 1, fields: 0, parts: 1 },
    defParamCharset: 'utf8',
    fileFilter(req, file, cb) {
      if (!/\.xlsx$/i.test(file.originalname || '')) {
        return cb(new ValidationError('Only .xlsx files are supported.', [], { code: 'UNSUPPORTED_FILE_TYPE' }));
      }
      return cb(null, true);
    },
  }).single('file');

  const router = express.Router();
  router.use(express.json({ limit: '100kb' }));

  // A STUDENT's own custom field values (read-only). The only non-admin route: the user id and school come
  // from the verified session, are re-checked against the LMS, and nothing in the URL selects a student.
  router.get('/me/custom-fields', wrap(async (req, res) => {
    const u = req.user || {};
    const userId = Number(u.userId);
    const universityId = Number(u.universityId);
    if (u.role !== 'student' || !Number.isInteger(userId) || userId < 1 || !Number.isInteger(universityId) || universityId < 1) {
      throw new ValidationError('Only a student can read their own details here.', [], { code: 'FORBIDDEN', statusCode: 403 });
    }
    const { store, close } = openCustomFieldStore({ sql, actor: { userId, universityId }, schema });
    try { res.json({ customFields: await store.getOwnValues() }); } finally { close(); }
  }));

  router.use(adminOnly);
  router.use(verifyActorAgainstLms(sql));

  // Mappable target fields, straight from the canonical schema (the UI never hard-codes them)
  const fieldList = Object.freeze(schema.fields.map((f) => Object.freeze({
    name: f.name,
    required: f.required === true,
    classroomAssignment: f.classroomAssignment === true,
    description: f.description || '',
  })));
  router.get('/fields', (req, res) => res.json({ schemaVersion: schema.version, fields: fieldList }));

  // Downloadable .xlsx template whose headers are exactly the recognized ones (admin-only, like every route here).
  router.get('/template', wrap(async (req, res) => {
    const buffer = await buildImportTemplate(schema);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${TEMPLATE_FILE_NAME}"`,
      'Cache-Control': 'no-store',
    });
    res.send(buffer);
  }));

  // Upload + parse + automatic mapping + validation -> review
  router.post('/imports', (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return next(err instanceof ValidationError ? err : uploadError(err, importConfig.maxFileBytes));
      if (!req.file) return next(new ValidationError('Upload one .xlsx file in the field "file".', [], { code: 'MISSING_FILE' }));
      const activeTargets = async () => {
        const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
        try { return await store.listActiveTargets(); } finally { close(); }
      };
      activeTargets()
        .catch(() => []) // custom fields unavailable: the import works without them
        .then((existingCustomFields) => jobService.startJob(req.file.buffer, { fileName: req.file.originalname, existingCustomFields }))
        .then((review) => {
          jobOwners.set(review.jobId, req.actor.universityId);
          res.status(review.state === 'failed' ? 422 : 201).json(safeReview(review));
        })
        .catch(next);
    });
  });

  router.get('/imports/:jobId', ownJob, wrap(async (req, res) => {
    res.json(safeReview(await jobService.getReview(req.params.jobId)));
  }));

  router.post('/imports/:jobId/decisions', ownJob, wrap(async (req, res) => {
    const { decisions, expectedVersion, ...rest } = body(req);
    rejectExtra(rest);
    const options = expectedVersion === undefined ? undefined : { expectedVersion };
    res.json(safeReview(await jobService.applyMappingDecision(req.params.jobId, { decisions }, options)));
  }));

  /*
   * Approved dynamic fields (migration 003). An AI new-field idea is only "suggested" until an admin acts:
   *   approve: the definition (the AI's, or the admin's edited key/label/type) is validated on the server,
   *            the field is created (or the same existing one reused) in ONE transaction for THIS school,
   *            and only then the job records the approval and maps the column to it. If the job cannot
   *            record it, a field created by this very request is removed again (it holds no value yet):
   *            never "approved" without a field, never an orphan field from a failed approval.
   *   reject:  nothing is created; the column is confirmed as not imported.
   */
  router.post('/imports/:jobId/new-fields/approve', ownJob, wrap(async (req, res) => {
    const { sourceColumn, key, label, dataType, expectedVersion, ...rest } = body(req);
    rejectExtra(rest);
    if (typeof sourceColumn !== 'string' || !sourceColumn) throw new ValidationError('"sourceColumn" is required.', [], { code: 'INVALID_REQUEST' });
    let idea = null;
    try {
      idea = await jobService.getNewFieldIdea(req.params.jobId, sourceColumn); // 404 / 409 before any write
    } catch (e) {
      if (e?.code !== 'NEW_FIELD_NOT_FOUND') throw e;
    }
    const defaultKey = sourceColumn.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    const safeKey = /^[a-z]/.test(defaultKey) ? defaultKey : `f_${defaultKey}`;
    const definition = {
      key: key !== undefined ? key : (idea?.key || safeKey),
      label: label !== undefined ? label : (idea?.label || sourceColumn),
      dataType: dataType !== undefined ? dataType : (idea?.dataType || 'text'),
    };
    const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
    try {
      const ensured = await store.ensureField(definition); // validates again; one transaction; this school only
      try {
        const options = expectedVersion === undefined ? undefined : { expectedVersion };
        res.json(safeReview(await jobService.approveNewField(req.params.jobId, { sourceColumn, field: ensured.field }, options)));
      } catch (err) {
        if (ensured.created) await store.removeUnusedField(ensured.field.id); // compensation: no orphan field
        throw err;
      }
    } finally {
      close();
    }
  }));

  router.post('/imports/:jobId/new-fields/reject', ownJob, wrap(async (req, res) => {
    const { sourceColumn, expectedVersion, ...rest } = body(req);
    rejectExtra(rest);
    if (typeof sourceColumn !== 'string' || !sourceColumn) throw new ValidationError('"sourceColumn" is required.', [], { code: 'INVALID_REQUEST' });
    const options = expectedVersion === undefined ? undefined : { expectedVersion };
    res.json(safeReview(await jobService.rejectNewField(req.params.jobId, { sourceColumn }, options)));
  }));

  // This school's custom field definitions, and one student's custom values (read-only; school-scoped).
  router.get('/custom-fields', wrap(async (req, res) => {
    const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
    try { res.json({ ready: await store.isReady(), fields: await store.listFields() }); } finally { close(); }
  }));
  router.patch('/custom-fields/:key', wrap(async (req, res) => {
    const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
    try { res.json({ field: await store.updateField(req.params.key, body(req)) }); } finally { close(); }
  }));
  router.post('/custom-fields/:key/retire', wrap(async (req, res) => {
    rejectExtra(body(req));
    const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
    try { res.json({ field: await store.retireField(req.params.key) }); } finally { close(); }
  }));
  router.post('/custom-fields/:key/unretire', wrap(async (req, res) => {
    rejectExtra(body(req));
    const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
    try { res.json({ field: await store.unretireField(req.params.key) }); } finally { close(); }
  }));
  router.get('/students/:studentRef/custom-fields', wrap(async (req, res) => {
    const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
    try { res.json({ studentRef: req.params.studentRef, customFields: await store.getStudentValues(req.params.studentRef) }); } finally { close(); }
  }));

  router.post('/imports/:jobId/validate', ownJob, wrap(async (req, res) => {
    res.json(safeReview(await jobService.runFinalValidation(req.params.jobId, versionOnly(req))));
  }));

  router.post('/imports/:jobId/approve', ownJob, wrap(async (req, res) => {
    const options = versionOnly(req);
    // Every custom field this mapping writes must still exist for THIS school, be active and have the same type.
    const review = await jobService.getReview(req.params.jobId);
    const used = new Set(review.columns.filter((c) => c.status === 'mapped' && typeof c.targetField === 'string' && c.targetField.startsWith('custom:')).map((c) => c.targetField.slice(7)));
    if (used.size > 0) {
      const { store, close } = openCustomFieldStore({ sql, actor: req.actor, schema });
      let active;
      try { active = new Map((await store.listActiveTargets()).map((f) => [f.key, f])); } finally { close(); }
      const stale = [...used].filter((k) => { const a = active.get(k); const j = (review.customFields || []).find((f) => f.key === k); return !a || !j || a.dataType !== j.dataType; });
      if (stale.length) {
        throw new ValidationError('A custom field used by this import is no longer active or has changed. Map those columns again.', stale.map((k) => ({ code: 'CUSTOM_FIELD_NOT_ACTIVE', targetField: `custom:${k}` })), { code: 'CUSTOM_FIELD_NOT_ACTIVE', statusCode: 409 });
      }
    }
    res.json(await jobService.approveImport(req.params.jobId, options));
  }));

  // Approved import -> Step 8 executor -> PostgresLmsAdapter (this admin's verified actor) -> LMS DB
  router.post('/imports/:jobId/execute', ownJob, wrap(async (req, res) => {
    rejectExtra(body(req));
    const state = await jobService.getJobState(req.params.jobId);
    if (state !== 'approved') {
      throw new ValidationError('Only an approved import can be executed.', [`STATE_${state.toUpperCase()}`], { code: 'IMPORT_NOT_APPROVED', statusCode: 409 });
    }
    const { adapter, close } = openPostgresLmsAdapter({ sql, actor: req.actor, schema });
    let result;
    try {
      const executor = createApprovedImportExecutor({ schema, jobService, lmsAdapter: adapter, executionStore });
      result = await executor.executeApprovedImport(req.params.jobId);
    } finally {
      close();
    }
    // Step 11: setup-password emails AFTER creation. Email problems never undo a created student;
    // they are reported per row (email_failed) and retried by running the import again.
    // With email paused (skipSetupEmails), nothing is sent and rows report "skipped".
    let out = result;
    if (setupService) out = await withSetupEmails(result, req.actor, setupService);
    else if (skipSetupEmails) out = withSkippedEmails(result);
    res.json({ ...out, setupVerification: verificationOf(req.params.jobId), ...(tempPasswordSetup ? { tempPasswordSetup: true } : {}) });
  }));

  // TEMPORARY testing/admin mechanism (email disabled): set the first password of a student created by
  // this import. Replace with the email invite flow later. Registered only when the host enables it.
  if (tempPasswordSetup) {
    if (typeof tempPasswordSetup.hashPassword !== 'function') throw new TypeError('tempPasswordSetup requires the LMS hashPassword function.');
    router.post('/imports/:jobId/rows/:rowNumber/password', ownJob, wrap(async (req, res) => {
      const { password, ...rest } = body(req);
      rejectExtra(rest);
      res.json(await setStudentPasswordByAdmin({
        sql,
        actor: req.actor,
        jobId: req.params.jobId,
        rowNumber: req.params.rowNumber,
        password,
        hashPassword: tempPasswordSetup.hashPassword,
      }));
    }));
  }

  // Admin's manual Yes/No: "the student setup step for this import is verified". No email, no DB write.
  router.get('/imports/:jobId/setup-verification', ownJob, (req, res) => {
    res.json({ jobId: req.params.jobId, setupVerification: verificationOf(req.params.jobId) });
  });
  router.post('/imports/:jobId/setup-verification', ownJob, wrap(async (req, res) => {
    const { verified, ...rest } = body(req);
    rejectExtra(rest);
    if (typeof verified !== 'boolean') {
      throw new ValidationError('Send { "verified": true } or { "verified": false }.', [], { code: 'INVALID_REQUEST' });
    }
    const execution = executionStore.get(req.params.jobId);
    if (!execution || execution.status !== 'completed') {
      throw new ValidationError('Run the import before marking its student setup as verified.', [], { code: 'IMPORT_NOT_EXECUTED', statusCode: 409 });
    }
    setupVerifications.set(req.params.jobId, Object.freeze({ verified, updatedAt: new Date().toISOString() }));
    res.json({ jobId: req.params.jobId, setupVerification: verificationOf(req.params.jobId) });
  }));

  router.use(onboardingErrorHandler);

  function ownJob(req, res, next) {
    const owner = jobOwners.get(req.params.jobId);
    if (owner === undefined || owner !== req.actor.universityId) {
      return next(new ValidationError('Import job not found.', [], { code: 'JOB_NOT_FOUND', statusCode: 404 }));
    }
    return next();
  }

  return router;
}

// ---- Step 11: setup emails + the public password-setup router ----

const EMAIL_ELIGIBLE = new Set(['created', 'already_created']); // created by THIS import (already_created = replay)

/** Adds rows[i].email = { status, code? } and emailTotals; the stored execution result is not changed. */
async function withSetupEmails(result, actor, setupService) {
  const refs = result.rows.filter((r) => EMAIL_ELIGIBLE.has(r.student.status) && r.student.studentRef).map((r) => r.student.studentRef);
  let outcomes;
  try {
    outcomes = await setupService.inviteStudents({ actor, studentRefs: refs });
  } catch (err) {
    const code = err && typeof err.code === 'string' && /^[A-Z_]{3,40}$/.test(err.code) ? err.code : 'SETUP_FAILED';
    outcomes = new Map(refs.map((r) => [r, { status: 'email_failed', code }]));
  }
  const rows = result.rows.map((r) => ({
    ...r,
    email: EMAIL_ELIGIBLE.has(r.student.status) ? outcomes.get(r.student.studentRef) || { status: 'email_failed', code: 'SETUP_FAILED' } : { status: 'not_applicable' },
  }));
  const emailTotals = { sent: 0, alreadySent: 0, failed: 0, rateLimited: 0, inProgress: 0, alreadySetUp: 0 };
  const key = { sent: 'sent', already_sent: 'alreadySent', email_failed: 'failed', rate_limited: 'rateLimited', in_progress: 'inProgress', account_already_set_up: 'alreadySetUp' };
  for (const r of rows) if (key[r.email.status]) emailTotals[key[r.email.status]] += 1;
  return { ...result, rows, emailTotals };
}

/** Email paused: every student created by this import reports { status: 'skipped', code: 'EMAIL_NOT_CONFIGURED' }. */
function withSkippedEmails(result) {
  const rows = result.rows.map((r) => ({
    ...r,
    email: EMAIL_ELIGIBLE.has(r.student.status) ? { status: 'skipped', code: 'EMAIL_NOT_CONFIGURED' } : { status: 'not_applicable' },
  }));
  const skipped = rows.filter((r) => r.email.status === 'skipped').length;
  return { ...result, rows, emailTotals: { sent: 0, alreadySent: 0, failed: 0, rateLimited: 0, inProgress: 0, alreadySetUp: 0, skipped } };
}

/**
 * Public (no login) router for the student's password-setup page. The LMS mounts it
 * behind a rate limiter. The token travels in the JSON body (never in a URL), so
 * request-URL logging never sees it.
 *   POST /check    { token }            -> { valid: true, expiresAt }
 *   POST /complete { token, password }  -> { passwordSet: true }
 */
function createStudentSetupRouter({ express, setupService }) {
  if (!express || typeof express.Router !== 'function') throw new TypeError('createStudentSetupRouter requires the host app\'s express.');
  if (!setupService) throw new TypeError('createStudentSetupRouter requires a setupService.');
  const router = express.Router();
  router.use(express.json({ limit: '4kb' }));
  router.post('/check', wrap(async (req, res) => {
    const { token, ...rest } = body(req);
    rejectSetupExtra(rest);
    res.json(await setupService.checkToken(token));
  }));
  router.post('/complete', wrap(async (req, res) => {
    const { token, password, ...rest } = body(req);
    rejectSetupExtra(rest);
    res.json(await setupService.completeSetup({ token, password }));
  }));
  router.use(onboardingErrorHandler);
  return router;
}

function rejectSetupExtra(rest) {
  if (Object.keys(rest).length > 0) {
    throw new ValidationError('Send only the setup token and the new password.', [], { code: 'INVALID_REQUEST' });
  }
}

// ---- actor ----

/** The actor comes from the LMS-authenticated req.user only. */
function buildActor(user) {
  if (!user || user.role !== 'admin') return null;
  const userId = Number(user.userId);
  const universityId = Number(user.universityId);
  if (!Number.isInteger(userId) || userId < 1 || !Number.isInteger(universityId) || universityId < 1) return null;
  return Object.freeze({ userId, role: 'admin', universityId });
}

function adminOnly(req, res, next) {
  const actor = buildActor(req.user);
  if (!actor) {
    return next(new ValidationError('Admin access only.', [], { code: 'FORBIDDEN', statusCode: 403 }));
  }
  req.actor = actor;
  return next();
}

/** Read-only check that the token's claims match the LMS: admin, same school, school exists. */
function verifyActorAgainstLms(sql) {
  return (req, res, next) => {
    (async () => {
      const user = await sql.get('SELECT role, university_id FROM users WHERE id = ?', [req.actor.userId]);
      const school = await sql.get('SELECT id FROM universities WHERE id = ?', [req.actor.universityId]);
      if (!user || user.role !== 'admin' || user.university_id === null || Number(user.university_id) !== req.actor.universityId || !school) {
        throw new ValidationError('Your account does not match this school.', [], { code: 'TENANT_MISMATCH', statusCode: 403 });
      }
    })().then(() => next(), next);
  };
}

// ---- request/response shaping ----

function body(req) {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new ValidationError('Request body must be a JSON object.', [], { code: 'INVALID_REQUEST' });
  return b;
}

/** Anything the server owns (tenant, user, role, rows, approval, IDs) is refused, not ignored. */
function rejectExtra(rest) {
  const extra = Object.keys(rest);
  if (extra.length > 0) {
    throw new ValidationError(`Unexpected field(s): ${extra.join(', ')}. The server owns tenant, identity, data and approval state.`, [], { code: 'INVALID_REQUEST' });
  }
}

function versionOnly(req) {
  const { expectedVersion, ...rest } = body(req);
  rejectExtra(rest);
  return expectedVersion === undefined ? undefined : { expectedVersion };
}

/** Review without student values: validator messages can contain cell values, so issues keep codes/locations only. */
function safeReview(review) {
  return {
    jobId: review.jobId,
    state: review.state,
    version: review.version,
    approvalReady: review.approvalReady,
    approved: review.approved,
    file: review.file,
    summary: review.summary,
    columns: review.columns.map((c) => ({
      sourceColumn: c.sourceColumn,
      status: c.status,
      targetField: c.targetField,
      candidateFields: c.candidateFields,
      confidence: typeof c.confidence === 'number' ? c.confidence : null,
      decidedBy: c.decidedBy,
      blocking: c.blocking,
      errors: (c.errors || []).map((e) => e.code),
    })),
    issues: review.issues.map((i) => ({
      category: i.category,
      code: i.code,
      severity: i.severity,
      blocking: i.blocking,
      rowNumber: i.rowNumber,
      sourceColumn: i.sourceColumn,
      targetField: i.targetField,
      ...(i.details && i.details.relatedRows ? { relatedRows: i.details.relatedRows, relatedRowCount: i.details.relatedRowCount } : {}),
    })),
    automaticMapping: review.automaticMapping ? { provider: review.automaticMapping.provider, status: review.automaticMapping.status, error: review.automaticMapping.error } : null,
    missingRequiredFields: review.missingRequiredFields || [], // required fields no approved column or pending suggestion fills
    newFields: (review.newFields || []).map((f) => ({ sourceColumn: f.sourceColumn, key: f.key, label: f.label, dataType: f.dataType,
      confidence: typeof f.confidence === 'number' ? f.confidence : null, status: f.status, reason: capText(f.reason) })),
    customFields: (review.customFields || []).map((f) => ({ key: f.key, label: f.label, dataType: f.dataType, source: f.source || 'new' })), // existing | new
    aiReview: aiReviewOf(review),
    error: review.error ? { code: review.error.code } : null,
    approval: review.approval ? { approvedAt: review.approval.approvedAt, rowCount: review.approval.rowCount } : null,
  };
}

const AI_TEXT_MAX = 200;
/**
 * What the admin needs to judge the AI suggestions: per column, the MASKED samples the AI was shown
 * (never the raw cells) and the AI's short reason (model text that already passed ProposalSafety's
 * screen; plain text, capped), plus display-only ideas for new fields. Null when no AI proposal exists
 * (AI off/failed, or an exact header match that needed no AI).
 */
function aiReviewOf(review) {
  const am = review.automaticMapping;
  if (!am || am.status !== 'proposed' || am.provider === 'exact-header-match') return null;
  return {
    samples: Object.fromEntries(((am.sentToLlm && am.sentToLlm.columns) || []).map((c) => [c.sourceColumn, c.samples])),
    reasons: Object.fromEntries(review.columns.filter((c) => c.decidedBy === 'llm' && capText(c.reason)).map((c) => [c.sourceColumn, capText(c.reason)])),
  }; // new-field ideas (with their approval status) are in review.newFields
}

const capText = (t) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, AI_TEXT_MAX) : null);

function uploadError(err, maxFileBytes) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError(`The file is larger than ${Math.round(maxFileBytes / (1024 * 1024))} MB.`, [], { code: 'FILE_TOO_LARGE', statusCode: 413 });
  }
  if (err && (err.code === 'LIMIT_FIELD_COUNT' || err.code === 'LIMIT_PART_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT')) {
    return new ValidationError('Send exactly one .xlsx file in the field "file" and nothing else.', [], { code: 'INVALID_REQUEST' });
  }
  return new ValidationError('The upload could not be read.', [], { code: 'INVALID_UPLOAD' });
}

function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

/** Structured, safe errors only. Module errors carry fixed messages; anything else becomes a generic 500. */
function sendSafeError(err, res) {
  if (err instanceof ValidationError) {
    const details = Array.isArray(err.details)
      ? err.details.map((d) => (typeof d === 'string' ? d : d && d.code ? { code: d.code, sourceColumn: d.sourceColumn ?? undefined } : null)).filter(Boolean)
      : [];
    return res.status(err.statusCode || 400).json({ error: { code: err.code, message: err.message, details } });
  }
  if (err && err.name === 'LmsAdapterError') {
    const status = err.code === 'LMS_NOT_READY' ? 503 : err.code === 'TENANT_INVALID' || err.code === 'ACTOR_NOT_AUTHORIZED' ? 403 : 502;
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large.' } });
  }
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
}

/**
 * Express error middleware. The router uses it internally; the host also mounts it
 * after the router so errors raised upstream for onboarding paths (e.g. the host's
 * global express.json() rejecting a malformed body) get the same safe JSON shape
 * instead of Express's default HTML page with a stack trace.
 */
function onboardingErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  return sendSafeError(err, res);
}

module.exports = { createLmsOnboardingRouter, createStudentSetupRouter, onboardingErrorHandler, buildActor, safeReview };
