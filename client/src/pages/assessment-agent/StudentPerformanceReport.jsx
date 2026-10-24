import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Download, Loader2, Sparkles } from "lucide-react";
import StudentLayout from "../../components/StudentLayout";
import { useAuth } from "../../auth/auth";
import { downloadReportPdf } from "./reportPdf";
import { evidenceLabel } from "./AiPerformanceReport";

/*
 * AI Assessment Agent - ONE AI Performance Report that a teacher shared with this student.
 * Opened from the "Performance Report Shared" notification. The server returns the report only
 * when it belongs to the signed-in student and was shared (anything else is "not found"), and
 * the PDF is built in the browser from that same data with the teacher's reportPdf.js.
 * No AI call happens here.
 */

const STATUS_LABEL = {
  strong: "Strong",
  on_track: "On track",
  needs_support: "Needs support",
  insufficient_evidence: "Insufficient evidence",
};

// "nextAssessment" -> "Next Assessment"
const heading = (key) =>
  String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const HIDDEN_KEYS = new Set(["evidence", "id", "code"]); // internal references, not for reading

// Shows whatever sections the stored report has, without assuming a fixed shape
const Value = ({ value }) => {
  if (value === null || value === undefined || value === "") return null;

  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && item !== "");
    if (items.length === 0) return null;
    return (
      <ul className="list-disc pl-5 space-y-2">
        {items.map((item, index) => (
          <li key={index} className="text-sm text-[#1e1b4b]/90 leading-relaxed">
            <Value value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([key, v]) => !HIDDEN_KEYS.has(key) && v !== null && v !== undefined && v !== "");
    return (
      <div className="space-y-1.5">
        {entries.map(([key, v]) => (
          <div key={key} className="text-sm text-[#1e1b4b]/90 leading-relaxed">
            <span className="font-semibold text-[#1e1b4b]">{heading(key)}: </span>
            {typeof v === "object" ? <div className="mt-1 pl-3 border-l-2 border-[#ebdcaa]"><Value value={v} /></div> : <Value value={v} />}
          </div>
        ))}
      </div>
    );
  }

  const text = STATUS_LABEL[value] || String(value).replace(/_/g, " ");
  return <span>{text}</span>;
};

export default function StudentPerformanceReport() {
  const { reportId } = useParams();
  const { token, API } = useAuth();
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [state, setState] = useState({ status: "loading", report: null, message: "" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", report: null, message: "" });
    axios
      .get(`${API}/assessment-agent/student/performance-reports/${reportId}`, auth)
      .then((res) => { if (alive) setState({ status: "ready", report: res.data.report, message: "" }); })
      .catch((err) => {
        if (!alive) return;
        const notFound = err?.response?.status === 404 || err?.response?.status === 403;
        setState({
          status: "error",
          report: null,
          message: notFound
            ? "This report is not available. It may not have been shared with you."
            : err?.response?.data?.error?.message || "The report could not be loaded.",
        });
      });
    return () => { alive = false; };
  }, [API, auth, reportId]);

  const { status, report, message } = state;

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <Link to="/student/assessment-agent/tests" className="inline-flex items-center gap-2 text-sm font-semibold text-[#B99652] hover:text-[#a38241]">
          <ArrowLeft size={16} /> Back to My Tests
        </Link>

        {status === "loading" && (
          <div className="p-8 bg-white border border-[#ebdcaa] text-center text-gray-500" data-testid="student-report-loading">
            <Loader2 className="inline animate-spin" /> Loading report...
          </div>
        )}

        {status === "error" && (
          <div className="p-8 bg-white border border-[#ebdcaa] text-center" role="alert" data-testid="student-report-error">
            <p className="text-[#1e1b4b] font-semibold">{message}</p>
          </div>
        )}

        {status === "ready" && report && (
          <article className="bg-[#fffdf4] border border-[#ebdcaa] shadow-sm" data-testid="student-report">
            <header className="p-5 sm:p-6 bg-white border-b border-[#ebdcaa] flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-['DM_Serif_Display',serif] text-[#1e1b4b] flex items-center gap-2">
                  <Sparkles size={20} className="text-[#B99652]" /> AI Performance Report
                </h1>
                <p className="text-sm text-[#1e1b4b]/70 mt-1">
                  {report.student?.name}
                  {report.ai?.focus?.label ? ` · ${report.ai.focus.label}` : ""}
                </p>
                <p className="text-xs text-[#1e1b4b]/60 mt-1">
                  Shared on {new Date(report.sharedAt).toLocaleString()}
                  {report.scope?.assessments ? ` · Based on ${report.scope.assessments} assessment${report.scope.assessments === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadReportPdf({ student: report.student, scope: report.scope, ai: report.ai, evidenceLabel })}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none font-semibold text-sm shadow-sm transition-all"
                data-testid="student-report-download"
              >
                <Download size={16} /> Download PDF
              </button>
            </header>

            <div className="p-5 sm:p-6 space-y-5">
              {report.ai?.preview?.validated === false && (
                <p className="text-xs sm:text-sm border border-amber-300 bg-amber-50 text-amber-900 p-3">
                  This report has not passed all quality checks. Please discuss it with your teacher.
                </p>
              )}

              {Object.entries(report.ai?.content || {}).map(([key, value]) => (
                <section key={key} className="bg-white border border-[#ebdcaa] p-5">
                  <h2 className="font-['DM_Serif_Display',serif] text-base sm:text-lg text-[#1e1b4b] mb-3 pb-2 border-b border-[#ebdcaa]/60">
                    {heading(key)}
                  </h2>
                  <Value value={value} />
                </section>
              ))}

              <p className="text-xs text-[#1e1b4b]/60">
                This report is an AI-written interpretation of your assessment results, shared by your teacher. It does not change any score.
              </p>
            </div>
          </article>
        )}
      </div>
    </StudentLayout>
  );
}
