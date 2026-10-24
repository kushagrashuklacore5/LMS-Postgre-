import AnnouncementBell from "../../components/AnnouncementBell";
import CreateAnnouncementModal from "../../components/announcements/CreateAnnouncementModal";
import QuotaLimitModal from "../../components/QuotaLimitModal";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth";
import MentorLayout from "../../components/MentorLayout";
import { useTranslation } from "../../context/TranslationContext";
import mentorHeroImg from "../../assets/mentor_reading_hero_perfect.png";
import { toast } from "react-toastify";
import {
  BookOpen,
  Award,
  PlusCircle,
  Users,
  TrendingUp,
  ClipboardList,
  Eye,
  Plus,
  UserPlus,
  FileText
} from "lucide-react";

/* ================= RANDOM COURSE THEMES ================= */

const COURSE_BACKGROUNDS = [
  "https://images.unsplash.com/photo-1523240795612-9a054b0db644",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b",
  "https://images.unsplash.com/photo-1584697964154-f09e38f4c5b3",
  "https://images.unsplash.com/photo-1532619675605-1ede6c2ed2b0"
];

const COURSE_GRADIENTS = [
  "from-purple-600 to-indigo-600",
  "from-blue-600 to-cyan-600",
  "from-emerald-600 to-teal-600",
  "from-pink-600 to-rose-600",
  "from-orange-500 to-amber-500",
  "from-violet-600 to-fuchsia-600"
];

