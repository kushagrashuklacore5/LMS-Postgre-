const express = require("express");
const router = express.Router();
const { runToolCalls, capabilitiesFor } = require("../helpers/assistantTools");
const conversation = require("../helpers/assistantContext");

/**
 * Help assistant (universalChatbot) for signed-in users.
 *
 * The chat widget calls these routes instead of the chatbot server, so the user's session is checked
 * by the API gate like every other route. The role and school sent to the chatbot come from req.user,
 * which authMiddleware loads from the database; anything the browser sends about its role is ignored.
 * The chatbot accepts that context only with CHATBOT_CALLER_KEY (header X-Caller-Key).
 *
 * The paths mirror the chatbot API (/api/v1/...) so the widget works unchanged with
 * data-api-base="<LMS>/api/assistant".
 *
 * Live data: a question about records may come back from the chatbot as tool calls. They are run
 * here as the signed-in user (helpers/assistantTools.js) and sent back once for the final answer;
 * one round only, so the model cannot loop.
 *
 * Follow-ups ("the first one", "next page") use a short conversation context kept here per account,
 * role, school and widget session (helpers/assistantContext.js). It only names records; it never
 * grants access to them.
 */

const TIMEOUT_MS = 290_000; // the local model can take minutes; just under Node's 300 s request timeout
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_QUESTION = 2000; // same as the chatbot's RAG_MAX_QUESTION_CHARS

// LMS role -> the chatbot's role names (config/apps.json "roles"). "teacher" is the older name of "mentor".
const CHATBOT_ROLE = {
  admin: "admin",
  mentor: "teacher",
  teacher: "teacher",
  student: "student",
  accountant: "accountant",
  storekeeper: "storekeeper",
  vendor: "vendor",
  superadmin: "superadmin",
};

const config = () => ({
  base: (process.env.CHATBOT_URL || "http://127.0.0.1:8000").replace(/\/$/, ""),
  appId: process.env.CHATBOT_APP_ID || "default",
  key: process.env.CHATBOT_CALLER_KEY || "",
});

// Same error shape as the chatbot, so the widget shows the message.
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

class ChatbotError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

/** One call to the chatbot; resolves to { status, data } or throws ChatbotError. */
async function callChatbot(url, init, signal) {
  let response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (err) {
    const timedOut = err.name === "TimeoutError";
    console.error("Assistant:", timedOut ? "chatbot timed out" : `chatbot unreachable (${err.message})`);
    throw timedOut
      ? new ChatbotError(504, "assistant_timeout", "The answer took too long. Please try again.")
      : new ChatbotError(503, "assistant_unavailable", "The help assistant is not available right now.");
  }
  const data = await response.json().catch(() => null);
  if (!data) throw new ChatbotError(502, "assistant_bad_response", "The help assistant gave no answer. Please try again.");
  return { status: response.status, data };
}

const sendError = (res, err) => {
  if (err instanceof ChatbotError) return fail(res, err.status, err.code, err.message);
  console.error("Assistant error:", err.message);
  return fail(res, 502, "assistant_bad_response", "The help assistant gave no answer. Please try again.");
};

// Welcome text and example questions (always the configured app, whatever id the widget asks for)
router.get("/api/v1/apps/:appId", async (req, res) => {
  const { base, appId } = config();
  try {
    const { status, data } = await callChatbot(`${base}/api/v1/apps/${encodeURIComponent(appId)}`, { method: "GET" }, AbortSignal.timeout(TIMEOUT_MS));
    res.status(status).json(data);
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/api/v1/chat", async (req, res) => {
  const { base, appId, key } = config();
  if (!key) return fail(res, 503, "assistant_not_configured", "The help assistant is not set up on this server.");

  const { question, session_id: sessionId } = req.body || {};
  if (typeof question !== "string" || !question.trim()) return fail(res, 400, "empty_question", "Question is empty.");
  if (question.length > MAX_QUESTION) {
    return fail(res, 400, "question_too_long", `Question is longer than ${MAX_QUESTION} characters.`);
  }
  if (sessionId != null && !SESSION_ID.test(String(sessionId))) {
    return fail(res, 400, "invalid_request", "Invalid session id.");
  }

  const role = CHATBOT_ROLE[req.user.role];
  if (!role) return fail(res, 403, "role_not_supported", "The help assistant is not available for this account.");

  // capabilities: the record types and relations this role can read, so the model is offered only those
  const body = { question, app_id: appId, user_role: role, tools: true, capabilities: capabilitiesFor(req.user.role) };
  if (sessionId != null) body.session_id = String(sessionId);
  if (req.user.universityId != null) body.tenant_id = String(req.user.universityId);
  const context = conversation.contextFor(req.user, sessionId);
  if (context) body.context = context;

  const signal = AbortSignal.timeout(TIMEOUT_MS); // both steps share one deadline
  const post = (payload) =>
    callChatbot(`${base}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Caller-Key": key },
      body: JSON.stringify(payload),
    }, signal);

  const started = Date.now();
  const lap = (from) => Date.now() - from;
  try {
    const first = await post(body);
    const calls = first.data?.tool_calls;
    if (first.status !== 200 || !Array.isArray(calls) || calls.length === 0) {
      console.log(`Assistant: help answer status=${first.status} ms=${lap(started)}`);
      if (first.status === 200) conversation.remember(req.user, sessionId);
      return res.status(first.status).json(first.data);
    }
    const planMs = lap(started);
    // The tools run with the user's own session against this server, so its permission checks apply.
    const ctx = {
      origin: `http://127.0.0.1:${req.socket.localPort}`,
      authorization: req.headers.authorization,
      role: req.user.role,
      userId: req.user.userId,
      allowedIds: conversation.allowedIdsFor(question, context),
    };
    const toolsStart = Date.now();
    const results = await runToolCalls(ctx, calls);
    const toolsMs = lap(toolsStart);
    const answerStart = Date.now();
    const second = await post({ ...body, tools: false, tool_calls: calls, tool_results: results });
    if (second.status === 200 && second.data?.tool_calls) {
      throw new Error("chatbot asked for a second tool round");
    }
    // Tool names and timings only: no question text, arguments or records (they may name students).
    console.log(`Assistant: tools=${calls.map((c) => c.name).join(",")} plan_ms=${planMs} tools_ms=${toolsMs} answer_ms=${lap(answerStart)} total_ms=${lap(started)} status=${second.status}`);
    if (second.status === 200) conversation.remember(req.user, sessionId, calls, results);
    res.status(second.status).json(second.data);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
module.exports.CHATBOT_ROLE = CHATBOT_ROLE;
