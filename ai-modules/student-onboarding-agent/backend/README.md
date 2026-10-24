# backend/ — Student Onboarding Agent

Express server with `GET /health`, `POST /agent/run` and `POST /import/parse`,
plus the provider-agnostic agent orchestration layer, a deterministic Excel
parser, a deterministic student data validator and LLM-assisted column
mapping. The validator and the mapping are services only, with no endpoints.
No tools, email, database or LMS connection yet.

## Current layout

```
backend/src/
├── server.js                      # loads this module's .env, reads SOA_PORT (default 5055), starts listening
├── app.js                         # createApp({ agent, importConfig, importService }): routes, JSON 404 + error handler
├── config.js                      # loadImportConfig(): SOA_IMPORT_MAX_FILE_MB, SOA_IMPORT_MAX_ROWS
├── errors.js                      # ValidationError (code + HTTP status, 400 by default, with details)
├── routes/
│   ├── agentRoutes.js             # POST /agent/run → AgentContext.fromRequest → agent.run
│   └── importRoutes.js            # POST /import/parse: multer (memory) → ExcelImportService → 20-row preview
├── import/
│   ├── ExcelImportService.js      # XLSX buffer → headers + rows (no semantic interpretation)
│   ├── xlsxContainer.js           # pre-load ZIP checks: real XLSX, no macros, zip-bomb guard
│   ├── importJobStates.js         # job states + allowed transitions
│   ├── ImportJobStore.js          # store contract + InMemoryImportJobStore (copies, versions, immutability)
│   ├── ImportReview.js            # deterministic review: issues, blocking rules, readiness
│   └── ImportJobService.js        # start → review → human decisions (via the guard) → final validation → approve
├── mapping/
│   ├── ColumnMappingContract.js   # proposal shape + statuses; targets/forbidden names derived from the schema
│   ├── ColumnMappingGuard.js      # checks a mapping proposal; per-column acceptance; never repairs, never trusts confidence
│   ├── SampleMasker.js            # exact headers + a few masked sample values (the only data the LLM sees)
│   ├── MappingPrompt.js           # provider-neutral prompt from the schema contract
│   ├── CanonicalRowBuilder.js     # accepted mapping + Excel rows -> canonical rows (rowNumber kept)
│   └── ColumnMappingService.js    # mapImport(): mask -> prompt -> LLM -> strict JSON -> guard -> canonical rows
├── validation/
│   ├── studentSchema.js           # loads + strictly checks config/studentSchema.json
│   ├── formats.js                 # email / phone / date rules named by the schema
│   └── StudentDataValidator.js    # canonical rows → per-row errors/warnings + normalized data
├── agent/
│   ├── StudentOnboardingAgent.js  # orchestrator; LLM provider + ToolRegistry injected
│   └── AgentContext.js            # validated, normalized state for one onboarding operation
├── llm/
│   ├── LLMProvider.js             # provider contract: name + generate(prompt, options); LLMProviderError
│   ├── createLLMProvider.js       # the only place that picks a vendor, from SOA_LLM_PROVIDER
│   └── providers/gemini/          # GeminiProvider (REST via fetch, no SDK); openai/huggingface later
├── tools/
│   ├── ToolRegistry.js            # tool contract, create/read only, forbidden names, frozen tools, lock()
│   ├── ToolExecutor.js            # lookup → access check → validateInput → execute(context, args)
│   └── onboarding/                # createStudent, assignStudentToClassroom (create-only, locked registry)
├── execution/
│   └── ApprovedImportExecutor.js  # executeApprovedImport(jobId): approved jobs only; idempotency boundary
└── adapters/lms/
    ├── LmsAdapter.js              # interface: createStudent, assignStudentToClassroom (+ frozen facade)
    ├── FakeLmsAdapter.js          # deterministic in-memory LMS (Step 8)
    ├── SqliteLmsAdapter.js        # real adapter for the LMS SQLite DB (Step 9B; needs the migration below)
    └── migrations/001_soa_idempotency_keys.sql   # PROPOSED, not applied
```

## How the pieces fit

```
HTTP request
   │
   ▼
routes/agentRoutes.js      Express only; no business logic
   │  AgentContext.fromRequest(body)   → ValidationError → 400
   ▼
agent/StudentOnboardingAgent.run(context)
   │  uses injected llmProvider (none yet) and toolRegistry (empty)
   ▼
structured result JSON
```

- **StudentOnboardingAgent** has no dependency on Express, the LMS or any LLM
  vendor. Build it with `new StudentOnboardingAgent({ llmProvider, toolRegistry })`;
  both are optional. One instance serves all requests, so per-run state lives
  on the `AgentContext`, not on the agent.
- **run(context)** currently only validates that it received an `AgentContext`
  and reports what is configured. Status is `provider_not_configured` when no
  provider is injected, or `orchestration_not_implemented` when one is. In
  both cases the provider is **not called** and no tool runs.
- **AgentContext** fields: `requestId`, `source`, `students`, `validation`
  (`errors`, `warnings`), `status`, `metadata`, `createdAt`.
- **LLMProvider** is an abstract base class plus `LLMProvider.assertValid()`,
  which checks shape (not inheritance), so providers are loosely coupled.
- **ToolRegistry** rejects empty or duplicate names, tools without
  `execute()`/`description`, and any access level other than `read`/`create`.

`app.js` exports `createApp()` without starting a server, so the app can be
tested directly, given a different agent (`createApp({ agent })`), or mounted
into the LMS later without changes.

## Planned additions under `src/` (subject to change)

```
├── llm/providers/openai/, huggingface/   # further providers behind the same contract
├── email/          # onboarding/verification email triggers
├── progress/       # job progress tracking
├── reporting/      # audit + import reports
└── (integration)   # building the verified admin actor from LMS auth, and mounting routes
```
