import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CalendarClock, CheckCircle2, Download, FileText, Loader2, UploadCloud, X } from "lucide-react";
import StudentLayout from "../../components/StudentLayout";
import { useAuth } from "../../auth/auth";
import { AuthedImage } from "../../components/QuestionImage";
import { Badge, STUDENT_STATUS, Stepper, apiError, downloadPdf, dueText, fmtBytes, fmtDateTime } from "./assignmentUi";

const STUDENT_FLOW = ["Read the questions", "Upload your PDF", "Submitted · awaiting evaluation", "Final result"];
const FLOW_STEP = { not_submitted: 1, submitted: 2, evaluated: 3 };

/*
 * AI Assessment Agent - Descriptive Assignments (student: read + upload a PDF).
 * Upload: PUT /api/assessment-agent/student/assignments/:id/submission?filename=... with the raw PDF bytes.
 * The checks here (type, size) are only for a friendly message: the SERVER validates the bytes
 * (PDF signature, trailer, size, no active content) and decides whether submissions are accepted.
 * Re-uploading before the teacher marks the work replaces the previous file.
 */
const MAX_BYTES = 10 * 1024 * 1024;

export default function StudentAssignment() {
  const { id } = useParams();
  const { token, API } = useAuth();
  const base = `${API}/assessment-agent/student/assignments/${id}`;
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [a, setA] = useState(null);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [progress, setProgress] = useState(null); // 0..100 while uploading
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const uploadLock = useRef(false);

  const load = useCallback(async () => {
    try {
      setA((await axios.get(base, auth)).data.assignment);
    } catch (err) {
      setError(apiError(err, "Could not load this assignment."));
    }
  }, [base, auth]);
  useEffect(() => { load(); }, [load]);

  const choose = (f) => {
    setJustSubmitted(false);
    setFileError(null);
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf")) { setFile(null); setFileError("Only PDF files can be submitted."); return; }
    if (f.size === 0) { setFile(null); setFileError("This file is empty."); return; }
    if (f.size > MAX_BYTES) { setFile(null); setFileError(`This file is ${fmtBytes(f.size)}. The maximum is 10 MB.`); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!file || progress !== null || uploadLock.current) return; // synchronous lock: one upload per click
    uploadLock.current = true;
    setProgress(0);
    setFileError(null);
    try {
      await axios.put(`${base}/submission?filename=${encodeURIComponent(file.name)}`, file, {
        headers: { ...auth.headers, "Content-Type": "application/pdf" },
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setJustSubmitted(true);
      await load();
    } catch (err) {
      setFileError(apiError(err, "The upload failed. Please try again."));
    } finally {
      uploadLock.current = false;
      setProgress(null);
    }
  };

  const back = <Link to="/student/assessment-agent/assignments" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft size={16} /> My Assignments</Link>;
  if (error) return <StudentLayout><div className="max-w-4xl mx-auto p-6 space-y-4">{back}<div className="p-6 bg-white rounded-2xl shadow-sm text-red-600">{error}</div></div></StudentLayout>;
  if (!a) return <StudentLayout><div className="max-w-4xl mx-auto p-6 text-gray-500"><Loader2 className="inline animate-spin" /> Loading...</div></StudentLayout>;

  const sub = a.submission;
  const canUpload = a.acceptingSubmissions && a.myStatus !== "evaluated";

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="aia-stu-asg">
        {back}
        <header className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{a.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{a.teacherName || "Teacher"} · {a.classroom?.name || "Class"}</p>
            </div>
            <Badge map={STUDENT_STATUS} value={a.myStatus} testId="aia-stu-asg-status" />
          </div>
          {a.myStatus !== "missed" && <div className="mt-4"><Stepper steps={STUDENT_FLOW} current={FLOW_STEP[a.myStatus] ?? 1} testId="aia-stu-asg-flow" /></div>}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">Total marks</div><div className="font-semibold">{a.maxMarks}</div></div>
            <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">Questions</div><div className="font-semibold">{a.questions.length}</div></div>
            <div className="rounded-xl bg-gray-50 p-3 col-span-2 md:col-span-1"><div className="text-xs text-gray-500">Due</div><div className="font-semibold flex items-center gap-1.5"><CalendarClock size={14} /> {a.status === "closed" ? "Closed" : dueText(a.dueAt)}</div></div>
          </div>
          {a.instructions && <p className="mt-4 text-gray-700 whitespace-pre-line">{a.instructions}</p>}
        </header>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Questions</h2>
          <ol className="space-y-3">
            {a.questions.map((q) => (
              <li key={q.position} className="flex gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">{q.position}</span>
                <div className="flex-1 flex justify-between gap-3">
                  <div>
                    <p className="text-gray-800 whitespace-pre-line">{q.text}</p>
                    {q.hasImage && <AuthedImage url={`${base}/questions/${q.position}/image`} />}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{q.maxMarks} mark{q.maxMarks === 1 ? "" : "s"}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4" data-testid="aia-stu-asg-submission">
          <h2 className="text-lg font-semibold">Your submission</h2>

          {justSubmitted && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 text-green-800 font-medium" role="status" data-testid="aia-stu-asg-success">
              <CheckCircle2 size={18} /> Assignment submitted successfully.
            </div>
          )}

          {sub && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border bg-gray-50" data-testid="aia-stu-asg-current">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={28} className="text-red-500 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{sub.originalFilename}</div>
                  <div className="text-xs text-gray-500">{fmtBytes(sub.fileSize)} · submitted {fmtDateTime(sub.submittedAt)}{sub.version > 1 ? ` · version ${sub.version}` : ""}</div>
                </div>
              </div>
              <button onClick={() => downloadPdf(`${base}/submission/file`, auth, sub.originalFilename).catch(() => setFileError("Could not download the file."))} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm bg-white">
                <Download size={14} /> Download
              </button>
            </div>
          )}

          {sub?.status === "evaluated" && (
            <div className="p-4 rounded-xl bg-green-50 border border-green-100" data-testid="aia-stu-asg-final">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h3 className="font-semibold text-green-900">Final result</h3>
                <span className="text-xs text-green-800">Marked by your teacher{sub.evaluatedAt ? ` · ${fmtDateTime(sub.evaluatedAt)}` : ""}</span>
              </div>
              <div className="text-sm text-green-800">Marks: <span className="text-xl font-bold">{sub.finalMarks}</span> / {a.maxMarks}</div>
              {sub.questionMarks && (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs" data-testid="aia-stu-asg-question-marks">
                  {sub.questionMarks.map((q) => <li key={q.questionId} className="px-2 py-1 rounded-full bg-white border border-green-100 text-green-800">{q.questionId}: {q.marks} / {a.questions.find((x) => `Q${x.position}` === q.questionId)?.maxMarks ?? "?"}</li>)}
                </ul>
              )}
              {sub.teacherFeedback && <p className="mt-2 text-sm text-gray-700 whitespace-pre-line"><span className="font-medium">Teacher feedback:</span> {sub.teacherFeedback}</p>}
            </div>
          )}

          {canUpload ? (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary/60 hover:bg-gray-50"}`}
                data-testid="aia-stu-asg-dropzone"
              >
                <UploadCloud size={36} className="mx-auto text-primary" />
                <p className="mt-2 font-medium text-gray-800">{sub ? "Upload a new PDF to replace your submission" : "Drag your PDF here, or click to choose"}</p>
                <p className="text-xs text-gray-500 mt-1">PDF only · up to 10 MB{sub ? " · you can replace it until your teacher marks it" : ""}</p>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => choose(e.target.files[0])} data-testid="aia-stu-asg-file" />
              </div>
              {file && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border" data-testid="aia-stu-asg-selected">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={22} className="text-red-500 shrink-0" />
                    <div className="min-w-0"><div className="text-sm font-medium truncate">{file.name}</div><div className="text-xs text-gray-500">{fmtBytes(file.size)}</div></div>
                  </div>
                  {progress === null && <button title="Remove" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} className="p-1 text-gray-500 hover:text-gray-800"><X size={16} /></button>}
                </div>
              )}
              {progress !== null && (
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-label="Upload progress"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
              )}
              {fileError && <p className="text-sm text-red-600" role="alert" data-testid="aia-stu-asg-error">{fileError}</p>}
              <button disabled={!file || progress !== null} onClick={submit} className="w-full py-3 bg-primary text-white rounded-xl font-semibold disabled:opacity-50" data-testid="aia-stu-asg-submit">
                {progress !== null ? `Uploading... ${progress}%` : sub ? "Replace submission" : "Submit assignment"}
              </button>
            </>
          ) : (
            !sub && <p className="text-sm text-gray-500">{a.status === "closed" ? "This assignment is closed. Submissions are no longer accepted." : "The due date has passed. Submissions are no longer accepted."}</p>
          )}
          {!canUpload && fileError && <p className="text-sm text-red-600">{fileError}</p>}
        </section>
      </div>
    </StudentLayout>
  );
}
