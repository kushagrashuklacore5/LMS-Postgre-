import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { ArrowLeft, CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import StudentLayout from "../../components/StudentLayout";
import { useAuth } from "../../auth/auth";
import { AuthedImage } from "../../components/QuestionImage";

/*
 * AI Assessment Agent (Step 3) - take a test and see the result.
 * The SERVER owns the attempt: it stores each answer as it is chosen, enforces the
 * deadline and grades on submit/expiry. The countdown here is display only; it is
 * computed from the server's clock (serverNow), so a wrong device clock does not matter.
 * Reloading the page resumes the same attempt.
 * Question types: single MCQ (radio), multiple select (checkboxes; the whole set is saved on
 * each change), numerical (typed number; saved on Enter / leaving the field / Submit).
 */

const LETTERS = ["A", "B", "C", "D"];

function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Saved answer from the server, per type: position | [positions] | "number". */
const answerOf = (a) => (a.value !== undefined ? a.value : a.optionPositions !== undefined ? a.optionPositions : a.optionPosition);
const isAnswered = (v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== "";

export default function StudentAttempt() {
  const { attemptId } = useParams();
  const { token, API } = useAuth();
  const base = `${API}/assessment-agent/student/attempts/${attemptId}`;
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId -> saved answer (position | [positions] | "number")
  const [drafts, setDrafts] = useState({}); // numerical questionId -> text being typed
  const [savingQ, setSavingQ] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [error, setError] = useState(null);
  const offset = useRef(0); // server clock - device clock

  const accept = useCallback((a) => {
    offset.current = Date.parse(a.serverNow) - Date.now();
    setAttempt(a);
    if (a.status === "in_progress") {
      const saved = Object.fromEntries(a.answers.map((x) => [x.questionId, answerOf(x)]));
      setAnswers(saved);
      setDrafts(Object.fromEntries(a.questions.filter((q) => q.type === "numerical").map((q) => [q.id, saved[q.id] ?? ""])));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(base, auth);
      accept(res.data.attempt);
    } catch (err) {
      setError(err?.response?.data?.error?.message || "Could not load this test.");
    }
  }, [base, auth, accept]);

  useEffect(() => { load(); }, [load]);

  // Display countdown. At zero, ask the server: it finalizes and returns the result.
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attempt.deadlineAt) { setRemaining(null); return undefined; }
    const deadline = Date.parse(attempt.deadlineAt);
    const tick = () => {
      const left = deadline - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 0) { clearInterval(timer); toast.info("Time is up. Your answers have been submitted."); load(); }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [attempt, load]);

  /** Saves one answer; body per type. Returns true on success. */
  const save = async (questionId, body, optimistic) => {
    const previous = answers[questionId];
    if (optimistic !== undefined) setAnswers((a) => ({ ...a, [questionId]: optimistic }));
    setSavingQ(questionId);
    try {
      const res = await axios.put(`${base}/answers/${questionId}`, body, auth);
      const saved = res.data.saved;
      if (saved.value !== undefined) {
        setAnswers((a) => ({ ...a, [questionId]: saved.value }));
        setDrafts((d) => ({ ...d, [questionId]: saved.value ?? "" })); // show the number as stored (e.g. "2.50" -> "2.5")
      }
      return true;
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      if (optimistic !== undefined) setAnswers((a) => ({ ...a, [questionId]: previous }));
      toast.error(err?.response?.data?.error?.message || "Your answer could not be saved.");
      if (code === "ATTEMPT_EXPIRED" || code === "ATTEMPT_SUBMITTED") load();
      return false;
    } finally {
      setSavingQ(null);
    }
  };

  const choose = (questionId, optionPosition) => save(questionId, { optionPosition }, optionPosition);
  const toggle = (questionId, position) => {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] : [];
    const next = current.includes(position) ? current.filter((p) => p !== position) : [...current, position].sort();
    return save(questionId, { optionPositions: next }, next);
  };
  const numberDirty = (qid) => (drafts[qid] ?? "").trim() !== String(answers[qid] ?? "");
  const saveNumber = (qid) => (numberDirty(qid) ? save(qid, { value: (drafts[qid] ?? "").trim() === "" ? null : drafts[qid].trim() }) : Promise.resolve(true));

  const submit = async () => {
    // Typed numbers that were not saved yet are saved first; a rejected one stops the submit.
    for (const q of attempt.questions.filter((x) => x.type === "numerical" && numberDirty(x.id))) {
      if (!(await saveNumber(q.id))) return;
    }
    const unanswered = attempt.questions.filter((q) => !isAnswered(answers[q.id]) && !(q.type === "numerical" && (drafts[q.id] ?? "").trim() !== "")).length;
    const note = unanswered > 0 ? ` ${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered.` : "";
    if (!window.confirm(`Submit your test?${note} You cannot change your answers afterwards.`)) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${base}/submit`, undefined, auth);
      accept(res.data.attempt);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const back = (
    <Link to="/student/assessment-agent/tests" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
      <ArrowLeft size={16} /> My tests
    </Link>
  );

  if (error) return <StudentLayout><div className="max-w-3xl mx-auto p-6">{back}<div className="p-6 bg-white rounded-xl shadow text-red-600">{error}</div></div></StudentLayout>;
  if (!attempt) return <StudentLayout><div className="max-w-3xl mx-auto p-6 text-gray-500"><Loader2 className="inline animate-spin" /> Loading...</div></StudentLayout>;

  const title = attempt.assessment?.title || "Test";

  /* ---------- result ---------- */
  if (attempt.status !== "in_progress") {
    const r = attempt.result;
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {back}
          <section className="bg-white rounded-xl shadow p-6" data-testid="aia-result">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-gray-500 mb-4">{attempt.status === "expired" ? "Time ran out; your saved answers were submitted automatically." : "Submitted."}</p>
            <div className="text-4xl font-bold mb-4" data-testid="aia-score">{r.score}/{r.totalQuestions} <span className="text-2xl text-gray-500" data-testid="aia-percentage">({r.percentage}%)</span></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {[["Correct", r.correct, "text-green-700"], ["Incorrect", r.incorrect, "text-red-600"], ["Unattempted", r.unattempted, "text-gray-600"], ["Total", r.totalQuestions, ""]].map(([label, value, cls]) => (
                <div key={label} className="border rounded-lg p-3"><div className={`text-2xl font-bold ${cls}`}>{value}</div><div className="text-xs text-gray-500">{label}</div></div>
              ))}
            </div>
          </section>
          <section className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold mb-4">Your answers</h2>
            <ol className="space-y-4">
              {attempt.questions.map((q) => (
                <li key={q.id} className="border rounded-lg p-4" data-testid="aia-result-question" data-outcome={q.outcome}>
                  <div className="font-medium flex items-start gap-2">
                    {q.outcome === "correct" ? <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" /> : <XCircle size={18} className={`${q.outcome === "incorrect" ? "text-red-500" : "text-gray-400"} shrink-0 mt-0.5`} />}
                    <span>{q.position}. {q.text}</span>
                  </div>
                  {q.hasImage && <AuthedImage url={`${API}/assessment-agent/student/assessments/${attempt.assessmentId}/questions/${q.id}/image`} />}
                  {q.type === "numerical" ? (
                    <div className="mt-2 text-sm space-y-1">
                      <div className={q.outcome === "correct" ? "text-green-700 font-semibold" : q.outcome === "incorrect" ? "text-red-600" : "text-gray-500"}>Your answer: {q.submittedValue ?? "—"}</div>
                      {q.outcome !== "correct" && <div className="text-green-700 font-semibold">Correct answer: {q.correctValue}</div>}
                    </div>
                  ) : (
                    <>
                      {q.type === "multi_select" && <p className="text-xs text-gray-500 mt-1">Multiple select: all correct options were needed.</p>}
                      <ul className="mt-2 grid gap-1 md:grid-cols-2 text-sm">
                        {q.options.map((o) => {
                          const correct = q.type === "multi_select" ? q.correctPositions.includes(o.position) : o.position === q.correctPosition;
                          const chosen = q.type === "multi_select" ? q.selectedPositions.includes(o.position) : o.position === q.selectedPosition;
                          return (
                            <li key={o.position} className={`${correct ? "text-green-700 font-semibold" : chosen ? "text-red-600" : "text-gray-700"}`}>
                              {LETTERS[o.position]}. {o.text}{correct ? " ✓ correct answer" : ""}{chosen ? " (your answer)" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  {q.outcome === "unattempted" && <p className="text-xs text-gray-500 mt-1">Not answered</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </StudentLayout>
    );
  }

  /* ---------- taking the test ---------- */
  const answeredCount = attempt.questions.filter((q) => isAnswered(answers[q.id])).length;
  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {back}
        <section className="bg-white rounded-xl shadow p-6 sticky top-0 z-10 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-gray-500">{answeredCount} of {attempt.questions.length} answered · answers are saved automatically</p>
          </div>
          {remaining !== null && (
            <div className={`flex items-center gap-2 text-lg font-mono font-bold ${remaining < 60000 ? "text-red-600" : ""}`} data-testid="aia-timer">
              <Clock size={20} /> {formatRemaining(remaining)}
            </div>
          )}
        </section>
        <ol className="space-y-4">
          {attempt.questions.map((q) => (
            <li key={q.id} className="bg-white rounded-xl shadow p-5" data-testid="aia-question" data-type={q.type || "single_mcq"}>
              <div className="font-medium mb-1">{q.position}. {q.text}</div>
              {q.hasImage && <AuthedImage url={`${API}/assessment-agent/student/assessments/${attempt.assessmentId}/questions/${q.id}/image`} className="max-w-full max-h-80 h-auto border border-gray-200 mb-3" />}
              {q.type === "multi_select" && <p className="text-xs text-primary font-medium mb-2">Select all that apply</p>}
              {q.type === "numerical" ? (
                <div className="mt-2">
                  <label className="text-sm text-gray-600 block mb-1">{q.numericFormat === "integer" ? "Enter a whole number" : "Enter a number (decimals allowed)"}</label>
                  <input
                    className={`w-full sm:w-64 p-2 border rounded-lg font-mono ${isAnswered(answers[q.id]) && !numberDirty(q.id) ? "border-[#B99652] bg-[#fff8e7]" : ""}`}
                    inputMode={q.numericFormat === "integer" ? "numeric" : "decimal"}
                    placeholder={q.numericFormat === "integer" ? "e.g. 42" : "e.g. 12.5"}
                    value={drafts[q.id] ?? ""}
                    disabled={submitting}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    onBlur={() => saveNumber(q.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNumber(q.id); } }}
                    data-testid={`aia-number-${q.position}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {numberDirty(q.id) ? "Press Enter or click outside the box to save." : isAnswered(answers[q.id]) ? "Saved." : "Digits only; no units."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2 mt-2">
                  {q.options.map((o) => {
                    const multi = q.type === "multi_select";
                    const checked = multi ? (Array.isArray(answers[q.id]) && answers[q.id].includes(o.position)) : answers[q.id] === o.position;
                    return (
                      <label key={o.position} className={`flex items-center gap-3 p-2 border rounded-lg cursor-pointer ${checked ? "border-[#B99652] bg-[#fff8e7]" : ""}`}>
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={`q-${q.id}`}
                          checked={checked}
                          disabled={submitting || (multi && savingQ === q.id)}
                          onChange={() => (multi ? toggle(q.id, o.position) : choose(q.id, o.position))}
                          data-testid={`aia-option-${q.position}-${o.position}`}
                        />
                        <span className="w-5 font-semibold">{LETTERS[o.position]}</span>
                        <span>{o.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {savingQ === q.id && <p className="text-xs text-gray-500 mt-2">Saving...</p>}
            </li>
          ))}
        </ol>
        <button onClick={submit} disabled={submitting || savingQ !== null} data-testid="aia-submit" className="w-full py-3 bg-primary text-white rounded-lg font-semibold disabled:opacity-60">
          {submitting ? "Submitting..." : "Submit test"}
        </button>
      </div>
    </StudentLayout>
  );
}
