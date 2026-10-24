/**
 * Notification text: templates, validation of AI/user wording, and the Hugging Face fallback.
 * No real AI call is made: the provider is a stub, and the Hugging Face provider is exercised
 * with a fake fetch.
 *
 *   node --test tests/notificationText.test.js      (from the server folder)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { fallbackText, sanitizeMessage, generateText, NOTIFICATION_TYPES } = require('../services/notificationText');

const LLM = path.join(__dirname, '..', '..', 'ai-modules', 'ai-assessment-agent', 'backend', 'src', 'llm');
const { loadGenerationConfig } = require(path.join(LLM, 'generationConfig'));
const { createGenerationProvider } = require(path.join(LLM, 'createGenerationProvider'));

const PLACEHOLDER = 'x'.repeat(40);
const FAKE_TOKEN = 'hf_' + 'A1b2C3d4E5'.repeat(3); // right format, not a real credential
const HF_ENV = { AIA_LLM_PROVIDER: 'huggingface', AIA_LLM_MODEL: 'org/model:provider' };

const stubProvider = (reply, { configured = true } = {}) => ({
  calls: 0,
  isConfigured: () => configured,
  async generateJson() {
    this.calls++;
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply() : reply;
  },
});

/* ---------------- templates ---------------- */
test('every notification type has a deterministic title and message', () => {
  for (const type of NOTIFICATION_TYPES) {
    const text = fallbackText(type, { title: 'Unit 3 Physics', deadline: '2026-10-12T00:00:00', date: '2026-03-15T10:00:00', studentName: 'Asha', teacherName: 'Mr Rao' });
    assert.ok(text.title.length > 0, type);
    assert.ok(text.message.length >= 10 && text.message.length <= 200, `${type}: ${text.message}`);
    assert.ok(!/undefined|null|\{|\}/.test(text.message), `${type}: ${text.message}`);
  }
});

test('templates follow the agreed wording', () => {
  assert.equal(
    fallbackText('ASSESSMENT_PUBLISHED', { title: 'Unit 3 Physics', deadline: '2026-10-12T00:00:00' }).message,
    "An assessment titled 'Unit 3 Physics' is now available. Complete it by 12 October."
  );
  assert.equal(
    fallbackText('CALENDAR_EVENT', { title: 'Holi Celebration', date: '2026-03-15T10:00:00' }).message,
    "'Holi Celebration' is scheduled for 15 March at 10:00 AM. Please check the calendar for details."
  );
  assert.equal(
    fallbackText('ASSIGNMENT_PUBLISHED', { title: 'Essay' }).message,
    "You have a new assignment: 'Essay'."
  );
});

test('an unknown type is refused', () => {
  assert.throws(() => fallbackText('DROP_TABLE', { title: 'x' }));
});

/* ---------------- validation ---------------- */
test('sanitizeMessage accepts a short plain sentence', () => {
  assert.equal(sanitizeMessage('  "Unit 3 Physics is now available."  '), 'Unit 3 Physics is now available.');
});

test('sanitizeMessage rejects links, markup, placeholders, JSON and bad lengths', () => {
  assert.equal(sanitizeMessage('See https://evil.example/login to continue now'), null);
  assert.equal(sanitizeMessage('Visit www.evil.example for your result today'), null);
  assert.equal(sanitizeMessage('Hello {studentName}, your test is ready now'), null);
  assert.equal(sanitizeMessage('{"message":"Unit 3 Physics is ready"}'), null);
  assert.equal(sanitizeMessage('Result ready [click here] to open it'), null);
  assert.equal(sanitizeMessage('short'), null);
  assert.equal(sanitizeMessage('a'.repeat(181)), null);
  assert.equal(sanitizeMessage(42), null);
  assert.equal(sanitizeMessage(null), null);
});

test('sanitizeMessage strips markup and control characters before checking', () => {
  assert.equal(sanitizeMessage('<b>Unit 3 Physics</b> is\nnow available.'), 'Unit 3 Physics is now available.');
});

test('sanitizeMessage can require the title to be present', () => {
  assert.equal(sanitizeMessage('A new test is available for you.', { mustInclude: ['Unit 3 Physics'] }), null);
  assert.ok(sanitizeMessage('unit 3 physics is available for you.', { mustInclude: ['Unit 3 Physics'] }));
});

/* ---------------- AI text + fallback ---------------- */
test('a valid AI sentence is used', async () => {
  const provider = stubProvider(JSON.stringify({ message: 'Unit 3 Physics assessment is now available. Complete it by 12 October.' }));
  const text = await generateText('ASSESSMENT_PUBLISHED', { title: 'Unit 3 Physics', deadline: '2026-10-12T00:00:00' }, { provider });
  assert.equal(text.source, 'ai');
  assert.equal(text.message, 'Unit 3 Physics assessment is now available. Complete it by 12 October.');
  assert.equal(text.title, 'New Assessment'); // the title is never taken from the AI
  assert.equal(provider.calls, 1);
});

test('provider failure falls back to the template and does not throw', async () => {
  const failure = Object.assign(new Error('The AI service is unavailable.'), { code: 'UNAVAILABLE' });
  const text = await generateText('ASSESSMENT_PUBLISHED', { title: 'Unit 3 Physics' }, { provider: stubProvider(failure) });
  assert.equal(text.source, 'template');
  assert.equal(text.message, "An assessment titled 'Unit 3 Physics' is now available.");
});

