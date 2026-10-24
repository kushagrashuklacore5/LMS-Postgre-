import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
  ArrowLeft, BarChart3, Brain, Calculator, Compass, GraduationCap, Layers, Lightbulb, Loader2, PenLine, Plus, RefreshCw, Sparkles, Timer, Trash2, Trophy,
} from "lucide-react";
import QuestionEditor, { TypePicker } from "./QuestionEditor";
import AssignToModal, { publishBody } from "./AssignToModal";
import { TYPE_LABEL, blankQuestion, toBody, toEditable } from "./questionForm";

/*
 * AI Assessment Agent - "Generate with AI" + teacher review.
 * The server generates a PROPOSAL only (POST /teacher/assessments/generate) and
 * stores nothing. Proposed questions live in this component's state until the
 * teacher explicitly saves them (POST /teacher/assessments/from-review), which
 * creates a normal DRAFT. Publishing stays a separate, explicit action.
 *
 * Advanced generation: the teacher picks the question type (single MCQ, multiple select,
 * numerical), optionally an educational intent template (server-owned guidance; only its id
 * is sent), and optional instructions that refine it.
 */

const DIFFICULTIES = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"], ["mixed", "Mixed (easier to harder)"]];
const EMPTY_FORM = { topic: "", subject: "", classroomId: "", courseId: "", count: 5, difficulty: "medium", instructions: "", questionType: "single_mcq", numericFormat: "", template: null };
const TEMPLATE_ICON = {
  board_exam_practice: GraduationCap,
  concept_mastery: Lightbulb,
  fundamentals_first: Layers,
  application_reasoning: Compass,
  higher_order_thinking: Brain,
  competitive_exam_practice: Trophy,
  numerical_practice: Calculator,
  mixed_difficulty: BarChart3,
  revision_quick_test: Timer,
  teacher_custom: PenLine,
};

/** AI errors carry safe server messages; the quality-check detail codes are not useful to a teacher. */
function aiErrorText(err, errorText) {
  const e = err?.response?.data?.error;
  if (e && typeof e.code === "string" && (e.code.startsWith("AI_") || e.code.startsWith("GENERATION_") || e.code === "QUESTION_TYPES_NOT_READY")) return e.message;
  return errorText(err);
}

