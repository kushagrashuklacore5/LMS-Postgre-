const path = require('path');
const { createAssessmentRouter, assessmentErrorHandler } = require('../http/createAssessmentRouter');
const { openPostgresAssessmentLmsAdapter } = require('../adapters/lms/PostgresAssessmentLmsAdapter');
const { loadGenerationConfig } = require('../llm/generationConfig');
const { createGenerationProvider } = require('../llm/createGenerationProvider');
const { AssessmentGenerator } = require('../core/ai/AssessmentGenerator');
const { PerformanceAnalyst } = require('../core/ai/PerformanceAnalyst');
const { isReportPreviewEnabled } = require('../core/ai/reportPreview'); // TEMPORARY preview mode (remove later)
const { LocalSubmissionFileStore, defaultSubmissionsDir, defaultQuestionImagesDir } = require('../assignments/LocalSubmissionFileStore');
const { IMAGE_EXTENSIONS, IMAGE_KEY, contentTypeOfKey } = require('../core/questionImage');
const { AssignmentEvaluator } = require('../assignments/AssignmentEvaluator');

/**
 * Wiring for THIS LMS: the HTTP layer + the PostgreSQL LMS adapter + (Step 2) the
 * AI generator.
 *
 * `database` is the LMS database interface (see openPostgresAssessmentLmsAdapter):
 * { get, all, run, transaction } with ? placeholders. `schema` (tests only) fixes which
 * migrations the adapter sees (see openPostgresAssessmentLmsAdapter).
 *
 * The LMS mounts it behind its existing session checks:
 *   app.use('/api/assessment-agent', requireAuth, requireTenant, router, errorHandler)
 * (requireAuth verifies the JWT and sets req.user; requireTenant checks the school exists.)
 * Inside, every request re-checks the user against the LMS database
 * (role from the DB, same school) before any assessment rule runs.
 *
 * AI configuration comes from the LMS environment (server/.env): the shared
 * SOA_LLM_PROVIDER / SOA_LLM_MODEL / SOA_GEMINI_API_KEY, plus the optional
 * AIA_AI_GENERATION_ENABLED / AIA_LLM_TIMEOUT_MS. When AI is missing or off,
 * only the AI routes answer 503. Manual test creation is unaffected.
 * `generationProvider` lets tests inject a mock (no real LLM calls in tests).
 * `onEvent` (optional) is passed to the router: the LMS uses it to create notifications.
 */
/**
 * Descriptive Assignments: uploaded PDFs go to `submissionsDir` (tests), else AIA_SUBMISSIONS_DIR (absolute),
 * else <module>/data/submissions (git-ignored). A relative/invalid env value is ignored with a warning,
 * so a bad setting can never stop the LMS from starting.
 */
function submissionsDirFrom(submissionsDir, env) {
  if (submissionsDir) return submissionsDir;
  const configured = env.AIA_SUBMISSIONS_DIR;
  if (configured && path.isAbsolute(configured)) return configured;
  if (configured) console.warn('[ai-assessment-agent] AIA_SUBMISSIONS_DIR must be an absolute path; using the default submission directory.');
  return defaultSubmissionsDir();
}

/**
 * Private store for question pictures: AIA_QUESTION_IMAGES_DIR (absolute), else
 * <module>/data/question-images (git-ignored). The LMS also reads it to show the picture of a
 * legacy course-assessment question, after its own access check.
 */
function createQuestionImageStore({ env = process.env, questionImagesDir } = {}) {
  const configured = env.AIA_QUESTION_IMAGES_DIR;
  const rootDir = questionImagesDir || (configured && path.isAbsolute(configured) ? configured : defaultQuestionImagesDir());
  return new LocalSubmissionFileStore({ rootDir, extensions: IMAGE_EXTENSIONS });
}

function createLmsAssessmentAgentRouter({ express, database, schema = null, env = process.env, generationProvider, now, submissionsDir, onEvent = null, questionImagesDir, imageStore }) {
  if (!database || ['get', 'all', 'run', 'transaction'].some((m) => typeof database[m] !== 'function')) {
    throw new TypeError('createLmsAssessmentAgentRouter requires the LMS database interface { get, all, run, transaction }.');
  }
  const config = loadGenerationConfig(env);
  const provider = generationProvider || createGenerationProvider(config);
  const generator = new AssessmentGenerator({ provider, timeoutMs: config.timeoutMs, enabled: config.enabled });
  // `now` (server clock for attempt deadlines) is only overridden by tests.
  // Student Performance Analyst: reuses the SAME generator/provider (no second provider or key).
  // TEMPORARY: AIA_REPORT_PREVIEW_MODE=true shows not-validated Performance Reports (default off). Remove later.
  const analyst = new PerformanceAnalyst({ generator, previewMode: isReportPreviewEnabled(env) });
  const fileStore = new LocalSubmissionFileStore({ rootDir: submissionsDirFrom(submissionsDir, env) });
  // Descriptive Assignments (Prompt 2): AI-assisted evaluation reuses the SAME generator/provider (explicit request only).
  const assignmentEvaluator = new AssignmentEvaluator({ generator });
  return createAssessmentRouter({ express, openAdapter: openPostgresAssessmentLmsAdapter(database, schema), generator, analyst, fileStore, assignmentEvaluator, onEvent,
    imageStore: imageStore || createQuestionImageStore({ env, questionImagesDir }), ...(now ? { now } : {}) });
}

module.exports = { createLmsAssessmentAgentRouter, assessmentErrorHandler, createQuestionImageStore, IMAGE_KEY, contentTypeOfKey };
