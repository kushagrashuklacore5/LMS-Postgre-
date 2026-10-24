/*
 * AI Assessment Agent - question types (single MCQ, multiple-select, numerical) in the teacher UI.
 * Editable form state <-> the server's question shape. The server validates everything again;
 * these helpers only translate what the teacher typed.
 *
 * Editable: { type, text, options: [4 strings], correct: [option indexes], numericFormat, numericValue, explanation, difficulty }
 * Server:   { type, text, options: [{ text, isCorrect }], numericAnswer: { format, value } | null, explanation, difficulty }
 */

export const LETTERS = ["A", "B", "C", "D"];

export const QUESTION_TYPES = [
  { id: "single_mcq", label: "Single MCQ", hint: "One correct option" },
  { id: "multi_select", label: "Multiple Select", hint: "Two or more correct options" },
  { id: "numerical", label: "Numerical", hint: "Student types a number" },
];
export const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.label]));

export const NUMERIC_FORMATS = [
  { id: "integer", label: "Whole number" },
  { id: "decimal", label: "Decimal" },
];

export const blankQuestion = (type = "single_mcq") => ({
  type,
  text: "",
  options: ["", "", "", ""],
  correct: type === "multi_select" ? [] : [0],
  numericFormat: "integer",
  numericValue: "",
  explanation: "",
  difficulty: null,
  imageKey: null, // optional picture (key of the uploaded file)
});

/** Server question (teacher view or AI proposal) -> editable state. */
export function toEditable(q) {
  const type = q.type || "single_mcq";
  const options = q.options && q.options.length === 4 ? q.options.map((o) => o.text) : ["", "", "", ""];
  const correct = (q.options || []).map((o, i) => (o.isCorrect ? i : -1)).filter((i) => i >= 0);
  return {
    type,
    text: q.text,
    options,
    correct: type === "single_mcq" ? [correct[0] ?? 0] : correct,
    numericFormat: q.numericAnswer?.format || "integer",
    numericValue: q.numericAnswer?.value ?? "",
    explanation: q.explanation || "",
    difficulty: q.difficulty || null,
    imageKey: q.imageKey || null,
  };
}

/**
 * Switching type keeps the text/options. The answer key is NOT carried into a multiple-select
 * question: a single MCQ always has one option pre-selected, and silently keeping it would make
 * an option correct that the teacher never ticked. Back to single MCQ keeps the first ticked option.
 */
export function withType(q, type) {
  if (type === q.type) return q;
  const correct = type === "multi_select" ? [] : [q.correct[0] ?? 0];
  return { ...q, type, correct };
}

/** Editable state -> request body for POST/PUT questions and from-review. */
export function toBody(q) {
  const common = { type: q.type, text: q.text, explanation: q.explanation, difficulty: q.difficulty, imageKey: q.imageKey || null };
  if (q.type === "numerical") return { ...common, numericAnswer: { format: q.numericFormat, value: String(q.numericValue).trim() } };
  return { ...common, options: q.options.map((text, i) => ({ text, isCorrect: q.correct.includes(i) })) };
}

/** Short answer-key line for lists ("Answer: B", "Answers: A, C", "Answer: 42 (whole number)"). */
export function answerKeyText(q) {
  if (q.type === "numerical") {
    return q.numericAnswer ? `Answer: ${q.numericAnswer.value} (${q.numericAnswer.format === "integer" ? "whole number" : "decimal"})` : "No answer set";
  }
  const letters = q.options.filter((o) => o.isCorrect).map((o) => LETTERS[o.position ?? q.options.indexOf(o)]);
  return `${letters.length > 1 ? "Answers" : "Answer"}: ${letters.join(", ")}`;
}
