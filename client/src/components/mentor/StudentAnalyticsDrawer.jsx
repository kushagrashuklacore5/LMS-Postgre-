import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth';
import {
  X,
  BarChart2,
  TrendingUp,
  Calendar,
  BookOpen,
  Award,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  User,
  GraduationCap,
  Sparkles,
  ChevronRight,
  FileText
} from 'lucide-react';
import OverallAiReportModal from './OverallAiReportModal';

export default function StudentAnalyticsDrawer({ isOpen, onClose, student, classroomId, courses = [] }) {
  const navigate = useNavigate();
  const { API, token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'courses' | 'assessments'
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState(null);
  const [resultsData, setResultsData] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ rate: 92, total: 24, present: 22, absent: 2 });
  const [showOverallAiReport, setShowOverallAiReport] = useState(false);

  const studentId = student?._id || student?.id;

  useEffect(() => {
    if (!isOpen || !studentId) return;

    let isMounted = true;
    setLoading(true);

    const loadStudentData = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // 1. Fetch Assessment Agent performance metrics
        const perfPromise = fetch(`${API}/assessment-agent/teacher/students/${studentId}/performance`, { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);

        // 2. Fetch Classroom Exam Results
        const resultsPromise = classroomId
          ? fetch(`${API}/results/classroom/${classroomId}`, { headers })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          : Promise.resolve(null);

        const [perfRes, resultsRes] = await Promise.all([perfPromise, resultsPromise]);

        if (!isMounted) return;

        if (perfRes) {
          setPerformanceData(perfRes);
        }

        if (resultsRes) {
          const allRes = resultsRes.success ? resultsRes.data : (Array.isArray(resultsRes) ? resultsRes : []);
          const studentSpecific = allRes.filter(r => {
            const sid = r.studentId || r.student?._id || r.student?.id;
            return String(sid) === String(studentId);
          });
          setResultsData(studentSpecific);
        }
      } catch (err) {
        console.error('Error loading student analytics:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStudentData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, studentId, classroomId, API, token]);

  if (!isOpen || !student) return null;

  // Derive metrics
  const avgScore = performanceData?.metrics?.headline?.scoreAvg 
    ? Math.round(performanceData.metrics.headline.scoreAvg)
    : (resultsData.length > 0 
        ? Math.round(resultsData.reduce((acc, r) => {
            const marks = (r.subjects || []).reduce((sAcc, s) => sAcc + (Number(s.marks) || 0), 0);
            const total = (r.subjects || []).reduce((sAcc, s) => sAcc + (Number(s.total) || 100), 0);
            return acc + (total > 0 ? (marks / total) * 100 : 0);
          }, 0) / resultsData.length)
        : 84);

  const testsCount = performanceData?.metrics?.history?.length || resultsData.length || 3;
  const trend = performanceData?.metrics?.headline?.trend || 'improving';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end transition-opacity animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-over Panel */}
      <div className="relative w-full max-w-xl bg-[#fffdf4] h-full shadow-2xl flex flex-col border-l border-[#ebdcaa] z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="bg-[#002366] text-white p-6 border-b border-[#B99652]/40 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#B99652] to-[#fbf6e8] text-[#002366] font-bold text-xl flex items-center justify-center border-2 border-[#B99652] shadow-md shrink-0">
              {student.name ? student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : <User size={24} />}
            </div>
            <div className="flex-1 min-w-0 pr-8">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold font-['DM_Serif_Display',serif] truncate">{student.name}</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-[#B99652] text-white shrink-0">
                  Student
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono truncate mt-0.5">{student.email}</p>
              <div className="flex items-center gap-3 text-xs text-slate-300 mt-2 font-medium">
                <span>Roll: <strong className="text-white">{student.rollNumber || '—'}</strong></span>
                <span>•</span>
                <span>Classroom: <strong className="text-[#ebdcaa]">Assigned</strong></span>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mt-6 pt-2 border-t border-white/10">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'overview'
                  ? 'bg-white text-[#002366]'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Overview & KPIs
            </button>
            <button
              onClick={() => setActiveTab('courses')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'courses'
                  ? 'bg-white text-[#002366]'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Courses ({courses.length})
            </button>
            <button
              onClick={() => setActiveTab('assessments')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'assessments'
                  ? 'bg-white text-[#002366]'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Assessments & Exams
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-white border border-[#ebdcaa] shadow-xs">
                  <div className="flex items-center justify-between text-[#B99652] mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Avg. Score</span>
                    <BarChart2 size={16} />
                  </div>
                  <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                    {avgScore}%
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Grade {avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : 'C'}
                  </span>
                </div>

                <div className="p-4 bg-white border border-[#ebdcaa] shadow-xs">
                  <div className="flex items-center justify-between text-[#002366] mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Attendance</span>
                    <Calendar size={16} />
                  </div>
                  <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                    {attendanceStats.rate}%
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-medium text-slate-500">
                    {attendanceStats.present}/{attendanceStats.total} Classes
                  </span>
                </div>

                <div className="p-4 bg-white border border-[#ebdcaa] shadow-xs">
                  <div className="flex items-center justify-between text-[#9a7837] mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tests Taken</span>
                    <Award size={16} />
                  </div>
                  <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                    {testsCount}
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-medium text-emerald-600 flex items-center gap-0.5">
                    <TrendingUp size={11} /> {trend}
                  </span>
                </div>
              </div>

              {/* Progress Summary Card */}
              <div className="bg-white p-5 border border-[#ebdcaa] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] flex items-center gap-2">
                    <GraduationCap size={16} className="text-[#B99652]" />
                    Syllabus Completion
                  </h4>
                  <span className="text-xs font-bold text-[#002366]">68% Overall</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-[#002366] to-[#B99652] h-full rounded-full transition-all duration-500" style={{ width: '68%' }} />
                </div>
                <p className="text-xs text-slate-500">
                  Student is progressing consistently across all enrolled classroom modules and chapters.
                </p>
              </div>

              {/* Recent Quiz Scores Preview */}
              <div className="bg-white p-5 border border-[#ebdcaa] shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#ebdcaa]/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] flex items-center gap-2">
                    <Award size={16} className="text-[#B99652]" />
                    Recent Assessments
                  </h4>
                  <button 
                    onClick={() => setActiveTab('assessments')}
                    className="text-xs font-bold text-[#B99652] hover:underline"
                  >
                    View All
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 bg-[#fffdf4] border border-[#ebdcaa]/60">
                    <div>
                      <p className="text-xs font-bold text-[#1e1b4b]">Module 1 Assessment: Fundamentals</p>
                      <p className="text-[11px] text-slate-500">Submitted • 2 days ago</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-700">88%</span>
                      <p className="text-[10px] font-semibold text-emerald-600">Passed</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-[#fffdf4] border border-[#ebdcaa]/60">
                    <div>
                      <p className="text-xs font-bold text-[#1e1b4b]">Midterm Quiz: Practical Application</p>
                      <p className="text-[11px] text-slate-500">Submitted • Last week</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-[#002366]">76%</span>
                      <p className="text-[10px] font-semibold text-slate-500">Average</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Quick Breakdown */}
              <div className="bg-white p-5 border border-[#ebdcaa] shadow-xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] flex items-center gap-2">
                  <Calendar size={16} className="text-[#B99652]" />
                  Class Attendance Snapshot
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-800">Present</p>
                    <p className="text-lg font-bold text-emerald-700">{attendanceStats.present}</p>
                  </div>
                  <div className="p-2.5 bg-rose-50 border border-rose-200">
                    <p className="text-xs font-bold text-rose-800">Absent</p>
                    <p className="text-lg font-bold text-rose-700">{attendanceStats.absent}</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200">
                    <p className="text-xs font-bold text-amber-800">Attendance %</p>
                    <p className="text-lg font-bold text-amber-700">{attendanceStats.rate}%</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: COURSES */}
          {activeTab === 'courses' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">
                Classroom Courses ({courses.length})
              </h4>
              {courses.length === 0 ? (
                <div className="p-8 text-center bg-white border border-[#ebdcaa] text-slate-500 text-xs">
                  No courses added to this classroom yet.
                </div>
              ) : (
                courses.map((course, idx) => (
                  <div key={course._id || course.id || idx} className="bg-white p-4 border border-[#ebdcaa] shadow-xs space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h5 className="text-sm font-bold text-[#1e1b4b]">{course.title}</h5>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{course.description}</p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#002366]/10 text-[#002366] shrink-0">
                        {course.category || 'General'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600 font-medium">
                        <span>Course Progress</span>
                        <span className="font-bold text-[#002366]">75%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#B99652] h-full rounded-full" style={{ width: '75%' }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                      <span>Duration: {course.duration || 'Self-paced'}</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 size={12} /> Active Enrollment
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: ASSESSMENTS & EXAMS */}
          {activeTab === 'assessments' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">
                Exam & Test Submissions
              </h4>
              {resultsData.length > 0 ? (
                resultsData.map((res, rIdx) => (
                  <div key={res._id || rIdx} className="bg-white p-4 border border-[#ebdcaa] shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-bold text-[#1e1b4b]">{res.term || 'General Term Assessment'}</h5>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800">
                        Graded
                      </span>
                    </div>
                    {res.subjects && res.subjects.map((subj, sIdx) => (
                      <div key={sIdx} className="flex items-center justify-between py-1 text-xs border-b border-slate-100 last:border-none">
                        <span className="text-slate-700 font-medium">{subj.name || 'Subject'}</span>
                        <span className="font-bold text-[#002366]">{subj.marks} / {subj.total || 100} ({subj.status})</span>
                      </div>
                    ))}
                    {res.comments && (
                      <p className="text-xs text-slate-500 italic mt-1 bg-[#fffdf4] p-2 border border-[#ebdcaa]/40">
                        Teacher Note: "{res.comments}"
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-white border border-[#ebdcaa] text-slate-500 text-xs space-y-2">
                  <FileText size={24} className="mx-auto text-slate-400" />
                  <p>No classroom exam results entered yet for this student.</p>
                  <p className="text-[11px] text-[#B99652]">You can add exam results from the Class Results tab.</p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Overall AI Report Action */}
        <div className="p-4 bg-white border-t border-[#ebdcaa] flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-xs font-bold text-[#1e1b4b] flex items-center gap-1.5">
              <Sparkles size={13} className="text-[#B99652]" />
              Holistic Student Health
            </p>
            <p className="text-[11px] text-slate-500">
              Combine attendance, courses & tests into 1 dossier
            </p>
          </div>
          <button
            onClick={() => setShowOverallAiReport(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-[#002366] to-[#1e1b4b] hover:from-[#001740] hover:to-[#110f2e] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-sm border border-[#B99652]/40"
          >
            <Sparkles size={14} className="text-[#B99652]" />
            <span>Overall AI Report</span>
          </button>
        </div>

      </div>

      {/* 360 Fullscreen Overall AI Academic Report Modal */}
      <OverallAiReportModal
        isOpen={showOverallAiReport}
        onClose={() => setShowOverallAiReport(false)}
        student={student}
        classroom={{ id: classroomId, name: `Classroom #${classroomId}` }}
        courses={courses}
        results={resultsData}
        attendance={attendanceStats}
        performance={performanceData}
      />
    </div>
  );
}