test('a slow provider is abandoned after the timeout', async () => {
  const provider = {
    isConfigured: () => true,
    generateJson: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  };
  const started = Date.now();
  const text = await generateText('CALENDAR_EVENT', { title: 'Holi Celebration' }, { provider, timeoutMs: 60 });
  assert.equal(text.source, 'template');
  assert.ok(Date.now() - started < 2000);
});

test('unusable AI output falls back to the template', async () => {
  const data = { title: 'Unit 3 Physics' };
  const bad = [
    'not json at all',
    JSON.stringify({ message: 'Open https://evil.example now to see Unit 3 Physics' }),
    JSON.stringify({ message: 'A new test is ready.' }), // does not mention the title
    JSON.stringify({ message: 'x' }),
    JSON.stringify({ message: `Unit 3 Physics ${'very '.repeat(60)}long` }),
    JSON.stringify({ text: 'Unit 3 Physics is available now.' }), // wrong field
    JSON.stringify({ message: { nested: 'Unit 3 Physics' } }),
  ];
  for (const reply of bad) {
    const text = await generateText('ASSESSMENT_PUBLISHED', data, { provider: stubProvider(reply) });
    assert.equal(text.source, 'template', reply.slice(0, 40));
    assert.equal(text.message, "An assessment titled 'Unit 3 Physics' is now available.");
  }
});

test('the AI is not called when it is not configured, or for types that never use AI', async () => {
  const off = stubProvider('{}', { configured: false });
  assert.equal((await generateText('ASSESSMENT_PUBLISHED', { title: 'Unit 3 Physics' }, { provider: off })).source, 'template');
  assert.equal(off.calls, 0);

  const on = stubProvider(JSON.stringify({ message: 'Essay is overdue, hurry up please.' }));
  assert.equal((await generateText('ASSIGNMENT_MISSED', { title: 'Essay' }, { provider: on })).source, 'template');
  assert.equal(on.calls, 0);

  assert.equal((await generateText('CALENDAR_EVENT', { title: 'Holi' }, { provider: null })).source, 'template');
});

/* ---------------- Hugging Face configuration ---------------- */
test('HF_TOKEN is the variable read for Hugging Face; the placeholder keeps AI off', () => {
  const placeholder = loadGenerationConfig({ ...HF_ENV, HF_TOKEN: PLACEHOLDER });
  assert.equal(placeholder.provider, 'huggingface');
  assert.equal(placeholder.configured, false);
  assert.equal(placeholder.reason, 'API_KEY_INVALID_FORMAT');
  assert.equal(createGenerationProvider(placeholder).isConfigured(), false);

  const missing = loadGenerationConfig({ ...HF_ENV });
  assert.equal(missing.reason, 'API_KEY_MISSING');

  const real = loadGenerationConfig({ ...HF_ENV, HF_TOKEN: FAKE_TOKEN });
  assert.equal(real.configured, true);
  assert.equal(real.apiKey, FAKE_TOKEN);
});

test('the token is not exposed when the configuration or provider is printed', () => {
  const config = loadGenerationConfig({ ...HF_ENV, HF_TOKEN: FAKE_TOKEN });
  const provider = createGenerationProvider(config, { fetchImpl: async () => ({}) });
  const util = require('util');
  for (const dump of [JSON.stringify(config), util.inspect(config), JSON.stringify(provider), util.inspect(provider)]) {
    assert.ok(!dump.includes(FAKE_TOKEN), 'token leaked into a printable form');
  }
});

test('Hugging Face provider: token goes only in the Authorization header; nothing is logged', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ message: 'Holi Celebration is scheduled for 15 March at 10:00 AM.' }) } }] }),
    };
  };
  const provider = createGenerationProvider(loadGenerationConfig({ ...HF_ENV, HF_TOKEN: FAKE_TOKEN }), { fetchImpl });

  const logged = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args) => logged.push(args.map(String).join(' '));
  let text;
  try {
    text = await generateText('CALENDAR_EVENT', { title: 'Holi Celebration', date: '2026-03-15T10:00:00' }, { provider });
  } finally {
    Object.assign(console, original);
  }

  assert.equal(text.source, 'ai');
  assert.equal(text.message, 'Holi Celebration is scheduled for 15 March at 10:00 AM.');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${FAKE_TOKEN}`);
  assert.ok(!requests[0].url.includes(FAKE_TOKEN));
  assert.ok(!requests[0].options.body.includes(FAKE_TOKEN));
  assert.ok(!logged.join('\n').includes(FAKE_TOKEN));
});

test('Hugging Face provider error (rejected credentials): template is used and the token is not logged', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ error: `bad token ${FAKE_TOKEN}` }) });
  const provider = createGenerationProvider(loadGenerationConfig({ ...HF_ENV, HF_TOKEN: FAKE_TOKEN }), { fetchImpl });

  const logged = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logged.push(args.map(String).join(' '));
  let text;
  try {
    text = await generateText('ASSIGNMENT_PUBLISHED', { title: 'Essay' }, { provider });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(text.source, 'template');
  assert.equal(text.message, "You have a new assignment: 'Essay'.");
  assert.ok(logged.length >= 1);
  assert.ok(!logged.join('\n').includes(FAKE_TOKEN));
});