const getCourseTheme = (id) => {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const MentorDashboard = () => {
  const navigate = useNavigate();
  const { user, token, API } = useAuth();
  const { t } = useTranslation();

  const [courseList, setCourseList] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  /* 🔔 Announcement modal */
  const [openAnnouncement, setOpenAnnouncement] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState(null);

  useEffect(() => {
    if (user && token && API) {
      fetchCourses();
    } else {
      setIsLoadingCourses(false);
    }
  }, [user, token, API]);

  const fetchCourses = async () => {
    try {
      const res = await fetch(`${API}/courses/mentor`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCourseList(Array.isArray(data) ? data : []);
      } else {
        setCourseList([]);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
      setCourseList([]);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  /** 🔥 CONDITIONAL REDIRECT LOGIC (UPDATED) */
  const handleAssessmentClick = (courseId) => {
    // Always navigate to Create Assessment page as requested
    navigate("/mentor/create-assessment", {
      state: { courseId },
    });
  };

  /* ================= REQUIRE USER ================= */
  if (!user) {
    return (
      <MentorLayout>
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </MentorLayout>
    );
  }

  /* ================= RENDER DASHBOARD ================= */
  return (
    <MentorLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-10">

        {/* ================= TOP BAR ================= */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">
              {t('welcome_back')}, {user?.name || "Mentor"}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {t('mentoring_overview')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div data-tour="mentor-announcements"><AnnouncementBell /></div>
          </div>
        </div>

        {/* ================= HERO ================= */}
        <div className="bg-gradient-to-r from-[#fffdf4] via-[#fbf8ea] to-[#f5ecd8] border border-[#ebdcaa] rounded-none p-6 md:p-8 flex flex-col md:flex-row items-center justify-between shadow-xs">
          <div>
            <h2 className="text-3xl md:text-5xl font-bold font-['DM_Serif_Display',serif] tracking-tight leading-tight mb-3 text-[#1e1b4b]">
              {t('inspire_teach_lead')}
            </h2>

            <p className="text-slate-600 text-base md:text-lg leading-relaxed max-w-xl font-normal">
              {t('manage_courses_hero')}
            </p>

          </div>

          <div className="relative flex items-center justify-center mt-6 md:mt-0">
            <div className="absolute w-44 h-44 sm:w-52 sm:h-52 bg-gradient-to-tr from-amber-300/25 via-amber-200/20 to-amber-100/10 rounded-full blur-xl pointer-events-none"></div>
            <img
              src={mentorHeroImg}
              alt="mentor hero"
              className="relative z-10 w-56 sm:w-64 md:w-72 max-h-56 object-contain drop-shadow-md transition-transform duration-300 hover:scale-105"
            />
          </div>
        </div>

        {/* ================= STATS (OPTION 1: CLEAN IVORY WITH GOLDEN ACCENT & TOPOGRAPHIC TEXTURE) ================= */}
        <div data-tour="mentor-stats" className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Total Courses */}
          <div className="relative overflow-hidden rounded-none p-6 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] shadow-xs hover:shadow-md transition-all duration-300 group">
            {/* Topographic Contour Wave Texture Overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.14] group-hover:opacity-[0.24] transition-opacity duration-300" viewBox="0 0 320 130" preserveAspectRatio="none" fill="none">
              <path d="M -20 110 C 60 40 140 120 220 50 C 270 10 310 60 360 20" stroke="#B99652" strokeWidth="1.5" />
              <path d="M -20 130 C 50 60 130 140 210 70 C 260 30 300 80 350 40" stroke="#B99652" strokeWidth="1.2" />
              <path d="M -10 90 C 70 20 150 100 230 30 C 280 -10 320 40 360 0" stroke="#B99652" strokeWidth="1.2" strokeDasharray="4 3" />
              <path d="M 0 150 C 80 80 160 160 240 90 C 290 50 330 100 370 60" stroke="#B99652" strokeWidth="0.9" />
              <circle cx="280" cy="35" r="48" stroke="#B99652" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            </svg>

            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]/70 mb-1.5">{t('total_courses')}</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1e1b4b] font-['DM_Serif_Display',serif]">{isLoadingCourses ? '-' : courseList.length}</h3>
              </div>
              <div className="w-12 h-12 rounded-none bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center shadow-xs border border-[#ebdcaa] group-hover:bg-[#B99652] group-hover:text-white transition-colors">
                <BookOpen className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>
          </div>

          {/* Total Students */}
          <div className="relative overflow-hidden rounded-none p-6 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] shadow-xs hover:shadow-md transition-all duration-300 group">
            {/* Topographic Contour Wave Texture Overlay (Variation 2) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.14] group-hover:opacity-[0.24] transition-opacity duration-300" viewBox="0 0 320 130" preserveAspectRatio="none" fill="none">
              <path d="M -30 40 C 50 110 130 30 210 100 C 260 140 310 80 360 120" stroke="#B99652" strokeWidth="1.5" />
              <path d="M -30 20 C 40 90 120 10 200 80 C 250 120 300 60 350 100" stroke="#B99652" strokeWidth="1.2" />
              <path d="M -20 60 C 60 130 140 50 220 120 C 270 160 320 100 370 140" stroke="#B99652" strokeWidth="1" strokeDasharray="5 3" />
              <circle cx="280" cy="40" r="36" stroke="#B99652" strokeWidth="1.2" opacity="0.7" />
              <circle cx="280" cy="40" r="64" stroke="#B99652" strokeWidth="0.9" strokeDasharray="4 3" opacity="0.5" />
            </svg>

            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]/70 mb-1.5">{t('total_students')}</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1e1b4b] font-['DM_Serif_Display',serif]">
                  {isLoadingCourses ? '-' : courseList.reduce((a, c) => a + (c.students?.length || 0), 0)}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-none bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center shadow-xs border border-[#ebdcaa] group-hover:bg-[#B99652] group-hover:text-white transition-colors">
                <Users className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>
          </div>

          {/* Active Courses */}
          <div className="relative overflow-hidden rounded-none p-6 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] shadow-xs hover:shadow-md transition-all duration-300 group">
            {/* Topographic Contour Wave Texture Overlay (Variation 3) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.14] group-hover:opacity-[0.24] transition-opacity duration-300" viewBox="0 0 320 130" preserveAspectRatio="none" fill="none">
              <path d="M -20 80 Q 70 -10 160 70 T 340 30" stroke="#B99652" strokeWidth="1.5" />
              <path d="M -20 105 Q 70 15 160 95 T 340 55" stroke="#B99652" strokeWidth="1.2" />
              <path d="M -20 55 Q 70 -35 160 45 T 340 5" stroke="#B99652" strokeWidth="1" strokeDasharray="4 3" />
              <path d="M -20 130 Q 70 40 160 120 T 340 80" stroke="#B99652" strokeWidth="0.8" />
              <circle cx="280" cy="40" r="52" stroke="#B99652" strokeWidth="1" opacity="0.6" />
            </svg>

            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]/70 mb-1.5">{t('active_courses')}</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1e1b4b] font-['DM_Serif_Display',serif]">{isLoadingCourses ? '-' : courseList.length}</h3>
              </div>
              <div className="w-12 h-12 rounded-none bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center shadow-xs border border-[#ebdcaa] group-hover:bg-[#B99652] group-hover:text-white transition-colors">
                <Award className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>
          </div>

        </div>

        {/* ================= COURSES ================= */}
        <div data-tour="mentor-courses" data-tour-courses-state={isLoadingCourses ? 'loading' : 'ready'}>
          <div className="flex items-center justify-between mb-4">
            <h2 data-tour="mentor-courses-heading" className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">{t('your_courses')}</h2>

            <button
              onClick={() => setOpenAnnouncement(true)}
              data-tour="mentor-create-announcement"
              className="flex items-center gap-2 bg-[#B99652] hover:bg-[#a38241] text-white px-4 py-2 rounded-none font-medium shadow-sm transition-all"
            >
              <PlusCircle size={18} />
              {t('announcement')}
            </button>
          </div>

          {courseList.length === 0 ? (
            <div className="bg-white border border-[#ebdcaa] rounded-none p-8 text-center shadow-xs">
              <div className="w-14 h-14 mx-auto bg-[#fffdf4] border border-[#ebdcaa] rounded-none flex items-center justify-center mb-3">
                <BookOpen className="w-7 h-7 text-[#9a7837]" />
              </div>
              <h3 className="text-base font-bold text-[#1e1b4b] mb-1 font-['DM_Serif_Display',serif]">{t('no_courses_assigned')}</h3>
              <p className="text-xs text-gray-500">You have not been assigned any courses yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courseList.map((course, courseIndex) => {
                const isMath = course.title && (course.title.toLowerCase().includes('math') || course.title.toLowerCase().includes('algebra') || course.title.toLowerCase().includes('geometry') || course.title.toLowerCase().includes('stat') || course.title.toLowerCase().includes('calc'));
                const isScience = course.title && (course.title.toLowerCase().includes('scienc') || course.title.toLowerCase().includes('physic') || course.title.toLowerCase().includes('chemist') || course.title.toLowerCase().includes('biolog') || course.title.toLowerCase().includes('experiment') || course.title.toLowerCase().includes('lab'));
                
                const bannerImg = course.photo 
                  ? `${API}${course.photo}` 
                  : isMath 
                    ? ['/banners/math_blueprint.png', '/banners/math_geometry.png', '/banners/math_stats.png'][courseIndex % 3]
                    : isScience 
                      ? ['/banners/science_general.png', '/banners/science_physics.png', '/banners/science_chemistry.png'][courseIndex % 3]
                      : null;

                return (
                  <div
                    key={course._id}
                    data-tour={courseIndex === 0 ? 'mentor-first-course-card' : undefined}
                    className="group bg-white border border-[#ebdcaa] rounded-none overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between"
                  >
                    {/* Top Banner Image Header */}
                    <div
                      className="h-36 relative bg-cover bg-center p-4 flex flex-col justify-between"
                      style={{
                        backgroundImage: bannerImg 
                          ? `url(${bannerImg})` 
                          : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #B99652 100%)'
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent"></div>
                      
                      <div className="relative z-10 flex justify-between items-start">
                        <div className="w-9 h-9 rounded-none bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-sm">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <span className="px-3 py-1 rounded-none text-xs font-semibold backdrop-blur-md bg-white/20 text-white border border-white/20 shadow-sm flex items-center gap-1.5">
                          <Users className="w-3 h-3 text-[#e0cfab]" />
                          {course.students?.length || 0} Students
                        </span>
                      </div>

                      <div className="relative z-10">
                        <span className="text-[11px] font-medium text-white/90 bg-black/40 backdrop-blur-sm px-2.5 py-0.5 rounded-none border border-white/10">
                          {course.chapters?.length || 0} Chapters
                        </span>
                      </div>
                    </div>

                    {/* Card Content & Details */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="text-base font-bold text-[#1e1b4b] group-hover:text-[#9a7837] transition-colors line-clamp-1">
                          {course.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {course.description || "Manage course chapters, assign enrolled students and create assessments."}
                        </p>
                      </div>

                      {/* Action Buttons Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#ebdcaa]/50">
                        <button
                          onClick={() => navigate(`/mentor/course/${course._id}`)}
                          data-tour={courseIndex === 0 ? 'mentor-course-view' : undefined}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-none bg-[#fffdf4] hover:bg-[#B99652] text-slate-700 hover:text-white font-medium text-xs transition-all duration-200 border border-[#ebdcaa] hover:border-[#B99652]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t('view')}
                        </button>
                        <button
                          data-tour={courseIndex === 0 ? 'mentor-course-add-chapter' : undefined}
                          onClick={() =>
                            navigate("/mentor/add-chapter", {
                              state: { courseId: course._id },
                            })
                          }
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-none bg-[#fffdf4] hover:bg-[#B99652] text-slate-700 hover:text-white font-medium text-xs transition-all duration-200 border border-[#ebdcaa] hover:border-[#B99652]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t('add_chapter')}
                        </button>
                        <button
                          data-tour={courseIndex === 0 ? 'mentor-course-assign' : undefined}
                          onClick={() =>
                            navigate("/mentor/assign-students", {
                              state: { courseId: course._id },
                            })
                          }
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-none bg-[#fffdf4] hover:bg-[#B99652] text-slate-700 hover:text-white font-medium text-xs transition-all duration-200 border border-[#ebdcaa] hover:border-[#B99652]"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {t('assign')}
                        </button>
                        <button
                          onClick={() => handleAssessmentClick(course._id)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-none bg-[#fffdf4] hover:bg-[#B99652] text-slate-700 hover:text-white font-medium text-xs transition-all duration-200 border border-[#ebdcaa] hover:border-[#B99652]"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          {t('assessment')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================= CREATE ANNOUNCEMENT MODAL ================= */}
      <CreateAnnouncementModal
        open={openAnnouncement}
        onClose={() => setOpenAnnouncement(false)}
        courses={courseList}
        onQuotaExceeded={(detail) => {
          setQuotaDetails(detail);
          setShowQuotaModal(true);
          setOpenAnnouncement(false);
        }}
      />

      {/* ================= QUOTA LIMIT MODAL ================= */}
      <QuotaLimitModal isOpen={showQuotaModal} onClose={() => setShowQuotaModal(false)} quotaDetails={quotaDetails} />
    </MentorLayout>
  );
};

export default MentorDashboard;
