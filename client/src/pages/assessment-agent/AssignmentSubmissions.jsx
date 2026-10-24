import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Download, Loader2, Sparkles, Users, XCircle } from "lucide-react";
import { ASSIGNMENT_STATUS, Badge, Stepper, SUBMISSION_STATUS, apiError, downloadPdf, dueText, fmtBytes, fmtDateTime } from "./assignmentUi";

/*
 * AI Assessment Agent - Descriptive Assignments: teacher submission dashboard (Prompt 2).
 * Loading this page never calls an AI. "Evaluate with AI" is the ONLY trigger: one request per click
 * (a per-row lock ignores double-clicks; the server also answers 429 to a concurrent request).
 * AI results are SUGGESTIONS: "Accept suggestions" only pre-fills the final-marks form; nothing is
 * saved until the teacher clicks "Save final marks". Students never see AI suggestions.
 */

const FILTERS = [["all", "All"], ["not_submitted", "Not submitted"], ["submitted", "Awaiting evaluation"], ["evaluated", "Evaluated"], ["missed", "Missed"]];
const classLabel = (c) => (c ? `${c.name} (Grade ${c.grade}${c.section ? ` ${c.section}` : ""})` : "—");

function Stat({ label, value, tone = "text-[#1e1b4b]", icon: Icon }) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_20px_rgba(185,150,82,0.04)] p-4">
      <div className="text-[11px] uppercase font-bold tracking-wider text-[#7a705a] flex items-center gap-1.5">
        {Icon && <Icon size={14} className="text-[#B99652]" />}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold mt-1 font-['DM_Serif_Display',serif] ${tone}`}>{value}</div>
    </div>
  );
}

function AiStatus({ state, seconds }) {
  if (state === "evaluating") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#92400e]" data-testid="aia-asg-ai-status" data-state="evaluating">
        <Loader2 size={13} className="animate-spin text-[#B99652]" />
        <span>Evaluating... {seconds}s</span>
      </span>
    );
  }
  const [label, cls] = {
    ready: ["AI Suggestion Ready", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
    failed: ["AI Evaluation Failed", "bg-rose-50 text-rose-700 border border-rose-200"],
    none: ["Not Evaluated", "bg-[#fffdf4] text-[#7a705a] border border-[#ebdcaa]"],
  }[state];
  return (
    <span className={`inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-none ${cls}`} data-testid="aia-asg-ai-status" data-state={state}>
      {label}
    </span>
  );
}

export default function AssignmentSubmissions({ base, auth, id, onBack, onOpen }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [evaluating, setEvaluating] = useState({}); // submissionId -> start ms
  const [failed, setFailed] = useState({}); // submissionId -> safe message
  const [panel, setPanel] = useState(null); // { submissionId, mode: 'ai' | 'review', form?: { marks: { Q1: '' }, feedback, fromAi } }
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);
  const inFlight = useRef(new Set()); // synchronous per-row lock
  const saveLock = useRef(false); // synchronous lock: "Save final marks" writes once per click

  const load = useCallback(async () => {
    try {
      setData((await axios.get(`${base}/assignments/${id}/submissions`, auth)).data); // facts only; no AI call
    } catch (err) {
      toast.error(apiError(err, "Could not load submissions."));
    }
  }, [base, auth, id]);
  useEffect(() => { load(); }, [load]);

  const busyCount = Object.keys(evaluating).length;
  useEffect(() => {
    if (!busyCount) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busyCount]);

  const replaceSubmission = (submission) => setData((d) => ({ ...d, students: d.students.map((r) => (r.submission && r.submission.id === submission.id ? { ...r, submission, status: submission.status === "evaluated" ? "evaluated" : r.status } : r)) }));

  /** The ONLY AI trigger on this page. */
  const evaluate = async (submissionId) => {
    if (inFlight.current.has(submissionId)) return; // double-click: ignored
    inFlight.current.add(submissionId);
    setEvaluating((e) => ({ ...e, [submissionId]: Date.now() }));
    setFailed((f) => { const n = { ...f }; delete n[submissionId]; return n; });
    try {
      const res = await axios.post(`${base}/assignments/${id}/submissions/${submissionId}/evaluate-ai`, undefined, auth);
      replaceSubmission(res.data.submission);
      setPanel({ submissionId, mode: "ai" });
    } catch (err) {
      setFailed((f) => ({ ...f, [submissionId]: apiError(err, "The AI evaluation could not be completed. You can mark this submission manually.") }));
    } finally {
      inFlight.current.delete(submissionId);
      setEvaluating((e) => { const n = { ...e }; delete n[submissionId]; return n; });
    }
  };

  const openReview = (sub, fromAi) => {
    const marks = {};
    for (const q of data.questions) {
      const ai = fromAi ? sub.aiEvaluation.questions.find((x) => x.questionId === q.questionId) : null;
      const final = !fromAi && sub.questionMarks ? sub.questionMarks.find((x) => x.questionId === q.questionId) : null;
      marks[q.questionId] = ai ? String(ai.marksAwarded) : final ? String(final.marks) : "";
    }
    const feedback = fromAi ? (sub.aiEvaluation.overallFeedback || "") : (sub.teacherFeedback || "");
    setPanel({ submissionId: sub.id, mode: "review", form: { marks, feedback, fromAi } });
  };

  const save = async (a) => {
    if (saving || saveLock.current) return;
    const { form, submissionId } = panel;
    const questionMarks = data.questions.map((q) => ({ questionId: q.questionId, marks: Number(form.marks[q.questionId]) }));
    if (data.questions.some((q) => form.marks[q.questionId] === "" || Number.isNaN(Number(form.marks[q.questionId])))) { toast.error("Enter marks for every question."); return; }
    // Name the question instead of the server's generic "marks are not valid" (the server still validates).
    const bad = data.questions.find((q) => { const m = Number(form.marks[q.questionId]); return m < 0 || m > q.maxMarks || Math.round(m * 2) !== m * 2; });
    if (bad) { toast.error(`${bad.questionId}: enter a mark from 0 to ${bad.maxMarks}, in steps of 0.5.`); return; }
    saveLock.current = true;
    setSaving(true);
    try {
      const res = await axios.put(`${base}/assignments/${id}/submissions/${submissionId}/evaluation`, { questionMarks, teacherFeedback: form.feedback }, auth);
      replaceSubmission(res.data.submission);
      toast.success(`Final marks saved: ${res.data.submission.finalMarks} / ${a.maxMarks}`);
      setPanel(null);
      load();
    } catch (err) {
      toast.error(apiError(err, "Could not save the marks."));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  if (!data) return <div className="max-w-6xl mx-auto p-6 text-[#7a705a]"><Loader2 className="inline animate-spin text-[#B99652]" /> Loading...</div>;
  const { assignment: a, summary: s } = data;
  const rows = data.students.filter((r) => filter === "all" || r.status === filter);
  const aiState = (sub) => (evaluating[sub.id] ? "evaluating" : failed[sub.id] ? "failed" : sub.aiEvaluation ? "ready" : "none");
  const qText = (qid) => data.questions.find((q) => q.questionId === qid)?.text || "";

  const AiPanel = ({ sub }) => {
    const ev = sub.aiEvaluation;
    return (
      <div className="rounded-none border border-[#B99652] bg-[#fffdf4] p-5 space-y-4 shadow-xs" data-testid="aia-asg-ai-panel">
        <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[#ebdcaa]">
          <div>
            <h3 className="font-bold text-[#1e1b4b] text-base flex items-center gap-2">
              <Sparkles size={16} className="text-[#B99652]" />
              <span>AI Suggested Evaluation</span>
            </h3>
            <p className="text-xs text-[#7a705a] mt-0.5">Generated {fmtDateTime(ev.generatedAt)} · teacher suggestion only; student will see only confirmed final marks.</p>
          </div>
          <div className="text-right">
            <span className="inline-block mb-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
              Private · Hidden from student
            </span>
            <div className="text-xs text-[#7a705a]">AI Suggested Total</div>
            <div className="text-xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif]" data-testid="aia-asg-ai-total">{ev.suggestedTotal} / {a.maxMarks}</div>
          </div>
        </div>

        <ol className="space-y-3">
          {ev.questions.map((q) => (
            <li key={q.questionId} className="rounded-none bg-white border border-[#ebdcaa] p-3.5 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-xs text-[#1e1b4b]">
                  {q.questionId} <span className="font-normal text-[#7a705a]">— {qText(q.questionId)}</span>
                </span>
                <span className="text-xs font-bold text-[#92400e] bg-[#fff8e7] px-2 py-0.5 rounded-none border border-[#fde68a]">
                  Suggested: {q.marksAwarded} / {q.maxMarks}
                </span>
              </div>
              <p className="text-xs text-[#665e4d] leading-relaxed"><strong className="text-[#1e1b4b]">Feedback:</strong> {q.feedback}</p>
            </li>
          ))}
        </ol>

        {ev.overallFeedback && (
          <div className="p-3 bg-white border border-[#ebdcaa] rounded-none">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a]">Overall Synthesis & Feedback</div>
            <p className="text-xs text-[#1e1b4b] mt-1 leading-relaxed">{ev.overallFeedback}</p>
          </div>
        )}

        {ev.limitations.length > 0 && (
          <div className="rounded-none bg-[#fff8e7] border border-[#fde68a] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#92400e] flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-[#d97706]" />
              <span>Pedagogical Considerations & Limitations</span>
            </div>
            <ul className="list-disc pl-5 text-xs text-[#92400e] mt-1 space-y-0.5">{ev.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            onClick={() => openReview(sub, true)}
            className="px-4 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none text-xs font-bold border border-[#9b7b3e] shadow-xs transition-all"
            data-testid="aia-asg-ai-accept"
          >
            Accept Suggestions & Finalize
          </button>
          <button
            onClick={() => openReview(sub, false)}
            className="px-4 py-2 border border-[#ebdcaa] rounded-none text-xs font-bold text-[#1e1b4b] bg-white hover:bg-[#fffdf4] transition-colors"
            data-testid="aia-asg-ai-edit"
          >
            Edit Manually
          </button>
          <button onClick={() => setPanel(null)} className="px-3 py-2 text-xs font-bold text-[#7a705a] hover:text-[#1e1b4b]">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const ReviewForm = ({ sub }) => {
    const { form } = panel;
    const set = (patch) => setPanel((p) => ({ ...p, form: { ...p.form, ...patch } }));
    const total = data.questions.reduce((t, q) => t + (Number(form.marks[q.questionId]) || 0), 0);
    return (
      <div className="rounded-none border border-[#ebdcaa] p-5 bg-white space-y-4 shadow-xs" data-testid="aia-asg-review">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#ebdcaa]">
          <div>
            <h3 className="font-bold text-[#1e1b4b] text-base">Finalize Grade & Teacher Feedback</h3>
            <p className="text-xs text-[#7a705a]">Saving makes these marks and your feedback visible to the student.</p>
          </div>
          {form.fromAi && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
              Pre-filled from AI Suggestion
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {data.questions.map((q) => {
            const ai = sub.aiEvaluation?.questions.find((x) => x.questionId === q.questionId);
            return (
              <label key={q.questionId} className="flex items-center justify-between gap-3 rounded-none border border-[#ebdcaa] p-3 text-xs bg-[#fffdf4]/30">
                <span className="min-w-0">
                  <strong className="text-[#1e1b4b]">{q.questionId}:</strong> <span className="text-[#665e4d] truncate">{q.text}</span>
                  {ai && <span className="block text-[11px] text-[#B99652] font-semibold mt-0.5">AI suggested {ai.marksAwarded}</span>}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max={q.maxMarks}
                    step="0.5"
                    className="w-18 p-1.5 border border-[#ebdcaa] rounded-none bg-white font-bold text-xs text-[#1e1b4b] focus:border-[#B99652] outline-none"
                    value={form.marks[q.questionId]}
                    onChange={(e) => set({ marks: { ...form.marks, [q.questionId]: e.target.value } })}
                    data-testid={`aia-asg-mark-${q.questionId}`}
                  />
                  <span className="text-[#7a705a] font-bold">/ {q.maxMarks}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="text-xs text-[#665e4d] font-bold">
          Calculated Total: <span className="text-sm text-[#1e1b4b]" data-testid="aia-asg-review-total">{total} / {a.maxMarks}</span>
        </div>

        <textarea
          className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-xs text-[#1e1b4b] bg-[#fffdf4]/40 focus:border-[#B99652] outline-none"
          rows={3}
          placeholder="Personalized remarks and constructive feedback for the student (optional)"
          value={form.feedback}
          onChange={(e) => set({ feedback: e.target.value })}
          data-testid="aia-asg-review-feedback"
        />

        <div className="flex gap-2 pt-1">
          <button
            disabled={saving}
            onClick={() => save(a)}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none text-xs font-bold border border-[#9b7b3e] shadow-xs transition-all disabled:opacity-60"
            data-testid="aia-asg-save-final"
          >
            {saving ? <Loader2 size={14} className="animate-spin text-white" /> : null}
            <span>Save & Publish Final Marks</span>
          </button>
          <button
            onClick={() => setPanel(null)}
            className="px-4 py-2 border border-[#ebdcaa] rounded-none text-xs font-bold text-[#665e4d] bg-white hover:bg-[#fffdf4]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="aia-asg-submissions">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1e1b4b] hover:text-[#B99652] transition-colors py-1"
      >
        <ArrowLeft size={16} />
        <span>Back to All Assignments</span>
      </button>

      {/* Top Banner */}
      <div className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#B99652] block mb-1">Submissions Review</span>
          <h1 className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{a.title}</h1>
          <p className="text-xs text-[#7a705a] mt-0.5">{classLabel(a.classroom)} · {a.maxMarks} marks · {dueText(a.dueAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge map={ASSIGNMENT_STATUS} value={a.status} />
          <button
            onClick={() => onOpen(a.id)}
            className="px-3.5 py-1.5 border border-[#ebdcaa] bg-white hover:bg-[#fffdf4] text-[#1e1b4b] rounded-none text-xs font-bold transition-colors"
          >
            View Specification
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total Enrolled" value={s.students} icon={Users} />
        <Stat label="Submitted" value={s.submitted + s.evaluated} tone="text-[#1e1b4b]" icon={CheckCircle2} />
        <Stat label="Pending" value={s.notSubmitted} tone="text-[#92400e]" icon={ClipboardList} />
        <Stat label="Evaluated" value={s.evaluated} tone="text-emerald-700" icon={CheckCircle2} />
        <Stat label="Missed" value={s.missed} tone="text-rose-700" icon={XCircle} />
      </div>

      <div className="rounded-none border border-[#ebdcaa] bg-[#fffdf4] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="aia-asg-marking-flow">
        <span className="text-xs font-bold uppercase tracking-wide text-[#1e1b4b]">Marking Workflow</span>
        <Stepper steps={["AI suggests marks", "Teacher reviews", "Save final marks", "Student accesses feedback"]} optional={[0]} />
      </div>

      <section className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7">
        <div className="flex flex-wrap gap-2 mb-4" role="tablist">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-none text-xs font-bold border transition-all ${
                filter === k
                  ? "bg-[#B99652] text-white border-[#9b7b3e] shadow-xs"
                  : "border-[#ebdcaa] text-[#665e4d] bg-white hover:bg-[#fffdf4]"
              }`}
            >
              {label} <span className="opacity-75 font-normal ml-0.5">({k === "all" ? s.students : k === "not_submitted" ? s.notSubmitted : k === "submitted" ? s.submitted : k === "evaluated" ? s.evaluated : s.missed})</span>
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-[#7a705a] border border-dashed border-[#ebdcaa]">
            {s.students === 0 ? "No students are enrolled in this class." : "No student submissions matching the selected filter."}
          </p>
        ) : (
          <div className="overflow-x-auto border border-[#ebdcaa]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#665e4d] bg-[#fffdf4] border-b border-[#ebdcaa] font-bold">
                  <th className="py-2.5 px-3">Student</th>
                  <th className="px-3">Submission</th>
                  <th className="px-3">AI Suggestion</th>
                  <th className="px-3">Final Marks</th>
                  <th className="px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebdcaa]/60 bg-white">
                {rows.map((r) => {
                  const sub = r.submission;
                  const open = sub && panel?.submissionId === sub.id;
                  return (
                    <Fragment key={r.studentId}>
                      <tr className={`align-top hover:bg-[#fffdf4]/40 transition-colors ${open ? "bg-[#fffdf4]/60" : ""}`} data-testid="aia-asg-sub-row" data-student={r.studentName} data-status={r.status}>
                        <td className="py-3 px-3 font-bold text-[#1e1b4b]">{r.studentName}</td>
                        <td className="py-3 px-3">
                          <Badge map={SUBMISSION_STATUS} value={r.status} testId="aia-asg-sub-status" />
                          {sub && (
                            <div className="mt-1.5 text-[11px] text-[#7a705a]">
                              {fmtDateTime(sub.submittedAt)} ·{" "}
                              <button
                                onClick={() => downloadPdf(`${base}/assignments/${id}/submissions/${sub.id}/file`, auth, sub.originalFilename).catch(() => toast.error("Could not download the file."))}
                                className="inline-flex items-center gap-1 text-[#B99652] font-bold hover:underline"
                                title="Download PDF"
                              >
                                <Download size={11} className="text-[#B99652]" />
                                <span className="max-w-[10rem] truncate">{sub.originalFilename}</span>
                              </button>{" "}
                              · {fmtBytes(sub.fileSize)}{sub.version > 1 ? ` · v${sub.version}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {sub ? <AiStatus state={aiState(sub)} seconds={evaluating[sub.id] ? Math.floor((Date.now() - evaluating[sub.id]) / 1000) : 0} /> : <span className="text-[#a09783]">—</span>}
                          {sub && failed[sub.id] && <p className="text-[11px] text-rose-600 mt-1 max-w-[14rem]" data-testid="aia-asg-ai-error">{failed[sub.id]}</p>}
                          {sub?.aiEvaluation && !evaluating[sub.id] && <p className="text-[11px] font-bold text-[#92400e] mt-1" data-testid="aia-asg-ai-suggested">AI: {sub.aiEvaluation.suggestedTotal} / {a.maxMarks}</p>}
                        </td>
                        <td className="py-3 px-3 font-bold text-[#1e1b4b]" data-testid="aia-asg-final-marks">
                          {sub?.finalMarks != null ? `${sub.finalMarks} / ${a.maxMarks}` : <span className="text-[#a09783] font-normal">— / {a.maxMarks}</span>}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {sub && (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                disabled={!!evaluating[sub.id]}
                                onClick={() => evaluate(sub.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold border border-[#B99652] text-[#92400e] bg-[#fff8e7] hover:bg-[#ebdcaa]/40 disabled:opacity-50"
                                data-testid="aia-asg-evaluate-ai"
                              >
                                {evaluating[sub.id] ? <Loader2 size={12} className="animate-spin text-[#B99652]" /> : <Sparkles size={12} className="text-[#B99652]" />}
                                <span>{sub.aiEvaluation ? "Re-evaluate" : "AI Evaluate"}</span>
                              </button>
                              {sub.aiEvaluation && (
                                <button
                                  onClick={() => setPanel(open && panel.mode === "ai" ? null : { submissionId: sub.id, mode: "ai" })}
                                  className="px-2.5 py-1 border border-[#ebdcaa] rounded-none text-[11px] font-bold text-[#1e1b4b] bg-white hover:bg-[#fffdf4]"
                                  data-testid="aia-asg-view-ai"
                                >
                                  View AI
                                </button>
                              )}
                              <button
                                onClick={() => openReview(sub, false)}
                                className="px-2.5 py-1 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none text-[11px] font-bold border border-[#9b7b3e]"
                                data-testid="aia-asg-review-open"
                              >
                                Grade
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[#ebdcaa]">
                          <td colSpan={5} className="p-4 bg-[#fffdf4]/20">
                            {panel.mode === "ai" && sub.aiEvaluation ? AiPanel({ sub }) : panel.mode === "review" ? ReviewForm({ sub }) : null}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
