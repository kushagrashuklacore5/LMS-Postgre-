import { jsPDF } from "jspdf";

/*
 * AI Assessment Agent - download the AI Performance Report as a PDF (client-side, no network, no AI call).
 * Text-based (selectable) A4 document built from the report DATA already on screen: header, the 7 report
 * sections, the preview warning when the report is not validated, and a footer with page numbers.
 * The PDF is for the teacher; it contains the student's name/class exactly as the page shows them.
 */

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const WIDTH = PAGE_W - MARGIN * 2;
const METRIC = { overall: "Overall score", recent: "Recent performance", completion: "Completion", consistency: "Consistency", unanswered: "Unanswered questions", timed_out: "Timed-out attempts", retakes: "Retakes", trend: "Trend" };
const STATUS = { strong: "Strong", on_track: "On track", needs_support: "Needs support", insufficient_evidence: "Insufficient evidence" };
const QTYPE = { single_mcq: "Single-answer MCQ", multi_select: "Multiple select", numerical: "Numerical", mixed: "Mixed question types" };

/** The standard PDF font covers Latin-1 only: map common typographic characters, drop the rest. */
const plain = (s) => String(s ?? "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/…/g, "...").replace(/·/g, "-").replace(/→/g, "->").replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "");

export function downloadReportPdf({ student, scope, ai, evidenceLabel = (r) => r }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;
  const ensure = (h) => { if (y + h > PAGE_H - 18) { doc.addPage(); y = MARGIN; } };
  const text = (value, { size = 10, style = "normal", color = [31, 41, 55], indent = 0, gap = 1.5 } = {}) => {
    const s = plain(value);
    if (!s) return;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(s, WIDTH - indent);
    const lh = size * 0.42;
    for (const line of lines) { ensure(lh); doc.text(line, MARGIN + indent, y + lh * 0.8); y += lh; }
    y += gap;
  };
  const labelled = (label, value, indent = 0) => { if (plain(value)) text(`${label}: ${value}`, { indent, size: 9.5 }); };
  const evidence = (refs, indent = 0) => { if (refs && refs.length) text(`Evidence: ${refs.map(evidenceLabel).join(", ")}`, { indent, size: 8.5, color: [100, 116, 139] }); };
  const heading = (title) => {
    ensure(12);
    y += 2;
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + WIDTH, y);
    y += 2;
    text(title, { size: 12.5, style: "bold", color: [30, 64, 175], gap: 1 });
  };

  const c = ai.content;
  text("AI Performance Report", { size: 18, style: "bold", color: [17, 24, 39], gap: 1 });
  text(`${student.name}${student.classes?.length ? ` - ${student.classes.map((x) => x.name).join(", ")}` : ""}`, { size: 11.5, style: "bold", gap: 1 });
  text(`Focus: ${ai.focus?.label || "-"}   |   Generated: ${new Date(ai.generatedAt).toLocaleString()}   |   Assessments in scope: ${scope.assessments}${scope.subjects?.length ? ` (${scope.subjects.join(", ")})` : ""}`, { size: 8.5, color: [100, 116, 139] });
  text("AI interpretation of the recorded assessment metrics. It cannot change any score; review it with your own judgement.", { size: 8.5, style: "italic", color: [100, 116, 139] });

  if (ai.preview && ai.preview.validated === false) {
    y += 1;
    text("PREVIEW / NOT VALIDATED - this AI report has not passed all quality checks. Verify the content before relying on it.", { size: 10, style: "bold", color: [180, 83, 9] });
    for (const w of ai.preview.warnings || []) text(`- ${w.message}`, { size: 8.5, color: [146, 64, 14], indent: 3, gap: 0.5 });
  }

  heading(`Executive Summary (${STATUS[c.executiveSummary.overallStatus] || "-"})`);
  labelled("Observed", c.executiveSummary.observed);
  labelled("Interpretation", c.executiveSummary.interpretation);

  if (c.performanceOverview?.length) {
    heading("Performance Overview");
    for (const o of c.performanceOverview) {
      text(METRIC[o.metric] || o.metric, { style: "bold", size: 10, gap: 0.5 });
      labelled("Observed", o.observed, 3);
      labelled("Interpretation", o.interpretation, 3);
      evidence(o.evidence, 3);
    }
  }

  heading("Strengths");
  if (!c.strengths?.length) text("No strengths can be stated with the available evidence.", { size: 9.5, color: [100, 116, 139] });
  for (const s of c.strengths || []) {
    text(`${s.area} (${s.evidenceStrength} evidence)`, { style: "bold", size: 10, gap: 0.5 });
    labelled("Observed", s.observed, 3);
    evidence(s.evidence, 3);
  }

  heading("Areas Requiring Attention");
  if (!c.focusAreas?.length) text("No areas requiring attention were identified in the available evidence.", { size: 9.5, color: [100, 116, 139] });
  for (const f of c.focusAreas || []) {
    text(`${f.area} (${f.priority} priority, ${f.evidenceStrength} evidence)`, { style: "bold", size: 10, gap: 0.5 });
    labelled("Observed", f.observed, 3);
    labelled("Interpretation", f.interpretation, 3);
    labelled("To investigate", f.investigate, 3);
    evidence(f.evidence, 3);
  }

  heading("Recommended Mentor Actions");
  (c.mentorActions || []).forEach((a, i) => {
    text(`${i + 1}. ${a.action} (${a.priority})`, { style: "bold", size: 10, gap: 0.5 });
    labelled("Why", a.rationale, 4);
    evidence(a.evidence, 4);
  });

  if (c.nextAssessment) {
    const n = c.nextAssessment;
    heading("Suggested Next Assessment");
    text(n.objective, { style: "bold", size: 10 });
    text(`Questions: ${n.questionCount ?? "-"}   |   Question type: ${QTYPE[n.questionType] || "-"}   |   Difficulty: ${n.difficulty || "-"}`, { size: 9.5 });
    labelled("Why", n.rationale);
    evidence(n.evidence);
  }

  heading("Data Limitations");
  if (!c.dataLimitations?.length) text("No specific limitations were noted for this report.", { size: 9.5, color: [100, 116, 139] });
  for (const l of c.dataLimitations || []) text(`- ${l}`, { size: 9.5, indent: 2, gap: 0.5 });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(plain(`AI Performance Report - ${student.name} - AI interpretation; teacher review required`), MARGIN, PAGE_H - 8);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  const safeName = plain(student.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "student";
  doc.save(`AI-Performance-Report_${safeName}_${new Date(ai.generatedAt).toISOString().slice(0, 10)}.pdf`);
}
