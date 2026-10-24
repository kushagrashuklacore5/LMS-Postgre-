/**
 * ONE controlled browser E2E run of the full MVP lifecycle (Steps 1-4), with SYNTHETIC data only:
 * teacher login -> sidebar "AI Assessments" -> Generate with AI -> review/edit -> save draft -> publish
 * -> student login -> sidebar "My Tests" -> start -> answer -> refresh -> submit -> result -> teacher report
 * -> "View performance" (Student Performance Analyst) -> AI analysis (mock) incl. a rejected output + Try again
 * -> advanced generation: template + instructions in the generation request; a manual test with a
 *    multiple-select and a numerical question, answered and graded; LLM-call counts on the performance page
 *    (open / refresh / navigate away and back = 0 calls, Generate = 1, double-click = 1, Regenerate = +1)
 * -> Descriptive Assignments: teacher creates a draft with 3 questions and publishes; student uploads a
 *    synthetic PDF; teacher sees the submitted student AND a not-submitted classmate. ZERO AI calls.
 * -> Prompt 2: teacher clicks "Evaluate with AI" (double-click = ONE request; the fake provider FAILS the run
 *    if an evaluation request arrives before that click), reviews the suggestion, changes a mark, saves final
 *    marks; the student sees only the teacher-approved marks, never the AI suggestion.
 * Manual (not part of `npm test`): needs Chrome and the LMS client's Vite.
 *
 *   node tests/e2e/browserE2E.js [--keep-open]
 *
 * What is real: the LMS login route (server/routes/auth-routes -> auth-controller, bcrypt, JWT),
 * the LMS authMiddleware + requireTenant, this module's router, and the LMS React client
 * (Vite dev server) driven through its UI in headless Chrome (DevTools protocol, no extra deps).
 * What is NOT real: the database. It is a throw-away PostgreSQL database (LMS_TEST_DATABASE_ADMIN_URL) with the
 * LMS schema (server/database/postgres/migrations) and synthetic users; it is dropped at the end. The school
 * database is never opened.
 * No Gemini call is made: "Generate with AI" uses a MOCK provider (tests/helpers/mockProvider) that returns
 * a fixed synthetic proposal. Everything after the provider (parsing, validation, guard, review UI, save)
 * is the real code.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { createLmsTestDb } = require('../helpers/lmsTestDb');

const MODULE = path.resolve(__dirname, '../..');
const ROOT = path.resolve(MODULE, '../..');
const SERVER = path.join(ROOT, 'server');
const CLIENT = path.join(ROOT, 'client');
const LIVE_DB = path.join(SERVER, 'data', 'lms_permanent.db');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const VITE_PORT = 5191;
const ORIGIN = `http://127.0.0.1:${VITE_PORT}`;
const OUT = process.env.AIA_E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'aia-e2e-shots-'));
const TEACHER = { email: 'e2e.teacher@synthetic.test', password: 'E2e-Teacher-Pass-1', name: 'E2E Teacher' };
const STUDENT = { email: 'e2e.student@synthetic.test', password: 'E2e-Student-Pass-1', name: 'E2E Student' };
const TEST_TITLE = `E2E Synthetic Quiz ${Date.now()}`;
const TYPES_TITLE = `E2E Synthetic Types ${Date.now()}`;
const ASSIGNMENT_TITLE = `E2E Synthetic Essay ${Date.now()}`;
const CLASSMATE = 'E2E Classmate (no submission)';
const MOCK_QUESTIONS = [
  ['Which device forwards data packets between different networks?', ['Switch', 'Router', 'Hub', 'Repeater'], 1, 'A router connects networks and forwards packets between them.'],
  ['What does LAN stand for?', ['Large Area Network', 'Long Access Node', 'Local Area Network', 'Linked Application Network'], 2, 'LAN means Local Area Network.'],
  ['Which protocol translates domain names into IP addresses?', ['DNS', 'FTP', 'SMTP', 'HTTP'], 0, 'DNS resolves names such as example.org to IP addresses.'],
];

const log = (...a) => console.log('[e2e]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanups = [];
let failureHook = null;

async function main() {
  if (!CHROME) throw new Error('Chrome/Edge not found.');
  const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB).mtimeMs : null;

  // ---------- synthetic database ----------
  process.env.JWT_SECRET = 'aia-e2e-only-secret-' + 'q'.repeat(40);
  const tmp = await createLmsTestDb(); // LMS schema + synthetic seed in a throw-away PostgreSQL database
  cleanups.push(() => tmp.close());
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aia-e2e-uploads-')); // submitted PDFs (temp only)
  cleanups.push(() => fs.rmSync(uploadRoot, { recursive: true, force: true }));
  const essayPdf = path.join(uploadRoot, 'E2E synthetic essay.pdf');
  fs.writeFileSync(essayPdf, require('../helpers/syntheticPdf').syntheticPdf(`Name: ${STUDENT.name} (${STUDENT.email})\nQ1: Plants use light energy to make glucose from carbon dioxide and water.\nQ2: Leaves look green because chlorophyll reflects green light.\nQ3: Light intensity limits the rate of photosynthesis.`));
  const bcrypt = require(path.join(SERVER, 'node_modules', 'bcryptjs'));
  {
    const set = 'UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?';
    await tmp.run(set, [TEACHER.name, TEACHER.email, bcrypt.hashSync(TEACHER.password, 10), 1]); // mentor, school 1
    await tmp.run(set, [STUDENT.name, STUDENT.email, bcrypt.hashSync(STUDENT.password, 10), 4]); // student, school 1, class 10
    // A synthetic classmate who never submits the assignment (shows as "Not submitted" to the teacher).
    await tmp.run("INSERT INTO users (id, name, email, password, role, university_id) VALUES (60, ?, 'e2e.classmate@synthetic.test', 'x', 'student', 1)", [CLASSMATE]);
    await tmp.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (60, 10)');
  }
  log('synthetic DB: throw-away PostgreSQL database', new URL(tmp.url).pathname.slice(1));

  // ---------- backend: real LMS auth + this module, pointed at the temp DB ----------
  const lmsDb = tmp.hostDatabase(); // closed by tmp.close()
  for (const mod of ['config/database-switch.js']) {
    const file = path.join(SERVER, mod);
    require.cache[file] = { id: file, filename: file, loaded: true, exports: lmsDb };
  }
  const express = require(path.join(SERVER, 'node_modules', 'express'));
  const cors = require(path.join(SERVER, 'node_modules', 'cors'));
  const requireAuth = require(path.join(SERVER, 'middleware', 'authMiddleware'));
  const requireTenant = require(path.join(SERVER, 'middleware', 'requireTenant'));
  const { createLmsAssessmentAgentRouter, assessmentErrorHandler } = require(path.join(MODULE, 'backend/src/integration/lmsAssessmentAgent'));
  const app = express();
  app.use(cors({ origin: ORIGIN, credentials: true }));
  app.use(express.json());
  app.use('/api/auth', require(path.join(SERVER, 'routes', 'auth-routes')));
  // Mock LLM (no network): a fixed, synthetic, well-formed proposal in the model's JSON format.
  // Correct options are at positions 1, 2, 0 (the student will get Q1 right, Q2 wrong, skip Q3).
  const { MockProvider } = require('../helpers/mockProvider');
  const GENERATED = JSON.stringify({ questions: MOCK_QUESTIONS.map(([question, options, c, explanation]) => ({
    question, options, correctAnswer: options[c], explanation, difficulty: 'easy',
  })) });
  // Performance Analyst requests (identified by their prompt) get a synthetic analysis; `analysisReply`
  // can be switched to an output the validator must reject (banned personality claim).
  // Professional report format (tests/helpers/reportFixture); the focus area cites question sample A1-Q2
  // (the student answered Q2 wrong), which the page links to history row A1.
  const { reportFor } = require('../helpers/reportFixture');
  const report = reportFor({ labels: ['A1'], subject: 'Computer Science', difficulty: 'easy', limited: true, focusArea: 'Networking terminology' });
  report.focusAreas[0].evidence = ['A1-Q2', 'difficulty:easy'];
  const ANALYSIS = JSON.stringify(report);
  let analysisReply = ANALYSIS;
  // Prompt 2: assignment evaluation replies; any evaluation request before the explicit click is a violation.
  const EVALUATION = JSON.stringify({
    questions: [
      { questionId: 'Q1', marksAwarded: 3, maxMarks: 4, feedback: 'Describes the inputs and glucose; the role of light energy is only implied.' },
      { questionId: 'Q2', marksAwarded: 2, maxMarks: 3, feedback: 'Correctly links the green colour to chlorophyll without explaining absorption.' },
      { questionId: 'Q3', marksAwarded: 2, maxMarks: 3, feedback: 'Names a valid limiting factor; its effect is not explained.' },
    ],
    totalMarksAwarded: 7, totalMarks: 10,
    overallFeedback: 'SYNTHETIC-AI-OVERALL: relevant answers that need fuller explanations.',
    limitations: ['Answers are short, so depth of understanding is hard to judge.'],
  });
  const isEvaluation = (req) => String(req.prompt).startsWith('Assignment evaluation data');
  let evaluateClicked = false;
  let evaluationReply = EVALUATION;
  const earlyEvaluationCalls = [];
  const mockLlm = new MockProvider((req) => {
    if (isEvaluation(req)) {
      if (!evaluateClicked) { earlyEvaluationCalls.push(Date.now()); throw new Error('EVALUATION REQUESTED BEFORE THE EXPLICIT CLICK'); }
      return evaluationReply;
    }
    return String(req.prompt).startsWith('Student assessment evidence') ? analysisReply : GENERATED;
  });
  app.use('/api/assessment-agent', requireAuth, requireTenant,
    createLmsAssessmentAgentRouter({ express, database: tmp.sql, schema: tmp.schema, env: {}, generationProvider: mockLlm, submissionsDir: path.join(uploadRoot, 'submissions') }), assessmentErrorHandler);
  const unrelated = new Set();
  app.use('/api', (req, res) => { unrelated.add(`${req.method} ${req.path}`); res.status(404).json({ message: 'not part of the E2E backend' }); });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  cleanups.push(() => server.close());
  const API = `http://127.0.0.1:${server.address().port}/api`;
  log('backend:', API);

  // ---------- client: the real LMS React app via Vite ----------
  // Vite's output goes to a file: an unread pipe fills up and blocks Vite (it logs many warnings).
  const viteLog = fs.openSync(path.join(OUT, 'vite.log'), 'w');
  const vite = spawn(process.execPath, [path.join(CLIENT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(VITE_PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: CLIENT, env: { ...process.env, VITE_BACKEND_URL: API }, stdio: ['ignore', viteLog, viteLog],
  });
  cleanups.push(() => killTree(vite));
  await waitForHttp(`${ORIGIN}/`, 90000);
  log('client:', ORIGIN);

  // ---------- headless Chrome over the DevTools protocol ----------
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aia-e2e-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1366,900', 'about:blank'], { stdio: 'ignore' });
  cleanups.push(() => { killTree(chrome); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500); });
  const portFile = path.join(profile, 'DevToolsActivePort');
  await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n')[0], 20000, 'Chrome DevTools port');
  const devPort = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json();
  const page = await cdp(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });
  const consoleErrors = [];
  page.on('Runtime.exceptionThrown', (p) => consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] || 'exception'));
  // A native alert/confirm would block every evaluation; accept and record it.
  const dialogs = [];
  page.on('Page.javascriptDialogOpening', (p) => { dialogs.push(`${p.type}: ${p.message}`); page.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  // On failure: screenshot + where we were, to diagnose instead of guessing.
  failureHook = async () => {
    try {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, 'failure.png'), Buffer.from(data, 'base64'));
      console.error('[e2e] at URL:', await page.eval('location.href'));
      console.error('[e2e] page text:', String(await page.eval('document.body ? document.body.innerText.slice(0, 400) : ""')).replace(/\s+/g, ' '));
      console.error('[e2e] page exceptions:', consoleErrors.slice(0, 5));
      console.error('[e2e] failure screenshot:', path.join(OUT, 'failure.png'));
    } catch (e) { console.error('[e2e] could not capture failure state:', e.message); }
  };

  const results = {};
  const shot = async (name) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };
  const go = async (url) => { await page.send('Page.navigate', { url: ORIGIN + url }); await sleep(1500); };
  const js = (expr) => page.eval(expr);
  const until = (expr, what, ms = 20000) => waitFor(() => js(expr), ms, what);
  // A user waits until the target is visible and uncovered (e.g. toasts fade), then clicks it.
  const userSet = async (el, value) => { await until('__e2e.canReach(' + el + ')', 'reachable: ' + el.slice(0, 60), 15000); await js('__e2e.set(' + el + ', ' + value + ')'); };
  const userClick = async (expr) => { await until('__e2e.canReach(' + expr + ')', 'reachable: ' + expr.slice(0, 60), 15000); await js('__e2e.click(' + expr + ')'); };

  async function login(user) {
    await go('/login');
    await js('localStorage.clear(), true');
    await go('/login');
    // The sign-in form is the form whose password field a user can reach: /login opens the "Quick Login"
    // dialog over the home page, which has a second (covered) sign-in form. Inputs have no name attributes and
    // translated placeholders, so neither is used; the first text/email input is the email/username.
    const form = `[...document.forms].find((f) => { const p = f.querySelector('input[type=password]'); return p && __e2e.canReach(p); })`;
    await until(`!!${form}`, 'login form', 120000); // first Vite compile is slow
    await userSet(`${form}.querySelector('input[type=text], input[type=email]')`, `${JSON.stringify(user.email)}`);
    await userSet(`${form}.querySelector('input[type=password]')`, `${JSON.stringify(user.password)}`);
    await userClick(`${form}.querySelector('button[type=submit]')`);
    await until(`!!localStorage.getItem('token')`, `${user.name} logged in`);
    // The LMS shows its Terms & Conditions modal after every fresh login: accept it like a user would.
    await until(`!!__e2e.button('Accept & Continue to Dashboard', true, true)`, 'LMS terms modal', 30000);
    await userClick(`[...document.querySelectorAll('input[type=checkbox]')].find((c) => (c.closest('label') || c.parentElement).innerText.includes('I acknowledge'))`);
    await until(`!!__e2e.button('Accept & Continue to Dashboard', true)`, 'terms acknowledged');
    await userClick(`__e2e.button('Accept & Continue to Dashboard', true)`);
    await until(`!__e2e.button('Accept & Continue to Dashboard', true, true)`, 'terms modal closed');
    log('logged in via the LMS login form (terms accepted):', user.name);
  }

  // 1) Teacher: sidebar -> AI Assessments -> Generate with AI -> review/edit -> save draft -> publish
  // Sidebar links exist in both the desktop and mobile sidebars; use the one a user can actually reach.
  const sidebarLink = (href) => `[...document.querySelectorAll('a[href="${href}"]')].find((a) => __e2e.canReach(a))`;
  const dbRows = (sql, ...p) => tmp.all(sql, p);
  await login(TEACHER);
  await userClick(sidebarLink('/teacher/assessments'));
  await until(`location.pathname === '/teacher/assessments' && !!__e2e.button('Generate with AI', true)`, 'AI Assessments page via sidebar');
  const teacherViaSidebar = await js(`location.pathname === '/teacher/assessments'`);
  await userClick(`__e2e.button('Generate with AI', true)`);
  await until(`!!document.querySelector('input[placeholder^="Topic"]')`, 'generation form');
  await userSet(`document.querySelector('input[placeholder^="Topic"]')`, `'Basic Computer Networks'`);
  await userSet(`document.querySelector('input[placeholder=Subject]')`, `'Computer Science'`);
  await userSet(`document.querySelectorAll('select')[0]`, `'10'`); // class 10 (Grade 10 - A)
  await userSet(`document.querySelector('input[type=number][max="20"]')`, `'3'`);
  await until(`!!document.querySelector('[data-template=concept_mastery]')`, 'template picker');
  await userClick(`document.querySelector('[data-template=concept_mastery]')`);
  await until(`document.querySelector('[data-testid=aia-gen-template-description]').innerText.includes('Concept Mastery')`, 'template description shown');
  await userSet(`document.querySelector('[data-testid=aia-gen-instructions]')`, `'Focus on real-world home network examples.'`);
  // Same-tick double-click on Generate: the synchronous lock sends ONE request (no 429 error box).
  await until(`__e2e.canReach(__e2e.button('Generate Questions', true))`, 'generate button');
  await js(`(() => { const b = __e2e.button('Generate Questions', true); b.click(); b.click(); return true; })()`);
  await until(`document.body.innerText.includes('Review questions (3)')`, 'AI proposal shown for review');
  const generateDoubleClickClean = await js(`!document.querySelector('[data-testid=aia-ai-error]')`);
  const notSavedBeforeReview = (await dbRows('SELECT COUNT(*) AS n FROM aia_assessments'))[0].n === 0;
  const genData = JSON.parse(mockLlm.calls[0].prompt.slice(mockLlm.calls[0].prompt.indexOf('{')));
  const templateAndInstructionsSent = genData.educationalIntent?.name === 'Concept Mastery' && genData.teacherInstructions === 'Focus on real-world home network examples.'
    && genData.questionType === 'single-answer MCQ' && !mockLlm.calls[0].systemInstruction.includes('home network');
  results.aiReview = await shot('1-teacher-ai-review');
  // Teacher edits the proposal before saving (explanation of Q1), then saves it as a draft.
  await userSet(`document.querySelector('textarea[placeholder^="Explanation"]')`, `'Edited by the teacher: a router forwards packets between networks.'`);
  await userSet(`document.querySelector('input[placeholder=Title]')`, `${JSON.stringify(TEST_TITLE)}`);
  await userSet(`document.querySelector('input[placeholder^="Duration"]')`, `'10'`);
  await userClick(`__e2e.button('Save as draft', true)`);
  await until(`!!document.querySelector('[data-testid=aia-publish]') && document.body.innerText.includes('Questions (3)')`, 'draft saved from review');
  const draft = (await dbRows('SELECT a.status, (SELECT explanation FROM aia_questions q WHERE q.assessment_id = a.id ORDER BY position LIMIT 1) AS e1 FROM aia_assessments a WHERE a.title = ?', TEST_TITLE))[0];
  const savedAsDraftWithEdit = !!draft && draft.status === 'draft' && draft.e1.startsWith('Edited by the teacher');
  await userClick(`document.querySelector('[data-testid=aia-publish]')`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 2`, 'Assign to popup (class students)');
  const publishDefaultAll = await js(`__e2e.assignState() === ${JSON.stringify(`${CLASSMATE}:1|E2E Student:1`)} && __e2e.assignCount().includes('2 students (whole class)')`);
  results.assignPopup = await shot('2a-assign-to-popup');
  await userClick(`document.querySelector('[data-testid=aia-assign-confirm]')`);
  await until(`!!document.querySelector('[data-testid=aia-toggle-report]')`, 'published');
  const publishedWholeClass = (await dbRows('SELECT COUNT(*) AS n FROM aia_assessment_recipients r JOIN aia_assessments a ON a.id = r.assessment_id WHERE a.title = ?', TEST_TITLE))[0].n === 0;
  results.teacherPublished = await shot('2-teacher-published');
  log('teacher generated (mock LLM), reviewed, edited, saved and published:', TEST_TITLE);

  // 2) Student: see the test, start, answer (1 correct, 1 wrong, 1 skipped), refresh, submit
  await login(STUDENT);
  await userClick(sidebarLink('/student/assessment-agent/tests'));
  await until(`location.pathname === '/student/assessment-agent/tests'`, 'My Tests via sidebar');
  const studentViaSidebar = await js(`location.pathname === '/student/assessment-agent/tests'`);
  await until(`[...document.querySelectorAll('[data-testid=aia-test-row]')].some(r => r.dataset.title === ${JSON.stringify(TEST_TITLE)})`, 'student test list');
  results.studentList = await shot('3-student-list');
  await userClick(`[...document.querySelectorAll('[data-testid=aia-test-row]')].find(r => r.dataset.title === ${JSON.stringify(TEST_TITLE)}).querySelector('[data-testid=aia-open-test]')`);
  await until(`document.querySelectorAll('[data-testid=aia-question]').length === 3`, 'attempt page');
  const noAnswerLeak = await js(`!document.body.innerText.includes('correct answer')`);
  await userClick(`document.querySelector('[data-testid=aia-option-1-1]')`); // Router: correct
  await until(`document.body.innerText.includes('1 of 3 answered') && !document.body.innerText.includes('Saving...')`, 'answer 1 saved');
  await userClick(`document.querySelector('[data-testid=aia-option-2-0]')`); // Large Area Network: wrong
  await until(`document.body.innerText.includes('2 of 3 answered') && !document.body.innerText.includes('Saving...')`, 'answer 2 saved');
  const timerShown = await js(`!!document.querySelector('[data-testid=aia-timer]')`);
  await sleep(500);
  await page.send('Page.reload'); // refresh must resume the same attempt with saved answers
  await until(`document.querySelectorAll('[data-testid=aia-question]').length === 3`, 'attempt after reload');
  const resumed = await js(`document.querySelector('[data-testid=aia-option-1-1]').checked && document.querySelector('[data-testid=aia-option-2-0]').checked`);
  results.studentAttempt = await shot('4-student-attempt');
  await userClick(`document.querySelector('[data-testid=aia-submit]')`);
  await until(`!!document.querySelector('[data-testid=aia-score]')`, 'result page');
  const studentScore = await js(`document.querySelector('[data-testid=aia-score]').innerText`);
  results.studentResult = await shot('5-student-result');
  log('student result on screen:', studentScore.replace(/\s+/g, ' '));

  // 3) Teacher: open the report
  await login(TEACHER);
  await userClick(sidebarLink('/teacher/assessments'));
  await until(`!!__e2e.button(${JSON.stringify(TEST_TITLE)}, true)`, 'teacher list');
  await userClick(`__e2e.button(${JSON.stringify(TEST_TITLE)}, true)`);
  await until(`!!document.querySelector('[data-testid=aia-toggle-report]')`, 'test opened');
  await userClick(`document.querySelector('[data-testid=aia-toggle-report]')`);
  await until(`[...document.querySelectorAll('[data-testid=aia-report-row]')].some(r => r.dataset.student === ${JSON.stringify(STUDENT.name)})`, 'report row');
  const reportRow = await js(`(() => { const r = [...document.querySelectorAll('[data-testid=aia-report-row]')].find(r => r.dataset.student === ${JSON.stringify(STUDENT.name)});
    return { score: r.querySelector('[data-testid=aia-report-score]').innerText, percentage: r.querySelector('[data-testid=aia-report-percentage]').innerText, text: r.innerText }; })()`);
  results.teacherReport = await shot('6-teacher-report');
  log('teacher report row:', reportRow.text.replace(/\s+/g, ' '));

  // 4) Teacher: report -> "View performance" -> Student Performance Analyst
  await userClick(`[...document.querySelectorAll('[data-testid=aia-report-row]')].find(r => r.dataset.student === ${JSON.stringify(STUDENT.name)}).querySelector('[data-testid=aia-report-performance]')`);
  await until(`location.pathname.startsWith('/teacher/assessments/students/') && !!document.querySelector('[data-testid=aia-performance]')`, 'performance page');
  await until(`document.querySelectorAll('[data-testid=aia-history-row]').length === 1`, 'history row');
  const perf = await js(`({ text: document.body.innerText, limited: !!document.querySelector('[data-testid=aia-sufficiency]'),
    aiLabel: document.querySelector('[data-testid=aia-ai-section]').innerText.includes('AI interpretation of the metrics above'),
    chart: !!document.querySelector('.recharts-surface') })`);
  const facts = { name: perf.text.includes(STUDENT.name), avg: perf.text.includes('33.33%'), a1: perf.text.includes('A1') && perf.text.includes(TEST_TITLE) };
  const callsBeforeAnalysis = mockLlm.calls.length;
  const factsWithoutLlm = callsBeforeAnalysis === 1; // opening the page never calls the LLM
  const emptyState = await js(`document.querySelector('[data-testid=aia-ai-empty]')?.innerText.includes('AI analysis has not been generated yet.')
    && document.querySelector('[data-testid=aia-ai-status]').innerText === 'AI analysis not generated'
    && document.querySelector('[data-testid=aia-ai-generate]').innerText.includes('Generate AI Report')`);
  results.performance = await shot('7-teacher-performance');
  // Refresh, then leave and come back: still no LLM call, still the empty state.
  const perfUrl = await js('location.pathname');
  await page.send('Page.reload');
  await until(`document.querySelectorAll('[data-testid=aia-history-row]').length === 1 && !!document.querySelector('[data-testid=aia-ai-empty]')`, 'performance page after refresh');
  await go('/teacher/assessments');
  await until(`!!__e2e.button('Generate with AI', true)`, 'left the performance page');
  await go(perfUrl);
  await until(`document.querySelectorAll('[data-testid=aia-history-row]').length === 1 && !!document.querySelector('[data-testid=aia-ai-empty]')`, 'back on the performance page');
  const noCallOnRefreshOrReturn = mockLlm.calls.length === callsBeforeAnalysis;
  // Teacher chooses a report focus and adds an instruction (changing them makes no call).
  await until(`[...document.querySelectorAll('[data-testid=aia-report-focus] option')].length === 8`, 'report focus options');
  await userSet(`document.querySelector('[data-testid=aia-report-focus]')`, `'weak_concepts'`);
  await userSet(`document.querySelector('[data-testid=aia-report-instructions]')`, `'Keep recommendations to the next two weeks.'`);
  const noCallOnFocusChange = mockLlm.calls.length === callsBeforeAnalysis;
  // Double-click Generate (two clicks in the same tick): exactly ONE request; the button is disabled while it runs.
  let releaseAnalysis;
  analysisReply = new Promise((r) => { releaseAnalysis = () => r(ANALYSIS); });
  await until('__e2e.canReach(document.querySelector("[data-testid=aia-ai-generate]"))', 'generate button reachable');
  await js(`(() => { const b = document.querySelector('[data-testid=aia-ai-generate]'); b.click(); b.click(); return true; })()`);
  await until(`document.querySelector('[data-testid=aia-ai-generate]').disabled && !!document.querySelector('[data-testid=aia-ai-loading]')`, 'loading state with disabled button');
  await js(`(() => { document.querySelector('[data-testid=aia-ai-generate]').click(); return true; })()`); // a third click while loading
  await sleep(500);
  const doubleClickOneCall = mockLlm.calls.length === callsBeforeAnalysis + 1;
  releaseAnalysis();
  await until(`!!document.querySelector('[data-testid=aia-ai-content]')`, 'AI analysis shown');
  analysisReply = ANALYSIS;
  const analysisShown = await js(`(() => { const t = document.querySelector('[data-testid=aia-ai-content]').innerText;
    return ['Executive Summary', 'Performance Overview', 'Strengths', 'Areas Requiring Attention', 'Recommended Mentor Actions', 'Suggested Next Assessment', 'Data Limitations', 'Networking terminology', 'Weak Concepts']
      .every((x) => t.includes(x)) && document.querySelector('[data-testid=aia-ai-status]').innerText === 'Generated just now'; })()`);
  const focusInput = JSON.parse(mockLlm.calls.at(-1).prompt.replace(/^[^\n]*\n/, ''));
  const focusSent = focusInput.reportFocus.name === 'Identify Weak Concepts' && focusInput.teacherInstructions === 'Keep recommendations to the next two weeks.';
  await userClick(`[...document.querySelectorAll('[data-testid=aia-evidence-chip]')].find((c) => c.innerText === 'A1 · Q2')`);
  const evidenceHighlight = await js(`new Promise((r) => setTimeout(() => r(document.getElementById('hist-A1').className.includes('bg-blue-50')), 300))`);
  results.performanceAi = await shot('8-teacher-performance-ai');
  await js(`(() => { document.querySelector('[data-testid=aia-report-summary]').scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(300);
  results.performanceReport1 = await shot('8b-ai-report-summary');
  await js(`(() => { document.querySelector('[data-testid=aia-report-actions]').scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(300);
  results.performanceReport2 = await shot('8c-ai-report-actions');
  const analysisPayload = JSON.stringify(mockLlm.calls[mockLlm.calls.length - 1]);
  const noPiiSent = [STUDENT.name, STUDENT.email, TEACHER.name, TEST_TITLE, 'Grade 10'].every((f) => !analysisPayload.includes(f));
  // Rejected model output -> safe unavailable state (no model text), metrics stay; Try again recovers.
  analysisReply = ANALYSIS.replace('confirm this.', 'confirm this because the student is lazy.');
  await userClick(`__e2e.button('Regenerate', true)`);
  await until(`!!document.querySelector('[data-testid=aia-ai-unavailable]')`, 'AI unavailable state');
  const safeError = await js(`!document.body.innerText.includes('lazy') && document.querySelectorAll('[data-testid=aia-history-row]').length === 1`);
  results.performanceAiError = await shot('9-teacher-performance-ai-rejected');
  analysisReply = ANALYSIS;
  await userClick(`__e2e.button('Try again', true)`);
  await until(`!!document.querySelector('[data-testid=aia-ai-content]')`, 'AI analysis after Try again');
  const callsAfterAnalysis = mockLlm.calls.length;
  await page.send('Page.reload'); // coming back later: nothing is generated automatically
  await until(`document.querySelectorAll('[data-testid=aia-history-row]').length === 1 && !!document.querySelector('[data-testid=aia-ai-empty]')`, 'performance page reloaded after analysis');
  await sleep(500);
  const noAutoRegenerate = mockLlm.calls.length === callsAfterAnalysis;
  log('performance page: facts, AI analysis, rejected-output state, retry and LLM-call counts verified');

  // 5) Question types: teacher builds a test by hand with a multiple-select and a numerical question
  await go('/teacher/assessments');
  await until(`!!__e2e.button('New test', true)`, 'teacher list for new test');
  await userClick(`__e2e.button('New test', true)`);
  await until(`!!document.querySelector('input[placeholder=Title]')`, 'new test form');
  await userSet(`document.querySelector('input[placeholder=Title]')`, `${JSON.stringify(TYPES_TITLE)}`);
  await userSet(`document.querySelector('input[placeholder=Subject]')`, `'Mathematics'`);
  await userSet(`document.querySelectorAll('select')[0]`, `'10'`);
  await userClick(`__e2e.button('Create draft', true)`);
  await until(`!!document.querySelector('[data-testid=aia-manual-type]')`, 'draft created; question editor shown');
  await userClick(`document.querySelector('[data-testid=aia-manual-type] [data-type=multi_select]')`);
  await userSet(`document.querySelector('textarea[placeholder="Question text"]')`, `'Which of these numbers are prime? Select all that apply.'`);
  for (const [i, t] of [['A', '4'], ['B', '7'], ['C', '9'], ['D', '11']]) await userSet(`document.querySelector('input[placeholder="Option ${i}"]')`, `'${t}'`);
  await userClick(`document.querySelectorAll('input[name=aia-manual-correct]')[1]`);
  await userClick(`document.querySelectorAll('input[name=aia-manual-correct]')[3]`);
  await userClick(`__e2e.button('Add question', true)`);
  await until(`document.querySelectorAll('[data-testid=aia-question-row]').length === 1`, 'multiple-select question added');
  await userClick(`document.querySelector('[data-testid=aia-manual-type] [data-type=numerical]')`);
  await userSet(`document.querySelector('textarea[placeholder="Question text"]')`, `'What is 7 x 6?'`);
  await userSet(`document.querySelector('[data-testid=aia-manual-answer]')`, `'42'`);
  await userClick(`__e2e.button('Add question', true)`);
  await until(`document.querySelectorAll('[data-testid=aia-question-row]').length === 2`, 'numerical question added');
  const teacherTypes = await js(`[...document.querySelectorAll('[data-testid=aia-question-row]')].map((r) => r.dataset.type).join(',')`);
  const numericKeyShown = await js(`document.querySelectorAll('[data-testid=aia-question-row]')[1].innerText.includes('Answer: 42 (whole number)')`);
  results.teacherTypes = await shot('10-teacher-question-types');
  const assignState = (expected) => js(`__e2e.assignState() === ${JSON.stringify(expected)}`);
  await userClick(`document.querySelector('[data-testid=aia-publish]')`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 2`, 'Assign to popup (types test)');
  await userClick(`document.querySelector('[data-testid=aia-assign-none]')`);
  const noneState = await assignState(`${CLASSMATE}:0|E2E Student:0`) && await js(`__e2e.assignCount().includes('Selected: 0 students') && document.querySelector('[data-testid=aia-assign-confirm]').disabled`);
  await userClick(`document.querySelector('[data-testid=aia-assign-cancel]')`);
  await until(`!document.querySelector('[data-testid=aia-assign-modal]')`, 'popup cancelled');
  const cancelKeptDraft = (await dbRows('SELECT status FROM aia_assessments WHERE title = ?', TYPES_TITLE))[0].status === 'draft';
  await userClick(`document.querySelector('[data-testid=aia-publish]')`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 2`, 'Assign to popup reopened');
  const reopenedAll = await assignState(`${CLASSMATE}:1|E2E Student:1`);
  await userClick(`document.querySelector('[data-testid=aia-assign-none]')`);
  await userSet(`document.querySelector('[data-testid=aia-assign-search]')`, `'student'`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 1`, 'search by name');
  const searchOk = await assignState('E2E Student:0');
  await userClick(`__e2e.assignBox('E2E Student')`);
  await userSet(`document.querySelector('[data-testid=aia-assign-search]')`, `''`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 2`, 'search cleared');
  const individualOk = await assignState(`${CLASSMATE}:0|E2E Student:1`) && await js(`__e2e.assignCount().includes('Selected: 1 student')`);
  await userClick(`document.querySelector('[data-testid=aia-assign-all]')`);
  const allOk = await assignState(`${CLASSMATE}:1|E2E Student:1`) && await js(`__e2e.assignCount().includes('(whole class)')`);
  await userClick(`document.querySelector('[data-testid=aia-assign-none]')`);
  await userClick(`__e2e.assignBox('E2E Student')`);
  results.assignSelected = await shot('10a-assign-to-one-student');
  await userClick(`document.querySelector('[data-testid=aia-assign-confirm]')`);
  await until(`!!document.querySelector('[data-testid=aia-toggle-report]')`, 'types test published');
  const recipientsOf = async (title) => (await dbRows('SELECT r.student_id AS id FROM aia_assessment_recipients r JOIN aia_assessments a ON a.id = r.assessment_id WHERE a.title = ? ORDER BY r.student_id', title)).map((r) => r.id).join(',');
  const typesRecipients = (await recipientsOf(TYPES_TITLE)) === '4';
  const selectedShown = await js(`document.body.innerText.includes('Assigned to 1 selected student')`);

  // 6) Student answers: multiple-select (B + D) and numerical ("042" is saved as 42), then submits
  await login(STUDENT);
  await go('/student/assessment-agent/tests');
  await until(`[...document.querySelectorAll('[data-testid=aia-test-row]')].some(r => r.dataset.title === ${JSON.stringify(TYPES_TITLE)})`, 'types test listed');
  await userClick(`[...document.querySelectorAll('[data-testid=aia-test-row]')].find(r => r.dataset.title === ${JSON.stringify(TYPES_TITLE)}).querySelector('[data-testid=aia-open-test]')`);
  await until(`document.querySelectorAll('[data-testid=aia-question]').length === 2`, 'types attempt page');
  const studentNoKey = await js(`!document.body.innerText.includes('42') && document.querySelectorAll('input[type=checkbox][data-testid^=aia-option-1-]').length === 4`);
  await userClick(`document.querySelector('[data-testid=aia-option-1-1]')`);
  await until(`!document.body.innerText.includes('Saving...') && document.querySelector('[data-testid=aia-option-1-1]').checked`, 'first choice saved');
  await userClick(`document.querySelector('[data-testid=aia-option-1-3]')`);
  await until(`!document.body.innerText.includes('Saving...') && document.querySelector('[data-testid=aia-option-1-3]').checked`, 'second choice saved');
  await userSet(`document.querySelector('[data-testid=aia-number-2]')`, `'042'`);
  await js(`(() => { document.querySelector('[data-testid=aia-number-2]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  await until(`document.querySelector('[data-testid=aia-number-2]').value === '42' && document.body.innerText.includes('2 of 2 answered')`, 'number saved (canonical)');
  results.studentTypes = await shot('11-student-question-types');
  await userClick(`document.querySelector('[data-testid=aia-submit]')`);
  await until(`!!document.querySelector('[data-testid=aia-score]')`, 'types result page');
  const typesScore = await js(`document.querySelector('[data-testid=aia-score]').innerText`);
  const typesOutcomes = await js(`[...document.querySelectorAll('[data-testid=aia-result-question]')].map((q) => q.dataset.outcome).join(',')`);
  results.studentTypesResult = await shot('12-student-question-types-result');
  log('question types: student result', typesScore.replace(/\s+/g, ' '));

  // 7) Descriptive Assignments - teacher: draft with 3 questions -> publish. No AI anywhere from here on.
  const callsBeforeAssignments = mockLlm.calls.length;
  await login(TEACHER);
  await go('/teacher/assessments');
  await until(`!!document.querySelector('[data-testid=aia-open-assignments]')`, 'assignments entry link');
  await userClick(`document.querySelector('[data-testid=aia-open-assignments]')`);
  await until(`location.pathname === '/teacher/assessments/assignments' && !!document.querySelector('[data-testid=aia-asg-new]')`, 'assignments page');
  await userClick(`document.querySelector('[data-testid=aia-asg-new]')`);
  await until(`!!document.querySelector('[data-testid=aia-asg-title]')`, 'assignment editor');
  await userSet(`document.querySelector('[data-testid=aia-asg-title]')`, `${JSON.stringify(ASSIGNMENT_TITLE)}`);
  await userSet(`document.querySelector('[data-testid=aia-asg-class]')`, `'10'`);
  await userSet(`document.querySelector('[data-testid=aia-asg-marks]')`, `'10'`);
  await userSet(`document.querySelector('[data-testid=aia-asg-instructions]')`, `'Answer every question in full sentences and upload one PDF.'`);
  const QS = [['Explain how photosynthesis works.', '4'], ['Why do leaves look green?', '3'], ['Describe one factor that limits photosynthesis.', '3']];
  for (let i = 0; i < QS.length; i += 1) {
    if (i > 0) await userClick(`document.querySelector('[data-testid=aia-asg-add-question]')`);
    await until(`document.querySelectorAll('[data-testid=aia-asg-question]').length === ${i + 1}`, `question ${i + 1} field`);
    await userSet(`document.querySelectorAll('[data-testid=aia-asg-question]')[${i}]`, `${JSON.stringify(QS[i][0])}`);
    await userSet(`document.querySelectorAll('[data-testid=aia-asg-question-marks]')[${i}]`, `'${QS[i][1]}'`);
  }
  const tallyOk = await js(`document.querySelector('[data-testid=aia-asg-tally]').innerText.includes('10 / 10')`);
  await userClick(`document.querySelector('[data-testid=aia-asg-save]')`);
  await until(`document.querySelector('[data-testid=aia-asg-status]')?.dataset.status === 'draft'`, 'draft saved');
  const draftSaved = (await dbRows('SELECT status, (SELECT COUNT(*) FROM aia_assignment_questions q WHERE q.assignment_id = a.id) AS n FROM aia_assignments a WHERE title = ?', ASSIGNMENT_TITLE))[0];
  await userClick(`document.querySelector('[data-testid=aia-asg-publish]')`);
  await until(`document.querySelector('[data-testid=aia-asg-status]')?.dataset.status === 'published'`, 'assignment published');
  const lockedAfterPublish = await js(`[...document.querySelectorAll('[data-testid=aia-asg-question]')].every((t) => t.disabled) && !document.querySelector('[data-testid=aia-asg-publish]')`);
  results.assignmentPublished = await shot('13-teacher-assignment-published');
  log('assignment created with 3 questions and published:', ASSIGNMENT_TITLE);

  // 8) Student: My Tests -> My Assignments -> open -> upload a synthetic PDF -> submit
  await login(STUDENT);
  await go('/student/assessment-agent/tests');
  await until(`!!document.querySelector('[data-testid=aia-open-assignments]')`, 'student assignments link');
  await userClick(`document.querySelector('[data-testid=aia-open-assignments]')`);
  await until(`[...document.querySelectorAll('[data-testid=aia-stu-asg-row]')].some((r) => r.dataset.title === ${JSON.stringify(ASSIGNMENT_TITLE)})`, 'assignment listed for the student');
  const listedNotSubmitted = await js(`[...document.querySelectorAll('[data-testid=aia-stu-asg-row]')].find((r) => r.dataset.title === ${JSON.stringify(ASSIGNMENT_TITLE)}).querySelector('[data-testid=aia-stu-asg-status]').dataset.status === 'not_submitted'`);
  results.studentAssignments = await shot('14-student-assignments');
  await userClick(`[...document.querySelectorAll('[data-testid=aia-stu-asg-row]')].find((r) => r.dataset.title === ${JSON.stringify(ASSIGNMENT_TITLE)})`);
  await until(`!!document.querySelector('[data-testid=aia-stu-asg-dropzone]') && document.body.innerText.includes('Describe one factor that limits photosynthesis.')`, 'assignment page with questions');
  const { root } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-testid=aia-stu-asg-file]' });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [essayPdf] });
  await until(`!!document.querySelector('[data-testid=aia-stu-asg-selected]') && document.querySelector('[data-testid=aia-stu-asg-selected]').innerText.includes('E2E synthetic essay.pdf')`, 'PDF selected');
  results.studentUploadSelected = await shot('15-student-upload-selected');
  await userClick(`document.querySelector('[data-testid=aia-stu-asg-submit]')`);
  await until(`document.body.innerText.includes('Assignment submitted successfully.') && document.querySelector('[data-testid=aia-stu-asg-status]').dataset.status === 'submitted'`, 'submission confirmed');
  const submittedShown = await js(`document.querySelector('[data-testid=aia-stu-asg-current]').innerText.includes('E2E synthetic essay.pdf')`);
  results.studentSubmitted = await shot('16-student-submitted');
  const storedFiles = fs.readdirSync(path.join(uploadRoot, 'submissions'));
  const storedOk = storedFiles.length === 1 && /^[0-9a-f-]{36}\.pdf$/.test(storedFiles[0])
    && fs.readFileSync(path.join(uploadRoot, 'submissions', storedFiles[0])).equals(fs.readFileSync(essayPdf));
  log('student uploaded the synthetic PDF; stored as', storedFiles[0]);

  // 9) Teacher: submissions dashboard shows the submitted student AND the classmate who did not submit
  await login(TEACHER);
  await go('/teacher/assessments/assignments');
  await until(`[...document.querySelectorAll('[data-testid=aia-asg-row]')].some((r) => r.dataset.title === ${JSON.stringify(ASSIGNMENT_TITLE)})`, 'teacher assignment list');
  await userClick(`[...document.querySelectorAll('[data-testid=aia-asg-row]')].find((r) => r.dataset.title === ${JSON.stringify(ASSIGNMENT_TITLE)}).querySelector('[data-testid=aia-asg-view-submissions]')`);
  await until(`document.querySelectorAll('[data-testid=aia-asg-sub-row]').length === 2`, 'submission dashboard rows');
  const dash = await js(`Object.fromEntries([...document.querySelectorAll('[data-testid=aia-asg-sub-row]')].map((r) => [r.dataset.student, r.dataset.status]))`);
  const dashboardOk = dash[STUDENT.name] === 'submitted' && dash[CLASSMATE] === 'not_submitted';
  results.teacherSubmissions = await shot('17-teacher-submissions');
  const zeroAiInAssignments = mockLlm.calls.length === callsBeforeAssignments;
  log('teacher submission dashboard:', JSON.stringify(dash));

  // 10) Prompt 2: AI-assisted evaluation. Loading the dashboard made no evaluation call.
  const evalCalls = () => mockLlm.calls.filter(isEvaluation).length;
  const noEvalBeforeClick = evalCalls() === 0 && earlyEvaluationCalls.length === 0
    && await js(`[...document.querySelectorAll('[data-testid=aia-asg-sub-row]')].find((r) => r.dataset.student === ${JSON.stringify(STUDENT.name)}).querySelector('[data-testid=aia-asg-ai-status]').dataset.state === 'none'`);
  let releaseEvaluation;
  evaluationReply = new Promise((r) => { releaseEvaluation = () => r(EVALUATION); });
  evaluateClicked = true;
  const rowSel = `[...document.querySelectorAll('[data-testid=aia-asg-sub-row]')].find((r) => r.dataset.student === ${JSON.stringify(STUDENT.name)})`;
  await until(`__e2e.canReach(${rowSel}.querySelector('[data-testid=aia-asg-evaluate-ai]'))`, 'Evaluate with AI button');
  await js(`(() => { const b = ${rowSel}.querySelector('[data-testid=aia-asg-evaluate-ai]'); b.click(); b.click(); return true; })()`); // double-click
  await until(`${rowSel}.querySelector('[data-testid=aia-asg-ai-status]').dataset.state === 'evaluating' && ${rowSel}.querySelector('[data-testid=aia-asg-evaluate-ai]').disabled`, 'evaluating state');
  await sleep(1300);
  const loadingShown = /Evaluating\.\.\. \d+s/.test(await js(`${rowSel}.querySelector('[data-testid=aia-asg-ai-status]').innerText`));
  results.teacherEvaluating = await shot('18-teacher-ai-evaluating');
  const oneEvalCall = evalCalls() === 1;
  releaseEvaluation();
  await until(`!!document.querySelector('[data-testid=aia-asg-ai-panel]') && document.querySelector('[data-testid=aia-asg-ai-total]').innerText === '7 / 10'`, 'AI suggestion panel');
  const panelOk = await js(`(() => { const t = document.querySelector('[data-testid=aia-asg-ai-panel]').innerText;
    return ['AI Suggested Evaluation', 'Suggested: 3 / 4', 'Suggested: 2 / 3', 'Overall feedback', 'Limitations'].every((x) => t.toLowerCase().includes(x.toLowerCase())) // headings are CSS-uppercased
      && ${rowSel}.querySelector('[data-testid=aia-asg-ai-status]').dataset.state === 'ready'
      && ${rowSel}.querySelector('[data-testid=aia-asg-final-marks]').innerText.startsWith('—'); })()`);
  results.teacherAiPanel = await shot('19-teacher-ai-suggestion');
  const evalPayload = mockLlm.calls.filter(isEvaluation)[0];
  const evalSent = JSON.stringify(evalPayload);
  const evalPrivacy = [STUDENT.name, STUDENT.email, TEACHER.name, ASSIGNMENT_TITLE, 'Grade 10 - A', path.basename(uploadRoot)].every((f) => !evalSent.includes(f))
    && JSON.parse(evalPayload.prompt.replace(/^[^\n]*\n/, '')).studentAnswer.startsWith('Name: [student] [email]'); // the PDF helper turns "( )" into spaces
  const aiNotFinal = (await dbRows('SELECT ai_marks, final_marks, status FROM aia_assignment_submissions'))[0];
  // Accept -> pre-fills the final form only; the teacher changes Q1 and saves explicitly.
  await userClick(`document.querySelector('[data-testid=aia-asg-ai-accept]')`);
  await until(`!!document.querySelector('[data-testid=aia-asg-review]') && document.querySelector('[data-testid=aia-asg-mark-Q1]').value === '3'`, 'review form pre-filled from AI');
  const acceptSavedNothing = (await dbRows('SELECT final_marks FROM aia_assignment_submissions'))[0].final_marks === null;
  await userSet(`document.querySelector('[data-testid=aia-asg-mark-Q1]')`, `'4'`);
  await userSet(`document.querySelector('[data-testid=aia-asg-review-feedback]')`, `'Teacher-approved: good answers; explain Q2 and Q3 more fully.'`);
  await until(`document.querySelector('[data-testid=aia-asg-review-total]').innerText === '8 / 10'`, 'review total updated');
  results.teacherReview = await shot('20-teacher-review');
  await userClick(`document.querySelector('[data-testid=aia-asg-save-final]')`);
  await until(`${rowSel}?.querySelector('[data-testid=aia-asg-final-marks]').innerText === '8 / 10'`, 'final marks saved');
  const finalRow = (await dbRows('SELECT ai_marks, final_marks, final_question_marks_json, status, teacher_feedback FROM aia_assignment_submissions'))[0];
  const finalAuthoritative = finalRow.final_marks === 8 && finalRow.ai_marks === 7 && finalRow.status === 'evaluated' && JSON.parse(finalRow.final_question_marks_json)[0].marks === 4;
  results.teacherFinal = await shot('21-teacher-final-saved');
  log('AI suggestion 7/10; teacher saved final 8/10');

  // 11) Student sees ONLY the teacher-approved marks and feedback.
  const assignmentId = (await dbRows('SELECT id FROM aia_assignments WHERE title = ?', ASSIGNMENT_TITLE))[0].id;
  await login(STUDENT);
  await go(`/student/assessment-agent/assignments/${assignmentId}`);
  await until(`document.querySelector('[data-testid=aia-stu-asg-status]')?.dataset.status === 'evaluated'`, 'student sees evaluated');
  const studentView = await js(`document.body.innerText`);
  const studentSeesFinalOnly = /Marks:\s*8\s*\/\s*10/.test(studentView) && studentView.includes('Teacher-approved: good answers')
    && !studentView.includes('SYNTHETIC-AI-OVERALL') && !/AI Suggested|Suggested:|suggestion|Limitations/i.test(studentView) && studentView.includes('Q1: 4 / 4');
  results.studentFinal = await shot('22-student-final-marks');
  // Question-generation calls of the original flows (the checks below refer to these, not to step 12).
  const genCallsOriginalFlow = mockLlm.calls.filter((c) => !String(c.prompt).startsWith('Student assessment evidence') && !isEvaluation(c)).length;

  // 12) Report PDF download + "Generate this assessment" -> pre-filled generator -> generate -> Save & assign.
  await login(TEACHER);
  await go(perfUrl);
  await until(`document.querySelectorAll('[data-testid=aia-history-row]').length >= 1 && !!document.querySelector('[data-testid=aia-ai-empty]')`, 'performance page (step 12)'); // the student now has 2 tests
  const analysisBefore12 = mockLlm.calls.filter((c) => String(c.prompt).startsWith('Student assessment evidence')).length;
  await userClick(`document.querySelector('[data-testid=aia-ai-generate]')`);
  await until(`!!document.querySelector('[data-testid=aia-report-pdf]')`, 'report with Download PDF');
  const downloadDir = path.join(uploadRoot, 'downloads');
  fs.mkdirSync(downloadDir, { recursive: true });
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await userClick(`document.querySelector('[data-testid=aia-report-pdf]')`);
  await waitFor(() => fs.readdirSync(downloadDir).some((f) => f.endsWith('.pdf')), 20000, 'report PDF downloaded');
  const pdfFile = fs.readdirSync(downloadDir).find((f) => f.endsWith('.pdf'));
  const pdfBytes = fs.readFileSync(path.join(downloadDir, pdfFile));
  const pdfOk = pdfBytes.subarray(0, 5).toString() === '%PDF-' && pdfBytes.length > 1000 && /^AI-Performance-Report_E2E-Student_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfFile);
  const pdfNoAiCall = mockLlm.calls.filter((c) => String(c.prompt).startsWith('Student assessment evidence')).length === analysisBefore12 + 1; // only the Generate click
  log('report PDF downloaded:', pdfFile, `${pdfBytes.length} bytes`);
  const analysisCalls = () => mockLlm.calls.filter((c) => String(c.prompt).startsWith('Student assessment evidence')).length;
  await until(`!!document.querySelector('[data-testid=aia-report-send]') && !document.querySelector('[data-testid=aia-report-send]').disabled`, 'Send to Student enabled');
  await js(`(() => { const b = __e2e.reachable(document.querySelector('[data-testid=aia-report-send]')); b.click(); b.click(); return true; })()`);
  await until(`!!document.querySelector('[data-testid=aia-report-sent]')`, 'report sent');
  results.reportSent = await shot('23a-report-sent');
  const sharedRows = (await dbRows('SELECT student_id AS s FROM aia_performance_reports WHERE shared_at IS NOT NULL'));
  const sendOk = sharedRows.length === 1 && sharedRows[0].s === 4;
  const sendNoAi = analysisCalls() === analysisBefore12 + 1;
  const genBeforeNext = mockLlm.calls.filter((c) => !String(c.prompt).startsWith('Student assessment evidence') && !isEvaluation(c)).length;
  await userClick(`document.querySelector('[data-testid=aia-report-generate-next]')`);
  await until(`location.pathname === '/teacher/assessments' && !!document.querySelector('[data-testid=aia-gen-prefill]')`, 'pre-filled generator');
  const prefillOk = await js(`document.querySelector('[data-testid=aia-gen-prefill]').innerText.includes('Suggested for: E2E Student')
    && document.querySelector('input[placeholder^="Topic"]').value === 'Check concept mastery in Computer Science.'
    && document.querySelector('input[placeholder=Subject]').value === 'Computer Science' && document.querySelectorAll('select')[0].value === '10'`);
  const noCallOnPrefill = mockLlm.calls.filter((c) => !String(c.prompt).startsWith('Student assessment evidence') && !isEvaluation(c)).length === genBeforeNext;
  results.generatorPrefilled = await shot('23-generator-prefilled');
  await userSet(`document.querySelector('input[type=number][max="20"]')`, `'3'`); // the mock returns 3 questions
  await userClick(`__e2e.button('Generate Questions', true)`);
  await until(`document.body.innerText.includes('Review questions (3)')`, 'proposal from the suggestion');
  const NEXT_TITLE = `E2E Follow-up ${Date.now()}`;
  await userSet(`document.querySelector('input[placeholder=Title]')`, `${JSON.stringify(NEXT_TITLE)}`);
  await userClick(`document.querySelector('[data-testid=aia-gen-save-assign]')`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 2`, 'Assign to popup (suggested)');
  const suggestedDefault = await assignState(`${CLASSMATE}:0|E2E Student:1`) && await js(`document.querySelector('[data-testid=aia-assign-suggested]').innerText.includes('Suggested for: E2E Student') && __e2e.assignCount().includes('Selected: 1 student')`);
  const notAssignedYet = (await dbRows('SELECT COUNT(*) AS n FROM aia_assessments WHERE title = ?', NEXT_TITLE))[0].n === 0;
  results.suggestedPopup = await shot('23b-assign-to-suggested-student');
  await userClick(`document.querySelector('[data-testid=aia-assign-all]')`);
  const addAllOk = await assignState(`${CLASSMATE}:1|E2E Student:1`);
  await userClick(`document.querySelector('[data-testid=aia-assign-none]')`);
  await userSet(`document.querySelector('[data-testid=aia-assign-search]')`, `'classmate'`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 1`, 'search classmate');
  await userClick(`__e2e.assignBox('Classmate')`);
  await userSet(`document.querySelector('[data-testid=aia-assign-search]')`, `''`);
  await until(`document.querySelectorAll('[data-testid=aia-assign-student]').length === 2`, 'search cleared (suggested)');
  const addAnotherOk = await assignState(`${CLASSMATE}:1|E2E Student:0`);
  await userClick(`__e2e.assignBox('E2E Student')`);
  await userClick(`__e2e.assignBox('Classmate')`); // back to only the student the report was about
  const finalState = await assignState(`${CLASSMATE}:0|E2E Student:1`);
  await userClick(`document.querySelector('[data-testid=aia-assign-confirm]')`);
  await until(`!!document.querySelector('[data-testid=aia-toggle-report]')`, 'saved and assigned (published view)');
  const nextRecipients = (await recipientsOf(NEXT_TITLE)) === '4';
  const assigned = (await dbRows('SELECT status, classroom_id AS classroomId, (SELECT COUNT(*) FROM aia_questions q WHERE q.assessment_id = a.id) AS n FROM aia_assessments a WHERE title = ?', NEXT_TITLE))[0];
  const assignedOk = !!assigned && assigned.status === 'published' && assigned.classroomId === 10 && assigned.n === 3
    && mockLlm.calls.filter((c) => !String(c.prompt).startsWith('Student assessment evidence') && !isEvaluation(c)).length === genBeforeNext + 1;
  results.assigned = await shot('24-next-assessment-assigned');
  log('suggested next assessment generated and assigned:', NEXT_TITLE);

  // 13) Student: report notification -> Download Report (authenticated endpoint, browser-built PDF, no AI)
  await login(STUDENT);
  await go('/student/assessment-agent/tests');
  await until(`document.querySelectorAll('[data-testid=aia-report-notification]').length === 1`, 'report notification');
  const notifOk = await js(`(() => { const n = document.querySelector('[data-testid=aia-report-notification]'); return n.dataset.read === '0' && n.innerText.includes('New Performance Report') && n.innerText.includes('Your teacher has shared an AI Performance Report with you.'); })()`);
  const personalizedListed = await js(`[...document.querySelectorAll('[data-testid=aia-test-row]')].some((r) => r.dataset.title === ${JSON.stringify(NEXT_TITLE)})`);
  results.studentNotification = await shot('25-student-report-notification');
  const studentDir = path.join(uploadRoot, 'student-downloads');
  fs.mkdirSync(studentDir, { recursive: true });
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: studentDir });
  const aiBeforeStudent = mockLlm.calls.length;
  await js(`(() => { const b = __e2e.reachable(document.querySelector('[data-testid=aia-report-download]')); b.click(); b.click(); return true; })()`);
  await waitFor(() => fs.readdirSync(studentDir).some((f) => f.endsWith('.pdf')), 20000, 'student report PDF downloaded');
  await until(`document.querySelector('[data-testid=aia-report-notification]').dataset.read === '1'`, 'notification marked read');
  await sleep(1500); // a second download (double-click) would have landed by now
  const studentPdfs = fs.readdirSync(studentDir).filter((f) => f.endsWith('.pdf'));
  const studentPdf = fs.readFileSync(path.join(studentDir, studentPdfs[0]));
  const studentPdfOk = studentPdfs.length === 1 && studentPdf.subarray(0, 5).toString() === '%PDF-' && studentPdf.length > 1000 && /^AI-Performance-Report_E2E-Student_\d{4}-\d{2}-\d{2}\.pdf$/.test(studentPdfs[0]);
  const studentNoAi = mockLlm.calls.length === aiBeforeStudent;
  log('student downloaded the shared report:', studentPdfs[0], `${studentPdf.length} bytes`);

  // ---------- verdict ----------
  const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB).mtimeMs : null;
  const checks = {
    'teacher opened AI Assessments from the sidebar': teacherViaSidebar,
    'AI proposal shown for review and NOT saved before Save': notSavedBeforeReview,
    'saved as a draft (with the teacher edit), then published': savedAsDraftWithEdit,
    'question generation called the LLM once (mock, no real provider)': genCallsOriginalFlow === 1,
    'template (Concept Mastery) + instructions sent as separate data; system rules unchanged': templateAndInstructionsSent,
    'question generation: same-tick double-click => one request, no error state': generateDoubleClickClean,
    'student opened My Tests from the sidebar': studentViaSidebar,
    'student saw no answer key before submitting': noAnswerLeak,
    'server-driven countdown shown': timerShown,
    'refresh resumed the same attempt with saved answers': resumed,
    'student score is 1/3 (33.33%)': /1\/3/.test(studentScore) && /33\.33%/.test(studentScore),
    'teacher report shows the same score': reportRow.score === '1/3' && reportRow.percentage === '33.33%',
    'performance page opened from the report, shows backend facts (name, 33.33% average, A1 row, chart)': facts.name && facts.avg && facts.a1 && perf.chart,
    'limited-data banner shown (1 finished assessment)': perf.limited,
    'AI section labelled "AI interpretation of the metrics above"': perf.aiLabel,
    'opening the performance page did not call the LLM': factsWithoutLlm,
    'AI report shown with all 7 sections, focus and "Generated just now"; question-level chip A1 · Q2 highlights history row A1': analysisShown && evidenceHighlight,
    'analysis payload contained no student/teacher name, email, test title or class name': noPiiSent,
    'rejected AI output -> safe unavailable state, no model text, metrics intact': safeError,
    'analysis calls: 3 (generate, regenerate rejected, try again)': callsAfterAnalysis - callsBeforeAnalysis === 3,
    'empty state "AI analysis has not been generated yet." + status "AI analysis not generated" + "Generate AI Report" button': emptyState,
    'choosing a report focus / typing instructions => 0 LLM calls; the chosen focus + instructions were sent': noCallOnFocusChange && focusSent,
    'refresh + leaving and returning to the performance page => 0 LLM calls': noCallOnRefreshOrReturn,
    'double-click Generate (+ a click while loading) => exactly 1 LLM call; button disabled while loading': doubleClickOneCall,
    'reloading after an analysis does not regenerate it (0 calls)': noAutoRegenerate,
    'teacher built a multiple-select + numerical test in the UI (answer key shown to the teacher)': teacherTypes === 'multi_select,numerical' && numericKeyShown,
    'student saw checkboxes and no numeric answer key before submitting': studentNoKey,
    'multiple-select (exact set) + numerical ("042" = 42) graded 2/2 on the server': /2\/2/.test(typesScore) && typesOutcomes === 'correct,correct',
    'no question-generation LLM call for the manual test': genCallsOriginalFlow === 1,
    'assignments: teacher drafted 3 questions (tally 10 / 10), saved, published; editor locked after publishing': tallyOk && draftSaved?.status === 'draft' && draftSaved?.n === 3 && lockedAfterPublish,
    'assignments: student saw it as "Not submitted", uploaded a synthetic PDF, got "Assignment submitted successfully."': listedNotSubmitted && submittedShown,
    'assignments: the PDF was stored byte-identical under a server-generated name in the TEMP store only': storedOk,
    'assignments: teacher dashboard shows the submitted student AND the not-submitted classmate': dashboardOk,
    'assignments: ZERO AI calls in the whole assignment flow': zeroAiInAssignments,
    'AI evaluation: ZERO evaluation calls before the explicit click (fake provider would fail); status "Not evaluated"': noEvalBeforeClick,
    'AI evaluation: double-click => exactly ONE provider call; "Evaluating... Ns" shown with the button disabled': oneEvalCall && loadingShown && evalCalls() === 1,
    'AI evaluation: suggestion panel (per-question, total 7 / 10, feedback, limitations); final marks untouched': panelOk && aiNotFinal.ai_marks === 7 && aiNotFinal.final_marks === null && aiNotFinal.status === 'submitted',
    'AI evaluation: payload has no student/teacher name, e-mail, title, class or path (name in the PDF redacted)': evalPrivacy,
    'AI evaluation: Accept only pre-fills; teacher changed Q1 and saved => final 8 (AI 7 kept separately)': acceptSavedNothing && finalAuthoritative,
    'AI evaluation: student sees only the teacher-approved marks/feedback, no AI suggestion': studentSeesFinalOnly,
    'AI evaluation: no early evaluation calls at any time': earlyEvaluationCalls.length === 0,
    'report PDF: "Download PDF" saves a real PDF (named for the student) with no extra AI call': pdfOk && pdfNoAiCall,
    '"Generate this assessment": generator opens pre-filled from the suggestion, with NO AI call on arrival': prefillOk && noCallOnPrefill,
    '"Save & assign": one generation call, then the test is published in the student\'s class': assignedOk,
    'Assign to (normal test): popup lists the class, default = whole class, published with no recipient rows': publishDefaultAll && publishedWholeClass,
    'Assign to: Deselect all => 0 selected + Assign disabled; Cancel changed nothing (still draft, reopened with defaults)': noneState && cancelKeptDraft && reopenedAll,
    'Assign to: search by name, individual select, Select all, selected count; published to EXACTLY the chosen student': searchOk && individualOk && allOk && typesRecipients && selectedShown,
    'suggested assessment: the report\'s student is pre-selected (1 selected); opening the popup saved/assigned NOTHING': suggestedDefault && notAssignedYet,
    'suggested assessment: teacher could select the whole class, search + add another student, then assigned exactly the chosen student': addAllOk && addAnotherOk && finalState && nextRecipients,
    'Send to Student: same-tick double-click => shared ONCE, for the right student, zero AI calls': sendOk && sendNoAi,
    'student: "New Performance Report" notification; Download Report => ONE real PDF, zero AI calls, marked read; personalized test listed': notifOk && studentPdfOk && studentNoAi && personalizedListed,
    'live LMS database untouched': liveAfter === liveBefore,
  };
  console.log('\n===== E2E RESULT =====');
  for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  console.log('screenshots:', OUT);
  console.log('unrelated LMS API calls answered 404 by the E2E backend:', [...unrelated].sort().join(', ') || '(none)');
  console.log('native dialogs auto-accepted:', dialogs.length ? dialogs.join(' | ') : '(none)');
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
  if (process.argv.includes('--keep-open')) await sleep(10 * 60 * 1000);
}

// Helpers injected into every page: React-compatible value setter, button lookup, auto-accept confirms.
const HELPERS = `
  window.confirm = () => true;
  window.__e2e = {
    /** A user can only reach what is visible and on top: fail loudly if something covers the element. */
    reachable(el) {
      if (!el) throw new Error('element not found');
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const ok = top && (top === el || el.contains(top) || (el.labels && [...el.labels].some((l) => l.contains(top))));
      if (!ok) throw new Error('element is covered by ' + (top ? top.tagName + '.' + String(top.className).slice(0, 60) : 'nothing'));
      return el;
    },
    click(el) { this.reachable(el).click(); return true; },
    canReach(el) { try { this.reachable(el); return true; } catch { return false; } },
    set(el, value) {
      this.reachable(el);
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    },
    /** "Assign to" popup: the checkbox of one student (by name), and "Name:1|Name:0" for every listed student. */
    assignBox(name) { return [...document.querySelectorAll('[data-testid=aia-assign-student]')].find((b) => b.nextElementSibling.textContent.includes(name)) || null; },
    assignState() { return [...document.querySelectorAll('[data-testid=aia-assign-student]')].map((b) => b.nextElementSibling.textContent + (b.checked ? ':1' : ':0')).join('|'); },
    assignCount() { const c = document.querySelector('[data-testid=aia-assign-count]'); return c ? c.innerText : ''; },
    button(text, contains, includeDisabled) {
      return [...document.querySelectorAll('button')].find((b) => (includeDisabled || !b.disabled) && (contains ? b.innerText.includes(text) : b.innerText.trim() === text)) || null;
    },
  };`;

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method && listeners.has(msg.method)) listeners.get(msg.method)(msg.params);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = async (method, params = {}) => {
    await ready;
    return new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => { pending.delete(n); reject(new Error(`DevTools call timed out: ${method}`)); }, 30000);
      pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  };
  cleanups.push(() => ws.close());
  return ready.then(() => ({
    send,
    on(method, fn) { listeners.set(method, fn); },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    },
  }));
}

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${what}${typeof last === 'string' ? ` (${last})` : ''}`);
}

function waitForHttp(url, ms) {
  return waitFor(() => new Promise((resolve) => {
    http.get(url, (res) => { res.resume(); resolve(res.statusCode < 500); }).on('error', () => resolve(false));
  }), ms, url);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

main()
  .catch(async (err) => { console.error('[e2e] FAILED:', err.message); if (failureHook) await failureHook(); process.exitCode = 1; })
  .finally(() => { for (const c of cleanups.reverse()) { try { c(); } catch { /* best effort */ } } setTimeout(() => process.exit(), 2500); });
