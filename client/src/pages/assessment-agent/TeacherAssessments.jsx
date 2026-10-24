import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  BookOpen,
  School,
  Clock,
  ChevronRight,
  AlertCircle,
  Award
} from "lucide-react";
import MentorLayout from "../../components/MentorLayout";
import { useAuth } from "../../auth/auth";
import { AuthedImage } from "../../components/QuestionImage";
import AiAssessmentGenerator from "./AiAssessmentGenerator";
import AssessmentReport from "./AssessmentReport";
import AssignToModal, { publishBody, recipientsText } from "./AssignToModal";
import QuestionEditor from "./QuestionEditor";
import { LETTERS, TYPE_LABEL, answerKeyText, blankQuestion, toBody, toEditable } from "./questionForm";

/*
 * AI Assessment Agent - teacher page (Step 1: manual MCQ tests; Step 2: "Generate with AI").
 * Backend: /api/assessment-agent (ai-modules/ai-assessment-agent). The server
 * owns school, owner, status and every rule; this page only sends what the
 * teacher typed and shows the server's answer. Remove this file and its route
 * in App.jsx to remove the UI.
 */

const EMPTY_DETAILS = { title: "", subject: "", description: "", classroomId: "", courseId: "", durationMinutes: "", opensAt: "", closesAt: "" };

/* Step 5: <input type="datetime-local"> works in the teacher's local time; the server stores UTC ISO. */
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local) => (local ? new Date(local).toISOString() : null);
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString() : "");
const EMPTY_QUESTION = blankQuestion();

const CODE_TEXT = {
  REQUIRED: "is required",
  TOO_LONG: "is too long",
  INVALID_ID: "is not valid",
  OUT_OF_RANGE: "must be between 1 and 600 minutes",
  CLASSROOM_NOT_FOUND: "is not a class in your school",
  NO_CORRECT_OPTION: "need a correct answer",
  MULTIPLE_CORRECT_OPTIONS: "need exactly one correct answer",
  TOO_FEW_CORRECT_OPTIONS: "need at least two correct answers for a multiple-select question",
  NOT_ALLOWED_FOR_TYPE: "is not used for this question type",
  INVALID_NUMBER: "must be a plain number (e.g. 42 or -3.5)",
  NOT_AN_INTEGER: "must be a whole number",
  TOO_MANY_DECIMALS: "can have at most 6 decimal places",
  TOO_MANY_DIGITS: "is too long",
  INVALID_NUMBER_FORMAT: "must be whole number or decimal",
  INVALID_QUESTION_TYPE: "is not a supported question type",
  UNSAFE_INSTRUCTIONS: "contain wording that tries to change how the AI works; please rephrase them",
  INVALID_TEMPLATE: "is not a known template",
  DUPLICATE_OPTIONS: "must all be different",
  WRONG_OPTION_COUNT: "must be exactly 4",
  NO_QUESTIONS: "add at least one question",
  INVALID_QUESTION: "is not valid",
  INVALID_DIFFICULTY: "must be easy, medium or hard",
  TOO_MANY_QUESTIONS: "has too many questions",
  MUST_BE_TEXT: "must be text",
  INVALID_DATETIME: "is not a valid date and time",
  CLOSES_BEFORE_OPENS: "must be after the opening time",
  CLOSES_IN_PAST: "is already in the past",
  NOT_IN_CLASS: "includes a student who is not in this class",
  SELECT_AT_LEAST_ONE: "needs at least one student",
  DUPLICATE: "lists a student twice",
};

/** Turns the server's { error: { message, details } } into one readable line. */
function errorText(err) {
  const e = err?.response?.data?.error;
  if (!e) return "Could not reach the server.";
  const parts = (e.details || []).map((d) => `${d.field || "request"} ${CODE_TEXT[d.code] || d.code}`);
  return parts.length ? `${e.message} ${parts.join("; ")}.` : e.message;
}

function classLabel(c) {
  return c ? `${c.name} (Grade ${c.grade}${c.section ? ` ${c.section}` : ""})` : "No class selected";
}

