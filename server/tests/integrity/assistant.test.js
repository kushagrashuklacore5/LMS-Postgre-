/**
 * Help assistant proxy (routes/assistantRoutes.js), 22 October 2026.
 *
 * The real chatbot is never called: a small HTTP server in this process stands in for it and records
 * what the LMS sends. These tests prove that only signed-in users get through, that the role and school
 * come from the account (not from the request), and that the caller key is sent server-to-server.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startTestApp } = require('../helpers/testApp');

describe('help assistant proxy', () => {
  let ctx;
  let fake;
  let received = [];
  let reply = { status: 200, body: { answer: 'ok', citations: [], sources: [] } };
  const KEY = 'test-caller-key';

  const ask = (as, body = { question: 'How do I add a student?', session_id: 'abc-123' }) =>
    ctx.api('POST', '/api/assistant/api/v1/chat', { as, body });

  before(async () => {
    fake = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
        const out = typeof reply === 'function' ? reply(received.at(-1).body, received.length) : reply;
        res.writeHead(out.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out.body));
      });
    });
    await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
    ctx = await startTestApp();
    process.env.CHATBOT_URL = `http://127.0.0.1:${fake.address().port}`;
    process.env.CHATBOT_CALLER_KEY = KEY;
  });

  after(async () => {
    delete process.env.CHATBOT_URL;
    delete process.env.CHATBOT_CALLER_KEY;
    await ctx.stop();
    await new Promise((resolve) => fake.close(resolve));
  });

  beforeEach(() => {
    received = [];
    reply = { status: 200, body: { answer: 'ok', citations: [], sources: [] } };
  });

  it('refuses a request without a session and never reaches the chatbot', async () => {
    const r = await ctx.api('POST', '/api/assistant/api/v1/chat', { body: { question: 'How do I add a student?' } });
    assert.equal(r.status, 401);
    assert.equal(received.length, 0);
  });

  it('sends the role and school from the account, with the caller key', async () => {
    const r = await ask('studentA');
    assert.equal(r.status, 200);
    assert.equal(r.body.answer, 'ok');
    assert.equal(received.length, 1);
    const [call] = received;
    assert.equal(call.url, '/api/v1/chat');
    assert.equal(call.headers['x-caller-key'], KEY);
    assert.equal(call.headers.authorization, undefined, 'the user session token is not passed on');
    const { capabilities, ...rest } = call.body;
    assert.deepEqual(rest, { question: 'How do I add a student?', app_id: 'default', user_role: 'student', tools: true, session_id: 'abc-123', tenant_id: String(ctx.ids.schoolA) });
    assert.ok(capabilities.record_types.includes('courses'), 'what a student can read');
  });

  it('maps mentor to the chatbot role teacher and keeps schools apart', async () => {
    await ask('mentorA');
    await ask('adminB');
    assert.equal(received[0].body.user_role, 'teacher');
    assert.equal(received[0].body.tenant_id, String(ctx.ids.schoolA));
    assert.equal(received[1].body.user_role, 'admin');
    assert.equal(received[1].body.tenant_id, String(ctx.ids.schoolB));
  });

  it('ignores a role or school the browser tries to send', async () => {
    await ask('studentA', { question: 'How do I add a student?', user_role: 'admin', tenant_id: '2', app_id: 'other' });
    const { body } = received[0];
    assert.equal(body.user_role, 'student');
    assert.equal(body.tenant_id, String(ctx.ids.schoolA));
    assert.equal(body.app_id, 'default');
  });

  it('rejects an empty or too long question and a bad session id without calling the chatbot', async () => {
    assert.equal((await ask('studentA', { question: '   ' })).status, 400);
    assert.equal((await ask('studentA', { question: 'x'.repeat(2001) })).status, 400);
    assert.equal((await ask('studentA', { question: 'Hi', session_id: '../x' })).status, 400);
    assert.equal(received.length, 0);
  });

  it('passes the chatbot errors on in the same shape', async () => {
    reply = { status: 503, body: { error: { code: 'llm_unavailable', message: 'The AI model service is unavailable.' } } };
    const r = await ask('adminA');
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'llm_unavailable');
  });

  it('answers 503 when the caller key is not configured', async () => {
    delete process.env.CHATBOT_CALLER_KEY;
    try {
      const r = await ask('adminA');
      assert.equal(r.status, 503);
      assert.equal(r.body.error.code, 'assistant_not_configured');
      assert.equal(received.length, 0);
    } finally {
      process.env.CHATBOT_CALLER_KEY = KEY;
    }
  });

  it('answers 503 when the chatbot server is down', async () => {
    const saved = process.env.CHATBOT_URL;
    process.env.CHATBOT_URL = 'http://127.0.0.1:1';
    try {
      const r = await ask('adminA');
      assert.equal(r.status, 503);
      assert.equal(r.body.error.code, 'assistant_unavailable');
    } finally {
      process.env.CHATBOT_URL = saved;
    }
  });

  it('serves the welcome text of the configured app only, for signed-in users', async () => {
    reply = { status: 200, body: { app_id: 'default', name: 'LMS Assistant', welcome_message: 'Hi', example_questions: [] } };
    assert.equal((await ctx.api('GET', '/api/assistant/api/v1/apps/default')).status, 401);
    const r = await ctx.api('GET', '/api/assistant/api/v1/apps/other', { as: 'studentA' });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'LMS Assistant');
    assert.equal(received.at(-1).url, '/api/v1/apps/default');
  });
});