function Step({ n, title, hint, children }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[#1e1b4b] text-base flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-none bg-[#B99652] text-white text-xs font-medium border border-[#9b7b3e] shadow-xs">
            {n}
          </span>
          <span className="font-['DM_Serif_Display',serif] text-base sm:text-lg text-[#1e1b4b] font-normal">{title}</span>
        </h3>
        {hint && <p className="text-xs text-[#7a705a] ml-8 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="ml-8">{children}</div>
    </div>
  );
}

export default function AiAssessmentGenerator({ base, auth, classrooms, coursesByClass = {}, classLabel, errorText, onCancel, onSaved, prefill = null }) {
  // prefill: from the AI Performance Report's suggested next assessment (form values only; no AI call).
  const [form, setForm] = useState(() => (prefill ? {
    ...EMPTY_FORM,
    topic: prefill.topic || "", subject: prefill.subject || "", classroomId: prefill.classroomId || "",
    count: prefill.count || EMPTY_FORM.count, difficulty: prefill.difficulty || EMPTY_FORM.difficulty, questionType: prefill.questionType || EMPTY_FORM.questionType,
  } : EMPTY_FORM));
  const [assigning, setAssigning] = useState(false);
  const [assignClass, setAssignClass] = useState(null); // open "Assign to" popup (class object)
  // A suggested next assessment is pre-selected for the student it was suggested for (a default only).
  const suggestedStudent = prefill && prefill.student && Number.isInteger(prefill.student.id) ? prefill.student : null;
  const [questions, setQuestions] = useState(null); // null = not generated yet
  const [details, setDetails] = useState({ title: "", description: "", durationMinutes: "" });
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(null); // index being regenerated
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState(null); // safe server message; shown with a Try again button
  const [elapsed, setElapsed] = useState(0); // seconds while generating (display only)
  const [catalog, setCatalog] = useState({ templates: [], questionTypesAvailable: ["single_mcq"] });
  const busy = generating || saving || assigning || regenerating !== null;
  // Synchronous lock: two clicks in the same tick (before React re-renders) still send ONE request.
  const inFlight = useRef(false);
  const locked = async (fn) => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    try { await fn(); } finally { inFlight.current = false; }
  };

  // Template list + which question types the server can save (read-only; no LLM call).
  useEffect(() => {
    axios.get(`${base}/ai/templates`, auth)
      .then((res) => setCatalog({ templates: res.data.templates, questionTypesAvailable: res.data.questionTypesAvailable }))
      .catch(() => setCatalog({ templates: [], questionTypesAvailable: ["single_mcq"] }));
  }, [base, auth]);

  useEffect(() => {
    if (!generating) return undefined;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  const selectedTemplate = catalog.templates.find((t) => t.id === form.template) || null;
  const chooseTemplate = (id) => setForm((f) => {
    const template = f.template === id ? null : id; // clicking the selected template clears it
    return { ...f, template, difficulty: template === "mixed_difficulty" ? "mixed" : f.difficulty === "mixed" && template !== "mixed_difficulty" ? "medium" : f.difficulty };
  });

  const request = (count, avoidQuestions, type = form.questionType) => ({
    topic: form.topic,
    subject: form.subject,
    classroomId: form.classroomId === "" ? null : Number(form.classroomId),
    count,
    difficulty: form.difficulty,
    instructions: form.instructions,
    questionType: type,
    ...(type === "numerical" && form.numericFormat ? { numericFormat: form.numericFormat } : {}),
    ...(form.template ? { template: form.template } : {}),
    ...(avoidQuestions && avoidQuestions.length ? { avoidQuestions } : {}),
  });

  const generate = () => locked(async () => { // explicit click only; one request per click
    if (!form.classroomId) { toast.error("Choose the class these questions are for."); return; }
    setGenerating(true);
    setAiError(null);
    try {
      const res = await axios.post(`${base}/assessments/generate`, request(Number(form.count)), auth);
      setQuestions(res.data.proposal.questions.map(toEditable));
      setDetails((d) => ({ ...d, title: d.title || form.topic }));
      toast.success("Questions generated. Review them before saving.");
    } catch (err) {
      setAiError(aiErrorText(err, errorText)); // safe message from the server; never raw provider details
    } finally {
      setGenerating(false);
    }
  });

  const regenerate = (index) => locked(async () => {
    setRegenerating(index);
    try {
      const others = questions.filter((_, i) => i !== index).map((q) => q.text.trim()).filter(Boolean).slice(0, 50);
      const res = await axios.post(`${base}/assessments/generate`, request(1, others, questions[index].type), auth);
      const [replacement] = res.data.proposal.questions.map(toEditable);
      setQuestions((qs) => qs.map((q, i) => (i === index ? replacement : q)));
    } catch (err) {
      toast.error(aiErrorText(err, errorText));
    } finally {
      setRegenerating(null);
    }
  });

  const replaceAt = (index, next) => setQuestions((qs) => qs.map((q, i) => (i === index ? next : q)));
  const remove = (index) => setQuestions((qs) => qs.filter((_, i) => i !== index));

  /** "Save & assign": opens the "Assign to" popup. Nothing is saved until the teacher confirms recipients there. */
  const saveAndAssign = () => {
    if (busy) return;
    if (!questions.length) { toast.error("Add at least one question before assigning."); return; }
    const cls = classrooms.find((c) => String(c.id) === String(form.classroomId));
    if (!cls) { toast.error("Choose the class to assign this test to (in the form above)."); return; }
    if (!form.courseId) { toast.error("Choose the course of this test (in the form above)."); return; }
    setAssignClass(cls);
  };

  /** Confirmed in the popup: save the reviewed questions + publish to exactly the chosen students. */
  const confirmAssign = (ids, wholeClass) => locked(async () => {
    const cls = assignClass;
    setAssigning(true);
    let draft = null;
    try {
      draft = (await axios.post(`${base}/assessments/from-review`, {
        assessment: {
          title: details.title, subject: form.subject, description: details.description,
          classroomId: Number(form.classroomId),
          ...(form.courseId ? { courseId: Number(form.courseId) } : {}),
          durationMinutes: details.durationMinutes === "" ? null : Number(details.durationMinutes),
        },
        questions: questions.map(toBody),
      }, auth)).data.assessment;
      const published = (await axios.post(`${base}/assessments/${draft.id}/publish`, publishBody(ids, wholeClass), auth)).data.assessment;
      toast.success(wholeClass ? `Assigned to ${classLabel(cls)}.` : `Assigned to ${ids.length} student${ids.length === 1 ? "" : "s"} in ${classLabel(cls)}.`);
      setAssignClass(null);
      onSaved(published);
    } catch (err) {
      setAssignClass(null);
      if (draft) { toast.error(`Saved as a draft, but it could not be assigned: ${errorText(err)}`); onSaved(draft); }
      else toast.error(errorText(err));
    } finally {
      setAssigning(false);
    }
  });

  const save = () => locked(async () => { // also prevents a double-click from creating two drafts
    if (!form.classroomId) { toast.error("Choose the class for this test."); return; }
    if (!form.courseId) { toast.error("Choose the course for this test."); return; }
    if (!questions.length) { toast.error("Add at least one question before saving."); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${base}/assessments/from-review`, {
        assessment: {
          title: details.title,
          subject: form.subject,
          description: details.description,
          classroomId: form.classroomId === "" ? null : Number(form.classroomId),
          ...(form.courseId ? { courseId: Number(form.courseId) } : {}),
          durationMinutes: details.durationMinutes === "" ? null : Number(details.durationMinutes),
        },
        questions: questions.map(toBody),
      }, auth);
      toast.success("Saved as a draft. Check it and publish when ready.");
      onSaved(res.data.assessment);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  });

  const discard = () => {
    if (!questions || window.confirm("Discard the generated questions? Nothing has been saved.")) onCancel();
  };

  const customNeedsText = form.template === "teacher_custom" && !form.instructions.trim();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <button
        onClick={discard}
        disabled={busy}
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#B99652] hover:text-[#92400e] transition-colors py-1"
      >
        <ArrowLeft size={16} />
        <span>Back to All Tests</span>
      </button>

      {/* Generator Configuration Section */}
      <section className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-8">
        <div className="flex items-center gap-3.5 pb-4 mb-6 border-b border-[#ebdcaa]">
          <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#B99652] to-[#a38243] text-white flex items-center justify-center border border-[#ebdcaa] shadow-xs">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
              Generate Assessment with AI
            </h2>
            <p className="text-xs text-[#7a705a] mt-0.5">
              The AI proposes smart curriculum questions. Nothing is saved until you review and click "Save as draft".
            </p>
          </div>
        </div>

        {prefill && (
          <div className="mb-6 p-4 rounded-none bg-[#fff8e7] border border-[#fde68a] text-xs sm:text-sm text-[#92400e]" data-testid="aia-gen-prefill">
            Pre-filled from the <strong>{prefill.source || "AI Performance Report"}</strong>'s suggested next assessment. Check the details, then click "Generate Questions".
            {suggestedStudent && <span className="block mt-1">Suggested for: <strong>{suggestedStudent.name}</strong> (pre-selected when you assign; you can adjust anytime).</span>}
          </div>
        )}

        <fieldset disabled={busy} className="space-y-7">
          <Step n={1} title="Assessment Target & Scope">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783]"
                placeholder="Topic (e.g. Thermodynamics, Optics, Algebra)"
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
              />
              <input
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783]"
                placeholder="Subject (e.g. Physics, Mathematics)"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
              <select
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                value={form.classroomId}
                onChange={(e) => setForm({ ...form, classroomId: e.target.value, courseId: "" })}
                required
                aria-label="Classroom (required)"
                data-testid="aia-gen-classroom"
              >
                <option value="">Classroom (required)</option>
                {classrooms.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
              </select>
              <select
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                disabled={!form.classroomId}
                aria-label="Course (required)"
                data-testid="aia-gen-course"
              >
                <option value="">{form.classroomId ? "Course (required)" : "Choose a classroom first"}</option>
                {(coursesByClass[String(form.classroomId)] || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-[#665e4d]">
                  <span className="block mb-1">Question Count</span>
                  <input
                    className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
                    type="number"
                    min="1"
                    max="20"
                    value={form.count}
                    onChange={(e) => setForm({ ...form, count: e.target.value })}
                  />
                </label>
                <label className="text-xs font-bold text-[#665e4d]">
                  <span className="block mb-1">Difficulty</span>
                  <select
                    className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    data-testid="aia-gen-difficulty"
                  >
                    {DIFFICULTIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </Step>

          <Step n={2} title="Question Format" hint="Choose the question format and structure.">
            <TypePicker size="lg" value={form.questionType} onChange={(questionType) => setForm({ ...form, questionType })} available={catalog.questionTypesAvailable} testId="aia-gen-type" />
            {form.questionType === "numerical" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" data-testid="aia-gen-numeric-format">
                <span className="text-[#665e4d] font-semibold">Answers should be:</span>
                {[["", "Whole numbers or decimals"], ["integer", "Whole numbers only"], ["decimal", "Decimals"]].map(([id, label]) => (
                  <button
                    key={id || "any"}
                    type="button"
                    onClick={() => setForm({ ...form, numericFormat: id })}
                    className={`px-3 py-1 rounded-none border text-xs font-semibold transition-all ${
                      form.numericFormat === id
                        ? "border-[#B99652] bg-[#fff8e7] text-[#92400e] ring-1 ring-[#B99652]"
                        : "border-[#ebdcaa] text-[#665e4d] bg-white hover:border-[#B99652]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </Step>

          <Step n={3} title="Educational Intent (Pedagogical Guidance)" hint="Guides the style and cognitive level of the questions according to learning outcomes.">
            {catalog.templates.length === 0 ? (
              <p className="text-xs text-[#7a705a]">Templates are not available right now. You can describe your specific requirements below.</p>
            ) : (
              <>
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-5" role="radiogroup" aria-label="Educational intent" data-testid="aia-gen-templates">
                  {catalog.templates.map((t) => {
                    const Icon = TEMPLATE_ICON[t.id] || Sparkles;
                    const active = form.template === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => chooseTemplate(t.id)}
                        data-template={t.id}
                        className={`flex flex-col items-start gap-2 p-3 rounded-none border text-left transition-all ${
                          active
                            ? "border-[#B99652] bg-[#fff8e7] ring-1 ring-[#B99652] shadow-xs"
                            : "border-[#ebdcaa] bg-white hover:border-[#B99652]/70 hover:bg-[#fffdf4]/40"
                        }`}
                      >
                        <Icon size={18} className={active ? "text-[#B99652]" : "text-[#7a705a]"} />
                        <span className={`text-xs font-bold leading-tight ${active ? "text-[#92400e]" : "text-[#1e1b4b]"}`}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 p-2.5 rounded-none bg-[#fffdf4] border border-[#ebdcaa] text-xs text-[#665e4d]" data-testid="aia-gen-template-description">
                  {selectedTemplate ? (
                    <>
                      <strong className="text-[#92400e]">{selectedTemplate.label}:</strong> {selectedTemplate.description}{" "}
                      <span className="text-[#a09783] cursor-pointer underline ml-1" onClick={() => chooseTemplate(selectedTemplate.id)}>(click to clear)</span>
                    </>
                  ) : (
                    "No intent template selected: the AI will formulate questions directly from topic & instructions."
                  )}
                </div>
              </>
            )}
          </Step>

          <Step
            n={4}
            title={form.template === "teacher_custom" ? "Custom Instructions (Required for Teacher Custom)" : "Special Instructions / Focus Areas (Optional)"}
            hint="Specify topic emphasis, real-world application contexts, or specific formulas. (Max 500 chars)"
          >
            <textarea
              className="w-full p-3 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783]"
              rows={3}
              maxLength={500}
              placeholder="e.g. Focus on Newton's laws and include practical application scenarios involving friction and momentum."
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              data-testid="aia-gen-instructions"
            />
            <div className="text-[11px] text-[#7a705a] text-right mt-1">{form.instructions.length}/500</div>
          </Step>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#ebdcaa] pt-5">
            <div className="flex items-center gap-3">
              <button
                onClick={generate}
                disabled={customNeedsText || busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs sm:text-sm border border-[#9b7b3e] shadow-xs transition-all disabled:opacity-50"
              >
                {generating ? <Loader2 size={16} className="animate-spin text-white" /> : <Sparkles size={16} />}
                <span>{generating ? "Synthesizing Questions..." : questions ? "Regenerate Full Test" : "Generate Questions with AI"}</span>
              </button>
              {generating && (
                <span className="text-xs text-[#7a705a] font-medium" data-testid="aia-generating">
                  AI generating questions... {elapsed}s
                </span>
              )}
            </div>

            <div className="text-xs text-[#7a705a]">
              <span className="font-semibold text-[#92400e]">{TYPE_LABEL[form.questionType]}</span>
              {selectedTemplate ? ` · ${selectedTemplate.label}` : ""} · {form.count} {Number(form.count) === 1 ? "question" : "questions"}
            </div>
          </div>
        </fieldset>

        {aiError && !generating && (
          <div className="mt-5 p-4 rounded-none bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800" data-testid="aia-ai-error" role="alert">
            <p className="font-bold text-red-700">{aiError}</p>
            <p className="text-red-600 mt-1">Your configuration inputs are retained. You can retry generation or create manually.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={generate} className="px-3.5 py-1.5 bg-[#B99652] text-white rounded-none text-xs font-bold">Try again</button>
              <button onClick={onCancel} className="px-3.5 py-1.5 bg-white border border-[#ebdcaa] text-[#92400e] rounded-none text-xs font-bold">Create manually instead</button>
            </div>
          </div>
        )}
      </section>

      {/* Review Questions Section */}
      {questions && (
        <>
          <section className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(0,35,102,0.06)] p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#ebdcaa]">
              <div>
                <h3 className="text-lg sm:text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Review & Refine Proposed Questions ({questions.length})
                </h3>
                <p className="text-xs text-[#7a705a]">
                  Edit question text, verify answer keys, or regenerate single questions as needed.
                </p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                Draft Proposal (Unsaved)
              </span>
            </div>

            <ol className="space-y-4">
              {questions.map((q, i) => (
                <li key={i} className="border border-[#ebdcaa] rounded-none p-4 sm:p-5 bg-[#fffdf4]/20 space-y-3" data-testid="aia-review-question" data-type={q.type}>
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#ebdcaa]/60">
                    <span className="font-semibold text-sm text-[#1e1b4b] flex items-center gap-2">
                      <span className="w-5 h-5 bg-[#B99652] text-white text-xs flex items-center justify-center font-medium">
                        {i + 1}
                      </span>
                      <span>Question {i + 1}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                        {TYPE_LABEL[q.type]}
                      </span>
                      {q.difficulty && (
                        <span className="text-[10px] font-medium text-[#7a705a] capitalize">
                          {q.difficulty}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        disabled={busy}
                        title="Regenerate this question"
                        onClick={() => regenerate(i)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B99652] hover:text-[#92400e] disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw size={13} className={regenerating === i ? "animate-spin" : ""} />
                        <span>Regenerate</span>
                      </button>
                      <button
                        disabled={busy}
                        title="Remove"
                        onClick={() => remove(i)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                  <fieldset disabled={busy}>
                    <QuestionEditor
                      value={q}
                      onChange={(next) => replaceAt(i, next)}
                      idPrefix={`aia-review-${i}`}
                      availableTypes={catalog.questionTypesAvailable}
                      allowTypeChange={false}
                    />
                  </fieldset>
                </li>
              ))}
            </ol>

            <button
              disabled={busy}
              onClick={() => setQuestions((qs) => [...qs, blankQuestion(form.questionType)])}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#fffdf4] text-[#92400e] border border-[#ebdcaa] hover:border-[#B99652] rounded-none font-bold text-xs shadow-xs transition-all"
            >
              <Plus size={14} className="text-[#B99652]" />
              <span>Add Custom Question Manually</span>
            </button>
          </section>

          {/* Save & Publish Options Card */}
          <section className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-8">
            <h3 className="text-lg sm:text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">
              Finalize Assessment
            </h3>
            <p className="text-xs text-[#7a705a] mb-5">
              Specify test title and duration. "Save as draft" keeps it private; "Save & assign" publishes directly to selected students.
            </p>

            <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
              <input
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783]"
                placeholder="Test Title (e.g. Physics Midterm Quiz: Mechanics)"
                value={details.title}
                onChange={(e) => setDetails({ ...details, title: e.target.value })}
              />
              <input
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783]"
                type="number"
                min="1"
                max="600"
                placeholder="Duration in minutes (e.g. 30)"
                value={details.durationMinutes}
                onChange={(e) => setDetails({ ...details, durationMinutes: e.target.value })}
              />
              <textarea
                className="p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783] sm:col-span-2"
                rows={2}
                placeholder="Description & instructions for students (optional)"
                value={details.description}
                onChange={(e) => setDetails({ ...details, description: e.target.value })}
              />
              
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3 pt-4 border-t border-[#ebdcaa]">
                <button
                  onClick={save}
                  disabled={saving || busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs sm:text-sm border border-[#9b7b3e] shadow-xs transition-all disabled:opacity-60"
                >
                  {saving && <Loader2 size={16} className="animate-spin text-white" />}
                  <span>Save as Draft</span>
                </button>
                <button
                  onClick={saveAndAssign}
                  disabled={assigning || busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#fff8e7] hover:bg-[#fde68a] text-[#92400e] rounded-none font-bold text-xs sm:text-sm border border-[#B99652] shadow-xs transition-all disabled:opacity-60"
                  data-testid="aia-gen-save-assign"
                >
                  {assigning && <Loader2 size={16} className="animate-spin text-[#92400e]" />}
                  <span>Save & Assign to Class…</span>
                </button>
                <button
                  onClick={discard}
                  className="px-4 py-2.5 bg-white hover:bg-[#fffdf4] text-[#665e4d] border border-[#ebdcaa] rounded-none text-xs sm:text-sm font-bold transition-colors"
                >
                  Discard
                </button>
              </div>
            </fieldset>
          </section>
        </>
      )}

      {assignClass && (
        <AssignToModal
          base={base}
          auth={auth}
          classroom={assignClass}
          courseId={form.courseId ? Number(form.courseId) : null}
          classLabel={classLabel}
          testTitle={details.title || form.topic}
          suggested={suggestedStudent}
          busy={assigning}
          onCancel={() => setAssignClass(null)}
          onConfirm={confirmAssign}
        />
      )}
    </div>
  );
}