export default function TeacherAssessments() {
  const { token, API } = useAuth();
  const base = `${API}/assessment-agent/teacher`;
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [list, setList] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  // class id -> the teacher's courses taught to that class (a test belongs to one of them)
  const [coursesByClass, setCoursesByClass] = useState({});
  const [current, setCurrent] = useState(null); // open assessment (detail)
  const [creating, setCreating] = useState(false); // "New test" form before the draft exists
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [question, setQuestion] = useState(EMPTY_QUESTION);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiMode, setAiMode] = useState(false); // Step 2: generate + review screen
  const [aiPrefill, setAiPrefill] = useState(null); // from the AI Performance Report's "Generate this assessment"
  const location = useLocation();
  const navigate = useNavigate();
  // Opening the pre-filled generator is NOT an AI call; generation still needs the "Generate Questions" click.
  // The navigation state is cleared at once, so a refresh or "back" never reopens it.
  useEffect(() => {
    const prefill = location.state?.aiPrefill;
    if (!prefill) return;
    setAiPrefill(prefill);
    setAiMode(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  const [showReport, setShowReport] = useState(false); // Step 3: results report
  const [assignOpen, setAssignOpen] = useState(false); // "Assign to" popup before publishing
  const [ai, setAi] = useState({ available: false, reason: null });
  const [typesAvailable, setTypesAvailable] = useState(["single_mcq"]); // which question types the server can store

  // Read-only (no LLM): which question types can be saved (multiple-select/numerical need migration 006).
  useEffect(() => {
    axios.get(`${base}/ai/templates`, auth)
      .then((res) => setTypesAvailable(res.data.questionTypesAvailable))
      .catch(() => setTypesAvailable(["single_mcq"]));
  }, [base, auth]);

  // AI availability is separate from the list: if it fails, manual creation still works.
  useEffect(() => {
    axios.get(`${base}/ai/status`, auth)
      .then((res) => setAi(res.data.ai))
      .catch(() => setAi({ available: false, reason: "AI_UNAVAILABLE" }));
  }, [base, auth]);

  const loadList = useCallback(async () => {
    try {
      const [a, c, o] = await Promise.all([
        axios.get(`${base}/assessments`, auth),
        axios.get(`${base}/classrooms`, auth),
        axios.get(`${API}/courses/teaching/overview`, auth).catch(() => null),
      ]);
      setList(a.data.assessments);
      setClassrooms(c.data.classrooms);
      setCoursesByClass(Object.fromEntries((o?.data?.data?.classes || []).map((k) => [String(k.id), k.courses])));
    } catch (err) {
      toast.error(errorText(err));
    }
  }, [base, auth, API]);

  useEffect(() => { loadList(); }, [loadList]);

  const open = (assessment) => {
    if (!current || current.id !== assessment.id) setShowReport(false);
    setCurrent(assessment);
    setCreating(false);
    setAiMode(false);
    setDetails({
      title: assessment.title,
      subject: assessment.subject,
      description: assessment.description || "",
      classroomId: assessment.classroomId ?? "",
      courseId: assessment.courseId ?? "",
      durationMinutes: assessment.durationMinutes ?? "",
      opensAt: toLocalInput(assessment.opensAt),
      closesAt: toLocalInput(assessment.closesAt),
    });
    setQuestion(EMPTY_QUESTION);
    setEditingQuestionId(null);
  };

  const runLock = useRef(false); // synchronous lock: a double-click must not create two drafts
  const run = async (action, success) => {
    if (runLock.current) return null;
    runLock.current = true;
    setBusy(true);
    try {
      const res = await action();
      if (res?.data?.assessment) open(res.data.assessment);
      if (success) toast.success(success);
      return res;
    } catch (err) {
      toast.error(errorText(err));
      return null;
    } finally {
      runLock.current = false;
      setBusy(false);
    }
  };

  const detailsBody = () => ({
    title: details.title,
    subject: details.subject,
    description: details.description,
    classroomId: details.classroomId === "" ? null : Number(details.classroomId),
    ...(details.courseId === "" ? {} : { courseId: Number(details.courseId) }),
    durationMinutes: details.durationMinutes === "" ? null : Number(details.durationMinutes),
    opensAt: toIso(details.opensAt),
    closesAt: toIso(details.closesAt),
  });

  const saveDetails = () =>
    current
      ? run(() => axios.patch(`${base}/assessments/${current.id}`, detailsBody(), auth), "Details saved")
      : run(() => axios.post(`${base}/assessments`, detailsBody(), auth), "Draft created");

  const questionBody = () => toBody(question);

  const saveQuestion = async () => {
    const url = `${base}/assessments/${current.id}/questions`;
    const res = editingQuestionId
      // No success toast: the updated question list is the feedback (stacked toasts covered "Publish").
      ? await run(() => axios.put(`${url}/${editingQuestionId}`, questionBody(), auth))
      : await run(() => axios.post(url, questionBody(), auth));
    if (res) { setQuestion(EMPTY_QUESTION); setEditingQuestionId(null); }
  };

  const editQuestion = (q) => {
    setEditingQuestionId(q.id);
    setQuestion(toEditable(q));
  };

  const deleteQuestion = (q) => {
    if (window.confirm(`Delete question ${q.position}?`)) {
      run(() => axios.delete(`${base}/assessments/${current.id}/questions/${q.id}`, auth), "Question deleted");
    }
  };

  const publishClass = current ? classrooms.find((c) => String(c.id) === String(current.classroomId)) : null;
  const setStatus = (action) => {
    if (action === "publish") {
      // Choose the recipients first ("Assign to" popup); the server still checks class + questions.
      if (!publishClass) { toast.error("Choose the class for this test (and save the details) before publishing."); return; }
      setAssignOpen(true);
      return;
    }
    run(() => axios.post(`${base}/assessments/${current.id}/${action}`, undefined, auth), "Moved back to draft");
  };
  const confirmPublish = async (ids, wholeClass) => {
    const res = await run(() => axios.post(`${base}/assessments/${current.id}/publish`, publishBody(ids, wholeClass), auth),
      wholeClass ? "Published to the whole class" : `Published to ${ids.length} student${ids.length === 1 ? "" : "s"}`);
    if (res) setAssignOpen(false);
  };

  const back = () => { setCurrent(null); setCreating(false); setAiMode(false); setDetails(EMPTY_DETAILS); loadList(); };
  const startNew = () => { setCurrent(null); setDetails(EMPTY_DETAILS); setCreating(true); };
  const locked = current?.status === "published";
  const closed = !!current?.closedAt || (!!current?.closesAt && Date.parse(current.closesAt) <= Date.now()); // display only; the server decides

  const closeTest = () => {
    if (!window.confirm(`Close "${current.title}" now? Students can no longer start it, and any test in progress is submitted automatically with the answers saved so far. This cannot be undone.`)) return;
    run(() => axios.post(`${base}/assessments/${current.id}/close`, undefined, auth), "Test closed");
  };

  /* ---------- AI generate + review (Step 2) ---------- */
  if (aiMode) {
    return (
      <MentorLayout>
        <AiAssessmentGenerator
          base={base}
          auth={auth}
          classrooms={classrooms}
          coursesByClass={coursesByClass}
          classLabel={classLabel}
          errorText={errorText}
          prefill={aiPrefill}
          onCancel={() => { setAiPrefill(null); back(); }}
          onSaved={(assessment) => { setAiPrefill(null); open(assessment); loadList(); }}
        />
      </MentorLayout>
    );
  }

  /* ---------- list view ---------- */
  if (!current && !creating) {
    return (
      <MentorLayout>
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
          
          {/* Header Banner */}
          <div className="relative bg-white/95 backdrop-blur-md rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.08)] p-6 sm:p-8 border border-[#ebdcaa] overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#B99652]/15 via-[#ebdcaa]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-none bg-gradient-to-br from-[#B99652] to-[#a38243] text-white flex items-center justify-center shadow-xs border border-[#ebdcaa] shrink-0">
                  <Sparkles size={24} className="stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-wide">
                    AI Assessments Studio
                  </h1>
                  <p className="text-xs sm:text-sm text-[#7a705a] mt-1 max-w-2xl leading-relaxed">
                    Create manual tests, generate smart curriculum questions with AI, and evaluate class mastery in real time.
                  </p>
                </div>
              </div>

              {/* Action Buttons - aligned in one line with golden luxury theme */}
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
                <Link
                  to="/teacher/assessments/assignments"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white border border-[#9b7b3e] rounded-none font-bold text-xs sm:text-sm shadow-xs transition-all whitespace-nowrap"
                  data-testid="aia-open-assignments"
                >
                  <FileText size={16} />
                  <span>Descriptive Assignments</span>
                </Link>

                <button
                  onClick={() => setAiMode(true)}
                  disabled={!ai.available}
                  title={ai.available ? "Let AI suggest questions for you to review" : "AI generation is not available. You can still create tests manually."}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white border border-[#9b7b3e] rounded-none font-bold text-xs sm:text-sm shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Sparkles size={16} />
                  <span>Generate with AI</span>
                </button>

                <button
                  onClick={startNew}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white border border-[#9b7b3e] rounded-none font-bold text-xs sm:text-sm shadow-xs transition-all whitespace-nowrap"
                >
                  <Plus size={16} />
                  <span>New Test</span>
                </button>
              </div>
            </div>
          </div>

          {!ai.available && ai.reason && (
            <div className="p-4 rounded-none bg-[#fff8e7] border border-[#fde68a] text-[#92400e] text-xs sm:text-sm flex items-center gap-2.5 shadow-xs" data-testid="aia-ai-unavailable">
              <AlertCircle size={18} className="text-[#d97706] shrink-0" />
              <span>AI question generation is temporarily unavailable. You can still create and manage tests with <strong>"New Test"</strong>.</span>
            </div>
          )}

          {/* Assessment Cards Grid */}
          {list.length === 0 ? (
            <div className="p-10 bg-white/90 backdrop-blur-sm rounded-none border border-dashed border-[#ebdcaa] text-center shadow-xs">
              <div className="w-16 h-16 bg-gradient-to-br from-[#B99652]/20 to-[#ebdcaa]/30 rounded-none flex items-center justify-center mx-auto mb-4 border border-[#ebdcaa]">
                <BookOpen className="text-[#B99652]" size={28} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#1e1b4b] mb-1">No Assessments Created Yet</h3>
              <p className="text-xs sm:text-sm text-[#7a705a] max-w-md mx-auto mb-5">
                Generate questions with AI or start a new test manually. Every test starts as a draft: review it, publish it for a class, and see results in its report.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => setAiMode(true)}
                  disabled={!ai.available}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white font-bold text-xs sm:text-sm rounded-none border border-[#9b7b3e] shadow-xs transition-all"
                >
                  <Sparkles size={16} />
                  <span>Generate with AI</span>
                </button>
                <button
                  onClick={startNew}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white font-bold text-xs sm:text-sm rounded-none border border-[#9b7b3e] shadow-xs transition-all"
                >
                  <Plus size={16} />
                  <span>Create Manual Test</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {list.map((a) => (
                <div
                  key={a.id}
                  onClick={() => run(() => axios.get(`${base}/assessments/${a.id}`, auth))}
                  className="group relative bg-white/95 backdrop-blur-sm rounded-none p-5 sm:p-6 border border-[#ebdcaa] hover:border-[#B99652] shadow-[0_4px_20px_rgba(185,150,82,0.06)] hover:shadow-[0_8px_25px_rgba(185,150,82,0.14)] transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base sm:text-lg font-bold text-[#1e1b4b] group-hover:text-[#B99652] transition-colors truncate">
                        {a.title}
                      </h3>
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-none font-bold border shrink-0 ${
                        a.status === "published"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-[#fff8e7] text-[#92400e] border-[#fde68a]"
                      }`}>
                        {a.status === "published" ? "Published" : "Draft"}
                      </span>
                    </div>

                    {/* Metadata Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#665e4d]">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fffdf4] border border-[#ebdcaa]/80 rounded-none font-medium">
                        <BookOpen size={12} className="text-[#B99652]" />
                        {a.subject}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fffdf4] border border-[#ebdcaa]/80 rounded-none font-medium">
                        <School size={12} className="text-[#B99652]" />
                        {classLabel(a.classroom)}
                      </span>
                      {a.course && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fffdf4] border border-[#ebdcaa]/80 rounded-none font-medium">
                          {a.course.title}
                        </span>
                      )}
                      {a.legacy && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 border border-gray-200 rounded-none font-medium" title="Made before tests belonged to a course">
                          Legacy (no course)
                        </span>
                      )}
                      {a.status === "published" && a.recipients?.mode === "selected" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fff8e7] text-[#92400e] border border-[#fde68a] rounded-none font-medium">
                          {recipientsText(a.recipients)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fffdf4] border border-[#ebdcaa]/80 rounded-none font-medium">
                        <FileText size={12} className="text-[#B99652]" />
                        {a.questionCount} {a.questionCount === 1 ? "question" : "questions"}
                      </span>
                      {a.durationMinutes && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fffdf4] border border-[#ebdcaa]/80 rounded-none font-medium">
                          <Clock size={12} className="text-[#B99652]" />
                          {a.durationMinutes} mins
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                    <button className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs border border-[#9b7b3e] shadow-xs transition-all">
                      <span>Open Test</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </MentorLayout>
    );
  }

  /* ---------- Create / Edit View ---------- */
  return (
    <MentorLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Back Button */}
        <button
          onClick={back}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#B99652] hover:text-[#92400e] transition-colors py-1"
        >
          <ArrowLeft size={16} />
          <span>Back to All Tests</span>
        </button>

        {/* Test Details Card */}
        <section className="bg-white/95 backdrop-blur-sm rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-8 border border-[#ebdcaa]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-[#ebdcaa]">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-none text-[11px] font-bold bg-[#fff8e7] text-[#92400e] border border-[#fde68a] mb-1.5">
                <BookOpen size={11} className="text-[#B99652]" />
                <span>Test Configuration</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                {current ? current.title : "Create New Assessment"}
              </h2>
            </div>

            {current && (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`text-xs px-3 py-1 rounded-none font-bold border ${
                  locked ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#fff8e7] text-[#92400e] border-[#fde68a]"
                }`}>
                  {locked ? "Published" : "Draft"}
                </span>

                {locked && closed && (
                  <span className="text-xs px-3 py-1 rounded-none font-bold bg-gray-100 text-gray-700 border border-gray-200" data-testid="aia-closed-badge">
                    Closed
                  </span>
                )}

                {locked && !current.closedAt && (
                  <button
                    disabled={busy}
                    onClick={closeTest}
                    data-testid="aia-close-test"
                    className="px-3.5 py-1.5 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 rounded-none text-xs font-bold transition-colors"
                  >
                    Close Test
                  </button>
                )}

                {locked && (
                  <button
                    onClick={() => setShowReport((v) => !v)}
                    data-testid="aia-toggle-report"
                    className="px-3.5 py-1.5 border border-[#B99652] text-[#92400e] bg-[#fffdf4] hover:bg-[#fff8e7] rounded-none text-xs font-bold transition-colors"
                  >
                    {showReport ? "Hide Report" : "View Results Report"}
                  </button>
                )}

                {locked ? (
                  <button
                    disabled={busy}
                    onClick={() => setStatus("unpublish")}
                    className="px-3.5 py-1.5 border border-[#ebdcaa] bg-white hover:bg-gray-50 text-gray-700 rounded-none text-xs font-bold transition-colors"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => setStatus("publish")}
                    className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-none text-xs font-bold shadow-xs transition-all"
                    data-testid="aia-publish"
                  >
                    Publish Test…
                  </button>
                )}
              </div>
            )}
          </div>

          {locked && (
            <div className="mb-6 text-xs sm:text-sm text-[#92400e] bg-[#fff8e7] p-4 rounded-none border border-[#fde68a]">
              {current.closedAt
                ? `Closed on ${fmtWhen(current.closedAt)}. Students can no longer start it; see the report for results.`
                : current.recipients?.mode === "selected"
                  ? `Assigned to ${recipientsText(current.recipients)} of the class. Only they can see this test. Unpublish it to make changes.`
                  : "Students in the selected class can see this test. Unpublish it to make changes."}
              {!current.closedAt && (current.opensAt || current.closesAt) && (
                <span className="block mt-1 font-semibold text-[#78350f]">
                  {current.opensAt && `Opens: ${fmtWhen(current.opensAt)}. `}
                  {current.closesAt && `Closes: ${fmtWhen(current.closesAt)}.`}
                </span>
              )}
            </div>
          )}

          {/* Form inputs */}
          <fieldset disabled={locked || busy} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Assessment Title *</label>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                placeholder="e.g. Chemical Bonding Mastery Quiz"
                value={details.title}
                onChange={(e) => setDetails({ ...details, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Subject *</label>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                placeholder="e.g. Chemistry"
                value={details.subject}
                onChange={(e) => setDetails({ ...details, subject: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Classroom *</label>
              <select
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                value={details.classroomId}
                onChange={(e) => setDetails({ ...details, classroomId: e.target.value, courseId: "" })}
              >
                <option value="">Choose class</option>
                {classrooms.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Course *</label>
              <select
                aria-label="Course"
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                value={details.courseId}
                disabled={!details.classroomId}
                onChange={(e) => setDetails({ ...details, courseId: e.target.value })}
              >
                <option value="">{details.classroomId ? "Choose course" : "Choose a class first"}</option>
                {(coursesByClass[String(details.classroomId)] || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {details.classroomId && (coursesByClass[String(details.classroomId)] || []).length === 0 && (
                <p className="text-xs text-amber-700 mt-1">You mentor no course taught to this class. Ask your admin to assign one.</p>
              )}
              {current && current.legacy && !details.courseId && (
                <p className="text-xs text-gray-500 mt-1">Made before tests had a course (legacy). Choose its course to link it.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Duration in Minutes (optional)</label>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                type="number"
                min="1"
                max="600"
                placeholder="e.g. 30"
                value={details.durationMinutes}
                onChange={(e) => setDetails({ ...details, durationMinutes: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Opens At (optional)</label>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                type="datetime-local"
                value={details.opensAt}
                onChange={(e) => setDetails({ ...details, opensAt: e.target.value })}
                data-testid="aia-opens-at"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Closes At (optional)</label>
              <input
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]/30 outline-none"
                type="datetime-local"
                value={details.closesAt}
                onChange={(e) => setDetails({ ...details, closesAt: e.target.value })}
                data-testid="aia-closes-at"
              />
            </div>

            <p className="md:col-span-2 text-xs text-[#7a705a] -mt-1">
              Leave dates empty to keep the test open until manually closed. A running test ends at the closing time even if its duration is longer.
            </p>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-[#1e1b4b] mb-1.5">Description (optional)</label>
              <textarea
                className="w-full p-2.5 border border-[#ebdcaa] rounded-none text-sm text-[#1e1b4b] bg-white focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                rows={3}
                placeholder="Instructions or context for students..."
                value={details.description}
                onChange={(e) => setDetails({ ...details, description: e.target.value })}
              />
            </div>

            <div className="md:col-span-2 pt-2">
              <button
                onClick={saveDetails}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs sm:text-sm border border-[#9b7b3e] shadow-xs transition-all active:scale-[0.98]"
              >
                <span>{current ? "Save Test Details" : "Create Draft Test"}</span>
              </button>
            </div>
          </fieldset>
        </section>

        {current && locked && showReport && (
          <AssessmentReport base={base} auth={auth} assessmentId={current.id} errorText={errorText} />
        )}

        {/* Questions Section */}
        {current && (
          <section className="bg-white/95 backdrop-blur-sm rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-8 border border-[#ebdcaa]">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#ebdcaa]">
              <h3 className="text-lg sm:text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] flex items-center gap-2">
                <span>Questions</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                  {current.questions.length} Total
                </span>
              </h3>
            </div>

            <ol className="space-y-4 mb-6">
              {current.questions.map((q) => (
                <li
                  key={q.id}
                  className="border border-[#ebdcaa] rounded-none p-4 sm:p-5 bg-[#fffdf4]/40 hover:border-[#B99652] transition-colors"
                  data-testid="aia-question-row"
                  data-type={q.type}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="font-bold text-sm sm:text-base text-[#1e1b4b]">
                      <span>{q.position}. {q.text}</span>
                      {q.imageKey && <AuthedImage url={`${base}/question-images/${q.imageKey}`} className="block max-w-full max-h-48 h-auto border border-[#ebdcaa] my-2" />}
                      <span className="ml-2.5 align-middle text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                        {TYPE_LABEL[q.type] || "Single MCQ"}
                      </span>
                    </div>

                    {!locked && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          title="Edit"
                          onClick={() => editQuestion(q)}
                          className="p-1.5 text-gray-500 hover:text-[#B99652] hover:bg-white rounded-none border border-transparent hover:border-[#ebdcaa] transition-all"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => deleteQuestion(q)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-none border border-transparent hover:border-red-200 transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {q.type === "numerical" ? (
                    <p className="mt-3 text-xs sm:text-sm text-emerald-800 font-bold flex items-center gap-1.5 bg-emerald-50 p-2.5 rounded-none border border-emerald-200">
                      <CheckCircle size={14} className="text-emerald-600" />
                      <span>Answer Key: {answerKeyText(q)}</span>
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2 md:grid-cols-2 text-xs sm:text-sm">
                      {q.options.map((o) => (
                        <li
                          key={o.position}
                          className={`flex items-center gap-2 p-2.5 rounded-none border ${
                            o.isCorrect
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                              : "bg-white text-gray-700 border-[#ebdcaa]"
                          }`}
                        >
                          <span className="w-5 h-5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a] flex items-center justify-center text-xs font-bold shrink-0">
                            {LETTERS[o.position]}
                          </span>
                          <span className="flex-1">{o.text}</span>
                          {o.isCorrect && <CheckCircle size={14} className="text-emerald-600 shrink-0" />}
                        </li>
                      ))}
                    </ul>
                  )}

                  {q.explanation && (
                    <p className="mt-2.5 text-xs text-[#7a705a] italic bg-white p-2 border border-[#ebdcaa]/60">
                      <strong>Explanation:</strong> {q.explanation}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            {!locked && (
              <fieldset disabled={busy} className="border-t border-[#ebdcaa] pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-none bg-[#B99652] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                    {editingQuestionId ? <Pencil size={12} /> : <Plus size={14} />}
                  </div>
                  <h4 className="font-bold font-['DM_Serif_Display',serif] text-base text-[#1e1b4b]">
                    {editingQuestionId ? "Edit Question" : "Add New Question"}
                  </h4>
                </div>

                <QuestionEditor
                  value={question}
                  onChange={setQuestion}
                  idPrefix="aia-manual"
                  availableTypes={typesAvailable}
                  explanationPlaceholder="Explanation (optional; teachers only)"
                />

                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={saveQuestion}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs sm:text-sm border border-[#9b7b3e] shadow-xs transition-all"
                  >
                    <span>{editingQuestionId ? "Save Question" : "Add Question"}</span>
                  </button>

                  {editingQuestionId && (
                    <button
                      onClick={() => { setEditingQuestionId(null); setQuestion(EMPTY_QUESTION); }}
                      className="px-4 py-2.5 border border-[#ebdcaa] bg-white hover:bg-gray-50 text-gray-700 rounded-none text-xs sm:text-sm font-bold transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </fieldset>
            )}
          </section>
        )}
      </div>

      {assignOpen && current && publishClass && (
        <AssignToModal
          base={base}
          auth={auth}
          classroom={publishClass}
          courseId={current?.courseId ?? null}
          classLabel={classLabel}
          testTitle={current.title}
          busy={busy}
          onCancel={() => setAssignOpen(false)}
          onConfirm={confirmPublish}
        />
      )}
    </MentorLayout>
  );
}
