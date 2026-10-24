/**
 * Educational intent templates for AI question generation (advanced-generation step).
 *
 * A template is the BASE learning outcome the teacher wants; the teacher's optional
 * instructions refine it. The guidance text lives here, on the server: the client sends
 * only a template id, so no client can put its own "template" text into the prompt.
 *
 * These are GUIDANCE for question style, never predictions. Wording such as "most probable",
 * "guaranteed" or "will be asked" is not allowed (enforced by a test); "exam-style practice"
 * and "commonly tested concepts" are.
 *
 *   label        shown to the teacher
 *   description  one line for the teacher, under the template picker
 *   guidance     what the model is told (inside the request DATA, not the system rules)
 */
const TEMPLATES = Object.freeze([
  {
    id: 'board_exam_practice',
    label: 'Board Exam Practice',
    description: 'Board-style practice on syllabus-aligned concepts, common question patterns and application of what was taught.',
    guidance: 'Board-style exam practice: questions in the style of school board examinations, aligned to the usual syllabus for the subject and grade, using commonly tested question patterns and direct application of taught material. This is practice in that style, not a prediction of any real paper.',
  },
  {
    id: 'concept_mastery',
    label: 'Concept Mastery',
    description: 'Checks real understanding of the underlying concept rather than memorised facts.',
    guidance: 'Concept mastery: test whether the student understands the underlying concept (why and how), not whether they memorised a definition. Prefer questions that a student who only memorised facts would find hard, and use distractors based on common misconceptions.',
  },
  {
    id: 'fundamentals_first',
    label: 'Fundamentals First',
    description: 'Foundational questions on the basics and the prerequisite concepts.',
    guidance: 'Fundamentals first: focus on foundational knowledge and the prerequisite concepts the topic builds on. Keep questions clear and direct, checking that the basics are secure.',
  },
  {
    id: 'application_reasoning',
    label: 'Application & Reasoning',
    description: 'Applying concepts to unfamiliar situations and reasoning through to the answer.',
    guidance: 'Application and reasoning: present unfamiliar situations or short scenarios in which the student must apply the concept and reason to the answer, rather than recall it.',
  },
  {
    id: 'higher_order_thinking',
    label: 'Higher-Order Thinking',
    description: 'Analysis, comparison, multi-step reasoning and conceptual depth.',
    guidance: 'Higher-order thinking: questions that require analysis, comparison, evaluation or multi-step reasoning, and that probe conceptual depth.',
  },
  {
    id: 'competitive_exam_practice',
    label: 'Competitive Exam Practice',
    description: 'Challenging, time-conscious competitive-exam-style questions with multi-step reasoning where appropriate.',
    guidance: 'Competitive-exam-style practice: challenging questions that reward efficient, precise thinking under time pressure, with multi-step reasoning where appropriate. This is practice in that style, not a prediction of any real paper.',
  },
  {
    id: 'numerical_practice',
    label: 'Numerical Practice',
    description: 'Calculation-based questions and numerical reasoning.',
    guidance: 'Numerical practice: prioritise calculation-based questions and numerical reasoning. Give all the data needed, state units, and make every answer exactly determined.',
  },
  {
    id: 'mixed_difficulty',
    label: 'Mixed Difficulty',
    description: 'A balanced progression from easier questions toward harder ones.',
    guidance: 'Mixed difficulty: order the questions as a balanced progression from easier to harder, and label each question\'s difficulty accordingly.',
  },
  {
    id: 'revision_quick_test',
    label: 'Revision / Quick Test',
    description: 'Short questions on the highest-value concepts, suitable for revision.',
    guidance: 'Revision quick test: short, focused questions on the most important, commonly tested concepts of the topic, suitable for quick revision.',
  },
  {
    id: 'teacher_custom',
    label: 'Teacher Custom',
    description: 'You describe the intent yourself in the instructions box.',
    guidance: 'Teacher custom: the teacher\'s own instructions describe the intended learning outcome.',
  },
]);

const TEMPLATE_IDS = Object.freeze(TEMPLATES.map((t) => t.id));
const findTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;
/** What the client may see: no guidance text is needed there. */
const publicTemplates = () => TEMPLATES.map(({ id, label, description }) => ({ id, label, description }));

module.exports = { TEMPLATES, TEMPLATE_IDS, findTemplate, publicTemplates };
