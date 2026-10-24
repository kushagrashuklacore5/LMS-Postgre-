import React, { useEffect, useState } from "react";
import StudentLayout from "../../components/StudentLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { Calendar, TrendingUp, CheckCircle, XCircle, BookOpen } from "lucide-react";

const StudentAttendance = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    total: 0,
    present: 0,
    absent: 0,
    percentage: 0
  });

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        setLoading(true);
        const studentId = localStorage.getItem('userId');
        
        // Fetch attendance records for this student (backend endpoint)
        const response = await fetch(`${API}/attendance/student`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch attendance');

        const data = await response.json();
        const records = data.data || data;

        // Server returns this student's attendance using /attendance/student
        const studentAttendance = Array.isArray(records) ? records : [];

        setAttendanceRecords(studentAttendance);

        // Calculate summary
        const total = studentAttendance.length;
        const present = studentAttendance.filter(r => (r.status || '').toLowerCase() === 'present').length;
        const absent = total - present;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

        setSummary({ total, present, absent, percentage });
      } catch (error) {
        console.error('Error fetching attendance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [API, token]);

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin h-10 w-10 border-4 border-[#B99652] border-t-transparent rounded-full"></div>
          </div>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-[#ebdcaa]/60">
          <h1 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight mb-1">
            {t('my_attendance')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            {t('track_attendance_records')}
          </p>
        </div>

        {/* Summary Cards */}
        <div data-tour="attendance-summary" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-[#ebdcaa] px-5 py-3.5 rounded-none flex items-center gap-3.5 shadow-xs hover:border-[#B99652] transition-colors">
            <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] shrink-0">
              <Calendar className="w-5 h-5 text-[#B99652]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] leading-none truncate">{summary.total}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate">{t('total_classes')}</p>
            </div>
          </div>

          <div className="bg-white border border-[#ebdcaa] px-5 py-3.5 rounded-none flex items-center gap-3.5 shadow-xs hover:border-[#B99652] transition-colors">
            <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] shrink-0">
              <CheckCircle className="w-5 h-5 text-[#B99652]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] leading-none truncate">{summary.present}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate">{t('present')}</p>
            </div>
          </div>

          <div className="bg-white border border-[#ebdcaa] px-5 py-3.5 rounded-none flex items-center gap-3.5 shadow-xs hover:border-[#B99652] transition-colors">
            <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] shrink-0">
              <XCircle className="w-5 h-5 text-[#B99652]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] leading-none truncate">{summary.absent}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate">{t('absent')}</p>
            </div>
          </div>

          <div className="bg-white border border-[#ebdcaa] px-5 py-3.5 rounded-none flex items-center gap-3.5 shadow-xs hover:border-[#B99652] transition-colors">
            <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] shrink-0">
              <TrendingUp className="w-5 h-5 text-[#B99652]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] leading-none truncate">{summary.percentage}%</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate">{t('attendance_percentage')}</p>
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        {attendanceRecords.length > 0 ? (
          <div data-tour="attendance-records-log" className="bg-white border border-[#ebdcaa] rounded-none overflow-hidden shadow-xs">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fffdf4] border-b border-[#ebdcaa]">
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
                    <Calendar className="inline mr-2 text-[#B99652]" size={15} /> {t('date') !== 'date' ? t('date') : 'Date'}
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
                    <BookOpen className="inline mr-2 text-[#B99652]" size={15} /> {t('classrooms') !== 'classrooms' ? t('classrooms') : 'Classroom'}
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
                    {t('status') !== 'status' ? t('status') : 'Status'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map((record, index) => (
                  <tr key={index} className="border-b border-[#ebdcaa]/50 hover:bg-[#fffdf4]/60 transition-colors">
                    <td className="px-6 py-3.5 text-sm font-medium text-slate-700">
                      {new Date(record.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-sm font-medium text-slate-700">
                      {record.classroomName || `${t('classrooms')} ${record.classroomId}`}
                    </td>
                    <td className="px-6 py-3.5 text-sm">
                      <span className={`px-3 py-1 rounded-none text-xs font-semibold uppercase tracking-wider ${
                        (record.status || '').toLowerCase() === 'present'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {(record.status || '').toLowerCase() === 'present' ? `✓ ${t('present')}` : `✗ ${t('absent')}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div data-tour="attendance-records-log" className="bg-[#fffdf4]/40 border-2 border-dashed border-[#ebdcaa] rounded-none p-12 text-center">
            <TrendingUp className="mx-auto mb-3 text-[#B99652]/60" size={44} />
            <p className="font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">{t('no_attendance_records')}</p>
            <p className="text-xs text-slate-500 mt-1">{t('attendance_marks_will_appear', 'Your attendance marks from mentors will appear here.')}</p>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentAttendance;
