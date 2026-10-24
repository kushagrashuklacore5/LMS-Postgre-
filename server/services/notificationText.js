const path = require('path');

/**
 * Short notification text.
 *
 * The application decides everything about a notification (recipient, type, target, ids).
 * This file only produces the short human-friendly MESSAGE:
 *   1. a deterministic template (always available), and
 *   2. optionally an AI-written sentence from the configured provider (Hugging Face / Gemini,
 *      through the AI Assessment Agent's existing provider abstraction), validated before use.
 * An AI failure of any kind falls back to the template. It never throws.
 */

const MAX_MESSAGE_LENGTH = 180;
const MAX_TITLE_LENGTH = 120;
const AI_TIMEOUT_MS = 8000;

/* ================= TRUSTED DATA HELPERS ================= */
const cleanText = (value, maxLength = MAX_TITLE_LENGTH) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

// "12 October" or "12 October at 10:00 AM" (time left out when it is midnight)
const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  if (date.getHours() === 0 && date.getMinutes() === 0) return day;
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
};

/* ================= TEMPLATES ================= */
// title = the notification heading. message(d) = the deterministic fallback text.
// ai = whether an AI rewrite may be attempted for this type.
const TEMPLATES = {
  ASSESSMENT_PUBLISHED: {
    title: 'New Assessment',
    ai: true,
    message: (d) =>
      d.deadline
        ? `An assessment titled '${d.title}' is now available. Complete it by ${d.deadline}.`
        : `An assessment titled '${d.title}' is now available.`,
  },
  ASSIGNMENT_PUBLISHED: {
    title: 'New Assignment',
    ai: true,
    message: (d) =>
      d.deadline
        ? `You have a new assignment: '${d.title}'. Please submit it by ${d.deadline}.`
        : `You have a new assignment: '${d.title}'.`,
  },
  ASSIGNMENT_DUE_SOON: {
    title: 'Assignment Due Soon',
    ai: false,
    message: (d) => `'${d.title}' is due soon on ${d.deadline}.`,
  },
  ASSIGNMENT_MISSED: {
    title: 'Assignment Deadline Missed',
    ai: false,
    message: (d) =>
      `You missed the deadline for '${d.title}'. Please check with your teacher if further action is required.`,
  },
  RESULT_AVAILABLE: {
    title: 'Result Available',
    ai: false,
    message: (d) => `Your result for '${d.title}' is now available.`,
  },
  REPORT_SHARED: {
    title: 'Performance Report Shared',
    ai: false,
    message: (d) =>
      d.teacherName
        ? `${d.teacherName} has shared an AI Performance Report with you.`
        : 'Your teacher has shared an AI Performance Report with you.',
  },
  CALENDAR_EVENT: {
    title: 'New Calendar Event',
    ai: true,
    message: (d) =>
      d.date
        ? `'${d.title}' is scheduled for ${d.date}. Please check the calendar for details.`
        : `'${d.title}' has been added to the calendar.`,
  },
  ASSIGNMENT_SUBMITTED: {
    title: 'Assignment Submitted',
    ai: false,
    message: (d) => `${d.studentName || 'A student'} submitted '${d.title}'. It is ready for review.`,
  },
  ATTEMPT_SUBMITTED: {
    title: 'Assessment Attempt Submitted',
    ai: false,
    message: (d) => `${d.studentName || 'A student'} completed '${d.title}'.`,
  },
  ATTENDANCE_PENDING: {
    title: 'Attendance Pending',
    ai: false,
    message: (d) => `Attendance for ${d.title} has not been marked today.`,
  },
  LIVE_CLASS_STARTED: {
    title: 'Live Class Started',
    ai: false,
    message: (d) => `${d.teacherName || 'Your teacher'} has started '${d.title}'. Open this notification to join.`,
  },
  LIVE_CLASS_SCHEDULED: {
    title: 'Live Class Scheduled',
    ai: false,
    message: (d) => `'${d.title}' is scheduled for ${d.date}. You can join from Your Lectures when it starts.`,
  },
  MENTOR_PENDING_APPROVAL: {
    title: 'Teacher Awaiting Approval',
    ai: false,
    message: (d) => `${d.title} has registered as a teacher and is waiting for your approval.`,
  },
};

const NOTIFICATION_TYPES = Object.freeze(Object.keys(TEMPLATES));

// Only trusted, cleaned values reach a template or a prompt
const trustedData = (data = {}) => ({
  title: cleanText(data.title),
  deadline: formatWhen(data.deadline),
  date: formatWhen(data.date),
  studentName: cleanText(data.studentName, 80),
  teacherName: cleanText(data.teacherName, 80),
});

