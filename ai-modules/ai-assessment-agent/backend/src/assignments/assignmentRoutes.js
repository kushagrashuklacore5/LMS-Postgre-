const { AssessmentError } = require('../core/errors');
const { AssignmentService } = require('./AssignmentService');
const { validatePdfUpload, MAX_PDF_BYTES } = require('./pdfValidation');
const { extractPdfText } = require('./pdfText');

/**
 * Descriptive Assignments - HTTP routes, registered on the assessment agent's router (same host
 * authentication, same per-request adapter + actor resolution, same error format). NO AI.
 *
 * Teacher:  GET    /teacher/assignments
 *           POST   /teacher/assignments                                   { title, instructions?, classroomId, maxMarks, dueAt? }
 *           GET    /teacher/assignments/:id
 *           PATCH  /teacher/assignments/:id                               draft only
 *           PUT    /teacher/assignments/:id/questions                     { questions: [{ text, maxMarks }] } draft only (order = array order)
 *           POST   /teacher/assignments/:id/publish                       no body
 *           POST   /teacher/assignments/:id/close                         no body
 *           GET    /teacher/assignments/:id/submissions                   roster: submitted / not submitted / evaluated / missed
 *           GET    /teacher/assignments/:id/submissions/:submissionId/file   the PDF (attachment)
 *           PUT    /teacher/assignments/:id/submissions/:submissionId/evaluation  { finalMarks?, questionMarks?, teacherFeedback? } (FINAL marks)
 *           POST   /teacher/assignments/:id/submissions/:submissionId/evaluate-ai no body; AI SUGGESTION only (Prompt 2)
 * Student:  GET    /student/assignments
 *           GET    /student/assignments/:id
 *           PUT    /student/assignments/:id/submission?filename=<name>.pdf   raw body, Content-Type: application/pdf (<= 10 MB)
 *           GET    /student/assignments/:id/submission/file               own PDF (attachment)
 *
 * Upload order: validate bytes (no DB) -> rule check (DB) -> store file (no DB connection held)
 * -> record in a transaction (rules re-checked) -> delete the replaced file. A failed record deletes
 * the newly stored file. Nothing logs file contents or student names.
 */
