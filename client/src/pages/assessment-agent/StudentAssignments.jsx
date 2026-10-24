import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CalendarClock, ChevronRight, FileText, Inbox, Loader2 } from "lucide-react";
import StudentLayout from "../../components/StudentLayout";
import { useAuth } from "../../auth/auth";
import { Badge, STUDENT_STATUS, apiError, dueText } from "./assignmentUi";
import { useTranslation } from "../../context/TranslationContext";

/*
 * AI Assessment Agent - Descriptive Assignments (student list). Backend: GET /api/assessment-agent/student/assignments.
 * The server decides what is visible (published/closed assignments of the student's classes) and each status.
 */
export default function StudentAssignments() {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API}/assessment-agent/student/assignments`, auth)
      .then((r) => setList(r.data.assignments))
      .catch((err) => { setError(apiError(err, t('dashboard:asg_load_failed'))); setList([]); });
  }, [API, auth]);

  const open = (list || []).filter((a) => a.myStatus === "not_submitted");
  const rest = (list || []).filter((a) => a.myStatus !== "not_submitted");

  const Row = ({ a }) => (
    <Link to={`/student/assessment-agent/assignments/${a.id}`} className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow" data-testid="aia-stu-asg-row" data-title={a.title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{a.title}</h3>
          <p className="text-sm text-gray-500">{a.teacherName || t('dashboard:asg_teacher')} · {a.classroom?.name || t('dashboard:asg_class')} · {t('dashboard:asg_marks', { n: a.maxMarks })}</p>
        </div>
        <Badge map={STUDENT_STATUS} value={a.myStatus} testId="aia-stu-asg-status" />
      </div>
      {a.instructions && <p className="mt-3 text-sm text-gray-600 line-clamp-2">{a.instructions}</p>}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-gray-600"><CalendarClock size={16} className="text-gray-400" /> {a.status === "closed" ? t('dashboard:st_closed') : dueText(a.dueAt, t)}</span>
        <span className="flex items-center gap-1 text-primary font-medium">{t('dashboard:asg_open')} <ChevronRight size={16} /></span>
      </div>
    </Link>
  );

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Link to="/student/assessment-agent/tests" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft size={16} /> {t('navigation:nav_my_tests')}</Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText size={24} /> {t('dashboard:st_my_assignments')}</h1>
          <p className="text-sm text-gray-500">{t('dashboard:asg_intro')}</p>
        </div>
        {error && <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
        {list === null ? (
          <div className="p-10 text-center text-gray-500"><Loader2 className="inline animate-spin" /> {t('common:loading')}</div>
        ) : list.length === 0 && !error ? (
          <div className="p-12 bg-white rounded-2xl border border-dashed border-gray-300 text-center" data-testid="aia-stu-asg-empty">
            <Inbox size={36} className="mx-auto text-gray-400" />
            <p className="mt-3 font-semibold text-gray-800">{t('dashboard:asg_empty_title')}</p>
            <p className="text-sm text-gray-500">{t('dashboard:asg_empty_body')}</p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('dashboard:asg_to_do')}</h2>
                {open.map((a) => <Row key={a.id} a={a} />)}
              </section>
            )}
            {rest.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('dashboard:asg_submitted_past')}</h2>
                {rest.map((a) => <Row key={a.id} a={a} />)}
              </section>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
}
