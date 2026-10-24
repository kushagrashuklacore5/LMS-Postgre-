# AI Assessment Agent — development rules (cost- and context-efficient)

Short, practical rules for working on this module, including with Claude Code. The README and
`docs/ARCHITECTURE.md` explain *what* the module does. This file covers *how to work on it cheaply and
safely*.

## 1. Where things are (AI paths only)

| Concern | Files |
|---|---|
| Provider + config | `backend/src/llm/HuggingFaceProvider.js`, `createGenerationProvider.js`, `generationConfig.js` |
| Shared call path (timeout, error mapping) | `backend/src/core/ai/AssessmentGenerator.js` (`callProvider`) |
| Throttling | `backend/src/core/ai/GenerationThrottle.js` (instances created in `http/createAssessmentRouter.js`) |
| Question generation | `core/ai/generationRequest.js`, `generationPrompt.js`, `generationTemplates.js`, `generatedOutput.js`, `contentGuard.js` |
| Performance report | `core/ai/PerformanceAnalyst.js`, `analysisSchema.js`, `reportFocus.js`; facts in `core/analytics/` |
| Assignment evaluation | `assignments/AssignmentEvaluator.js`, `evaluationSchema.js`, `pdfText.js`; route in `assignments/assignmentRoutes.js` |
| AI routes | `http/createAssessmentRouter.js` (generate, analysis), `assignments/assignmentRoutes.js` (evaluate-ai) |
| Client AI triggers | `client/src/pages/assessment-agent/AiAssessmentGenerator.jsx`, `AiPerformanceReport.jsx`, `AssignmentSubmissions.jsx` |
| Manual real calls (opt-in) | `tests/manual/realLlmCheck.js`, `realAssignmentEvalCheck.js`, `realGeminiCheck.js` |
| Cost estimate (offline) | `tests/helpers/promptBudget.js`, `tests/manual/estimatePromptCost.js` |

## 2. Context rules

- Inspect only the files in the table above that the change touches, plus their direct imports.
- Search module-locally, e.g. `rg PATTERN ai-modules/ai-assessment-agent/backend/src`. Never search
  `node_modules/`, `data/`, `client/dist/` or other build output. The module's `.gitignore` excludes
  `node_modules/` and `data/`, and ripgrep respects it.
- Don't reread the README or ARCHITECTURE for code you are not changing. Don't reread a file you just edited.
- Print summaries, not logs: pipe test output through `grep -E "^ℹ (tests|pass|fail)|✖"`, and cut long lines.
- Read one focused test file when needed, never the whole `tests/` tree.

## 3. Test ladder: run the lowest level that covers the change

| Level | When | Command |
|---|---|---|
| 1 | The unit you changed | `node --test tests/<area>/<file>.test.js` |
| 2 | Related flow (AI / assignments / integration) | `npm run test:ai` · `npm run test:assignments` · `npm run test:http` |
| 3 | UI or API flow changed | `npm run e2e:browser` (temp DB, fake provider, headless Chrome; ~2–3 min) |
| 4 | Checkpoint / before reporting | `npm test` (the whole module) |
| 5 | Only if shared LMS code or the host mount changed | `server`: `node --test "test/**/*.test.js"`; onboarding: `npm test` there |

Re-run a passing suite only if something it covers changed. The LMS onboarding test "double-clicked
Execute" is intermittent and unrelated: don't touch it.

## 4. AI cost rules (product)

- AI runs **only** on an explicit click: Generate / Regenerate, Generate AI Report / Regenerate / Try
  again, Evaluate with AI / Re-evaluate.
  - Never from page loads, effects, refreshes, filters, focus or template changes, polling or retries.
  - Each trigger has a synchronous `useRef` lock on the client and a per-teacher throttle on the server
    (a second concurrent request gets 429).
- Prompts send compact JSON (no pretty-print). `tests/ai/promptBudget.test.js` guards an approximate input
  budget per flow. Check the profile with `npm run cost:estimate` (offline).
- Don't drop fields the validators rely on (evidence references, question ids, max marks), and don't
  weaken redaction.
- Real provider calls happen only through the manual scripts, with explicit approval. Each one:
  - makes at most ONE network request (a hard guard refuses a second);
  - uses synthetic data, no retries and no database writes;
  - never prints the token.
