# llm/providers/ — Student Onboarding Agent

Concrete LLM providers. Each satisfies the contract in
[`../LLMProvider.js`](../LLMProvider.js):

```
name: string
generate(prompt, { responseFormat: 'json', temperature, signal }) -> Promise<string>
```

- **`responseFormat: 'json'`** requests the provider's JSON mode, where one
  exists. Callers still parse strictly and run the guardrails, because JSON
  mode is a request, not a guarantee.
- **`temperature: 0`** gives the most repeatable answers.
- **`signal`** is an AbortSignal, used for timeouts.
- **Failures:** providers throw `LLMProviderError` with a fixed message and a
  `code`. The message never contains the API key, the request body or the
  raw response.

| Provider | Status |
|---|---|
| `gemini/GeminiProvider.js` | Implemented. REST `generateContent` via built-in `fetch` (no SDK). Key in the `x-goog-api-key` header, never the URL. JSON mode via `responseMimeType`. **Covered by tests with a fake `fetch` only; not yet run against the live API.** |
| `openai/` | Planned |
| `huggingface/` | Planned |

## Selecting a provider

[`../createLLMProvider.js`](../createLLMProvider.js) reads the settings from
`loadLlmConfig()` (this module's `.env`: `SOA_LLM_PROVIDER`, `SOA_LLM_MODEL`,
`SOA_GEMINI_API_KEY`, `SOA_LLM_TIMEOUT_MS`). It returns `{ provider, reason }`,
where `provider` is `null` with a reason when something is missing. There is
no default model: `SOA_LLM_MODEL` must be set.

Business code (mapping, agent) receives the provider by injection and never
names a vendor. Adding OpenAI or Hugging Face means adding a provider here and
a case in the factory; mapping logic does not change.

## Trying Gemini for real (opt-in)

```bash
# in this module's .env: SOA_LLM_PROVIDER=gemini, SOA_LLM_MODEL=<model>, SOA_GEMINI_API_KEY=<key>
npm run mapping:manual
```

This runs the mapping flow on a small **synthetic** header set (no real
student data) and prints only the per-column decisions. It is not part of
`npm test`, which never makes network calls.

## huggingface (`huggingface/HuggingFaceProvider.js`)

The module's own small adapter (it shares no code with other modules): Hugging Face Inference Providers,
OpenAI-compatible chat completions at `https://router.huggingface.co/v1/chat/completions`.

| Variable | Meaning |
|---|---|
| `SOA_LLM_PROVIDER=huggingface` | selects it |
| `SOA_HUGGINGFACE_MODEL` | required, no default: `org/model` or `org/model:inference-provider`, e.g. `Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra` |
| `SOA_HUGGINGFACE_API_KEY` | the access token (`hf_...`); if empty, `HF_TOKEN` from the same server `.env` is used |
| `SOA_LLM_TIMEOUT_MS` | per-request timeout (default 30000), enforced by `ColumnMappingService` |

- The token is sent only in the `Authorization` header, is non-enumerable, and never appears in errors
  (fixed texts + HTTP status; an error response body is never read).
- One request per upload; no retries, no background calls, no database access.
- JSON is requested through the prompt (no `response_format`, so every routed inference provider accepts
  the request). The answer is parsed strictly; `ColumnMappingGuard`, the confidence rule and
  `SampleShapeCheck` decide what is used. Failures fall back to manual mapping.
- Tests: `backend/test/HuggingFaceProvider.test.js` (fake fetch; no network).
