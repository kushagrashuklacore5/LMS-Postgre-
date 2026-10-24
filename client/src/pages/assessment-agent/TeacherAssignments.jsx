import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarClock, CheckCircle2, FileText, Inbox, Loader2, Lock, Plus, Send, Trash2,
} from "lucide-react";
import MentorLayout from "../../components/MentorLayout";
import AssignmentSubmissions from "./AssignmentSubmissions";
import { useAuth } from "../../auth/auth";
import { QuestionImageField } from "../../components/QuestionImage";
import {
  ASSIGNMENT_STATUS, Badge, Stepper, TEACHER_FLOW, apiError, dueText, toIso, toLocalInput,
} from "./assignmentUi";

/*
 * AI Assessment Agent - Descriptive Assignments (teacher). Backend: /api/assessment-agent/teacher/assignments.
 * Draft -> Publish (locks details + questions) -> Close. The submission dashboard shows who has and has
 * not submitted, lets the teacher download PDFs and record final marks. Nothing here calls an AI.
 */

const EMPTY = { title: "", instructions: "", classroomId: "", maxMarks: 10, dueAt: "" };
const newQuestion = () => ({ key: Math.random().toString(36).slice(2), text: "", maxMarks: 5, imageKey: null });
const classLabel = (c) => (c ? `${c.name} (Grade ${c.grade}${c.section ? ` ${c.section}` : ""})` : "—");