function registerAssignmentRoutes({ router, express, handle, openAdapter, fileStore, now, emptyBody, jsonBody, evaluator = null, evaluationThrottle = null, log = (m) => console.warn(m), emit = () => {} }) {
  const svc = (adapter) => new AssignmentService({ adapter, now });

  /** Opens the adapter, resolves the actor, runs one step, closes (for the file routes). */
  const step = async (req, fn) => {
    const opened = await openAdapter();
    try {
      if (!opened.adapter.isReady()) throw new AssessmentError('NOT_READY', 'Assessments are not available yet.', { statusCode: 503 });
      return await fn(svc(opened.adapter), await opened.adapter.resolveActor(req.user));
    } finally {
      opened.close();
    }
  };

  const sendPdf = async (res, { storageKey, originalFilename }) => {
    let bytes;
    try {
      bytes = await fileStore.read(storageKey);
    } catch {
      log(`[ai-assessment-agent] submission file missing: ${storageKey}`);
      throw new AssessmentError('FILE_NOT_FOUND', 'The submitted file is not available.', { statusCode: 404 });
    }
    const ascii = originalFilename.replace(/[^A-Za-z0-9._ ()-]/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(originalFilename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    res.send(bytes);
  };

  // Teacher
  router.get('/teacher/assignments', handle(async (s, a, req, t, adapter) => ({ assignments: await svc(adapter).listOwn(a) })));
  router.post('/teacher/assignments', handle(async (s, a, req, t, adapter) => ({ assignment: await svc(adapter).create(a, jsonBody(req)) }), 201));
  router.get('/teacher/assignments/:id', handle(async (s, a, req, t, adapter) => ({ assignment: await svc(adapter).getOwn(a, req.params.id) })));
  router.patch('/teacher/assignments/:id', handle(async (s, a, req, t, adapter) => ({ assignment: await svc(adapter).update(a, req.params.id, jsonBody(req)) })));
  router.put('/teacher/assignments/:id/questions', handle(async (s, a, req, t, adapter) => ({ assignment: await svc(adapter).replaceQuestions(a, req.params.id, jsonBody(req)) })));
  router.post('/teacher/assignments/:id/publish', handle(async (s, a, req, t, adapter) => (emptyBody(req), { assignment: await svc(adapter).publish(a, req.params.id) }), 200,
    (out) => ({ name: 'assignment.published', data: { assignmentId: out.assignment.id } })));
  router.post('/teacher/assignments/:id/close', handle(async (s, a, req, t, adapter) => (emptyBody(req), { assignment: await svc(adapter).close(a, req.params.id) })));
  router.get('/teacher/assignments/:id/submissions', handle(async (s, a, req, t, adapter) => await svc(adapter).submissions(a, req.params.id)));
  router.put('/teacher/assignments/:id/submissions/:submissionId/evaluation',
    handle(async (s, a, req, t, adapter) => await svc(adapter).evaluate(a, req.params.id, req.params.submissionId, jsonBody(req)), 200,
      (out, req) => ({ name: 'assignment.evaluated', data: { assignmentId: Number(req.params.id), submissionId: Number(req.params.submissionId) } })));
  /**
   * Prompt 2 - AI-ASSISTED evaluation, ONLY on this explicit request (never on page loads).
   * authorization + submission lookup (DB, closed) -> AI available? -> throttle (1 in flight per teacher: a
   * double-click gets 429) -> read the stored PDF -> re-validate + extract text (limits) -> provider (no DB
   * connection held) -> strict validation -> store in ai_* ONLY (final marks untouched) -> response.
   */
  router.post('/teacher/assignments/:id/submissions/:submissionId/evaluate-ai', (req, res, next) => setImmediate(async () => {
    let release;
    try {
      emptyBody(req);
      const { actor, prepared } = await step(req, async (service, a) => ({ actor: a, prepared: await service.aiEvaluationContext(a, req.params.id, req.params.submissionId) }));
      if (!evaluator) throw new AssessmentError('AI_NOT_CONFIGURED', 'AI evaluation is not available. You can still mark submissions manually.', { statusCode: 503 });
      evaluator.assertAvailable();
      release = evaluationThrottle.acquire(`${actor.universityId}:${actor.userId}`);
      let bytes;
      try {
        bytes = await fileStore.read(prepared.storageKey);
      } catch {
        log(`[ai-assessment-agent] submission file missing: ${prepared.storageKey}`);
        throw new AssessmentError('FILE_NOT_FOUND', 'The submitted file is not available.', { statusCode: 404 });
      }
      const { text } = await extractPdfText(bytes);
      const evaluation = await evaluator.evaluate(prepared.context, text);
      const { submission } = await step(req, async (service, a) => await service.storeAiEvaluation(a, req.params.id, req.params.submissionId, prepared.storageKey, evaluation));
      res.json({ evaluation: submission.aiEvaluation, submission });
    } catch (err) {
      next(err);
    } finally {
      if (release) release();
    }
  }));
  router.get('/teacher/assignments/:id/submissions/:submissionId/file', (req, res, next) => setImmediate(async () => {
    try {
      await sendPdf(res, await step(req, async (service, actor) => await service.submissionFileFor(actor, req.params.id, req.params.submissionId)));
    } catch (err) { next(err); }
  }));

  // Student
  router.get('/student/assignments', handle(async (s, a, req, t, adapter) => ({ assignments: await svc(adapter).listForStudent(a) })));
  router.get('/student/assignments/:id', handle(async (s, a, req, t, adapter) => ({ assignment: await svc(adapter).getForStudent(a, req.params.id) })));
  router.get('/student/assignments/:id/submission/file', (req, res, next) => setImmediate(async () => {
    try {
      await sendPdf(res, await step(req, async (service, actor) => await service.ownSubmissionFile(actor, req.params.id)));
    } catch (err) { next(err); }
  }));
  router.put('/student/assignments/:id/submission', express.raw({ type: 'application/pdf', limit: MAX_PDF_BYTES }), (req, res, next) => setImmediate(async () => {
    let stored = null;
    try {
      // 1) Session + role + visibility + state, before touching the body or the disk.
      await step(req, async (service, actor) => await service.assertCanSubmit(actor, req.params.id));
      // 2) The bytes themselves (type, signature, trailer, size, active content, display name).
      const file = validatePdfUpload({
        buffer: Buffer.isBuffer(req.body) ? req.body : undefined,
        contentType: req.get('content-type'),
        filename: typeof req.query.filename === 'string' ? req.query.filename : undefined,
      });
      // 3) Store under a server-generated key (no DB connection held while writing).
      stored = await fileStore.save(file.buffer);
      // 4) Record, re-checking every rule in a transaction.
      let submitter;
      const result = await step(req, async (service, actor) => { submitter = actor; return await service.recordSubmission(actor, req.params.id, { ...file, ...stored }); });
      stored = null; // now owned by the database row
      if (result.replacedStorageKey) {
        await fileStore.delete(result.replacedStorageKey).catch(() => log(`[ai-assessment-agent] could not delete replaced file: ${result.replacedStorageKey}`));
      }
      res.status(result.created ? 201 : 200).json({ submission: result.submission, replaced: !result.created });
      emit('assignment.submitted', submitter, { assignmentId: Number(req.params.id) });
    } catch (err) {
      if (stored) await fileStore.delete(stored.storageKey).catch(() => {});
      next(err);
    }
  }));
}

module.exports = { registerAssignmentRoutes };