const fallbackText = (type, data) => {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown notification type: ${type}`);
  return { title: template.title, message: template.message(trustedData(data)) };
};

/* ================= VALIDATION OF AI / USER TEXT ================= */
// Returns a safe single-line message, or null when the text must not be used.
const sanitizeMessage = (text, { mustInclude = [] } = {}) => {
  if (typeof text !== 'string') return null;

  let message = text
    .replace(/<[^>]*>/g, ' ') // no markup
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(["`])([\s\S]*)\1$/, '$2') // only a pair that wraps the whole text (a habit of AI replies)
    .trim();

  if (message.length < 10 || message.length > MAX_MESSAGE_LENGTH) return null;
  // Links, placeholders and JSON never belong in a notification message
  if (/https?:\/\/|www\.|[{}\[\]<>]/i.test(message)) return null;

  const lower = message.toLowerCase();
  for (const required of mustInclude) {
    if (required && !lower.includes(String(required).toLowerCase())) return null;
  }
  return message;
};

/* ================= AI PROVIDER (EXISTING ABSTRACTION) ================= */
const LLM_DIR = path.join(__dirname, '..', '..', 'ai-modules', 'ai-assessment-agent', 'backend', 'src', 'llm');
let cachedProvider;

// Reads the same server/.env settings as the AI Assessment Agent (HF_TOKEN for Hugging Face).
const defaultProvider = () => {
  if (cachedProvider !== undefined) return cachedProvider;
  try {
    if (String(process.env.NOTIFICATION_AI_TEXT_ENABLED || '').toLowerCase() === 'false') {
      cachedProvider = null;
      return cachedProvider;
    }
    const { loadGenerationConfig } = require(path.join(LLM_DIR, 'generationConfig'));
    const { createGenerationProvider } = require(path.join(LLM_DIR, 'createGenerationProvider'));
    cachedProvider = createGenerationProvider(loadGenerationConfig(process.env));
  } catch (err) {
    cachedProvider = null;
  }
  return cachedProvider;
};

const SYSTEM_INSTRUCTION =
  'You write one short, friendly notification sentence for a school learning app. ' +
  'Use only the facts given. Do not add links, names, dates, numbers or instructions that are not given. ' +
  'Reply as JSON: {"message": "..."} with at most 160 characters.';

const MESSAGE_SCHEMA = {
  type: 'OBJECT',
  properties: { message: { type: 'STRING' } },
  required: ['message'],
};

const buildPrompt = (type, d) => {
  const facts = [`Kind of notification: ${type.replace(/_/g, ' ').toLowerCase()}`, `Title: ${d.title}`];
  if (d.deadline) facts.push(`Deadline: ${d.deadline}`);
  if (d.date) facts.push(`Date: ${d.date}`);
  return `${facts.join('\n')}\nWrite the notification sentence. It must mention the title exactly as given.`;
};

/**
 * Message for a notification. Tries the AI provider when one is configured and the type
 * allows it; any problem (not configured, timeout, provider error, unusable text) returns
 * the deterministic template instead. source: 'ai' | 'template'.
 */
const generateText = async (type, data, { provider = defaultProvider(), timeoutMs = AI_TIMEOUT_MS } = {}) => {
  const fallback = fallbackText(type, data);
  const template = TEMPLATES[type];
  const d = trustedData(data);

  if (!template.ai || !d.title || !provider || typeof provider.isConfigured !== 'function' || !provider.isConfigured()) {
    return { ...fallback, source: 'template' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const raw = await provider.generateJson({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt(type, d),
      jsonSchema: MESSAGE_SCHEMA,
      signal: controller.signal,
    });

    let candidate = null;
    try {
      candidate = JSON.parse(raw)?.message;
    } catch (parseErr) {
      candidate = null;
    }

    const message = sanitizeMessage(candidate, { mustInclude: [d.title] });
    if (!message) return { ...fallback, source: 'template' };
    return { title: fallback.title, message, source: 'ai' };
  } catch (err) {
    // Only a code is logged: never the prompt, the response or any credential
    console.warn('[notifications] AI text unavailable, using the standard message:', err?.code || err?.name || 'error');
    return { ...fallback, source: 'template' };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  NOTIFICATION_TYPES,
  MAX_MESSAGE_LENGTH,
  cleanText,
  formatWhen,
  fallbackText,
  sanitizeMessage,
  generateText,
};
