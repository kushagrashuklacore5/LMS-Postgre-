import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth";
import StudentLayout from "../../components/StudentLayout";
import { useTranslation } from "react-i18next";
import { Trophy, FileText, CheckCircle, AlertCircle, Award } from "lucide-react";

const StudentResults = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation(['common', 'forms']);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const studentId = localStorage.getItem('userId');
      const res = await fetch(`${API}/results/student/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const resultsList = data.success ? data.data : (Array.isArray(data) ? data : []);
      setResults(resultsList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin h-10 w-10 border-4 border-[#B99652] border-t-transparent rounded-full"></div>
            <p className="ml-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('loading_courses')}</p>
          </div>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div data-tour="results-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-[#ebdcaa]/60">
          <h1 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight mb-1 flex items-center gap-2.5">
            <Award className="text-[#B99652] w-7 h-7" /> {t('my_results')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            {t('review_academic_exam_terms', 'Review your academic exam terms, grades, and subject-wise score breakdowns')}
          </p>
        </div>

        {results.length === 0 ? (
          <div className="text-center py-16 bg-[#fffdf4]/40 border-2 border-dashed border-[#ebdcaa] rounded-none">
            <Trophy className="w-16 h-16 text-[#B99652]/60 mx-auto mb-3" />
            <h3 className="font-['DM_Serif_Display',serif] text-2xl text-[#1e1b4b]">{t('no_results_yet')}</h3>
            <p className="text-xs text-slate-500 mt-1">{t('results_will_appear')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {results.map((result, resultIndex) => (
              <div key={result.id || result._id} className="bg-white rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] overflow-hidden shadow-xs hover:shadow-sm transition-shadow">
                
                {/* Header */}
                <div data-tour={resultIndex === 0 ? 'results-cards' : undefined} className="p-5 sm:p-6 bg-[#fffdf4] border-b border-[#ebdcaa]/80">
                  <div className="flex flex-wrap justify-between items-start gap-4">
                    <div>
                      <h2 className="text-2xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">{result.term || t('general_examination', 'General Examination')}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 font-medium">{t('classroom_colon', 'Classroom:')} <strong className="text-slate-700">{result.classroomName || 'N/A'} {result.section ? `- ${result.section}` : ''}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-slate-500 font-medium">{t('grade', 'Grade')} {result.grade || 'N/A'}</span>
                      </div>
                    </div>
                    <div className={`px-3.5 py-1.5 rounded-none font-bold text-xs uppercase tracking-wider flex items-center gap-2 border ${
                      result.overallStatus === "PASS"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}>
                      {result.overallStatus === "PASS" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                      {result.overallStatus}
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-[#ebdcaa]/50 flex gap-6">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('overall_percentage', 'Overall Percentage')}</p>
                      <p className={`text-3xl sm:text-4xl font-bold font-['DM_Serif_Display',serif] mt-0.5 ${result.overallStatus === "PASS" ? "text-emerald-700" : "text-red-700"}`}>
                        {result.overallPercentage}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div data-tour={resultIndex === 0 ? 'results-subject-breakdown' : undefined} className="p-5 sm:p-6">
                  <h3 className="font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] tracking-tight mb-4">{t('subject_wise_marks', 'Subject-wise Marks')}</h3>
                  <div className="overflow-x-auto border border-[#ebdcaa] rounded-none">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#ebdcaa] bg-[#fffdf4]">
                          <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('subject')}</th>
                          <th className="text-center py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('marks')}</th>
                          <th className="text-center py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('total')}</th>
                          <th className="text-center py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('percentage')}</th>
                          <th className="text-center py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(result.subjects) && result.subjects.length > 0 ? (
                          result.subjects.map((sub, index) => {
                            const percentage = sub.total > 0 ? ((sub.marks / sub.total) * 100).toFixed(2) : 0;
                            return (
                              <tr key={index} className="border-b border-[#ebdcaa]/40 hover:bg-[#fffdf4]/60 transition-colors">
                                <td className="py-3.5 px-4 font-semibold text-sm text-slate-800">{sub.name}</td>
                                <td className="py-3.5 px-4 text-center font-bold text-sm text-[#1e1b4b]">{sub.marks}</td>
                                <td className="py-3.5 px-4 text-center text-sm text-slate-500">{sub.total}</td>
                                <td className="py-3.5 px-4 text-center font-semibold text-sm text-slate-700">{percentage}%</td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`inline-block px-2.5 py-0.5 rounded-none text-[11px] font-bold uppercase tracking-wider border ${
                                    sub.status === "PASS"
                                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                      : "text-red-700 bg-red-50 border-red-200"
                                  }`}>
                                    {sub.status === "PASS" ? "✓ " + t('pass', 'PASS') : "✗ " + t('fail', 'FAIL')}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="5" className="py-6 px-4 text-center text-xs text-slate-500">{t('no_subjects_yet')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {result.comments && (
                    <div className="mt-5 p-4 bg-[#fffdf4] rounded-none border border-[#B99652]/40">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#B99652] mb-1">📝 {t('teacher_comments')}:</p>
                      <p className="text-slate-700 italic text-sm">"{result.comments}"</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentResults;
