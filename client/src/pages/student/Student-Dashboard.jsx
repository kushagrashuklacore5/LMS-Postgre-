import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import StudentLayout from "../../components/StudentLayout";
import AnnouncementBell from "../../components/AnnouncementBell";
import GuideBotLauncher from "../../guidebot/runtime/GuideBotLauncher";
import UniversalLanguageSelector from "../../components/UniversalLanguageSelector";
import { useAuth } from "../../auth/auth";
import ProgressBar from "../../components/ProgressBar";
import { useTranslation } from "../../context/TranslationContext";
import {
  BookOpen,
  Trophy,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  GraduationCap,
  ArrowRight,
  Search,
  Bell,
  Sun,
  FileText,
  Download,
  Upload,
  Compass,
  TrendingUp,
  Award,
  Video,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  UserCheck,
  CreditCard
} from "lucide-react";

const StudentDashboard = () => {
  const { user, token, API } = useAuth();
  const { t } = useTranslation();
  const [courses, setCourses] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalProgress: 0,
    completedCourses: 0,
    streakDays: 4,
    certificatesCount: 0,
    attendancePercentage: 0,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        console.log("📊 Starting dashboard data fetch...");

        // Fetch classrooms
        const classroomsResponse = await axios.get(
          `${API}/classrooms/student-classrooms`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const classroomList = Array.isArray(classroomsResponse.data) ? classroomsResponse.data : [];
        setClassrooms(classroomList);

        // Fetch attendance for student
        let attendanceData = null;
        try {
          const attendanceResponse = await axios.get(
            `${API}/attendance/student`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const allRecords = Array.isArray(attendanceResponse.data) 
            ? attendanceResponse.data 
            : (attendanceResponse.data?.data || []);
          attendanceData = Array.isArray(allRecords) ? allRecords : [];
          setAttendance(attendanceData);
        } catch (err) {
          console.error("❌ Attendance fetch error:", err.response?.data || err.message);
        }

        // Fetch results
        try {
          const resultsResponse = await axios.get(
            `${API}/results/my-results`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const studentResults = Array.isArray(resultsResponse.data) ? resultsResponse.data : [];
          setResults(studentResults);
        } catch (resultsErr) {
          try {
            const studentId = user?.id || user?.userId || user?._id;
            const universalResultsResponse = await axios.get(
              `${API}/results/student/${studentId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const responseData = universalResultsResponse.data;
            const studentResults = Array.isArray(responseData?.data) ? responseData.data : 
                                 Array.isArray(responseData) ? responseData : [];
            setResults(studentResults);
          } catch (universalErr) {
            setResults([]);
          }
        }

        // Fetch courses
        try {
          const coursesResponse = await axios.get(
            `${API}/courses/student`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const enrolledCourses = Array.isArray(coursesResponse.data) ? coursesResponse.data : [];

          const coursesWithProgress = await Promise.all(
            enrolledCourses.map(async (course) => {
              try {
                const progressResponse = await axios.get(
                  `${API}/progress/${course._id}`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                const progressData = progressResponse.data || {};
                return {
                  ...course,
                  progress: progressData.completionPercentage || 0,
                  completedChapters: progressData.completedChapters || 0,
                  totalChapters: progressData.totalChapters || 0,
                  progressDetails: progressData.progress || [],
                };
              } catch {
                return {
                  ...course,
                  progress: 0,
                  completedChapters: 0,
                  totalChapters: 0,
                  progressDetails: [],
                };
              }
            })
          );

          setCourses(coursesWithProgress);

          const totalProgress =
            coursesWithProgress.length > 0
              ? coursesWithProgress.reduce((acc, c) => acc + c.progress, 0) / coursesWithProgress.length
              : 0;

          const completedCourses = coursesWithProgress.filter((c) => c.progress === 100).length;

          let attendancePercentage = 0;
          if (attendanceData && Array.isArray(attendanceData)) {
            const total = attendanceData.length;
            const presentCount = attendanceData.filter(record => (record.status || '').toLowerCase() === 'present').length;
            attendancePercentage = total > 0 ? (presentCount / total) * 100 : 0;
          } else if (attendanceData && attendanceData.percentage) {
            attendancePercentage = attendanceData.percentage;
          }

          setStats({
            totalCourses: coursesWithProgress.length,
            totalProgress: Math.round(totalProgress),
            completedCourses,
            streakDays: 4,
            certificatesCount: 0,
            attendancePercentage: Math.round(attendancePercentage),
          });
        } catch (courseErr) {
          console.error("❌ Course fetch error:", courseErr);
          setCourses([]);
        }

      } catch (err) {
        console.error("❌ Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [token, API]);

  const filteredCourses = courses.filter((c) => {
    if (!searchTerm) return true;
    const title = (c.title || c.name || "").toLowerCase();
    const desc = (c.description || "").toLowerCase();
    return title.includes(searchTerm.toLowerCase()) || desc.includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex-1 overflow-y-auto p-6 bg-[#f4f5fa] min-h-screen">
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin h-10 w-10 border-4 border-[#5b3fd9] border-t-transparent rounded-full"></div>
          </div>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="flex-1 overflow-y-auto bg-[#f4f5fa] text-[#141a33] font-['Plus_Jakarta_Sans',sans-serif] min-h-screen pb-12">
        
        {/* ================= TOPBAR ================= */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-6 md:px-8 py-4 bg-[#f4f5fa]/90 backdrop-blur-md border-b border-[#e6e8f1]">


          {/* Search bar */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-xl lg:max-w-2xl">
            <input
              type="search"
              placeholder={t('dashboard:sd_search_courses')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 h-10 px-4 bg-white border border-[#d0cbef] rounded-lg text-sm text-[#141a33] outline-none placeholder-[#7a809c] focus:border-[#5b3fd9] focus:ring-1 focus:ring-[#5b3fd9]/30 transition-all shadow-sm"
            />
            <button
              type="button"
              className="h-10 w-10 shrink-0 bg-[#d8ceff] hover:bg-[#c9bbff] text-[#5b3fd9] rounded-xl flex items-center justify-center transition-colors shadow-sm"
            >
              <Search className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <UniversalLanguageSelector variant="compact" />
            <GuideBotLauncher tourId="student-overview-v1" />

            <div data-tour="announcement-bell" className="p-1">
              <AnnouncementBell />
            </div>

            <div className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white transition-colors">
              <div className="w-9 h-9 flex items-center justify-center text-[#141a33] flex-none">
                <svg
                  className="w-8 h-8 text-[#141a33]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="9.5" r="3.2" />
                  <path d="M6.2 18.2C7.5 15.8 9.5 14.5 12 14.5s4.5 1.3 5.8 3.7" />
                </svg>
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-[#141a33] leading-tight">{user?.name || t('dashboard:sd_student_user')}</div>
                <div className="text-[11px] text-[#7a809c]">{user?.studentId ? t('dashboard:sd_roll', { id: user.studentId }) : t('common:student')}</div>
              </div>
            </div>
          </div>
        </header>

        {/* ================= CONTENT GRID ================= */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-6 md:px-8 pt-6">

          {/* ================= LEFT / MAIN COLUMN (8 cols) ================= */}
          <div className="lg:col-span-8 flex flex-col gap-6">

            {/* HERO BANNER */}
            <section className="relative overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[240px] rounded-none bg-gradient-to-r from-[#fbfaff] via-[#f5f1ff] to-[#efe9ff] border border-[#e6e8f1] shadow-sm">
              <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center z-10">
                <span className="text-[11px] font-extrabold tracking-wider text-[#7a809c] uppercase mb-2">{t('dashboard:sd_journey_eyebrow')}</span>
                <h2 className="font-['DM_Serif_Display',serif] text-3xl sm:text-4xl text-[#141a33] leading-tight mb-3">
                  {t('dashboard:sd_hero_line1')} <span className="text-[#5b3fd9] block">{t('dashboard:sd_hero_line2')}</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#3a4160] max-w-sm mb-6 leading-relaxed">
                  {t('dashboard:sd_hero_body')}
                </p>
                <div>
                  <Link
                    to="/student/courses"
                    className="inline-flex items-center gap-2 h-11 px-6 rounded-none bg-[#0f1731] hover:bg-[#1c2850] text-white font-semibold text-xs sm:text-sm transition-all shadow-md hover:shadow-lg transform active:translate-y-0.5"
                  >
                    {t('dashboard:sd_explore_my_courses')} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
              <div className="md:col-span-5 relative flex items-center justify-center p-2 sm:p-4">
                <img
                  src="/student_result_illustration.png"
                  alt={t('dashboard:sd_alt_result_illustration')}
                  className="w-full h-56 sm:h-64 md:h-72 object-contain drop-shadow-xl hover:scale-105 transition-transform duration-300"
                />
              </div>
            </section>

            {/* STATS GRID */}
            <section data-tour="stats-grid" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Total Courses */}
              <div className="bg-white border border-[#e6e8f1] rounded-none p-4 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-none bg-[#efebff] text-[#5b3fd9] flex items-center justify-center">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-[#7a809c] font-medium">{t('total_courses')}</span>
                </div>
                <div className="text-2xl font-extrabold text-[#141a33] my-1">{stats.totalCourses}</div>
                <Link to="/student/courses" className="text-xs font-semibold text-[#5b3fd9] hover:underline inline-flex items-center gap-1">
                  {t('common:view_all')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Avg Progress */}
              <div className="bg-white border border-[#e6e8f1] rounded-none p-4 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-none bg-[#fff1e6] text-[#f07b1d] flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-[#7a809c] font-medium">{t('avg_progress')}</span>
                </div>
                <div className="text-2xl font-extrabold text-[#141a33] my-1">{stats.totalProgress}%</div>
                <span className="text-xs font-semibold text-[#f07b1d] inline-flex items-center gap-1">
                  {t('dashboard:sd_overall_completion')}
                </span>
              </div>

              {/* Attendance */}
              <div className="bg-white border border-[#e6e8f1] rounded-none p-4 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-none bg-[#e8f7ee] text-[#16a34a] flex items-center justify-center">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-[#7a809c] font-medium">{t('attendance')}</span>
                </div>
                <div className="text-2xl font-extrabold text-[#141a33] my-1">{stats.attendancePercentage.toFixed(1)}%</div>
                <Link to="/student/attendance" className="text-xs font-semibold text-[#16a34a] hover:underline inline-flex items-center gap-1">
                  {t('dashboard:sd_view_records')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Completed Courses */}
              <div className="bg-white border border-[#e6e8f1] rounded-none p-4 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-none bg-[#e8efff] text-[#2563eb] flex items-center justify-center">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-[#7a809c] font-medium">{t('common:completed')}</span>
                </div>
                <div className="text-2xl font-extrabold text-[#141a33] my-1">{stats.completedCourses}</div>
                <Link to="/student/results" className="text-xs font-semibold text-[#2563eb] hover:underline inline-flex items-center gap-1">
                  {t('dashboard:sd_view_results')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </section>

            {/* CONTINUE LEARNING SECTION */}
            <section className="bg-white border border-[#e6e8f1] rounded-none p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#141a33]">{t('common:continue_learning')}</h3>
                  <p className="text-xs text-[#7a809c]">{t('dashboard:sd_pick_up')}</p>
                </div>
                <Link to="/student/courses" className="text-xs font-semibold text-[#5b3fd9] hover:underline inline-flex items-center gap-1">
                  {t('common:view_all')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {filteredCourses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCourses.slice(0, 3).map((course, index) => (
                    <Link
                      key={course._id}
                      to={`/student/course/${course._id}`}
                      className="group border border-[#e6e8f1] rounded-none overflow-hidden bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all"
                    >
                      <div
                        className="h-28 relative bg-cover bg-center p-3 flex flex-col justify-between rounded-none"
                        style={{
                          backgroundImage: course.photo 
                            ? `url(${API}${course.photo})` 
                            : (course.title && (course.title.toLowerCase().includes('math') || course.title.toLowerCase().includes('algebra') || course.title.toLowerCase().includes('geometry') || course.title.toLowerCase().includes('stat') || course.title.toLowerCase().includes('calc')))
                              ? `url(${['/banners/math_blueprint.png', '/banners/math_geometry.png', '/banners/math_stats.png'][index % 3]})`
                              : (course.title && (course.title.toLowerCase().includes('scienc') || course.title.toLowerCase().includes('physic') || course.title.toLowerCase().includes('chemist') || course.title.toLowerCase().includes('biolog') || course.title.toLowerCase().includes('experiment') || course.title.toLowerCase().includes('lab')))
                                ? `url(${['/banners/science_general.png', '/banners/science_physics.png', '/banners/science_chemistry.png'][index % 3]})`
                                : 'linear-gradient(135deg, #5b3fd9 0%, #2563eb 100%)',
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div>
                        <div className="relative z-10 flex justify-between items-start">
                          <span className={`px-2.5 py-0.5 rounded-none text-[10px] font-bold backdrop-blur-md ${course.progress === 100 ? 'bg-emerald-500/80 text-white' : 'bg-[#5b3fd9]/80 text-white'}`}>
                            {course.progress === 100 ? t('common:completed') : t('common:in_progress')}
                          </span>
                        </div>
                      </div>
                      <div className="p-3.5">
                        <h4 className="font-bold text-sm text-[#141a33] line-clamp-1 group-hover:text-[#5b3fd9] transition-colors">{course.title}</h4>
                        <p className="text-xs text-[#7a809c] mt-0.5 mb-3 line-clamp-1">
                          {course.completedChapters}/{course.totalChapters || 0} {t('common:chapters_completed')}
                        </p>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-semibold text-[#3a4160]">
                            <span>{t('common:progress')}</span>
                            <span>{course.progress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-[#eceef5] rounded-none overflow-hidden">
                            <div className="h-full bg-[#5b3fd9] rounded-none transition-all duration-300" style={{ width: `${course.progress}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#7a809c] py-4">{t('dashboard:sd_no_courses_match')}</p>
              )}
            </section>

            {/* CLASSROOMS & ENROLLED COURSES SECTION */}
            {classrooms.length > 0 && (
              <section className="bg-white border border-[#e6e8f1] rounded-none p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#141a33]">{t('my_classroom')}</h3>
                    <p className="text-xs text-[#7a809c]">{t('dashboard:sd_classes_section_details')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {classrooms.map((classroom) => {
                    const classroomCourses = courses.filter(c => c.classroomId === classroom.id || c.classroomId === classroom._id);
                    return (
                      <div key={classroom._id} className="border border-[#e6e8f1] rounded-none p-5 bg-[#f8f9fc]">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-base font-bold text-[#141a33]">
                              {classroom.name} {classroom.section && `- ${classroom.section}`}
                            </h4>
                            <p className="text-xs text-[#7a809c]">
                              {t('class_teacher')}: {classroom.classTeacher?.name || t('not_assigned')}
                            </p>
                          </div>
                          {classroom.photo && (
                            <img src={`${API}${classroom.photo}`} alt={classroom.name} className="w-16 h-16 rounded-none object-cover border" />
                          )}
                        </div>

                        {classroomCourses.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-[#e6e8f1]">
                            <p className="text-xs font-bold text-[#3a4160] mb-2">📚 {t('courses_in_classroom')}:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {classroomCourses.map((c) => (
                                <div
                                  key={c._id}
                                  onClick={() => navigate(`/student/course/${c._id}`)}
                                  className="p-3 rounded-none bg-white border border-[#e6e8f1] hover:border-[#5b3fd9] cursor-pointer transition-all flex items-center justify-between group"
                                >
                                  <div>
                                    <div className="text-xs font-bold text-[#141a33] group-hover:text-[#5b3fd9] transition-colors">{c.title}</div>
                                    <div className="text-[11px] text-[#7a809c] mt-0.5">{c.completedChapters}/{c.totalChapters || 0} {t('common:chapters')}</div>
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-[#7a809c] group-hover:text-[#5b3fd9] transition-colors" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ATTENDANCE & RESULTS SUMMARY DUAL ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Attendance Quick Summary */}
              <div data-tour="attendance-summary" className="bg-white border border-[#e6e8f1] rounded-none p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[#141a33] flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-[#16a34a]" /> {t('common:attendance_summary')}
                    </h3>
                    <Link to="/student/attendance" className="text-xs font-semibold text-[#5b3fd9] hover:underline">
                      {t('common:view_all')} →
                    </Link>
                  </div>
                  {attendance && Array.isArray(attendance) && attendance.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-[#e8f7ee] p-2.5 rounded-none">
                          <p className="text-[10px] text-[#16a34a] font-semibold uppercase">{t('common:present')}</p>
                          <p className="text-lg font-bold text-[#16a34a]">{attendance.filter(a => a.status === 'present').length}</p>
                        </div>
                        <div className="bg-[#fdecec] p-2.5 rounded-none">
                          <p className="text-[10px] text-[#ef4444] font-semibold uppercase">{t('common:absent')}</p>
                          <p className="text-lg font-bold text-[#ef4444]">{attendance.filter(a => a.status === 'absent').length}</p>
                        </div>
                        <div className="bg-[#e8efff] p-2.5 rounded-none">
                          <p className="text-[10px] text-[#2563eb] font-semibold uppercase">{t('common:total')}</p>
                          <p className="text-lg font-bold text-[#2563eb]">{attendance.length}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {attendance.slice(0, 4).map((record, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2 bg-[#f8f9fc] rounded-none text-xs">
                            <span className="text-[#3a4160]">{new Date(record.date).toLocaleDateString()}</span>
                            <span className={`px-2 py-0.5 rounded-none text-[10px] font-bold ${record.status === 'present' ? 'bg-[#e8f7ee] text-[#16a34a]' : 'bg-[#fdecec] text-[#ef4444]'}`}>
                              {record.status === 'present' ? `✓ ${t('common:present')}` : `✗ ${t('common:absent')}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#7a809c] py-4">{t('dashboard:sd_no_attendance')}</p>
                  )}
                </div>
              </div>

              {/* Results Quick Summary */}
              <div data-tour="result-summary" className="bg-white border border-[#e6e8f1] rounded-none p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[#141a33] flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[#2563eb]" /> {t('navigation:nav_desc_academic_results')}
                    </h3>
                    <Link to="/student/results" className="text-xs font-semibold text-[#2563eb] hover:underline">
                      {t('common:view_all')} →
                    </Link>
                  </div>
                  {results && results.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {results.slice(0, 2).map((res, idx) => (
                        <div key={idx} className="p-3 bg-[#f8f9fc] border border-[#e6e8f1] rounded-none space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-[#141a33]">{res.term || t('dashboard:sd_term_exam')}</span>
                            <span className="text-xs font-bold text-[#16a34a]">{res.overallPercentage || 0}%</span>
                          </div>
                          {res.subjects && Array.isArray(res.subjects) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {res.subjects.slice(0, 3).map((sub, sIdx) => (
                                <span key={sIdx} className="text-[10px] bg-white px-1.5 py-0.5 rounded-none border border-[#e6e8f1] text-[#3a4160]">
                                  {sub.name}: {sub.marks}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#7a809c] py-4">{t('dashboard:sd_no_results')}</p>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* ================= RIGHT / SIDE COLUMN (4 cols) ================= */}
          <div className="lg:col-span-4 flex flex-col gap-6 h-full">

            {/* DAILY MOTIVATION QUOTE CARD */}
            <section className="relative overflow-hidden p-6 min-h-[180px] rounded-[18px] border border-[#e3dcff] bg-gradient-to-br from-[#f3efff] to-[#e8e1ff]">
              <h3 className="text-lg font-bold text-[#141a33] max-w-[170px] leading-snug">
                {t('dashboard:sd_quote')}
              </h3>
              <p className="text-xs text-[#3a4160] mt-2 max-w-[170px]">
                {t('dashboard:sd_quote_sub')}
              </p>
              {/* Decorative Plant SVG */}
              <svg className="absolute right-[-6px] rtl:right-auto rtl:left-[-6px] rtl:-scale-x-100 bottom-[-4px] w-32 h-40" viewBox="0 0 130 160" fill="none">
                <path d="M40 150h50l-6-34H46z" fill="#fff" opacity="0.9"/>
                <g fill="#7f6be0" opacity="0.85">
                  <path d="M65 118C62 90 50 70 30 58c14 20 22 38 30 60z"/>
                  <path d="M66 118c2-34 14-58 38-74-12 24-20 46-32 74z"/>
                  <path d="M64 118C58 84 60 50 72 20c2 34-2 64-8 98z"/>
                </g>
                <g fill="#a797f0" opacity="0.8">
                  <path d="M62 118c-12-18-28-26-48-28 16 10 30 18 44 30z"/>
                  <path d="M68 118c10-20 26-30 50-34-18 10-32 20-44 34z"/>
                </g>
              </svg>
            </section>

            {/* QUICK ACTIONS */}
            <section className="bg-white border border-[#e6e8f1] rounded-none p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#141a33]">{t('dashboard:quick_actions')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Link to="/student/courses" className="flex items-center gap-2.5 p-2.5 border border-[#e6e8f1] rounded-none hover:border-[#5b3fd9] hover:bg-[#efebff]/50 transition-all group">
                  <div className="w-8 h-8 rounded-none bg-[#efebff] text-[#5b3fd9] flex items-center justify-center flex-none">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#141a33] group-hover:text-[#5b3fd9] leading-tight">{t('common:view_courses')}</span>
                    <span className="block text-[10px] text-[#7a809c]">{t('dashboard:sd_my_portal')}</span>
                  </div>
                </Link>

                <Link to="/student/attendance" className="flex items-center gap-2.5 p-2.5 border border-[#e6e8f1] rounded-none hover:border-[#16a34a] hover:bg-[#e8f7ee]/50 transition-all group">
                  <div className="w-8 h-8 rounded-none bg-[#e8f7ee] text-[#16a34a] flex items-center justify-center flex-none">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#141a33] group-hover:text-[#16a34a] leading-tight">{t('common:attendance')}</span>
                    <span className="block text-[10px] text-[#7a809c]">{t('dashboard:sd_records')}</span>
                  </div>
                </Link>

                <Link to="/student/results" className="flex items-center gap-2.5 p-2.5 border border-[#e6e8f1] rounded-none hover:border-[#2563eb] hover:bg-[#e8efff]/50 transition-all group">
                  <div className="w-8 h-8 rounded-none bg-[#e8efff] text-[#2563eb] flex items-center justify-center flex-none">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#141a33] group-hover:text-[#2563eb] leading-tight">{t('navigation:nav_desc_academic_results')}</span>
                    <span className="block text-[10px] text-[#7a809c]">{t('common:grades')}</span>
                  </div>
                </Link>

                <div
                  onClick={() => {
                    const bellBtn = document.querySelector('[data-tour="announcement-bell"] button');
                    if (bellBtn) bellBtn.click();
                  }}
                  className="flex items-center gap-2.5 p-2.5 border border-[#e6e8f1] rounded-none hover:border-[#f07b1d] hover:bg-[#fff1e6]/50 cursor-pointer transition-all group"
                >
                  <div className="w-8 h-8 rounded-none bg-[#fff1e6] text-[#f07b1d] flex items-center justify-center flex-none">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#141a33] group-hover:text-[#f07b1d] leading-tight">{t('navigation:nav_announcements')}</span>
                    <span className="block text-[10px] text-[#7a809c]">{t('dashboard:sd_notices')}</span>
                  </div>
                </div>

                <Link to="/student/pay-fees" className="col-span-2 flex items-center justify-between p-2.5 border border-[#ebdcaa] bg-[#fffdf4] hover:bg-[#ebdcaa]/30 rounded-none transition-all group shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-none bg-[#B99652]/20 text-[#B99652] flex items-center justify-center flex-none">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e1b4b] group-hover:text-[#B99652] leading-tight">{t('dashboard:sd_pay_fees')}</span>
                      <span className="block text-[10px] text-gray-500">{t('dashboard:sd_view_dues')}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#B99652] px-2 py-0.5 border border-[#B99652]/40 bg-white">{t('dashboard:sd_pay_now')} &rarr;</span>
                </Link>
              </div>
            </section>

            {/* EXPLORE COURSES / LEARNING JOURNEY CARD */}
            <section
              className="flex-1 min-h-[320px] flex flex-col justify-between rounded-none border border-[#e6e8f1] shadow-sm bg-[#f4f7fc] p-6 relative overflow-hidden group hover:shadow-md transition-all"
            >
              {/* Background Image - Seamlessly integrated illustration flush to bottom */}
              <img
                src="/student_journey_card_bg.png?v=2"
                alt={t('dashboard:sd_alt_learning_journey')}
                className="absolute inset-0 w-full h-full object-cover object-bottom pointer-events-none select-none transition-transform duration-500 group-hover:scale-[1.02]"
              />

              {/* Floating Content merged over the illustration */}
              <div className="relative z-10 max-w-[280px]">
                <span className="inline-block px-2.5 py-0.5 bg-white/90 backdrop-blur-xs border border-[#d6e3f5] text-[10px] font-bold tracking-wider text-[#2563eb] uppercase mb-2 shadow-xs">
                  {t('dashboard:sd_learning_journey')}
                </span>
                <h3 className="text-base font-bold text-[#141a33] leading-snug">
                  {t('dashboard:sd_explore_expand')}
                </h3>
                <p className="text-xs text-[#4b5563] mt-1.5 leading-relaxed font-medium">
                  {t('dashboard:sd_discover')}
                </p>

                <div className="mt-4">
                  <Link
                    to="/student/courses"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-none shadow-sm transition-all group-hover:gap-3"
                  >
                    {t('dashboard:sd_explore_courses')}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </section>

          </div>

        </main>
      </div>
    </StudentLayout>
  );
};

export default StudentDashboard;