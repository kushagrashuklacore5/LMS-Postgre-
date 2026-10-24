import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MentorLayout from "../../components/MentorLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import { Plus, BookOpen, Users, X, ChevronDown, ArrowRight, GraduationCap, MoreVertical, Calendar, BarChart2, Clock } from "lucide-react";

const CLASSROOM_TEXTURES = [
  // 0: Deep Indigo / Violet with Concentric Ripple Circles
  {
    gradient: "bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca]",
    avatarGradient: "from-amber-400 to-amber-500 text-amber-950",
    pattern: (
      <svg className="absolute right-0 top-0 h-full w-44 opacity-25 pointer-events-none" viewBox="0 0 160 120" fill="none">
        <circle cx="130" cy="55" r="20" stroke="white" strokeWidth="1.5" />
        <circle cx="130" cy="55" r="38" stroke="white" strokeWidth="1.5" />
        <circle cx="130" cy="55" r="56" stroke="white" strokeWidth="1.5" />
        <circle cx="130" cy="55" r="74" stroke="white" strokeWidth="1.5" />
        <circle cx="130" cy="55" r="92" stroke="white" strokeWidth="1.5" />
      </svg>
    )
  },
  // 1: Cobalt / Sapphire Blue with Dot Matrix Grid
  {
    gradient: "bg-gradient-to-br from-[#172554] via-[#1e40af] to-[#3b82f6]",
    avatarGradient: "from-indigo-600 to-purple-600 text-white",
    pattern: (
      <svg className="absolute right-3 top-3 h-full w-36 opacity-35 pointer-events-none" viewBox="0 0 120 100" fill="white">
        <pattern id="dot-matrix-grid" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.5" />
        </pattern>
        <rect width="120" height="100" fill="url(#dot-matrix-grid)" />
      </svg>
    )
  },
  // 2: Dark Midnight Slate with Diagonal Stripe Lines
  {
    gradient: "bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155]",
    avatarGradient: "from-slate-800 to-slate-950 text-white",
    pattern: (
      <svg className="absolute right-0 top-0 h-full w-44 opacity-30 pointer-events-none" viewBox="0 0 160 120" fill="none">
        <line x1="60" y1="0" x2="160" y2="100" stroke="white" strokeWidth="2.5" />
        <line x1="85" y1="0" x2="185" y2="100" stroke="white" strokeWidth="2.5" />
        <line x1="110" y1="0" x2="210" y2="100" stroke="white" strokeWidth="2.5" />
        <line x1="135" y1="0" x2="235" y2="100" stroke="white" strokeWidth="2.5" />
        <line x1="35" y1="0" x2="135" y2="100" stroke="white" strokeWidth="2.5" />
      </svg>
    )
  },
  // 3: Deep Navy with Wave Curvature
  {
    gradient: "bg-gradient-to-br from-[#001c52] via-[#002366] to-[#1e3a8a]",
    avatarGradient: "from-emerald-500 to-teal-700 text-white",
    pattern: (
      <svg className="absolute right-0 top-0 h-full w-40 opacity-25 pointer-events-none" viewBox="0 0 160 120" fill="none">
        <circle cx="140" cy="30" r="30" stroke="white" strokeWidth="1.5" />
        <circle cx="140" cy="30" r="60" stroke="white" strokeWidth="1.5" />
        <circle cx="140" cy="30" r="90" stroke="white" strokeWidth="1.5" />
      </svg>
    )
  }
];

