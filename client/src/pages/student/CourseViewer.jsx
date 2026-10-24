import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LecturesTable from "../../components/lectures/LecturesTable";
import { useAuth } from "../../auth/auth";
import StudentLayout from "../../components/StudentLayout";
import { toast } from "react-toastify";
import { useTranslation } from "../../context/TranslationContext";
import io from "socket.io-client";
import axios from "axios";
import {
  Video,
  X,
  Clock,
  Calendar,
  CheckCircle,
  CheckCircle2,
  BookOpen,
  FileText,
  Lock,
  Play,
  Sparkles,
  Radio,
  Users,
  Check,
  ChevronDown,
  ChevronRight,
  Award,
  ExternalLink
} from "lucide-react";
import { fileLink } from "../../config/api";

const CourseViewer = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { API, token, user } = useAuth();
  const { t } = useTranslation();

  const [course, setCourse] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completedChapters, setCompletedChapters] = useState([]);
  const [completedMaterials, setCompletedMaterials] = useState([]);
  const [completedAssessments, setCompletedAssessments] = useState([]);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [progress, setProgress] = useState(0);
  const [liveClasses, setLiveClasses] = useState([]);
  const [showJitsiModal, setShowJitsiModal] = useState(false);
  const [jitsiUrl, setJitsiUrl] = useState("");
  const studentId = user?.id || 'demo'; // Get student ID from auth

  useEffect(() => {
    console.log('🎓 CourseViewer - courseId:', courseId);
    console.log('🎓 CourseViewer - token:', token);
    console.log('🎓 CourseViewer - Starting fetchCourseData...');
    if (token) {
      fetchCourseData();
      fetchProgress();
      fetchCourseLiveClasses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, token]);

  const fetchProgress = async () => {
    try {
      // Load chapters progress from database
      const res = await fetch(`${API}/progress/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        console.log('🎓 Progress data received:', data);
        
        // Handle both old and new data formats with safety checks
        const allProgress = Array.isArray(data.progress) ? data.progress : [];
        const chaptersProgress = Array.isArray(data.chaptersProgress) ? data.chaptersProgress : [];
        const materialsProgress = Array.isArray(data.materialsProgress) ? data.materialsProgress : [];
        const assessmentsProgress = Array.isArray(data.assessmentsProgress) ? data.assessmentsProgress : [];
        
        // Set completed chapters
        setCompletedChapters(chaptersProgress.filter(p => p && p.completed).map(p => p.chapterId || p.contentId).filter(Boolean) || 
                          allProgress.filter(p => p && p.completed && (p.contentType === 'chapter' || p.chapterId)).map(p => p.chapterId || p.contentId).filter(Boolean) || []);
        
        // Set completed materials from API ✅
        setCompletedMaterials(materialsProgress.filter(p => p && p.completed).map(p => p.contentId).filter(Boolean) || []);
        
        // Set completed assessments from API ✅
        setCompletedAssessments(assessmentsProgress.filter(p => p && p.completed).map(p => p.contentId).filter(Boolean) || []);
        
        // Set overall progress
        setProgress(typeof data.completionPercentage === 'number' ? data.completionPercentage : 0);
        
        console.log('🎓 Loaded from API:', {
          chapters: completedChapters.length,
          materials: (materialsProgress.filter(p => p && p.completed) || []).length,
          assessments: (assessmentsProgress.filter(p => p && p.completed) || []).length
        });
      }
      
    } catch (error) {
      console.error("Failed to fetch progress", error);
      
      // Fallback to localStorage for everything
      try {
        const materialsStorageKey = `completed_materials_${courseId}_${studentId}`;
        const assessmentsStorageKey = `completed_assessments_${courseId}_${studentId}`;
        
        const completedMaterialsStorage = JSON.parse(localStorage.getItem(materialsStorageKey) || '[]');
        const completedAssessmentsStorage = JSON.parse(localStorage.getItem(assessmentsStorageKey) || '[]');
        
        setCompletedChapters([]);
        setCompletedMaterials(completedMaterialsStorage);
        setCompletedAssessments(completedAssessmentsStorage);
        setProgress(0);
      } catch (localStorageError) {
        console.error("LocalStorage fallback failed:", localStorageError);
        setCompletedChapters([]);
        setCompletedMaterials([]);
        setCompletedAssessments([]);
        setProgress(0);
      }
    }
  };

  const markChapterAsComplete = async (chapterId) => {
    try {
      const res = await fetch(`${API}/progress/mark-completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ chapterId })
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to mark as complete");
        return;
      }

      setCompletedChapters([...completedChapters, chapterId]);
      toast.success(t('chapter_completed'));
      fetchProgress(); // Refresh progress
    } catch (error) {
      console.error(error);
      toast.error(t('error_marking_complete'));
    }
  };

  const markMaterialAsComplete = async (materialId) => {
    try {
      console.log('🎯 markMaterialAsComplete called:', { materialId, courseId, studentId, token: token ? '***' : 'NO TOKEN' });
      
      // Try to save to database first
      const requestBody = {
        contentId: materialId,
        contentType: 'material',
        courseId
      };
      
      console.log('📤 Sending request:', { 
        url: `${API}/progress/mark-content-completed`,
        body: requestBody 
      });
      
      const res = await fetch(`${API}/progress/mark-content-completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();
      console.log('📥 Response received:', { status: res.status, data });

      if (res.ok) {
        setCompletedMaterials([...completedMaterials, materialId]);
        toast.success(t('material_completed'));
        fetchProgress(); // Refresh progress from DB
        console.log('✅ Material marked as complete in database:', materialId);
      } else {
        console.warn('❌ Material API failed:', data.message);
        // Fallback to localStorage if API fails
        const storageKey = `completed_materials_${courseId}_${studentId || 'demo'}`;
        let completedMaterialsStorage = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!completedMaterialsStorage.includes(materialId)) {
          completedMaterialsStorage.push(materialId);
          localStorage.setItem(storageKey, JSON.stringify(completedMaterialsStorage));
          setCompletedMaterials([...completedMaterials, materialId]);
          toast.success(t('material_completed') + ' (offline)');
        }
      }
      calculateProgress();
    } catch (error) {
      console.error("❌ Error marking material as complete:", error);
      // Fallback to localStorage
      try {
        const storageKey = `completed_materials_${courseId}_${studentId || 'demo'}`;
        let completedMaterialsStorage = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!completedMaterialsStorage.includes(materialId)) {
          completedMaterialsStorage.push(materialId);
          localStorage.setItem(storageKey, JSON.stringify(completedMaterialsStorage));
          setCompletedMaterials([...completedMaterials, materialId]);
          toast.success(t('material_completed') + ' (offline)');
          calculateProgress();
        }
      } catch (e) {
        toast.error("Error marking material as complete");
      }
    }
  };

  const markAssessmentAsComplete = async (assessmentId) => {
    try {
      // Try to save to database first
      const res = await fetch(`${API}/progress/mark-content-completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          contentId: assessmentId,
          contentType: 'assessment',
          courseId
        })
      });

      const data = await res.json();

      if (res.ok) {
        setCompletedAssessments([...completedAssessments, assessmentId]);
        toast.success(t('assessment_completed'));
        fetchProgress(); // Refresh progress from DB
        console.log('Assessment marked as complete in database:', assessmentId);
      } else {
        console.warn('Assessment API failed, falling back to localStorage:', data.message);
        // Fallback to localStorage if API fails
        const storageKey = `completed_assessments_${courseId}_${studentId || 'demo'}`;
        let completedAssessmentsStorage = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!completedAssessmentsStorage.includes(assessmentId)) {
          completedAssessmentsStorage.push(assessmentId);
          localStorage.setItem(storageKey, JSON.stringify(completedAssessmentsStorage));
          setCompletedAssessments([...completedAssessments, assessmentId]);
          toast.success(t('assessment_completed') + ' (offline)');
        }
      }
      calculateProgress();
    } catch (error) {
      console.error("Error marking assessment as complete:", error);
      // Fallback to localStorage
      try {
        const storageKey = `completed_assessments_${courseId}_${studentId || 'demo'}`;
        let completedAssessmentsStorage = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!completedAssessmentsStorage.includes(assessmentId)) {
          completedAssessmentsStorage.push(assessmentId);
          localStorage.setItem(storageKey, JSON.stringify(completedAssessmentsStorage));
          setCompletedAssessments([...completedAssessments, assessmentId]);
          toast.success(t('assessment_completed') + ' (offline)');
          calculateProgress();
        }
      } catch (e) {
        toast.error("Error marking assessment as complete");
      }
    }
  };

  const calculateProgress = () => {
    try {
      // Calculate overall progress based on completed items with safety checks
      const totalItems = (Array.isArray(chapters) ? chapters.length : 0) + 
                        (Array.isArray(materials) ? materials.length : 0) + 
                        (Array.isArray(assessments) ? assessments.length : 0);
      const completedItems = (Array.isArray(completedChapters) ? completedChapters.length : 0) + 
                           (Array.isArray(completedMaterials) ? completedMaterials.length : 0) + 
                           (Array.isArray(completedAssessments) ? completedAssessments.length : 0);
      const progressPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      setProgress(progressPercentage);
    } catch (error) {
      console.error("Error calculating progress:", error);
      setProgress(0); // Set fallback progress
    }
  };

  const toggleWeekExpansion = (weekId) => {
    setExpandedWeek(expandedWeek === weekId ? null : weekId);
  };

  const markAsComplete = markChapterAsComplete; // Keep for backward compatibility

  const fetchCourseLiveClasses = async () => {
    try {
      console.log('🎬 Fetching live classes for courseId:', courseId);
      console.log('🎬 API URL:', `${API}/live-classes/course/${courseId}`);
      console.log('🎬 Token exists:', !!token);
      const response = await axios.get(
        `${API}/live-classes/course/${courseId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✅ Live classes API response status:', response.status);
      console.log('🎬 Live classes response data:', response.data);
      console.log('🎬 Number of live classes:', Array.isArray(response.data) ? response.data.length : 0);
      setLiveClasses(Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : []);
      console.log('🎬 Live classes state updated');
    } catch (error) {
      console.error('❌ Error fetching live classes:', error.message);
      console.error('❌ Full error:', error);
      if (error.response) {
        console.error('❌ Error response status:', error.response.status);
        console.error('❌ Error response data:', error.response.data);
      }
      setLiveClasses([]);
    }
  };

  const handleJoinLiveClass = async (liveClassId, meetingLink) => {
    try {
      // Record attendance
      await axios.post(
        `${API}/live-classes/${liveClassId}/join`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Open Jitsi modal
      setJitsiUrl(
        `${meetingLink}?prejoinPageEnabled=false&userInfo={"displayName":"${user?.name || "Student"}","role":"participant"}`
      );
      setShowJitsiModal(true);
      toast.success(t('joined_live_class'));
    } catch (error) {
      console.error('Error joining live class:', error);
      toast.error(t('failed_join_live_class'));
    }
  };

  const fetchCourseData = async () => {
    try {
      setLoading(true);
      console.log('🎓 fetchCourseData - Starting to fetch course data for courseId:', courseId);

      /* ================= COURSE ================= */
      console.log('🎓 Fetching course from:', `${API}/courses/${courseId}`);
      const courseRes = await fetch(`${API}/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('🎓 Course response status:', courseRes.status);
      if (!courseRes.ok) {
        console.error("Course fetch failed:", courseRes.status, courseRes.statusText);
        throw new Error(`Failed to load course: ${courseRes.statusText}`);
      }
      const courseData = await courseRes.json();
      console.log('🎓 Course data received:', courseData);
      setCourse(courseData);

      /* ================= CHAPTERS ================= */
      console.log('🎓 Fetching chapters from:', `${API}/chapters/course/${courseId}`);
      const chapterRes = await fetch(`${API}/chapters/course/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let chapterData = [];
      if (chapterRes.ok) {
        chapterData = await chapterRes.json();
        console.log('🎓 Chapters data received:', chapterData);
        setChapters(chapterData);
      } else {
        console.log('🎓 Chapters fetch failed:', chapterRes.status);
      }

      /* ================= MATERIALS ================= */
      console.log('🎓 Fetching materials from:', `${API}/materials/course/${courseId}`);
      const materialRes = await fetch(`${API}/materials/course/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let materialData = [];
      if (materialRes.ok) {
        materialData = await materialRes.json();
        console.log('🎓 Materials data received:', materialData);
        setMaterials(materialData);
      } else {
        console.log('🎓 Materials fetch failed:', materialRes.status);
      }

      /* ================= ASSESSMENTS ================= */
      console.log('🎓 Fetching assessments from:', `${API}/assessments/course/${courseId}`);
      const assessmentRes = await fetch(
        `${API}/assessments/course/${courseId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      let assessmentData = [];
      if (assessmentRes.ok) {
        assessmentData = await assessmentRes.json();
        console.log('🎓 Assessments data received:', assessmentData);
        setAssessments(assessmentData);
      } else {
        console.log('🎓 Assessments fetch failed:', assessmentRes.status);
      }

      /* ================= ORGANIZE BY WEEKS ================= */
      // Create weeks based on available content
      const weeksMap = new Map();
      
      // Create week 1 by default
      weeksMap.set('week-1', {
        id: 'week-1',
        title: 'Week 1',
        chapters: [],
        materials: [],
        assessments: []
      });
      
      // Add all chapters to week 1 for now (with safety checks)
      if (Array.isArray(chapterData)) {
        chapterData.forEach((chapter) => {
          if (chapter && chapter._id) {
            weeksMap.get('week-1').chapters.push(chapter);
          }
        });
      }

      // Add all materials to week 1 (with safety checks)
      if (Array.isArray(materialData)) {
        materialData.forEach((material) => {
          if (material && material._id) {
            weeksMap.get('week-1').materials.push(material);
          }
        });
      }

      // Add all assessments to week 1 (with safety checks)
      if (Array.isArray(assessmentData)) {
        assessmentData.forEach((assessment) => {
          if (assessment && assessment.id) {
            weeksMap.get('week-1').assessments.push(assessment);
          }
        });
      }

      const weeksArray = Array.from(weeksMap.values());
      console.log('🎓 Weeks organized:', weeksArray);
      console.log('🎓 Week 1 content:', {
        chapters: weeksArray[0]?.chapters?.length || 0,
        materials: weeksArray[0]?.materials?.length || 0,
        assessments: weeksArray[0]?.assessments?.length || 0
      });
      setWeeks(weeksArray);

    } catch (error) {
      console.error("🎓 fetchCourseData ERROR:", error);
      toast.error(t('failed_load_course'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <StudentLayout><div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div></StudentLayout>
    );
  }

  if (!course) {
    return (
      <StudentLayout>
        <div className="p-6 text-center text-gray-500">
          Course not found
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">

        {/* ================= COURSE HEADER ================= */}
        <div
          data-tour="course-title"
          className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_4px_25px_rgba(0,35,102,0.06)] p-6 sm:p-8 border border-[#ebdcaa] overflow-hidden"
        >
          {/* Subtle gold decorative gradient in the corner */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#B99652]/10 via-[#ebdcaa]/10 to-transparent pointer-events-none rounded-bl-full" />
          
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#002366]/5 text-[#002366] border border-[#002366]/15 mb-3">
                <BookOpen size={13} className="text-[#B99652]" />
                <span>Course Overview</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-wide leading-tight">
                {course.title}
              </h1>
              {course.description && (
                <p className="text-sm sm:text-base text-[#665e4d] mt-2 leading-relaxed max-w-3xl">
                  {course.description}
                </p>
              )}
            </div>

            {/* Overall Progress Stat Card */}
            <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between bg-[#fffdf4] sm:bg-transparent p-4 sm:p-0 rounded-xl border border-[#ebdcaa]/60 sm:border-0">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black bg-gradient-to-r from-[#002366] via-[#1e1b4b] to-[#B99652] bg-clip-text text-transparent">
                {progress}%
              </div>
              <div className="text-xs uppercase tracking-wider font-bold text-[#8a7a5b] mt-0.5">
                {t('overall_progress') !== 'overall_progress' ? t('overall_progress') : 'Overall Progress'}
              </div>
            </div>
          </div>

          {/* Linear Progress Bar */}
          <div className="relative z-10 mt-6 pt-5 border-t border-[#ebdcaa]/50">
            <div className="w-full bg-[#ebdcaa]/40 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#002366] via-[#B99652] to-[#f1be38] h-full rounded-full transition-all duration-700 shadow-sm"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ================= WEEKS CARDS ================= */}
        {weeks.length > 0 ? (
          <div className="space-y-5">
            {weeks.map((week, weekIndex) => {
              // Safety checks for week data
              const weekChapters = Array.isArray(week.chapters) ? week.chapters : [];
              const weekMaterials = Array.isArray(week.materials) ? week.materials : [];
              const weekAssessments = Array.isArray(week.assessments) ? week.assessments : [];
              
              const weekTotalItems = weekChapters.length + weekMaterials.length + weekAssessments.length;
              const weekCompletedItems = 
                weekChapters.filter(ch => ch && ch._id && completedChapters.includes(ch._id)).length +
                weekMaterials.filter(m => m && m._id && completedMaterials.includes(m._id)).length +
                weekAssessments.filter(a => a && a.id && completedAssessments.includes(a.id)).length;
              const weekProgress = weekTotalItems > 0 ? Math.round((weekCompletedItems / weekTotalItems) * 100) : 0;
              const isExpanded = expandedWeek === week.id;

              return (
                <div
                  key={`week-${week.id || weekIndex}`}
                  className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,35,102,0.05)] border border-[#ebdcaa] overflow-hidden hover:shadow-[0_8px_25px_rgba(0,35,102,0.09)] transition-all duration-300"
                >
                  {/* Week Header with Progress Circle */}
                  <div 
                    data-tour={weekIndex === 0 ? 'course-weeks-progress' : undefined}
                    data-tour-week-items={weekTotalItems}
                    className="p-5 sm:p-6 cursor-pointer bg-gradient-to-r from-[#fffdf4] via-white to-[#fff9ec] hover:from-[#fdf6e7] hover:to-[#fcf2d9] transition-colors"
                    onClick={() => toggleWeekExpansion(week.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Circular Progress Ring */}
                        <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0">
                          <svg className="transform -rotate-90 w-14 h-14 sm:w-16 sm:h-16">
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              stroke="#ebdcaa"
                              strokeWidth="4"
                              fill="none"
                            />
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              stroke="#002366"
                              strokeWidth="4"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 26}`}
                              strokeDashoffset={`${2 * Math.PI * 26 * (1 - weekProgress / 100)}`}
                              strokeLinecap="round"
                              className="transition-all duration-500"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs sm:text-sm font-bold text-[#1e1b4b]">{weekProgress}%</span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-base sm:text-xl font-bold text-[#1e1b4b] truncate">
                            {week.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-[#7a705a] mt-0.5">
                            {weekCompletedItems} of {weekTotalItems} items completed
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-[#8a7a5b] font-medium">{t('status') !== 'status' ? t('status') : 'Status'}</div>
                          <div className={`text-xs sm:text-sm font-bold ${
                            weekProgress === 100 ? 'text-emerald-600' : 'text-amber-700'
                          }`}>
                            {weekProgress === 100 ? 'Completed' : 'In Progress'}
                          </div>
                        </div>

                        <div className={`w-8 h-8 rounded-full bg-[#002366]/5 flex items-center justify-center text-[#002366] transform transition-transform duration-300 ${
                          isExpanded ? "rotate-180 bg-[#002366] text-white" : ""
                        }`}>
                          <ChevronDown size={18} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Week Content (Expandable) */}
                  {isExpanded && (
                    <div className="border-t border-[#ebdcaa]/60 p-5 sm:p-6 bg-[#fffdf4]/60 space-y-6">
                      
                      {/* Chapters Section */}
                      {weekChapters.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-lg bg-[#002366] text-[#f1be38] flex items-center justify-center text-xs shadow-xs">
                              <BookOpen size={14} />
                            </div>
                            <h4 className="text-sm sm:text-base font-bold text-[#1e1b4b]">
                              {t('chapters') !== 'chapters' ? t('chapters') : 'Chapters'}
                            </h4>
                          </div>

                          <div className="space-y-3">
                            {weekChapters.map((chapter, index) => {
                              if (!chapter || !chapter._id) return null;
                              const isCompleted = Array.isArray(completedChapters) && completedChapters.includes(chapter._id);
                              return (
                                <div
                                  key={`chapter-${chapter._id || index}`}
                                  className={`bg-white rounded-xl p-4 sm:p-5 border transition-all duration-200 ${
                                    isCompleted
                                      ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                                      : 'border-[#ebdcaa]/80 hover:border-[#B99652] hover:shadow-sm'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <h5 className="font-bold text-sm sm:text-base text-[#1e1b4b]">{chapter.title}</h5>
                                        {isCompleted && (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                            <CheckCircle2 size={11} />
                                            Done
                                          </span>
                                        )}
                                      </div>
                                      {chapter.description && (
                                        <p className="text-xs sm:text-sm text-[#665e4d] mt-1 line-clamp-2">{chapter.description}</p>
                                      )}

                                      {/* Links */}
                                      <div className="flex flex-wrap gap-2.5 mt-3">
                                        {chapter.videoUrl && (
                                          <a
                                            href={chapter.videoUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#002366]/5 hover:bg-[#002366]/10 text-[#002366] border border-[#002366]/15 transition-colors"
                                          >
                                            <Video size={13} className="text-[#B99652]" />
                                            Watch Video
                                          </a>
                                        )}
                                        {(chapter.pdfUrl || chapter.fileUrl) && (
                                          <a
                                            href={fileLink(chapter.pdfUrl || chapter.fileUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
                                          >
                                            <FileText size={13} className="text-red-500" />
                                            View PDF
                                          </a>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                      {!isCompleted ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markChapterAsComplete(chapter._id);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#002366] to-[#1e1b4b] hover:from-[#1e1b4b] hover:to-[#002366] text-white text-xs sm:text-sm font-semibold rounded-none border border-[#B99652]/30 shadow-xs transition-all active:scale-[0.98]"
                                        >
                                          <Check size={14} className="text-[#f1be38]" />
                                          Mark Complete
                                        </button>
                                      ) : (
                                        <div className="px-3 py-1.5 bg-emerald-100/80 text-emerald-800 rounded-none text-xs font-bold border border-emerald-300 flex items-center gap-1.5">
                                          <CheckCircle2 size={13} />
                                          Completed
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Materials Section */}
                      {weekMaterials.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-none bg-[#B99652] text-white flex items-center justify-center text-xs shadow-xs">
                              <FileText size={14} />
                            </div>
                            <h4 className="text-sm sm:text-base font-bold text-[#1e1b4b]">
                              Course Materials
                            </h4>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {weekMaterials.map((material, index) => {
                              if (!material || !material._id) return null;
                              const isCompleted = Array.isArray(completedMaterials) && completedMaterials.includes(material._id);
                              return (
                                <div
                                  key={`material-${material._id || index}`}
                                  data-tour={weekIndex === 0 && index === 0 ? 'course-material-item' : undefined}
                                  className={`bg-white rounded-none p-4 border transition-all duration-200 ${
                                    isCompleted
                                      ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                                      : 'border-[#ebdcaa]/80 hover:border-[#B99652]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-bold text-sm text-[#1e1b4b] truncate">{material.title}</h5>
                                      <span className="inline-block px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider bg-[#002366]/5 text-[#002366] border border-[#002366]/10 mt-1">
                                        {material.type?.replace('_', ' ') || 'FILE'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <a
                                        href={material.type?.includes('link') ? material.linkUrl : fileLink(material.fileUrl)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => {
                                          if (!isCompleted) markMaterialAsComplete(material._id);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#002366] hover:bg-[#1e1b4b] text-white text-xs font-semibold rounded-none shadow-xs transition-colors"
                                      >
                                        <ExternalLink size={12} />
                                        View
                                      </a>
                                      {!isCompleted ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markMaterialAsComplete(material._id);
                                          }}
                                          title="Mark Complete"
                                          className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-none border border-emerald-200 transition-colors"
                                        >
                                          <Check size={14} />
                                        </button>
                                      ) : (
                                        <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-none">
                                          <CheckCircle2 size={14} />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Assessments Section */}
                      {weekAssessments.length > 0 && (
                        <div data-tour={weekIndex === 0 ? 'course-assessments' : undefined}>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-none bg-gradient-to-br from-[#002366] to-[#B99652] text-white flex items-center justify-center text-xs shadow-xs">
                              <Award size={14} />
                            </div>
                            <h4 className="text-sm sm:text-base font-bold text-[#1e1b4b]">
                              Assessments & Quizzes
                            </h4>
                          </div>

                          <div className="space-y-3">
                            {weekAssessments.map((assessment, index) => {
                              if (!assessment || !assessment.id) return null;
                              const isCompleted = Array.isArray(completedAssessments) && completedAssessments.includes(assessment.id);
                              return (
                                <div
                                  key={`assessment-${assessment.id || index}`}
                                  className={`bg-white rounded-none p-4 sm:p-5 border transition-all duration-200 ${
                                    isCompleted
                                      ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                                      : 'border-[#ebdcaa]/80 hover:border-[#B99652]'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-bold text-sm sm:text-base text-[#1e1b4b]">{assessment.title}</h5>
                                      {assessment.description && (
                                        <p className="text-xs sm:text-sm text-[#665e4d] mt-1">{assessment.description}</p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                      {assessment.isUnlocked && !isCompleted && (
                                        <>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(`/student/assessment/${assessment.id}`);
                                            }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#002366] to-[#1e1b4b] hover:from-[#1e1b4b] hover:to-[#002366] text-white text-xs sm:text-sm font-semibold rounded-none border border-[#B99652]/40 shadow-xs transition-all active:scale-[0.98]"
                                          >
                                            <Play size={13} className="text-[#f1be38] fill-current" />
                                            Start Quiz
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              markAssessmentAsComplete(assessment.id);
                                            }}
                                            title="Mark as Complete"
                                            className="p-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-none border border-emerald-200 transition-colors"
                                          >
                                            <Check size={15} />
                                          </button>
                                        </>
                                      )}
                                      {isCompleted && (
                                        <div className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-none text-xs font-bold border border-emerald-300 flex items-center gap-1.5">
                                          <CheckCircle2 size={13} />
                                          Completed
                                        </div>
                                      )}
                                      {!assessment.isUnlocked && (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-none text-xs font-semibold border border-gray-200">
                                          <Lock size={13} />
                                          Locked
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {weekChapters.length === 0 && weekMaterials.length === 0 && weekAssessments.length === 0 && (
                        <div className="text-center py-8 text-[#7a705a]">
                          <div className="w-14 h-14 bg-[#ebdcaa]/30 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-[#ebdcaa]">
                            <BookOpen className="text-[#B99652]" size={26} />
                          </div>
                          <p className="text-sm font-medium">No content available for this week yet</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= FALLBACK TO ORIGINAL LAYOUT ================= */
          <div className="space-y-6">
            {/* Materials Section */}
            {materials.length > 0 && (
              <div className="bg-white/95 rounded-2xl p-6 border border-[#ebdcaa] shadow-[0_4px_20px_rgba(0,35,102,0.05)]">
                <h2 className="text-xl font-bold text-[#1e1b4b] mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-[#B99652]" />
                  Course Materials
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {materials.map((m, index) => (
                    <div key={`material-${m._id || index}`} className="bg-[#fffdf4] border border-[#ebdcaa] rounded-xl p-4 flex items-center justify-between shadow-xs">
                      <div>
                        <h3 className="font-bold text-sm text-[#1e1b4b]">{m.title}</h3>
                        <p className="text-[11px] text-[#8a7a5b] uppercase font-bold mt-1">
                          {m.type?.replace('_', ' ') || 'FILE'}
                        </p>
                      </div>
                      <a
                        href={m.type?.includes('link') ? m.linkUrl : fileLink(m.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          if (!completedMaterials.includes(m._id)) markMaterialAsComplete(m._id);
                        }}
                        className="px-3.5 py-1.5 bg-[#002366] hover:bg-[#1e1b4b] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chapters Section */}
            {chapters.length > 0 && (
              <div className="bg-white/95 rounded-2xl p-6 border border-[#ebdcaa] shadow-[0_4px_20px_rgba(0,35,102,0.05)]">
                <h2 className="text-xl font-bold text-[#1e1b4b] mb-4 flex items-center gap-2">
                  <BookOpen size={20} className="text-[#B99652]" />
                  Course Content
                </h2>
                <div className="space-y-3">
                  {chapters.map((ch, index) => {
                    const isCompleted = completedChapters.includes(ch._id);
                    return (
                      <div
                        key={`chapter-${ch._id || index}`}
                        className={`rounded-xl p-4 transition-all ${
                          isCompleted
                            ? 'border border-emerald-300 bg-emerald-50/40'
                            : 'bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652]'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm sm:text-base text-[#1e1b4b]">{ch.title}</h3>
                              {isCompleted && (
                                <span className="text-emerald-700 text-xs font-bold px-2 py-0.5 bg-emerald-100 rounded-full border border-emerald-200">
                                  COMPLETED
                                </span>
                              )}
                            </div>
                            {ch.description && (
                              <p className="text-xs sm:text-sm text-[#665e4d] mt-1">
                                {ch.description}
                              </p>
                            )}

                            <div className="flex gap-3 mt-3">
                              {ch.videoUrl && (
                                <a href={ch.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold flex items-center gap-1.5 text-[#002366] hover:underline">
                                  <Video size={13} className="text-[#B99652]" /> Watch Video
                                </a>
                              )}
                              {(ch.pdfUrl || ch.fileUrl) && (
                                <a href={fileLink(ch.pdfUrl || ch.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold flex items-center gap-1.5 text-red-600 hover:underline">
                                  <FileText size={13} /> View PDF
                                </a>
                              )}
                            </div>
                          </div>

                          {!isCompleted && (
                            <button
                              onClick={() => markChapterAsComplete(ch._id)}
                              className="px-3 py-1.5 text-xs font-semibold bg-[#002366] hover:bg-[#1e1b4b] text-white rounded-lg transition-colors border border-[#B99652]/30 shadow-xs"
                            >
                              Mark Complete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {weeks.length === 0 && !loading && (
          <div className="bg-white/90 rounded-2xl p-8 text-center border-2 border-dashed border-[#ebdcaa]">
            <div className="w-16 h-16 bg-[#ebdcaa]/30 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#ebdcaa]">
              <BookOpen className="text-[#B99652]" size={32} />
            </div>
            <p className="text-[#1e1b4b] font-bold text-base sm:text-lg">No course content available yet</p>
            <p className="text-[#7a705a] text-xs sm:text-sm mt-1">Content will be added by your instructor soon</p>
          </div>
        )}

        {/* ================= LIVE CLASSES SECTION ================= */}
        <div className="space-y-4 pt-2">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#ebdcaa]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-none bg-gradient-to-br from-[#002366] to-[#1e1b4b] text-[#f1be38] flex items-center justify-center shadow-[0_4px_12px_rgba(0,35,102,0.25)] border border-[#B99652]/30">
                <Video size={22} className="stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-wide">
                  Live Interactive Classes
                </h2>
                <p className="text-xs sm:text-sm text-[#7a705a]">Join live video lectures and interactive sessions</p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-none text-xs font-semibold bg-[#002366]/5 text-[#002366] border border-[#002366]/20">
              <span className="w-2 h-2 rounded-full bg-[#002366]"></span>
              {liveClasses.length} {liveClasses.length === 1 ? 'Session' : 'Sessions'}
            </span>
          </div>

          {/* lectures of this course for this student: Join opens the class inside the LMS */}
          <LecturesTable API={API} token={token} mode="student" courseId={courseId} title="Your Lectures" />
        </div>

      </div>

      {/* JITSI MODAL FOR LIVE CLASS */}
      {showJitsiModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-[#002366] rounded-2xl max-w-5xl w-full h-[85vh] relative flex flex-col shadow-[0_10px_50px_rgba(0,0,0,0.5)] border border-[#B99652]/40 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#001845] border-b border-[#B99652]/30 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
                <div className="w-3 h-3 rounded-full bg-red-500 -ml-3"></div>
                <span className="font-bold text-sm tracking-wide text-[#f1be38]">Live Video Session</span>
                <span className="text-white/40 text-xs hidden sm:inline">|</span>
                <span className="text-xs text-white/80 hidden sm:inline">{course?.title}</span>
              </div>
              <button
                onClick={() => setShowJitsiModal(false)}
                className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-all"
                title="Close Meeting"
              >
                <X size={20} />
              </button>
            </div>

            {/* Jitsi Iframe */}
            <iframe
              src={jitsiUrl}
              allow="camera; microphone; fullscreen; display-capture"
              className="w-full flex-1 bg-black"
              title="Live Meeting"
            />
          </div>
        </div>
      )}
    </StudentLayout>
  );
};

export default CourseViewer;
