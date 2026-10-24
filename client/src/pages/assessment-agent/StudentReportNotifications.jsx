import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { Bell, Download, Eye, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { downloadReportPdf } from "./reportPdf";
import { evidenceLabel } from "./AiPerformanceReport";
import { useTranslation } from "../../context/TranslationContext";

/*
 * AI Assessment Agent (migration 008) - the student's "New Performance Report" notifications.
 * The list is a REFERENCE only (id, title, teacher, date). "Download Report" fetches that ONE report from
 * the authenticated endpoint (the server checks it is this student's and was shared with them) and the
 * browser builds the PDF with the same reportPdf.js the teacher uses. No AI call anywhere here.
 */
export default function StudentReportNotifications({ base, auth }) {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [downloading, setDownloading] = useState(null);
  const lock = useRef(false); // a double-click downloads once

  useEffect(() => {
    let alive = true;
    axios.get(`${base}/performance-reports`, auth)
      .then((res) => { if (alive) setReports(res.data.reports); })
      .catch(() => { if (alive) setReports([]); }); // unavailable (e.g. before the database update): show nothing
    return () => { alive = false; };
  }, [base, auth]);

  const download = async (r) => {
    if (lock.current) return;
    lock.current = true;
    setDownloading(r.id);
    try {
      const { report } = (await axios.get(`${base}/performance-reports/${r.id}`, auth)).data;
      downloadReportPdf({ student: report.student, scope: report.scope, ai: report.ai, evidenceLabel });
      setReports((list) => list.map((x) => (x.id === r.id ? { ...x, read: true } : x)));
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || t('dashboard:srn_download_failed'));
    } finally {
      lock.current = false;
      setDownloading(null);
    }
  };

  if (reports.length === 0) return null;
  return (
    <section className="mb-6 bg-white rounded-xl shadow divide-y" data-testid="aia-report-notifications">
      {reports.map((r) => (
        <div key={r.id} className="p-4 flex items-center justify-between gap-4" data-testid="aia-report-notification" data-read={r.read ? "1" : "0"}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 p-2 rounded-full ${r.read ? "bg-gray-100 text-gray-500" : "bg-indigo-50 text-indigo-600"}`}><Bell size={16} /></span>
            <div>
              <div className="font-semibold flex items-center gap-2">
                {r.title}
                {!r.read && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{t('dashboard:srn_new')}</span>}
              </div>
              <div className="text-sm text-gray-600">{r.message}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {r.teacherName ? `${t('dashboard:srn_from', { name: r.teacherName })} · ` : ""}{r.focusLabel} · {new Date(r.sharedAt).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2">
          <Link to={`/student/assessment-agent/reports/${r.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50" data-testid="aia-report-view">
            <Eye size={16} /> View Report
          </Link>
          <button type="button" onClick={() => download(r)} disabled={downloading !== null}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-semibold disabled:opacity-60" data-testid="aia-report-download">
            {downloading === r.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t('dashboard:srn_download_report')}
          </button>
          </div>
        </div>
      ))}
    </section>
  );
}
