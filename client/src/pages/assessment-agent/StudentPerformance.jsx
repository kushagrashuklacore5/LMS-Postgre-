import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ArrowLeft, Info, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import MentorLayout from "../../components/MentorLayout";
import { useAuth } from "../../auth/auth";
import AiPerformanceReport from "./AiPerformanceReport";

/*
 * AI Assessment Agent - Student Performance Analyst (teacher-only).
 * Backend: GET  /api/assessment-agent/teacher/students/:id/performance           (facts; never uses AI)
 *          POST /api/assessment-agent/teacher/students/:id/performance/analysis  (AI report; see AiPerformanceReport.jsx)
 * Every number on this page comes from the server. The AI section only interprets those numbers
 * and is clearly separated from them. Scope: the signed-in teacher's own assessments.
 *
 * API-call efficiency: this page never calls the LLM. Only AiPerformanceReport does, from an explicit
 * "Generate AI Report" / "Regenerate" click (one request per click). It is keyed by student, so
 * changing student resets it without any call; refreshing or returning never regenerates.
 */

const AXIS = "#7a705a";
const GRID = "#ebdcaa";
const NAVY = "#B99652";
const GOLD = "#d4af37";
const MUTED = "#a09783";

const STATE_LABEL = {
  finished: { submitted: ["Submitted", "bg-emerald-50 text-emerald-700 border border-emerald-200"], expired: ["Auto-submitted", "bg-slate-100 text-slate-700 border border-slate-300"] },
  in_progress: ["In progress", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
  missed: ["Missed", "bg-rose-50 text-rose-700 border border-rose-200"],
  pending: ["Not started", "bg-[#fffdf4] text-[#7a705a] border border-[#ebdcaa]"],
  upcoming: ["Upcoming", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
};
const TREND = {
  improving: ["Improving", TrendingUp, "text-emerald-700"],
  declining: ["Declining", TrendingDown, "text-rose-600"],
  stable: ["Stable", Minus, "text-[#665e4d]"],
  insufficient_data: ["Not enough data", Minus, "text-[#a09783]"],
};
const CONSISTENCY = { consistent: "Consistent", moderate: "Moderately variable", variable: "Highly variable", insufficient_data: "Not enough data" };
const FIXED_LIMITATIONS = [
  "Only objective questions (single MCQ, multiple select, numerical) are graded here; descriptive or written work is not part of this data.",
  "Only your own assessments are included; other teachers' tests are not part of this report.",
];

const fmt = (v, suffix = "") => (v === null || v === undefined ? "–" : `${v}${suffix}`);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "–");
const fmtDuration = (s) => (s === null || s === undefined ? "–" : `${Math.floor(s / 60)}m ${s % 60}s`);
const safeError = (err, fallback) => err?.response?.data?.error?.message || fallback;

function Kpi({ label, value, sub, icon: Icon, tone = "" }) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_20px_rgba(185,150,82,0.04)] p-4">
      <div className="text-[11px] text-[#7a705a] uppercase font-bold tracking-wider">{label}</div>
      <div className={`text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-1 flex items-center gap-2 ${tone}`}>
        {Icon && <Icon size={20} className="text-[#B99652]" />}
        <span>{value}</span>
      </div>
      {sub && <div className="text-[11px] text-[#7a705a] mt-1">{sub}</div>}
    </div>
  );
}

