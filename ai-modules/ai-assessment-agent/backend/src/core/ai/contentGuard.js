/**
 * Deterministic content guard for AI-generated questions. It runs AFTER the
 * structural validation, on already well-formed questions
 * ({ type, text, options: [{ text, isCorrect }], numericAnswer, explanation, difficulty };
 * numerical questions have no options, and their answer is a validated number).
 *
 * It catches content that is structurally valid but must not reach a teacher
 * as a ready-to-save question:
 *   INSTRUCTION_NOT_QUESTION   the model talking about the task ("Sure, here are...", "Generate ...")
 *   PROMPT_INJECTION           text trying to steer an AI or reveal prompts/secrets
 *   UNSAFE_MARKUP              HTML/script/links in content that will be rendered to students
 *   PLACEHOLDER_OR_GIBBERISH   empty-looking, placeholder or repeated-character content
 *   ANSWER_LEAK                the answer revealed outside correctAnswer (in the question or options)
 *
 * The guard is fixed patterns only: no second LLM and no scoring. It errs on
 * the side of rejecting. Only codes and locations are reported, never the
 * offending text. The explanation MAY name the answer (it is teacher-only), so
 * it is not checked for ANSWER_LEAK.
 */
// Kept narrow on purpose: one hit rejects the whole response, so ordinary quiz
// phrasings ("Choose the correct answer", "What is the output of...") must pass.
const META_START = /^(sure|certainly|okay|of course|here (is|are)|below (is|are)|i (cannot|can't|can not|am unable|won't)|i'm (sorry|unable)|as an ai|note:|instructions?:|generate|create|respond)\b/i;

const INJECTION = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|these|those)\b[^.\n]{0,20}\b(instructions?|prompts?|rules|directions)\b/i,
  /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
  /\byou are (now )?(an?|the) (ai|assistant|language model|chatbot|llm)\b/i,
  /\bas an ai( language)? model\b/i,
  /\b(reveal|print|show|output|repeat|leak)\b[^.\n]{0,30}\b(api[ _-]?key|system prompt|your (instructions|prompt)|secret)/i,
  /\bnew instructions?\s*:/i,
  /<\|?\s*(im_start|im_end|system|assistant)\s*\|?>/i,
  /\b(BEGIN|END)[ _](SYSTEM|PROMPT|INSTRUCTIONS?)\b/i,
  /#{2,}\s*(instruction|system)/i,
];

const MARKUP = [/<\s*\/?\s*(script|iframe|object|embed|style|img|a|svg|form|input|link|meta)\b/i, /javascript\s*:/i, /<[^>]*\bon\w+\s*=/i, /https?:\/\//i, /\bwww\.[a-z0-9-]+\.[a-z]/i];

const PLACEHOLDER = [/lorem ipsum/i, /\bplaceholder\b/i, /\bTODO\b/, /^(question|option|answer|choice)\s*#?\s*([a-d]|\d+)?\s*[:.]?$/i, /^(n\/a|tbd|\.{3,}|-+)$/i];

// "Choose the correct answer:" is normal wording; "the answer is ..." / "(correct)" are leaks.
const LEAK = [/\b(the|correct|right|final)\s+answer\s+is\b/i, /[([]\s*(correct|right answer|answer)\s*[)\]]/i, /[✓✔✅]/];

// Non-digit runs only: "1000000000" is a legitimate option.
const hasRepeatedRun = (s) => /([^\d])\1{7,}/u.test(s.replace(/\s/g, ''));
const hasAlnum = (s) => /[\p{L}\p{N}]/u.test(s);
const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function guardGeneratedQuestions(questions) {
  const problems = [];
  questions.forEach((q, i) => {
    const at = (f) => `questions[${i}].${f}`;
    const add = (field, code) => { if (!problems.some((p) => p.field === field && p.code === code)) problems.push({ field, code }); };
    const fields = [['question', q.text], ...q.options.map((o, j) => [`options[${j}]`, o.text]), ['explanation', q.explanation]];

    if (META_START.test(q.text.trim())) add(at('question'), 'INSTRUCTION_NOT_QUESTION');
    for (const [field, value] of fields) {
      if (INJECTION.some((re) => re.test(value))) add(at(field), 'PROMPT_INJECTION');
      if (MARKUP.some((re) => re.test(value))) add(at(field), 'UNSAFE_MARKUP');
      if (!hasAlnum(value) || hasRepeatedRun(value) || PLACEHOLDER.some((re) => re.test(value.trim()))) add(at(field), 'PLACEHOLDER_OR_GIBBERISH');
    }
    if (q.text.replace(/\s/g, '').length < 5) add(at('question'), 'PLACEHOLDER_OR_GIBBERISH');
    // Single-letter options ("A", "B") mean the model put labels instead of answers.
    if (q.options.length > 0 && q.options.every((o) => /^[a-d]$/i.test(o.text.trim()))) add(at('options'), 'PLACEHOLDER_OR_GIBBERISH');

    // Answer leakage outside the correct-answer field.
    if (LEAK.some((re) => re.test(q.text))) add(at('question'), 'ANSWER_LEAK');
    q.options.forEach((o, j) => { if (LEAK.some((re) => re.test(o.text))) add(at(`options[${j}]`), 'ANSWER_LEAK'); });
    // A long correct option copied into the question gives it away (every correct option of a multiple-select).
    for (const correct of q.options.filter((o) => o.isCorrect)) {
      if (norm(correct.text).length >= 12 && norm(q.text).includes(norm(correct.text))) add(at('question'), 'ANSWER_LEAK');
    }
  });
  return problems;
}

// INJECTION / MARKUP are also reused by the Student Performance Analyst's output guard (analysisSchema.js).
module.exports = { guardGeneratedQuestions, INJECTION, MARKUP };