function Card({ title, subtitle, children, right }) {
  return (
    <section className="bg-white/95 backdrop-blur-sm rounded-none shadow-[0_4px_20px_rgba(0,35,102,0.06)] border border-[#ebdcaa] p-6 sm:p-7">
      {(title || right) && (
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-5 border-b border-[#ebdcaa]">
          <div>
            {title && <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{title}</h2>}
            {subtitle && <p className="text-xs text-[#7a705a] mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export default function TeacherAssignments() {
  const { token, API } = useAuth();
  const base = `${API}/assessment-agent/teacher`;
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [view, setView] = useState({ name: "list" }); // list | edit { id? } | submissions { id }
  const [list, setList] = useState(null);
  const [classrooms, setClassrooms] = useState([]);
  const [notReady, setNotReady] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([axios.get(`${base}/assignments`, auth), axios.get(`${base}/classrooms`, auth)]);
      setList(a.data.assignments);
      setClassrooms(c.data.classrooms);
    } catch (err) {
      if (err?.response?.data?.error?.code === "ASSIGNMENTS_NOT_READY") setNotReady(true);
      else toast.error(apiError(err, "Could not load assignments."));
      setList([]);
    }
  }, [base, auth]);
  useEffect(() => { loadList(); }, [loadList]);

  const back = () => { setView({ name: "list" }); loadList(); };

  if (view.name === "edit") return <MentorLayout><Editor base={base} auth={auth} classrooms={classrooms} id={view.id} onBack={back} onOpenSubmissions={(id) => setView({ name: "submissions", id })} /></MentorLayout>;
  if (view.name === "submissions") return <MentorLayout><AssignmentSubmissions base={base} auth={auth} id={view.id} onBack={back} onOpen={(id) => setView({ name: "edit", id })} /></MentorLayout>;

  return (
    <MentorLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <Link
          to="/teacher/assessments"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1e1b4b] hover:text-[#B99652] transition-colors py-1"
        >
          <ArrowLeft size={16} />
          <span>Back to AI Assessments</span>
        </Link>

        {/* Top Header Banner */}
        <div className="bg-white/95 backdrop-blur-md rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-none bg-gradient-to-br from-[#B99652] to-[#a38243] text-white flex items-center justify-center shadow-xs border border-[#ebdcaa] shrink-0">
                <FileText size={24} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Descriptive Assignments Studio
                </h1>
                <p className="text-xs sm:text-sm text-[#7a705a] mt-1 max-w-2xl">
                  Written subjective assignments answered via PDF. Create a draft, publish to a class, and track student submissions.
                </p>
                <div className="mt-3"><Stepper steps={TEACHER_FLOW} optional={[3]} testId="aia-asg-flow" /></div>
              </div>
            </div>

            {!notReady && (
              <button
                onClick={() => setView({ name: "edit" })}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs sm:text-sm border border-[#9b7b3e] shadow-xs transition-all self-start md:self-auto whitespace-nowrap"
                data-testid="aia-asg-new"
              >
                <Plus size={16} />
                <span>New Assignment</span>
              </button>
            )}
          </div>
        </div>

        {notReady ? (
          <div className="p-6 rounded-none bg-[#fff8e7] border border-[#fde68a] text-[#92400e] text-xs sm:text-sm">
            Descriptive assignments are not available yet (a database update is pending).
          </div>
        ) : list === null ? (
          <div className="p-10 text-center text-[#7a705a]">
            <Loader2 className="inline animate-spin text-[#B99652]" /> Loading assignments...
          </div>
        ) : list.length === 0 ? (
          <div className="p-12 bg-white/90 backdrop-blur-sm rounded-none border border-dashed border-[#ebdcaa] text-center shadow-xs">
            <div className="w-16 h-16 bg-gradient-to-br from-[#B99652]/20 to-[#ebdcaa]/30 rounded-none flex items-center justify-center mx-auto mb-4 border border-[#ebdcaa]">
              <Inbox size={32} className="text-[#B99652]" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#1e1b4b] mb-1">No Descriptive Assignments Yet</h3>
            <p className="text-xs sm:text-sm text-[#7a705a] max-w-md mx-auto mb-5">
              Create your first descriptive assignment: add instructions and questions with marks, then publish it to a class.
            </p>
            <button
              onClick={() => setView({ name: "edit" })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B99652] hover:bg-[#a68444] text-white font-bold text-xs rounded-none border border-[#9b7b3e]"
            >
              <Plus size={14} />
              <span>Create Assignment</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((a) => (
              <article
                key={a.id}
                className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] hover:border-[#B99652] shadow-[0_4px_20px_rgba(185,150,82,0.04)] hover:shadow-[0_8px_25px_rgba(185,150,82,0.1)] p-5 sm:p-6 flex flex-col gap-4 transition-all"
                data-testid="aia-asg-row"
                data-title={a.title}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-[#1e1b4b] truncate">{a.title}</h3>
                    <p className="text-xs text-[#7a705a] mt-0.5">
                      {classLabel(a.classroom)} · {a.maxMarks} marks · {a.questionCount} {a.questionCount === 1 ? "question" : "questions"}
                    </p>
                  </div>
                  <Badge map={ASSIGNMENT_STATUS} value={a.status} />
                </div>
                
                <div className="flex items-center gap-2 text-xs text-[#665e4d]">
                  <CalendarClock size={15} className="text-[#B99652]" />
                  <span>{dueText(a.dueAt)}</span>
                </div>

                {a.status !== "draft" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#7a705a]">
                      <span>{a.submittedCount} of {a.studentsInClass} submitted</span>
                      <span>{a.evaluatedCount} evaluated</span>
                    </div>
                    <div className="h-2 bg-[#fffdf4] border border-[#ebdcaa] rounded-none overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#B99652] to-[#d4af37] transition-all"
                        style={{ width: `${a.studentsInClass ? Math.min(100, (a.submittedCount / a.studentsInClass) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2.5 mt-auto pt-2 border-t border-[#ebdcaa]/50">
                  <button
                    onClick={() => setView({ name: "edit", id: a.id })}
                    className="px-3.5 py-1.5 border border-[#ebdcaa] rounded-none text-xs font-bold text-[#1e1b4b] bg-white hover:bg-[#fffdf4] transition-colors"
                    data-testid="aia-asg-open"
                  >
                    {a.status === "draft" ? "Edit Draft" : "View Details"}
                  </button>
                  {a.status !== "draft" && (
                    <button
                      onClick={() => setView({ name: "submissions", id: a.id })}
                      className="px-3.5 py-1.5 bg-[#B99652] text-white rounded-none text-xs font-bold border border-[#9b7b3e] hover:bg-[#a68444] transition-colors"
                      data-testid="aia-asg-view-submissions"
                    >
                      Submissions
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </MentorLayout>
  );
}

/* ---------------- draft editor / read-only view ---------------- */
function Editor({ base, auth, classrooms, id, onBack, onOpenSubmissions }) {
  const [assignment, setAssignment] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [questions, setQuestions] = useState([newQuestion()]);
  const [busy, setBusy] = useState(false);

  const accept = (a) => {
    setAssignment(a);
    setForm({ title: a.title, instructions: a.instructions, classroomId: String(a.classroomId), maxMarks: a.maxMarks, dueAt: toLocalInput(a.dueAt) });
    setQuestions(a.questions.length ? a.questions.map((q) => ({ key: String(q.id), text: q.text, maxMarks: q.maxMarks, imageKey: q.imageKey || null })) : [newQuestion()]);
  };
  useEffect(() => {
    if (!id) return;
    axios.get(`${base}/assignments/${id}`, auth).then((r) => accept(r.data.assignment)).catch((err) => toast.error(apiError(err, "Could not load the assignment.")));
  }, [id, base, auth]);

  const locked = assignment && assignment.status !== "draft";
  const total = questions.reduce((s, q) => s + (Number(q.maxMarks) || 0), 0);
  const maxMarks = Number(form.maxMarks) || 0;
  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const move = (i, d) => setQuestions((qs) => { const n = [...qs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  const save = async () => {
    const details = { title: form.title, instructions: form.instructions, classroomId: form.classroomId === "" ? null : Number(form.classroomId), maxMarks: Number(form.maxMarks), dueAt: toIso(form.dueAt) };
    const body = { questions: questions.filter((q) => q.text.trim() !== "").map((q) => ({ text: q.text, maxMarks: Number(q.maxMarks), imageKey: q.imageKey || null })) };
    let a = assignment;
    a = a ? (await axios.patch(`${base}/assignments/${a.id}`, details, auth)).data.assignment : (await axios.post(`${base}/assignments`, details, auth)).data.assignment;
    a = (await axios.put(`${base}/assignments/${a.id}/questions`, body, auth)).data.assignment;
    accept(a);
    return a;
  };

  // Synchronous lock: a double-click (same tick) must not create two drafts or publish twice.
  const inFlight = useRef(false);
  const run = async (fn, success) => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      const e = err?.response?.data?.error;
      const extra = (e?.details || []).map((d) => (d.code === "MARKS_MISMATCH" ? `question marks add up to ${d.received}, not ${d.expected}` : `${d.field || "request"}: ${d.code}`)).join("; ");
      toast.error(`${apiError(err, "Could not save.")}${extra ? ` (${extra})` : ""}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const publish = () => run(async () => {
    const a = await save();
    if (!window.confirm(`Publish "${a.title}"? Students in the class can see it and submit, and it can no longer be edited.`)) return;
    accept((await axios.post(`${base}/assignments/${a.id}/publish`, undefined, auth)).data.assignment);
  }, null);
  const close = () => run(async () => {
    if (!window.confirm(`Close "${assignment.title}"? Students can no longer submit or replace their PDFs.`)) return;
    accept((await axios.post(`${base}/assignments/${assignment.id}/close`, undefined, auth)).data.assignment);
  }, "Assignment closed");

  if (id && !assignment) return <div className="max-w-5xl mx-auto p-6 text-[#7a705a]"><Loader2 className="inline animate-spin text-[#B99652]" /> Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1e1b4b] hover:text-[#B99652] transition-colors py-1"
      >
        <ArrowLeft size={16} />
        <span>Back to All Assignments</span>
      </button>

      {/* Editor Header */}
      <div className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
            {assignment ? assignment.title : "Create New Descriptive Assignment"}
          </h1>
          <div className="my-2"><Stepper steps={TEACHER_FLOW} current={!assignment || assignment.status === "draft" ? 0 : 2} optional={[3]} testId="aia-asg-editor-flow" /></div>
          <p className="text-xs text-[#7a705a]">
            {locked ? "Published assignments are locked so every student answers identical questions." : "Drafts are private. Save as often as needed, then publish to students."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assignment && <Badge map={ASSIGNMENT_STATUS} value={assignment.status} testId="aia-asg-status" />}
          {!locked && (
            <button
              disabled={busy}
              onClick={() => run(save, "Draft saved")}
              className="px-4 py-2 border border-[#ebdcaa] bg-white hover:bg-[#fffdf4] text-[#1e1b4b] rounded-none text-xs font-bold transition-colors disabled:opacity-60"
              data-testid="aia-asg-save"
            >
              Save Draft
            </button>
          )}
          {!locked && (
            <button
              disabled={busy}
              onClick={publish}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none text-xs font-bold border border-[#9b7b3e] shadow-xs transition-all disabled:opacity-60"
              data-testid="aia-asg-publish"
            >
              {busy ? <Loader2 size={15} className="animate-spin text-white" /> : <Send size={15} className="text-white" />}
              <span>Publish Assignment</span>
            </button>
          )}
          {locked && (
            <button
              onClick={() => onOpenSubmissions(assignment.id)}
              className="px-4 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none text-xs font-bold border border-[#9b7b3e]"
              data-testid="aia-asg-view-submissions"
            >
              View Submissions
            </button>
          )}
          {assignment?.status === "published" && (
            <button
              disabled={busy}
              onClick={close}
              className="px-4 py-2 border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 rounded-none text-xs font-bold"
              data-testid="aia-asg-close"
            >
              Close Assignment
            </button>
          )}
        </div>
      </div>

      <Card title="Assignment Details" right={locked && <span className="inline-flex items-center gap-1.5 text-xs text-[#7a705a] font-bold"><Lock size={14} className="text-[#B99652]" /> Locked</span>}>
        <fieldset disabled={locked || busy} className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-[#665e4d] md:col-span-2">
            <span className="block mb-1">Title</span>
            <input
              className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
              placeholder="e.g. Photosynthesis: explain mechanisms and light-dependent reactions in your own words"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="aia-asg-title"
            />
          </label>
          <label className="text-xs font-bold text-[#665e4d]">
            <span className="block mb-1">Classroom</span>
            <select
              className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
              value={form.classroomId}
              onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
              data-testid="aia-asg-class"
            >
              <option value="">Select a class</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-[#665e4d]">
              <span className="block mb-1">Total Marks</span>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
                type="number"
                min="1"
                max="1000"
                value={form.maxMarks}
                onChange={(e) => setForm({ ...form, maxMarks: e.target.value })}
                data-testid="aia-asg-marks"
              />
            </label>
            <label className="text-xs font-bold text-[#665e4d]">
              <span className="block mb-1">Due Date (Optional)</span>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                data-testid="aia-asg-due"
              />
            </label>
          </div>
          <label className="text-xs font-bold text-[#665e4d] md:col-span-2">
            <span className="block mb-1">Instructions for Students</span>
            <textarea
              className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
              rows={3}
              placeholder="What should students answer? Provide specific formatting or diagram requirements."
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              data-testid="aia-asg-instructions"
            />
          </label>
        </fieldset>
      </Card>

      <Card
        title="Questions & Prompts"
        subtitle="Students answer these in their PDF submission. Individual marks must sum to total."
        right={(
          <div className={`text-xs font-bold px-3 py-1.5 rounded-none border ${total === maxMarks ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-[#fff8e7] text-[#92400e] border-[#fde68a]"}`} data-testid="aia-asg-tally">
            {total} / {maxMarks} marks {total === maxMarks ? <CheckCircle2 size={13} className="inline ml-1 text-emerald-600" /> : ""}
          </div>
        )}
      >
        <ol className="space-y-3.5">
          {questions.map((q, i) => (
            <li key={q.key} className="flex gap-3 p-4 rounded-none border border-[#ebdcaa] bg-[#fffdf4]/30">
              <span className="w-7 h-7 shrink-0 rounded-none bg-[#B99652] text-white font-bold flex items-center justify-center text-xs border border-[#9b7b3e]">
                {i + 1}
              </span>
              <div className="flex-1 space-y-2">
                <textarea
                  disabled={locked || busy}
                  className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs sm:text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
                  rows={2}
                  placeholder="Write the question or prompt"
                  value={q.text}
                  onChange={(e) => setQ(i, { text: e.target.value })}
                  data-testid="aia-asg-question"
                />
                <QuestionImageField imageKey={q.imageKey} onChange={(imageKey) => setQ(i, { imageKey })} disabled={locked || busy} />
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#665e4d]">
                  <span>Marks for this question:</span>
                  <input
                    disabled={locked || busy}
                    type="number"
                    min="1"
                    max="1000"
                    className="w-20 p-1 border border-[#ebdcaa] rounded-none bg-white text-xs text-[#1e1b4b] font-bold focus:border-[#B99652] outline-none"
                    value={q.maxMarks}
                    onChange={(e) => setQ(i, { maxMarks: e.target.value })}
                    data-testid="aia-asg-question-marks"
                  />
                </label>
              </div>
              {!locked && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button disabled={busy || i === 0} title="Move up" onClick={() => move(i, -1)} className="p-1 rounded-none hover:bg-white text-[#7a705a] disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button disabled={busy || i === questions.length - 1} title="Move down" onClick={() => move(i, 1)} className="p-1 rounded-none hover:bg-white text-[#7a705a] disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button disabled={busy || questions.length === 1} title="Remove" onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== i))} className="p-1 rounded-none text-red-500 hover:bg-white disabled:opacity-30"><Trash2 size={14} /></button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {!locked && (
          <button
            disabled={busy}
            onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
            className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 border border-dashed border-[#ebdcaa] hover:border-[#B99652] rounded-none text-xs font-bold text-[#1e1b4b] bg-white hover:bg-[#fffdf4] transition-all"
            data-testid="aia-asg-add-question"
          >
            <Plus size={14} className="text-[#B99652]" />
            <span>Add Question</span>
          </button>
        )}
      </Card>
    </div>
  );
}
