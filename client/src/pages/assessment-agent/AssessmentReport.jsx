import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { BarChart3, Loader2, RefreshCw, RotateCcw } from "lucide-react";

/*
 * AI Assessment Agent (Step 3) - teacher report for one of the teacher's own tests.
 * All numbers come from the server (graded there). Sorted by name; no ranking.
 */

const STATUS = {
  submitted: ["Submitted", "bg-emerald-50 text-emerald-700 border border-emerald-200"],
  expired: ["Auto-submitted (time up)", "bg-slate-100 text-slate-700 border border-slate-300"],
  in_progress: ["In progress", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
  not_started: ["Not started", "bg-[#fffdf4] text-[#7a705a] border border-[#ebdcaa]"],
  missed: ["Missed (test closed)", "bg-rose-50 text-rose-700 border border-rose-200"], // Step 5
};

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : "-");
const fmtDuration = (s) => (s === null || s === undefined ? "-" : `${Math.floor(s / 60)}m ${s % 60}s`);
const show = (v, suffix = "") => (v === null || v === undefined ? "-" : `${v}${suffix}`);

export default function AssessmentReport({ base, auth, assessmentId, errorText }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${base}/assessments/${assessmentId}/report`, auth);
      setReport(res.data.report);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [base, auth, assessmentId, errorText]);

  useEffect(() => { load(); }, [load]);

  // Step 6: the server decides (owner-only, finished attempt, test not closed, reset limit).
  const [resetting, setResetting] = useState(null);
  const resetStudent = async (row) => {
    if (!window.confirm(`Reset ${row.studentName}'s attempt? Their current result (${row.score}/${row.totalQuestions}) is kept as history, and they can take the test again with a fresh timer.`)) return;
    setResetting(row.studentId);
    try {
      const res = await axios.post(`${base}/assessments/${assessmentId}/students/${row.studentId}/reset`, undefined, auth);
      const left = res.data.reset.resetsRemaining;
      toast.success(`Attempt reset. ${row.studentName} can retake the test (${left} reset${left === 1 ? "" : "s"} left for this student).`);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setResetting(null);
    }
  };

  if (error) return <section className="bg-white rounded-none border border-red-200 p-6 text-red-600 font-medium">{error}</section>;
  if (!report) return <section className="bg-white rounded-none border border-[#ebdcaa] p-6 text-[#7a705a]"><Loader2 className="inline animate-spin text-[#B99652]" /> Loading report...</section>;

  const s = report.summary;
  const q = report.assessment.questionCount;
  return (
    <section className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7" data-testid="aia-report">
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#ebdcaa]">
        <div>
          <h3 className="text-lg sm:text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
            Results & Analytics Report
          </h3>
          <p className="text-xs text-[#7a705a] mt-0.5">
            Real-time individual performance, score distributions, and attempt logs.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] rounded-none text-xs font-bold transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-[#B99652]" : "text-[#B99652]"} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-6">
        {[
          ["Students Attempted", `${s.studentsAttempted}${s.studentsInClass ? ` / ${s.studentsInClass}` : ""}`],
          ["Total Submissions", s.totalSubmissions],
          ["Class Average", s.averageScore === null ? "-" : `${s.averageScore}/${q} (${s.averagePercentage}%)`],
          ["Highest / Lowest", s.highestScore === null ? "-" : `${s.highestScore} / ${s.lowestScore}`],
        ].map(([label, value]) => (
          <div key={label} className="border border-[#ebdcaa] rounded-none p-3.5 bg-[#fffdf4]/40">
            <div className="text-xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif]">{value}</div>
            <div className="text-[11px] text-[#7a705a] font-bold uppercase tracking-wider mt-1">{label}</div>
          </div>
        ))}
      </div>

      {report.students.length === 0 ? (
        <p className="text-xs text-[#7a705a] py-6 text-center border border-dashed border-[#ebdcaa]">
          No students in this classroom have initiated or completed the assessment yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[#ebdcaa]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#665e4d] bg-[#fffdf4] border-b border-[#ebdcaa] font-bold">
                <th className="py-2.5 px-3">Student</th>
                <th className="px-3">Status</th>
                <th className="px-3">Score</th>
                <th className="px-3">%</th>
                <th className="px-3">Correct</th>
                <th className="px-3">Incorrect</th>
                <th className="px-3">Unattempted</th>
                <th className="px-3">Submitted</th>
                <th className="px-3">Time taken</th>
                <th className="px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebdcaa]/60 bg-white">
              {report.students.map((r) => {
                const [label, cls] = STATUS[r.status] || [r.status, ""];
                return (
                  <tr key={r.studentId} className="hover:bg-[#fffdf4]/50 transition-colors" data-testid="aia-report-row" data-student={r.studentName}>
                    <td className="py-3 px-3 font-bold text-[#1e1b4b]">
                      {r.studentName}
                      {r.attemptNumber > 1 && <span className="block text-[11px] text-[#7a705a] font-normal">Attempt {r.attemptNumber}</span>}
                      {r.previousAttempts && r.previousAttempts.length > 0 && (
                        <span className="block text-[10px] text-[#7a705a] font-normal" data-testid="aia-report-previous">
                          Previous: {r.previousAttempts.map((p) => `${p.score}/${p.totalQuestions} (${p.percentage}%)`).join(", ")}
                        </span>
                      )}
                      <Link
                        to={`/teacher/assessments/students/${r.studentId}`}
                        data-testid="aia-report-performance"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1e1b4b] hover:text-[#B99652] transition-colors mt-1"
                      >
                        <BarChart3 size={12} className="text-[#B99652]" />
                        <span>View Analytics</span>
                      </Link>
                    </td>
                    <td className="px-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-none whitespace-nowrap ${cls}`}>{label}</span></td>
                    <td className="px-3 font-bold text-[#1e1b4b]" data-testid="aia-report-score">{r.score === undefined ? "-" : `${r.score}/${r.totalQuestions}`}</td>
                    <td className="px-3 font-bold" data-testid="aia-report-percentage">{show(r.percentage, "%")}</td>
                    <td className="px-3 text-emerald-700 font-semibold">{show(r.correct)}</td>
                    <td className="px-3 text-rose-700 font-semibold">{show(r.incorrect)}</td>
                    <td className="px-3 text-[#7a705a]">{show(r.unattempted)}</td>
                    <td className="px-3 text-[#7a705a]">{fmtTime(r.submittedAt)}</td>
                    <td className="px-3 text-[#7a705a]">{fmtDuration(r.timeTakenSeconds)}</td>
                    <td className="px-3 text-right">
                      {(r.status === "submitted" || r.status === "expired") && report.assessment.availability !== "closed" && (
                        <button
                          onClick={() => resetStudent(r)}
                          disabled={resetting !== null}
                          data-testid="aia-report-reset"
                          title="Let this student take the test again"
                          className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 border border-[#ebdcaa] rounded-none text-[#1e1b4b] font-bold bg-white hover:bg-[#fffdf4] disabled:opacity-50 transition-colors"
                        >
                          <RotateCcw size={11} className="text-[#B99652]" />
                          <span>{resetting === r.studentId ? "Resetting..." : "Reset"}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