function Section({ id, title, subtitle, children, highlighted }) {
  return (
    <section id={id} className={`bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7 transition-all ${highlighted ? "ring-2 ring-[#B99652] bg-[#fffdf4]" : ""}`}>
      <h2 className="text-lg sm:text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{title}</h2>
      {subtitle && <p className="text-xs text-[#7a705a] mt-0.5 mb-5">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function StudentPerformance() {
  const { studentId } = useParams();
  const { token, API } = useAuth();
  const base = `${API}/assessment-agent/teacher/students/${studentId}/performance`;
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [focus, setFocus] = useState(null); // highlighted evidence, e.g. "A2", "subject:Biology"

  const load = useCallback(async () => {
    try {
      const res = await axios.get(base, auth);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(safeError(err, "Could not load this student's performance."));
    }
  }, [base, auth]);
  useEffect(() => { load(); }, [load]);

  const titles = useMemo(() => Object.fromEntries((data?.metrics.history || []).map((h) => [h.label, h.title])), [data]);

  // Evidence references from the AI report: highlight + scroll to the history row (A2, or A2-Q3 -> row A2)
  // or to the subject / difficulty / headline-metrics section.
  const showEvidence = (ref) => {
    const assessment = /^(A\d+)(-Q\d+)?$/.exec(ref)?.[1];
    const key = assessment || ref;
    setFocus(key);
    const target = assessment ? `hist-${assessment}` : ref.startsWith("subject:") ? "perf-subjects" : ref.startsWith("difficulty:") ? "perf-difficulty" : "perf-kpis";
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setFocus((f) => (f === key ? null : f)), 4000);
  };

  if (error) {
    return (
      <MentorLayout>
        <div className="max-w-6xl mx-auto space-y-4">
          <Link to="/teacher/assessments" className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1e1b4b] hover:text-[#B99652]"><ArrowLeft size={16} /> Back to AI Assessments</Link>
          <div className="p-6 bg-white rounded-none border border-red-200 text-red-600 font-medium">{error}</div>
        </div>
      </MentorLayout>
    );
  }
  if (!data) return <MentorLayout><div className="max-w-6xl mx-auto p-6 text-[#7a705a]"><Loader2 className="inline animate-spin text-[#B99652]" /> Loading performance analytics...</div></MentorLayout>;

  const { student, scope, metrics: m, dataSufficiency: ds } = data;
  const finishedChart = m.history
    .filter((h) => h.state === "finished")
    .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt))
    .map((h) => ({ label: h.label, Student: h.percentage, "Class average": h.classAveragePercentage }));
  const [trendLabel, TrendIcon, trendTone] = TREND[m.trend.label] || TREND.insufficient_data;
  const recentDelta = m.scores.lastThreeAverage !== null && m.scores.average !== null ? Math.round((m.scores.lastThreeAverage - m.scores.average) * 100) / 100 : null;

  return (
    <MentorLayout>
      <div className="max-w-6xl mx-auto space-y-6" data-testid="aia-performance">
        <Link
          to="/teacher/assessments"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1e1b4b] hover:text-[#B99652] transition-colors py-1"
        >
          <ArrowLeft size={16} />
          <span>Back to AI Assessments</span>
        </Link>

        {/* 1. Student Header */}
        <header className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#B99652] block mb-1">Student Performance Analyst</span>
            <h1 className="text-2xl sm:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{student.name}</h1>
            <p className="text-xs text-[#7a705a] mt-0.5">
              {student.classes.map((c) => c.name).join(", ") || "No class enrolled"}
            </p>
          </div>
          <div className="text-right text-xs text-[#7a705a]">
            <div>Your assessments · <strong className="text-[#1e1b4b]">{scope.assessments}</strong> tests · {scope.subjects.join(", ")}</div>
            <div className="mt-0.5">Updated {new Date(scope.generatedAt).toLocaleString()}</div>
          </div>
        </header>

        {/* 2. Data sufficiency */}
        {ds.level !== "adequate" && (
          <div className={`flex items-start gap-3 p-4 rounded-none border text-xs sm:text-sm ${ds.level === "none" ? "bg-[#fffdf4] text-[#665e4d] border-[#ebdcaa]" : "bg-[#fff8e7] text-[#92400e] border-[#fde68a]"}`} data-testid="aia-sufficiency">
            <Info size={18} className="shrink-0 mt-0.5 text-[#B99652]" />
            <div>
              {ds.level === "none"
                ? "No finished assessments yet. Detailed telemetry will appear once the student completes a test."
                : `Based on ${ds.finishedAssessments} finished assessment${ds.finishedAssessments === 1 ? "" : "s"}. Trend, consistency and recent average require at least 3 completed tests.`}
            </div>
          </div>
        )}

        {/* 3. KPIs */}
        <div id="perf-kpis" className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${focus?.startsWith("metric:") ? "ring-2 ring-[#B99652]" : ""}`}>
          <Kpi label="Overall score" value={fmt(m.scores.average, "%")} sub={m.scores.best !== null ? `Best ${m.scores.best}% · Lowest ${m.scores.worst}% · Median ${m.scores.median}%` : "No finished tests"} />
          <Kpi label="Trend" value={trendLabel} icon={TrendIcon} tone={trendTone} sub={m.trend.slopePerAssessment === null ? "Needs 3 finished tests" : `${m.trend.slopePerAssessment} pts per test`} />
          <Kpi label="Completion" value={fmt(m.completionRate, "%")} sub={`${m.counts.attempted} done · ${m.counts.missed} missed · ${m.counts.pending} not started${m.counts.inProgress ? ` · ${m.counts.inProgress} in progress` : ""}`} />
          <Kpi label="Consistency" value={CONSISTENCY[m.consistency.label]} sub={m.consistency.standardDeviation === null ? "Needs 3 finished tests" : `Spread ±${m.consistency.standardDeviation} pts`} />
          <Kpi label="Last 3 tests" value={fmt(m.scores.lastThreeAverage, "%")} sub={recentDelta === null ? "Needs 3 finished tests" : `${recentDelta >= 0 ? "+" : ""}${recentDelta} pts vs overall`} />
          <Kpi label="Unanswered" value={fmt(m.timing.unansweredRate, "%")} sub="of questions in finished tests" />
          <Kpi label="Timed out" value={fmt(m.timing.timedOutRate, "%")} sub={m.timing.averageTimeUsedPercent === null ? "No timed tests" : `Avg. ${m.timing.averageTimeUsedPercent}% of time used`} />
          <Kpi label="Retakes" value={m.retakes.count} sub={m.retakes.averageChange === null ? "No retaken tests finished" : `Avg. change ${m.retakes.averageChange >= 0 ? "+" : ""}${m.retakes.averageChange} pts`} />
        </div>

        {/* 4. Score trend */}
        <Section title="Score Trajectory Trend" subtitle="Individual student score per finished test compared against the cohort class average">
          {finishedChart.length === 0 ? <p className="text-xs text-[#7a705a]">No finished tests yet.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={finishedChart} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} stroke={AXIS} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => (v === null ? "–" : `${v}%`)} labelFormatter={(l) => `${l} · ${titles[l] || ""}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Student" stroke={NAVY} strokeWidth={2.5} dot={{ r: 4, fill: GOLD }} />
                <Line type="monotone" dataKey="Class average" stroke={MUTED} strokeDasharray="5 5" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 5. Subject performance */}
          <Section id="perf-subjects" title="Subject Competency Breakdown" subtitle="Accuracy distribution across finished tests" highlighted={focus?.startsWith("subject:")}>
            {m.bySubject.length === 0 ? <p className="text-xs text-[#7a705a]">No finished tests yet.</p> : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(120, m.bySubject.length * 48)}>
                  <BarChart data={m.bySubject} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis type="number" domain={[0, 100]} stroke={AXIS} unit="%" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="subject" stroke={AXIS} width={90} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Bar dataKey="percentage" name="Correct" fill={NAVY} radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <ul className="text-xs text-[#7a705a] mt-3 space-y-1">
                  {m.bySubject.map((s) => (
                    <li key={s.subject} className={focus === `subject:${s.subject}` ? "font-bold text-[#92400e]" : ""}>{s.subject}: {s.correct}/{s.questions} correct · {s.assessments} test{s.assessments === 1 ? "" : "s"}</li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          {/* 6. Difficulty performance */}
          <Section id="perf-difficulty" title="Cognitive Difficulty Distribution" subtitle="Success rate by question complexity tier" highlighted={focus?.startsWith("difficulty:")}>
            {m.byDifficulty.length === 0 ? <p className="text-xs text-[#7a705a]">No finished tests yet.</p> : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(120, m.byDifficulty.length * 48)}>
                  <BarChart data={m.byDifficulty} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis type="number" domain={[0, 100]} stroke={AXIS} unit="%" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="difficulty" stroke={AXIS} width={90} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Bar dataKey="percentage" name="Correct" fill={GOLD} radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <ul className="text-xs text-[#7a705a] mt-3 space-y-1">
                  {m.byDifficulty.map((d) => (
                    <li key={d.difficulty} className={focus === `difficulty:${d.difficulty}` ? "font-bold text-[#92400e]" : ""}>{d.difficulty}: {d.correct}/{d.questions} correct · {d.questions - d.answered} unanswered</li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        </div>

        {/* 7. Assessment history */}
        <Section title="Assessment Log History" subtitle="Current attempts per assessment; earlier resets retained as historical record">
          <div className="overflow-x-auto border border-[#ebdcaa]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#665e4d] bg-[#fffdf4] border-b border-[#ebdcaa] font-bold">
                  <th className="py-2.5 px-3">Ref</th>
                  <th className="px-3">Test</th>
                  <th className="px-3">Subject</th>
                  <th className="px-3">Status</th>
                  <th className="px-3">Score</th>
                  <th className="px-3">%</th>
                  <th className="px-3">Class avg</th>
                  <th className="px-3">Time used</th>
                  <th className="px-3">Attempt</th>
                  <th className="px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebdcaa]/60 bg-white">
                {m.history.map((h) => {
                  const [label, cls] = h.state === "finished" ? STATE_LABEL.finished[h.attemptStatus] : STATE_LABEL[h.state];
                  return (
                    <tr key={h.label} id={`hist-${h.label}`} className={`transition-colors hover:bg-[#fffdf4]/50 ${focus === h.label ? "bg-[#fffdf4]" : ""}`} data-testid="aia-history-row">
                      <td className="py-3 px-3 font-mono font-bold text-[#1e1b4b]">{h.label}</td>
                      <td className="px-3 font-bold text-[#1e1b4b]">{h.title}</td>
                      <td className="px-3 text-[#665e4d]">{h.subject}</td>
                      <td className="px-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-none whitespace-nowrap ${cls}`}>{label}</span></td>
                      <td className="px-3 font-bold text-[#1e1b4b]">{h.score === null ? "–" : `${h.score}/${h.totalQuestions}`}</td>
                      <td className="px-3 font-bold">{fmt(h.percentage, "%")}</td>
                      <td className="px-3 text-[#7a705a]">{fmt(h.classAveragePercentage, "%")}</td>
                      <td className="px-3 text-[#7a705a]">{h.timeUsedSeconds === null ? "–" : `${fmtDuration(h.timeUsedSeconds)}${h.allowedSeconds ? ` / ${Math.round(h.allowedSeconds / 60)}m` : ""}`}</td>
                      <td className="px-3 text-[#7a705a]">
                        {h.attemptNumber || "–"}
                        {h.previousAttempts.length > 0 && <span className="block text-[10px] text-[#7a705a]">Earlier: {h.previousAttempts.map((p) => `${p.percentage}%`).join(", ")}</span>}
                      </td>
                      <td className="px-3 text-[#7a705a]">{fmtDate(h.finishedAt || h.publishedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 8. AI Performance Report */}
        <AiPerformanceReport key={studentId} base={base} auth={auth} sufficiency={ds.level} titles={titles} onEvidence={showEvidence} student={student} scope={scope} />

        {/* 9. Data limitations */}
        <Section title="Methodology & Data Scope" subtitle="Telemetry boundaries and metric guidelines">
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#665e4d]" data-testid="aia-limitations">
            {ds.level !== "adequate" && <li>Only {ds.finishedAssessments} finished assessment{ds.finishedAssessments === 1 ? "" : "s"}; trend and consistency metrics require at least 3 completed tests.</li>}
            {FIXED_LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </Section>
      </div>
    </MentorLayout>
  );
}
