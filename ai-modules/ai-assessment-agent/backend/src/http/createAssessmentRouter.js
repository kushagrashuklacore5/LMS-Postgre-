const { AssessmentError } = require('../core/errors');
const { AssessmentService } = require('../core/AssessmentService');
const { AttemptService } = require('../core/AttemptService');
const { StudentPerformanceService } = require('../core/analytics/StudentPerformanceService');
const { PerformanceReportService } = require('../core/analytics/PerformanceReportService');
const { validateGenerationRequest } = require('../core/ai/generationRequest');
const { GenerationThrottle } = require('../core/ai/GenerationThrottle');
const { publicTemplates } = require('../core/ai/generationTemplates');
const { publicFocuses, validateReportRequest } = require('../core/ai/reportFocus');
const { QUESTION_TYPES } = require('../core/questionTypes');
const { registerAssignmentRoutes } = require('../assignments/assignmentRoutes'); // Descriptive Assignments
const { AssignmentService } = require('../assignments/AssignmentService');
const { validateImageUpload, contentTypeOfKey, MAX_IMAGE_BYTES, IMAGE_CONTENT_TYPES, IMAGE_KEY } = require('../core/questionImage');

/**
 * HTTP layer of the assessment agent. It knows nothing about the LMS
 * database: `openAdapter()` resolves to { adapter, close } for one request, and
 * the host's `express` is injected (the module has no dependencies of its own).
 *
 * The host MUST mount this router behind its own authentication, which sets
 * req.user = { userId, role, universityId }. The actor is then re-derived
 * from that session through adapter.resolveActor; request bodies never carry
 * tenant, owner, role, status or ids (unknown body fields are rejected).
 *
 * Teacher:  GET    /teacher/classrooms
 *           GET    /teacher/classrooms/:id/students         "Assign to" picker: { students: [{ id, name }] } (migration 008)
 *           GET    /teacher/assessments
 *           POST   /teacher/assessments
 *           GET    /teacher/assessments/:id
 *           PATCH  /teacher/assessments/:id
 *           POST   /teacher/assessments/:id/questions
 *           PUT    /teacher/assessments/:id/questions/:questionId
 *           DELETE /teacher/assessments/:id/questions/:questionId
 *           POST   /teacher/assessments/:id/publish       optional body { recipientIds } = selected students (migration 008)
 *           POST   /teacher/assessments/:id/unpublish
 * Teacher, AI (Step 2):
 *           GET    /teacher/ai/status                    { ai: { available, reason } }
 *           GET    /teacher/ai/templates                 { templates, questionTypes, questionTypesAvailable } (no LLM)
 *           POST   /teacher/assessments/generate         proposal only; saves NOTHING (questionType, template, instructions)
 *           POST   /teacher/assessments/from-review      saves reviewed questions as ONE draft
 * Teacher, results (Step 3):
 *           GET    /teacher/assessments/:id/report       per-student results + summary (no ranking)
 * Teacher, windows (Step 5):
 *           POST   /teacher/assessments/:id/close        close now: no new starts, open attempts finalized
 *           (opensAt / closesAt are optional fields of POST/PATCH /teacher/assessments)
 * Teacher, Student Performance Analyst (add-on):
 *           GET    /teacher/students/:studentId/performance            facts only (no LLM)
 *           POST   /teacher/students/:studentId/performance/analysis   AI report; optional body { focus?, instructions? } only
 *           GET    /teacher/ai/report-focuses                          { focuses, defaultFocus } (no LLM)
 * Teacher / student, shared AI Performance Reports (migration 008; NEVER call an AI):
 *           POST   /teacher/performance-reports/:reportId/share        "Send to Student" (idempotent; no body)
 *           GET    /student/performance-reports                        the student's report notifications (metadata)
 *           GET    /student/performance-reports/:reportId              ONE report shared with this student (404 otherwise)
 * Teacher, retakes (Step 6):
 *           POST   /teacher/assessments/:id/students/:studentId/reset   archive the finished attempt; student may retake
 * Student:  GET    /student/assessments            (+ own attempt status per test, Step 3)
 *           GET    /student/assessments/:id        (published, own classroom, no answers)
 * Student, attempts (Step 3):
 *           POST   /student/assessments/:id/attempt       start (201) or resume (200) the single attempt
 *           GET    /student/attempts/:attemptId           in-progress view, or the result once finalized
 *           PUT    /student/attempts/:attemptId/answers/:questionId   { optionPosition } | { optionPositions } | { value } (by question type)
 *           POST   /student/attempts/:attemptId/submit    idempotent; no body
 *           GET    /student/attempts/:attemptId/result
 *
 * Descriptive Assignments (migration 007): see assignments/assignmentRoutes.js; registered only when a
 * `fileStore` (SubmissionFileStore) is given. They never call an AI.
 *
 * `generator` (core/ai/AssessmentGenerator) is optional. Without it the AI
 * routes answer 503 AI_NOT_CONFIGURED and everything else works as in Step 1.
 * `now` is the server clock used for attempt deadlines (injectable for tests).
 *
 * `onEvent` is optional. After one of these actions has SUCCEEDED and the response was sent, the
 * host is told what happened so it can notify people: assessment.published, assignment.published,
 * assignment.submitted, assignment.evaluated, attempt.submitted, report.shared. The event carries
 * only the school and user from the verified session plus the ids involved - never request data.
 * A failing handler is logged and ignored; it cannot affect the request.
 */
