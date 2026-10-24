/**
 * Mock LLM provider for tests: NO network, NO real Gemini.
 * `respond` is a string, an Error to throw, or a function (request) => string | Promise<string>.
 */
const { QuestionGenerationProvider, LlmProviderError } = require('../../backend/src/llm/QuestionGenerationProvider');

class MockProvider extends QuestionGenerationProvider {
  constructor(respond, { configured = true } = {}) {
    super('mock');
    this.respond = respond;
    this.configured = configured;
    this.calls = [];
  }

  isConfigured() {
    return this.configured;
  }

  async generateJson(request) {
    this.calls.push(request);
    const r = typeof this.respond === 'function' ? await this.respond(request) : this.respond;
    if (r instanceof Error) throw r;
    return r;
  }
}

/** A provider that only finishes when aborted (to test timeouts). */
const hangingProvider = () => new MockProvider((req) => new Promise((resolve, reject) => {
  req.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
}));

const providerError = (code, status = null) => new LlmProviderError('provider failed', { code, status });

/** One well-formed generated question (the model's format). */
function genQuestion(i, overrides = {}) {
  return {
    question: `Which planet is number ${i + 1} from the Sun in this list of facts?`,
    options: [`Planet alpha ${i}`, `Planet beta ${i}`, `Planet gamma ${i}`, `Planet delta ${i}`],
    correctAnswer: `Planet beta ${i}`,
    explanation: `Planet beta ${i} is correct because of fact ${i}.`,
    difficulty: 'medium',
    ...overrides,
  };
}

/** Model JSON text with n questions; `edit(questions)` may mutate before serialising. */
function genOutput(n, edit) {
  const questions = Array.from({ length: n }, (_, i) => genQuestion(i));
  if (edit) edit(questions);
  return JSON.stringify({ questions });
}

module.exports = { MockProvider, hangingProvider, providerError, genQuestion, genOutput };
