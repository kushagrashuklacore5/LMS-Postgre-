/**
 * Short-lived conversation context for the help assistant, so follow-ups work:
 * "Show my courses" -> "Who teaches the first one?" / "Show the next page" / "What about its live classes?".
 *
 * What is kept, per conversation, in this server's memory only:
 *   - the records shown in the last answer that listed some (record type, id, label; at most 20),
 *   - the record the conversation is about (the last single record shown),
 *   - the last list request (tool and validated arguments, total, page) for "next page",
 *   - how many turns ago they were shown, so an old list is not assumed after the topic changed.
 * No question text, answers or other fields are stored.
 *
 * A conversation is the widget's session id combined with the account, its role and its school, so
 * another user (or the same user after a role or school change) never sees this context. Context only
 * says which record the user means: every tool still runs with the user's own session, and the record
 * is checked again by the endpoint that reads it. Entries expire after 30 idle minutes; at most
 * MAX_CONVERSATIONS are kept (the least recently used is dropped first).
 */

const TTL_MS = 30 * 60 * 1000;
const MAX_CONVERSATIONS = 500;
const MAX_REFS = 20;
const MAX_LABEL = 80;
const STALE_AFTER_TURNS = 3; // refs not used for this many turns are dropped

const conversations = new Map(); // key -> { expires, turn, refs, refsTurn, focus, focusTurn, lastList }

function keyFor(user, sessionId) {
  if (!sessionId) return null;
  const account = user.userId ?? `sa${user.superadminId}`;
  return JSON.stringify([account, user.role, user.universityId ?? null, String(sessionId)]);
}

function load(key, now = Date.now()) {
  if (!key) return null;
  const entry = conversations.get(key);
  if (!entry) return null;
  if (entry.expires <= now) {
    conversations.delete(key);
    return null;
  }
  return entry;
}

const label = (v) => String(v ?? "").slice(0, MAX_LABEL);

/** The context sent to the chatbot for this turn (bounded, labels cut), or null. */
function contextFor(user, sessionId, now = Date.now()) {
  const entry = load(keyFor(user, sessionId), now);
  if (!entry) return null;
  const fresh = (turn) => entry.turn - turn < STALE_AFTER_TURNS;
  const refs = entry.refs.length && fresh(entry.refsTurn) ? entry.refs : [];
  const focus = entry.focus && fresh(entry.focusTurn) ? entry.focus : null;
  const lastList = entry.lastList && fresh(entry.lastList.turn) ? entry.lastList : null;
  if (!refs.length && !focus && !lastList) return null;
  return {
    results: refs.map((r, i) => ({ n: i + 1, record_type: r.record_type, id: r.id, label: r.label })),
    focus,
    last_list: lastList && { tool: lastList.tool, args: lastList.args, total: lastList.total, page: lastList.page, has_more: lastList.has_more },
  };
}

/** Ids of `type` this conversation may name: written in the question or shown earlier in it. */
function allowedIdsFor(question, context) {
  const written = new Set((String(question).match(/\d+/g) || []).map(Number));
  return (type) => {
    const ids = new Set(written);
    for (const r of context?.results || []) if (r.record_type === type) ids.add(r.id);
    if (context?.focus?.record_type === type) ids.add(context.focus.id);
    return ids;
  };
}

const refOf = (type, r) => (r && Number.isInteger(Number(r.id)) && r.id !== undefined ? { record_type: type, id: Number(r.id), label: label(r.title ?? r.name ?? r.label ?? r.studentName ?? r.date ?? r.id) } : null);

/** Remember what this turn showed. `calls` and `results` are the validated tool round, if any. */
function remember(user, sessionId, calls = [], results = [], now = Date.now()) {
  const key = keyFor(user, sessionId);
  if (!key) return;
  const entry = load(key, now) || { turn: 0, refs: [], refsTurn: 0, focus: null, focusTurn: 0, lastList: null };
  entry.turn += 1;
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const call of calls) {
    const data = byId.get(call.id)?.ok ? byId.get(call.id).data : null;
    if (!data) continue;
    if (Array.isArray(data.records)) {
      const type = data.related_type ?? data.record_type;
      const refs = data.records.map((r) => refOf(r.record_type ?? type, r)).filter(Boolean).slice(0, MAX_REFS);
      // A relation that gives back one record (a course's teacher) is an answer about the record in focus: the
      // list the user is working through ("the second course", "next page") stays.
      const isRelation = Boolean(data.of);
      const replacesList = !isRelation || refs.length > 1;
      if (refs.length && replacesList) Object.assign(entry, { refs, refsTurn: entry.turn });
      if (isRelation) {
        Object.assign(entry, { focus: refOf(data.record_type, data.of), focusTurn: entry.turn, refsTurn: entry.turn });
        if (entry.lastList) entry.lastList.turn = entry.turn; // still the list in use
      }
      else if (refs.length === 1) Object.assign(entry, { focus: refs[0], focusTurn: entry.turn });
      if (replacesList && (call.name === "listRecords" || call.name === "getRelatedRecords")) {
        entry.lastList = { tool: call.name, args: call.args, total: data.total, page: data.page, has_more: data.has_more, turn: entry.turn };
      }
    } else if (Array.isArray(data.candidates)) {
      const refs = data.candidates.map((r) => refOf(data.record_type, r)).filter(Boolean);
      if (refs.length) Object.assign(entry, { refs, refsTurn: entry.turn });
    } else {
      const one = refOf(data.record_type, data.record ?? data);
      if (one) Object.assign(entry, { focus: one, focusTurn: entry.turn });
    }
  }
  entry.expires = now + TTL_MS;
  conversations.delete(key); // re-insert: Map order is the least-recently-used order
  conversations.set(key, entry);
  while (conversations.size > MAX_CONVERSATIONS) conversations.delete(conversations.keys().next().value);
}

const clearAll = () => conversations.clear();
const size = () => conversations.size;

module.exports = { contextFor, allowedIdsFor, remember, keyFor, clearAll, size, TTL_MS, MAX_CONVERSATIONS };