function createAssessmentRouter({ express, openAdapter, generator = null, throttle = new GenerationThrottle(), now = () => Date.now(), analyst = null, analysisThrottle = new GenerationThrottle(), fileStore = null, assignmentEvaluator = null,
  evaluationThrottle = new GenerationThrottle({ maxPerWindow: 60 }), onEvent = null, imageStore = null }) {
  if (!express || typeof express.Router !== 'function') throw new TypeError('createAssessmentRouter requires the host app\'s express.');
  if (typeof openAdapter !== 'function') throw new TypeError('createAssessmentRouter requires openAdapter().');

  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  /** Reports a finished action to the host (see `onEvent` above). Deferred, and never throws. */
  const emit = (name, actor, data = {}) => {
    if (typeof onEvent !== 'function') return;
    setImmediate(() => {
      try {
        onEvent({ name, universityId: actor.universityId, actorId: actor.userId, ...data });
      } catch (err) {
        console.error('[ai-assessment-agent] event handler failed:', name);
      }
    });
  };

  /**
   * Opens the adapter, re-derives the actor from the session, runs one service call, closes.
   * Deferred with setImmediate so the host's middleware has fully returned before the work starts.
   */
  const handle = (fn, status = 200, event = null) => (req, res, next) => setImmediate(async () => {
    let opened;
    try {
      opened = await openAdapter();
      if (!opened.adapter.isReady()) {
        throw new AssessmentError('NOT_READY', 'Assessments are not available yet.', { statusCode: 503 });
      }
      const actor = await opened.adapter.resolveActor(req.user);
      const service = new AssessmentService({ adapter: opened.adapter, now });
      const attempts = new AttemptService({ adapter: opened.adapter, now }); // Step 3; `now` = server clock
      const out = await fn(service, actor, req, attempts, opened.adapter);
      // A step that forgot to await a database call would otherwise answer 200 with an empty object
      if (out && typeof out === 'object' && Object.values(out).some((v) => v && typeof v.then === 'function')) {
        throw new Error('unresolved promise in a response');
      }
      res.status(typeof status === 'function' ? status(out) : status).json(out);
      const happened = event ? event(out, req) : null;
      if (happened) emit(happened.name, actor, happened.data);
    } catch (err) {
      next(err);
    } finally {
      if (opened) opened.close();
    }
  });

  // Teacher
  router.get('/teacher/classrooms', handle(async (s, a) => ({ classrooms: await s.listClassrooms(a) })));
  router.get('/teacher/classrooms/:id/students', handle(async (s, a, req) => ({ students: await s.listClassroomStudents(a, req.params.id, req.query.courseId) })));
  router.get('/teacher/assessments', handle(async (s, a) => ({ assessments: await s.listOwnAssessments(a) })));
  router.post('/teacher/assessments', handle(async (s, a, req) => ({ assessment: await s.createAssessment(a, jsonBody(req)) }), 201));

  // Teacher, AI (Step 2). Registered before the "/:id" routes.
  router.get('/teacher/ai/status', handle((s, a) => {
    s.assertTeacher(a);
    return { ai: generator ? generator.status() : { available: false, reason: 'AI_NOT_CONFIGURED' } };
  }));
  // Advanced generation: the fixed educational intent templates + which question types can be saved (no LLM).
  router.get('/teacher/ai/templates', handle((s, a, req, t, adapter) => {
    s.assertTeacher(a);
    return { templates: publicTemplates(), questionTypes: QUESTION_TYPES, questionTypesAvailable: adapter.supportsQuestionTypes() ? QUESTION_TYPES : ['single_mcq'] };
  }));
  router.post('/teacher/assessments/from-review', handle(async (s, a, req) => ({ assessment: await s.createAssessmentWithQuestions(a, jsonBody(req)) }), 201));
  router.post('/teacher/assessments/generate', (req, res, next) => setImmediate(async () => {
    // 1) Session + authorization + request + class (tenant) checks, with a DB connection that
    //    is closed BEFORE the slow LLM call. 2) Generation, which has no database access at all.
    let request;
    let target;
    let actor;
    let opened;
    try {
      opened = await openAdapter();
      if (!opened.adapter.isReady()) throw new AssessmentError('NOT_READY', 'Assessments are not available yet.', { statusCode: 503 });
      actor = await opened.adapter.resolveActor(req.user);
      const service = new AssessmentService({ adapter: opened.adapter });
      service.assertTeacher(actor);
      request = validateGenerationRequest(jsonBody(req));
      service.assertQuestionTypeAvailable(request.questionType); // no LLM call for a type that could not be saved
      target = await service.resolveGenerationTarget(actor, request.classroomId);
    } catch (err) {
      return next(err);
    } finally {
      if (opened) opened.close();
    }
    if (!generator) return next(new AssessmentError('AI_NOT_CONFIGURED', 'AI generation is not available. You can still create tests manually.', { statusCode: 503 }));

    let release;
    try {
      release = throttle.acquire(`${actor.universityId}:${actor.userId}`);
      const result = await generator.generate(request, target);
      return res.json({
        proposal: {
          saved: false, // nothing is stored until the teacher saves via /teacher/assessments/from-review
          topic: request.topic,
          subject: request.subject,
          classroomId: request.classroomId,
          difficulty: request.difficulty,
          questionType: request.questionType,
          numericFormat: request.numericFormat,
          template: request.template,
          questions: result.questions,
        },
        generatedBy: result.provider,
      });
    } catch (err) {
      return next(err);
    } finally {
      if (release) release();
    }
  }));
  router.get('/teacher/assessments/:id', handle(async (s, a, req) => ({ assessment: await s.getOwnAssessment(a, req.params.id) })));
  router.patch('/teacher/assessments/:id', handle(async (s, a, req) => ({ assessment: await s.updateAssessment(a, req.params.id, jsonBody(req)) })));
  router.post('/teacher/assessments/:id/questions', handle(async (s, a, req) => ({ assessment: await s.addQuestion(a, req.params.id, jsonBody(req)) }), 201));
  router.put('/teacher/assessments/:id/questions/:questionId', handle(async (s, a, req) => ({ assessment: await s.updateQuestion(a, req.params.id, req.params.questionId, jsonBody(req)) })));
  router.delete('/teacher/assessments/:id/questions/:questionId', handle(async (s, a, req) => ({ assessment: await s.deleteQuestion(a, req.params.id, req.params.questionId) })));
  router.post('/teacher/assessments/:id/publish', handle(async (s, a, req) => ({ assessment: await s.publish(a, req.params.id, optionalBody(req)) }), 200,
    (out) => ({ name: 'assessment.published', data: { assessmentId: out.assessment.id } })));
  router.post('/teacher/assessments/:id/unpublish', handle(async (s, a, req) => (emptyBody(req), { assessment: await s.unpublish(a, req.params.id) })));

  // Teacher, results (Step 3)
  router.get('/teacher/assessments/:id/report', handle(async (s, a, req, t) => ({ report: await t.report(a, req.params.id) })));
  // Teacher, Student Performance Analyst: FACTS only (never calls the LLM; works when AI is unavailable).
  router.get('/teacher/students/:studentId/performance', handle(async (s, a, req, t, adapter) =>
    await new StudentPerformanceService({ adapter, now }).getPerformance(a, req.params.studentId)));
  // Teacher, AI Performance Report: report focus options (read-only; no LLM).
  router.get('/teacher/ai/report-focuses', handle((s, a) => {
    s.assertTeacher(a);
    return { focuses: publicFocuses(), defaultFocus: 'overall_progress' };
  }));
  // Teacher, AI Performance Report: the ONLY route that calls the LLM for reports, on an explicit request.
  // Optional body { focus?, instructions? } (validated + screened BEFORE anything else); the student data
  // itself always comes from the server, never from the client.
  router.post('/teacher/students/:studentId/performance/analysis', (req, res, next) => setImmediate(async () => {
    let collected;
    let actor;
    let opened;
    let reportRequest;
    try {
      reportRequest = validateReportRequest(req.body);
      opened = await openAdapter();
      if (!opened.adapter.isReady()) throw new AssessmentError('NOT_READY', 'Assessments are not available yet.', { statusCode: 503 });
      actor = await opened.adapter.resolveActor(req.user);
      collected = await new StudentPerformanceService({ adapter: opened.adapter, now }).collect(actor, req.params.studentId); // same access rules as the facts
    } catch (err) {
      return next(err);
    } finally {
      if (opened) opened.close(); // closed BEFORE the slow LLM call
    }
    if (collected.response.dataSufficiency.level === 'none') {
      return res.json({ analysis: { status: 'insufficient_data', message: 'There are no finished assessments yet, so there is nothing to analyse.' } });
    }
    if (!analyst) return next(new AssessmentError('AI_NOT_CONFIGURED', 'AI analysis is not available. The metrics above are unaffected.', { statusCode: 503 }));
    let release;
    try {
      release = analysisThrottle.acquire(`${actor.universityId}:${actor.userId}`);
      const analysis = await analyst.analyze(collected.response, collected.evidence, reportRequest);
      return res.json({ analysis: { ...analysis, reportId: await storeReport(actor, collected.response, analysis) } });
    } catch (err) {
      return next(err);
    } finally {
      if (release) release();
    }
  }));

  // Teacher, reset one student's finished attempt (Step 6): archived, student may start fresh. No body.
  router.post('/teacher/assessments/:id/students/:studentId/reset', handle(async (s, a, req, t) => (emptyBody(req), await t.resetAttempt(a, req.params.id, req.params.studentId))));
  // Shared AI Performance Reports (migration 008). No AI call on any of these routes.
  router.post('/teacher/performance-reports/:reportId/share', handle(async (s, a, req, t, adapter) =>
    (emptyBody(req), await new PerformanceReportService({ adapter, now }).share(a, req.params.reportId)), 200,
    (out) => (out.alreadyShared ? null : { name: 'report.shared', data: { reportId: out.report.id } }))); // first share only
  router.get('/student/performance-reports', handle(async (s, a, req, t, adapter) => ({ reports: await new PerformanceReportService({ adapter, now }).listForStudent(a) })));
  router.get('/student/performance-reports/:reportId', handle(async (s, a, req, t, adapter) => ({ report: await new PerformanceReportService({ adapter, now }).getForStudent(a, req.params.reportId) })));

  /**
   * Stores a generated report AFTER the AI call (new short-lived connection), so "Send to Student" can
   * share exactly what the teacher saw. Returns its id, or null (migration 008 missing / store failed):
   * the teacher still gets the report, it just cannot be sent.
   */
  async function storeReport(actor, response, analysis) {
    let opened;
    try {
      opened = await openAdapter();
      return await new PerformanceReportService({ adapter: opened.adapter, now }).saveGenerated(actor, response, analysis);
    } catch (err) {
      console.error('[ai-assessment-agent] report not stored:', err && err.code ? err.code : 'error');
      return null;
    } finally {
      if (opened) opened.close();
    }
  }

  // Teacher, close test now (Step 5): refuses new starts and finalizes open attempts. No body.
  router.post('/teacher/assessments/:id/close', handle(async (s, a, req, t) => {
    emptyBody(req);
    const closed = await t.closeAssessment(a, req.params.id);
    return { ...closed, assessment: await s.getOwnAssessment(a, req.params.id) };
  }));

  // Student
  router.get('/student/assessments', handle(async (s, a, req, t) => ({ assessments: await t.withAttemptStatus(a, await s.listAvailableForStudent(a)) })));
  router.get('/student/assessments/:id', handle(async (s, a, req) => ({ assessment: await s.getAvailableForStudent(a, req.params.id) })));

  // Student, attempts (Step 3). Only ids travel in URLs; bodies carry nothing but the chosen option.
  router.post('/student/assessments/:id/attempt', handle(async (s, a, req, t) => (emptyBody(req), await t.startAttempt(a, req.params.id)), (out) => (out.created ? 201 : 200)));
  router.get('/student/attempts/:attemptId', handle(async (s, a, req, t) => ({ attempt: await t.getAttempt(a, req.params.attemptId) })));
  router.put('/student/attempts/:attemptId/answers/:questionId', handle(async (s, a, req, t) => await t.saveAnswer(a, req.params.attemptId, req.params.questionId, jsonBody(req))));
  router.post('/student/attempts/:attemptId/submit', handle(async (s, a, req, t) => (emptyBody(req), await t.submit(a, req.params.attemptId)), 200,
    (out, req) => ({ name: 'attempt.submitted', data: { attemptId: Number(req.params.attemptId) } })));
  router.get('/student/attempts/:attemptId/result', handle(async (s, a, req, t) => ({ attempt: await t.getResult(a, req.params.attemptId) })));

  /**
   * Question pictures (migration 009), only when the host provides an `imageStore`.
   *   POST /teacher/question-images                              raw image body -> { image: { key } }; the key then goes in a question's `imageKey`
   *   GET  /teacher/question-images/:key                         the picture, for the teacher's editor / review
   *   GET  /student/assessments/:id/questions/:questionId/image  picture of a question of a test the student may see
   *   GET  /student/assignments/:id/questions/:position/image    picture of a question of an assignment the student may see
   * Students never receive keys: the server finds the key after checking that the student may see the question.
   */
  if (imageStore) {
    /** Opens the adapter, resolves the actor, runs one step, closes. */
    const withActor = async (req, fn) => {
      const opened = await openAdapter();
      try {
        if (!opened.adapter.isReady()) throw new AssessmentError('NOT_READY', 'Assessments are not available yet.', { statusCode: 503 });
        return await fn(await opened.adapter.resolveActor(req.user), opened.adapter);
      } finally {
        opened.close();
      }
    };
    const requireTeacherActor = async (req) => await withActor(req, (actor, adapter) => {
      new AssessmentService({ adapter, now }).assertTeacher(actor);
      if (!adapter.supportsQuestionImages()) {
        throw new AssessmentError('IMAGES_NOT_READY', 'Question pictures are not available yet (a database update is pending).', { statusCode: 503 });
      }
      return actor;
    });
    const sendImage = async (res, key) => {
      let bytes;
      try {
        bytes = await imageStore.read(key);
      } catch {
        throw new AssessmentError('IMAGE_NOT_FOUND', 'The picture is not available.', { statusCode: 404 });
      }
      res.set({
        'Content-Type': contentTypeOfKey(key),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=300',
      });
      res.send(bytes);
    };

    router.post('/teacher/question-images', express.raw({ type: IMAGE_CONTENT_TYPES, limit: MAX_IMAGE_BYTES }), (req, res, next) => setImmediate(async () => {
      try {
        await requireTeacherActor(req); // session + role before touching the bytes
        const image = validateImageUpload({ buffer: Buffer.isBuffer(req.body) ? req.body : undefined, contentType: req.get('content-type') });
        const { storageKey } = await imageStore.save(image.buffer, image.extension);
        res.status(201).json({ image: { key: storageKey } });
      } catch (err) { next(err); }
    }));
    router.get('/teacher/question-images/:key', (req, res, next) => setImmediate(async () => {
      try {
        await requireTeacherActor(req);
        if (!IMAGE_KEY.test(req.params.key)) throw new AssessmentError('IMAGE_NOT_FOUND', 'The picture is not available.', { statusCode: 404 });
        await sendImage(res, req.params.key);
      } catch (err) { next(err); }
    }));
    router.get('/student/assessments/:id/questions/:questionId/image', (req, res, next) => setImmediate(async () => {
      try {
        const key = await withActor(req, async (actor, adapter) => await new AssessmentService({ adapter, now }).questionImageForStudent(actor, req.params.id, req.params.questionId));
        await sendImage(res, key);
      } catch (err) { next(err); }
    }));
    router.get('/student/assignments/:id/questions/:position/image', (req, res, next) => setImmediate(async () => {
      try {
        const key = await withActor(req, async (actor, adapter) => await new AssignmentService({ adapter, now }).questionImageForStudent(actor, req.params.id, req.params.position));
        await sendImage(res, key);
      } catch (err) { next(err); }
    }));
  }

  // Descriptive Assignments (remove this block to remove the feature's routes).
  if (fileStore) registerAssignmentRoutes({ router, express, handle, openAdapter, fileStore, now, emptyBody, jsonBody, evaluator: assignmentEvaluator, evaluationThrottle, emit });

  // Unknown paths end here instead of falling through to the host's catch-all routes.
  router.use((req, res, next) => next(new AssessmentError('ROUTE_NOT_FOUND', 'Not found.', { statusCode: 404 })));
  router.use(assessmentErrorHandler);
  return router;
}

function jsonBody(req) {
  const b = req.body;
  if (b === null || typeof b !== 'object' || Array.isArray(b)) {
    throw new AssessmentError('INVALID_REQUEST', 'Request body must be a JSON object.');
  }
  return b;
}

/** No body, {} or a JSON object (validated by the service). */
function optionalBody(req) {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new AssessmentError('INVALID_REQUEST', 'Request body must be a JSON object.');
  return b;
}

function emptyBody(req) {
  const b = req.body;
  if (b !== undefined && b !== null && !(typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length === 0)) {
    throw new AssessmentError('INVALID_REQUEST', 'This action takes no request body.');
  }
}

/** Safe, structured errors only: fixed messages and codes, never SQL or stack traces. */
function assessmentErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  if (err instanceof AssessmentError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.', details: [] } });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large.', details: [] } });
  }
  console.error('[ai-assessment-agent] unexpected error:', err && err.message);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', details: [] } });
}

module.exports = { createAssessmentRouter, assessmentErrorHandler };