const getTeacherInitials = (name) => {
  if (!name) return "TR";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const MentorClassrooms = () => {
  const { API, token, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    category: "",
    duration: "",
    courseTeacherId: "",
    studentIds: [],
  });

  const fetchAssignedClassrooms = async () => {
    try {
      setLoading(true);
      
      console.log("🔍 DEBUG: fetchAssignedClassrooms called");
      console.log("👤 DEBUG: User object:", user);
      console.log("🔑 DEBUG: Token available:", !!token);
      
      // Always set loading to false in a timeout to prevent infinite loading
      const loadingTimeout = setTimeout(() => {
        setLoading(false);
        console.log("⏰ DEBUG: Loading timeout - forcing loading to false");
      }, 5000);
      
      if (!user?.id && !user?._id) {
        console.error("❌ DEBUG: No user ID available");
        setClassrooms([]);
        clearTimeout(loadingTimeout);
        setLoading(false);
        return;
      }
      
      const userId = user.id || user._id;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      console.log("🔍 DEBUG: User ID:", userId);
      console.log("🔗 DEBUG: API URL:", `${API}/classrooms/my-classrooms`);
      console.log("🔑 DEBUG: Headers:", headers);
      
      // Fetch classrooms assigned to this mentor
      const res = await fetch(`${API}/classrooms/my-classrooms`, {
        headers: headers,
      });
      
      console.log("📊 DEBUG: Response status:", res.status);
      console.log("📊 DEBUG: Response ok:", res.ok);
      
      const data = await res.json();
      
      console.log("📋 DEBUG: Response data:", data);
      
      clearTimeout(loadingTimeout);
      
      if (!res.ok) {
        console.warn("❌ DEBUG: API Error:", data.message);
        setClassrooms([]);
      } else {
        // Handle both array and wrapped response
        const classroomList = data.data || data.classrooms || data;
        const validClassrooms = Array.isArray(classroomList) ? classroomList : [];
        
        console.log("📋 DEBUG: Extracted classroomList:", classroomList);
        console.log("📋 DEBUG: Valid classrooms:", validClassrooms);
        console.log("📋 DEBUG: Is array:", Array.isArray(classroomList));
        console.log("📋 DEBUG: Length:", validClassrooms.length);
        
        setClassrooms(validClassrooms);
        console.log(`✅ Loaded ${validClassrooms.length} classrooms for user ${userId}`);
      }
    } catch (err) {
      console.error("❌ DEBUG: Fetch error:", err);
      setClassrooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedClassrooms();
    
    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      console.log("⚠️ SAFETY: Forced loading to false after 10 seconds");
    }, 10000);
    
    return () => clearTimeout(safetyTimeout);
  }, []);

  const handleCreateCourse = (classroom) => {
    // Navigate to CreateCourse page with classroom context
    navigate('/mentor/create-course', { 
      state: { 
        classroomId: classroom._id || classroom.id,
        classroomName: classroom.name 
      } 
    });
  };

  
  return (
    <MentorLayout>
      <div 
        className="p-4 sm:p-6 md:p-8 min-h-screen text-[#1e1b4b]"
        style={{
          backgroundColor: "#fffdf4",
          backgroundImage: "linear-gradient(to right, #ebdcaa20 1px, transparent 1px), linear-gradient(to bottom, #ebdcaa20 1px, transparent 1px)",
          backgroundSize: "44px 44px"
        }}
      >
        <div className="max-w-7xl mx-auto">
          {/* ENHANCED HEADER */}
          <div data-tour="classrooms-header" data-tour-classrooms-state={loading ? 'loading' : 'ready'} className="mb-8">
            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-12 h-12 bg-[#002366] text-white flex items-center justify-center rounded-none shadow-sm">
                <GraduationCap className="w-6 h-6 text-[#59cfbd]" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif] tracking-tight">
                  {t('my_classrooms')}
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm font-medium">{t('manage_classrooms_courses_students')}</p>
              </div>
            </div>
          </div>

          {/* CONTENT */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-10 h-10 border-3 border-[#002366] border-t-transparent animate-spin"></div>
            </div>
          ) : classrooms.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-none shadow-sm border border-dashed border-[#ebdcaa]">
              <div className="w-16 h-16 bg-[#002366]/10 rounded-none border border-[#002366]/20 flex items-center justify-center mx-auto mb-4 text-[#002366]">
                <GraduationCap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#1e1b4b] mb-1 font-['DM_Serif_Display',serif]">{t('no_classrooms_assigned')}</h3>
              <p className="text-slate-500 text-xs sm:text-sm mb-6">{t('not_assigned_to_classrooms')}</p>
              <button
                onClick={() => navigate("/mentor")}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#002366] hover:bg-[#001c52] text-white rounded-none text-xs sm:text-sm font-semibold shadow-sm transition"
              >
                {t('go_to_dashboard')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classrooms.map((classroom, classroomIndex) => {
                const tex = CLASSROOM_TEXTURES[classroomIndex % CLASSROOM_TEXTURES.length];
                return (
                  <div
                    key={classroom._id || classroom.id}
                    data-tour={classroomIndex === 0 ? 'my-classroom-first-card' : undefined}
                    onClick={() => navigate(`/mentor/classroom/${classroom._id || classroom.id}`)}
                    className="bg-white rounded-none shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden border border-[#ebdcaa] cursor-pointer flex flex-col justify-between group"
                  >
                    {/* Textured Background Header */}
                    <div className={`relative ${tex.gradient} p-5 pb-8 text-white overflow-hidden rounded-none`}>
                      {tex.pattern}
                      <div className="relative z-10 flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-white tracking-tight">
                            {classroom.name}
                          </h3>
                          <p className="text-xs text-white/80 font-medium mt-0.5">
                            {classroom.section ? `Section ${classroom.section}` : `Grade ${classroom.grade || ''}`} {classroom.academicYear ? `• ${classroom.academicYear}` : '• 2026-27'}
                          </p>
                        </div>
                        <div className="text-white/70 hover:text-white p-1 rounded-none">
                          <MoreVertical className="w-4 h-4" />
                        </div>
                      </div>
                      
                      <div className="relative z-10 mt-3">
                        <span className="inline-block text-[10px] uppercase tracking-wider font-bold bg-[#59cfbd] text-[#002366] px-2.5 py-0.5 rounded-none shadow-xs">
                          {classroom.role === 'class_teacher' ? 'Class teacher' : 'Course teacher'}
                        </span>
                      </div>

                      {/* Overlapping Teacher Avatar Pill Badge */}
                      <div className={`absolute right-5 -bottom-4 w-10 h-10 rounded-none bg-gradient-to-br ${tex.avatarGradient} font-bold text-xs flex items-center justify-center border-2 border-white shadow-sm z-20`}>
                        {getTeacherInitials(classroom.classTeacher?.name)}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 pt-6 space-y-3 flex-1 flex flex-col justify-between bg-white">
                      <div>
                        <h4 className="text-sm font-bold text-[#1e1b4b] line-clamp-1">
                          {classroom.classTeacher?.name || "Not Assigned"}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Class teacher {classroom.academicYear ? `• ${classroom.academicYear}` : ''}
                        </p>
                      </div>

                      {/* Student Avatars Stack & Count */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-slate-600 font-medium">
                          {classroom.studentCount || 0} students
                        </span>
                      </div>

                      {/* Next class schedule note */}
                      <div className="bg-[#fffdf4] rounded-none p-2.5 flex items-center gap-2 text-xs text-slate-600 border border-[#ebdcaa]/60">
                        <Clock className="w-3.5 h-3.5 text-[#002366] shrink-0" />
                        <span className="truncate">Next: <strong>Classroom Session</strong> • Scheduled</span>
                      </div>

                      {/* Action Footer */}
                      <div className="pt-3 border-t border-[#ebdcaa]/60 flex items-center justify-between gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateCourse(classroom);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#fffdf4] hover:bg-[#002366] text-slate-700 hover:text-white rounded-none text-xs font-semibold transition-all border border-[#ebdcaa] hover:border-[#002366]"
                        >
                          <Plus size={14} />
                          {t('create_course')}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/mentor/classroom/${classroom._id || classroom.id}`);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#002366] hover:bg-[#001c52] text-white rounded-none text-xs font-semibold shadow-xs hover:shadow transition-all"
                        >
                          Open
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
    </MentorLayout>
  );
};

export default MentorClassrooms;
