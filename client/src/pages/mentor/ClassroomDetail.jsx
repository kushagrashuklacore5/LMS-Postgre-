import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MentorLayout from "../../components/MentorLayout";
import LecturesTable from "../../components/lectures/LecturesTable";
import StartClassModal from "../../components/lectures/StartClassModal";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import {
  Plus,
  BookOpen,
  Users,
  X,
  ChevronDown,
  BarChart3,
  Clock,
  ArrowLeft,
  UserPlus,
  CalendarCheck,
  Tag,
  UserCheck,
  ExternalLink,
  Settings,
  UserMinus,
  GraduationCap,
  Sparkles,
  BookMarked,
  Search,
  Video,
} from "lucide-react";
import StudentAnalyticsDrawer from "../../components/mentor/StudentAnalyticsDrawer";

const ClassroomDetail = () => {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const { API, token, user } = useAuth();
  const { t } = useTranslation();

  const [classroom, setClassroom] = useState(null);
  const [courses, setCourses] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [students, setStudents] = useState([]); // Students assigned to classroom
  const [allStudents, setAllStudents] = useState([]); // All students for assignment dropdown
  const [studentSearch, setStudentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [showStartClass, setShowStartClass] = useState(false);
  const [lecturesVersion, setLecturesVersion] = useState(0);
  const [selectedAnalyticsStudent, setSelectedAnalyticsStudent] = useState(null);

  // Modal states
  const [showCreateCourseModal, setShowCreateCourseModal] = useState(false);
  const [showAssignStudentsModal, setShowAssignStudentsModal] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    category: "",
    duration: "",
    courseTeacherId: "",
    studentIds: [],
  });

  // Helper function to unwrap API responses
  const unwrapResponse = (data) => {
    if (data && typeof data === 'object') {
      if ('data' in data && 'success' in data) {
        return data.data; // Wrapped response
      }
      if (Array.isArray(data)) {
        return data; // Direct array response
      }
      return data; // Direct object response
    }
    return null;
  };

  // Fetch all data on component mount
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        
        // Fetch classroom details
        const classroomRes = await fetch(`${API}/classrooms/${classroomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const classroomData = await classroomRes.json();
        const classroom = unwrapResponse(classroomData);
        setClassroom(classroom);

        // Fetch courses for this classroom
        const coursesRes = await fetch(
          `${API}/courses/classroom?classroomId=${classroomId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const coursesData = await coursesRes.json();
        const courses = unwrapResponse(coursesData);
        setCourses(Array.isArray(courses) ? courses : []);

        // Fetch students assigned to this classroom
        const classroomStudentsRes = await fetch(
          `${API}/classrooms/${classroomId}/students`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const classroomStudentsData = await classroomStudentsRes.json();
        
        let classroomStudents = unwrapResponse(classroomStudentsData);
        if (Array.isArray(classroomStudentsData)) {
          classroomStudents = classroomStudentsData;
        }
        setStudents(Array.isArray(classroomStudents) ? classroomStudents : []);

        // Class teacher or course teacher of this class? A course teacher gets only the students
        // of their own courses (the server filters) and does not add or remove class members.
        const mineRes = await fetch(`${API}/classrooms/mentor/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (mineRes.ok) {
          const mine = unwrapResponse(await mineRes.json());
          const entry = (Array.isArray(mine) ? mine : []).find((c) => String(c.id) === String(classroomId));
          setIsClassTeacher(entry?.role === "class_teacher");
        }

        // Fetch mentors for course creation dropdown
        const mentorsRes = await fetch(`${API}/users/mentors`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mentorsData = await mentorsRes.json();
        const mentorsList = unwrapResponse(mentorsData);
        setMentors(Array.isArray(mentorsList) ? mentorsList : []);

        // Fetch all students for assignment modal
        const allStudentsRes = await fetch(`${API}/users/students-simple`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const allStudentsData = await allStudentsRes.json();
        const allStudentsList = unwrapResponse(allStudentsData);
        setAllStudents(Array.isArray(allStudentsList) ? allStudentsList : []);
      } catch (err) {
        console.error("Fetch error:", err);
        toast.error("Failed to load classroom details");
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [classroomId, API, token]);

  // Create Course
  const handleCreateCourse = async (e) => {
    e.preventDefault();
    try {
      if (!courseForm.title || !courseForm.description || !courseForm.courseTeacherId) {
        toast.error("Please fill all required fields");
        return;
      }

      const res = await fetch(`${API}/courses/create-course`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: courseForm.title,
          description: courseForm.description,
          category: courseForm.category,
          duration: courseForm.duration,
          mentorId: courseForm.courseTeacherId,
          classroomId: classroomId,
          studentIds: courseForm.studentIds,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }

      const response = await res.json();
      const newCourse = response.course || response;
      setCourses([...courses, newCourse]);
      setShowCreateCourseModal(false);
      setCourseForm({
        title: "",
        description: "",
        category: "",
        duration: "",
        courseTeacherId: "",
        studentIds: [],
      });
      toast.success("Course created successfully!");
      window.dispatchEvent(new CustomEvent('guidebot:action-success', { detail: { actionId: 'course-created' } }));
    } catch (err) {
      console.error("Create course error:", err);
      toast.error(err.message || "Failed to create course");
    }
  };

  // Assign Students to Classroom
  const handleAssignStudents = async (e) => {
    e.preventDefault();
    try {
      const selectedStudents = Array.from(
        document.querySelectorAll('input[name="studentIds"]:checked')
      ).map((el) => el.value);

      if (selectedStudents.length === 0) {
        toast.error("Please select at least one student");
        return;
      }

      if (!classroomId) {
        toast.error("Classroom ID is missing");
        return;
      }

      for (const studentId of selectedStudents) {
        const res = await fetch(`${API}/classrooms/assign-student`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            classroomId: String(classroomId),
            studentId: String(studentId),
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || `Failed to assign student ${studentId}`);
        }
      }

      setShowAssignStudentsModal(false);
      toast.success("Students assigned successfully!");
      window.dispatchEvent(new CustomEvent('guidebot:action-success', { detail: { actionId: 'classroom-students-assigned' } }));

      // Refresh classroom data and students
      const classroomRes = await fetch(`${API}/classrooms/${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const classroomData = await classroomRes.json();
      const updatedClassroom = unwrapResponse(classroomData);
      setClassroom(updatedClassroom);

      const classroomStudentsRes = await fetch(
        `${API}/classrooms/${classroomId}/students`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const classroomStudentsData = await classroomStudentsRes.json();
      let updatedStudents = unwrapResponse(classroomStudentsData);
      if (Array.isArray(classroomStudentsData)) {
        updatedStudents = classroomStudentsData;
      }
      setStudents(Array.isArray(updatedStudents) ? updatedStudents : []);
    } catch (err) {
      console.error("Assign student error:", err);
      toast.error(err.message || "Failed to assign students");
    }
  };

  const filteredAllStudents = allStudents.filter(s => 
    !studentSearch || 
    (s.name && s.name.toLowerCase().includes(studentSearch.toLowerCase())) ||
    (s.email && s.email.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  if (loading) {
    return (
      <MentorLayout>
        <div 
          className="p-6 flex justify-center items-center h-screen"
          style={{
            backgroundColor: "#fffdf4",
            backgroundImage: "linear-gradient(to right, #ebdcaa20 1px, transparent 1px), linear-gradient(to bottom, #ebdcaa20 1px, transparent 1px)",
            backgroundSize: "44px 44px"
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-[#002366] border-t-transparent animate-spin"></div>
            <div className="text-sm font-semibold text-[#1e1b4b]">Loading classroom details...</div>
          </div>
        </div>
      </MentorLayout>
    );
  }

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
        {/* Top Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/mentor/classrooms")}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#ebdcaa] text-[#1e1b4b] rounded-none hover:bg-[#ebdcaa]/25 transition duration-200 text-xs sm:text-sm font-semibold shadow-sm"
            >
              <ArrowLeft size={17} className="text-[#002366]" /> Back to Classrooms
            </button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif] tracking-tight">
                {classroom?.name}
              </h1>
              {classroom?.section && (
                <p className="text-sm font-medium text-slate-500 mt-0.5">
                  Section: <span className="font-semibold text-[#002366]">{classroom.section}</span>
                  {classroom.academicYear && <span className="text-slate-400"> • {classroom.academicYear}</span>}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-center">
            <button
              onClick={() => setShowStartClass(true)}
              className="flex items-center gap-2 px-4 py-3 bg-red-700 hover:bg-red-800 text-white rounded-none text-sm font-semibold shadow-sm"
            >
              <Video size={16} /> Start Class
            </button>
            <div className="bg-white border border-[#ebdcaa] px-4 py-2 text-right rounded-none shadow-sm">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">Total Students</span>
              <span className="text-xl font-bold text-[#002366]">{students.length}</span>
            </div>
            <div className="bg-white border border-[#ebdcaa] px-4 py-2 text-right rounded-none shadow-sm">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">Total Courses</span>
              <span className="text-xl font-bold text-[#0d9488]">{courses.length}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid - Sharp Square & Uniform Golden Theme */}
        <div data-tour="classroom-quick-actions" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
          {/* Create Course */}
          <button
            onClick={() => setShowCreateCourseModal(true)}
            className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 rounded-none shadow-sm hover:shadow-md hover:border-[#B99652] transition-all duration-200 group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center text-[#9a7837] group-hover:bg-[#B99652] group-hover:text-white transition-all shrink-0">
                <Plus size={24} />
              </div>
              <div>
                <p className="font-bold text-[#1e1b4b] text-sm group-hover:text-[#9a7837] transition">Create Course</p>
                <p className="text-xs text-slate-500 mt-0.5">Add new course</p>
              </div>
            </div>
          </button>

          {/* Assign Students (class teacher only) */}
          {isClassTeacher && <button
            onClick={() => setShowAssignStudentsModal(true)}
            className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 rounded-none shadow-sm hover:shadow-md hover:border-[#B99652] transition-all duration-200 group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center text-[#9a7837] group-hover:bg-[#B99652] group-hover:text-white transition-all shrink-0">
                <UserPlus size={22} />
              </div>
              <div>
                <p className="font-bold text-[#1e1b4b] text-sm group-hover:text-[#9a7837] transition">Assign Students</p>
                <p className="text-xs text-slate-500 mt-0.5">Manage enrollment</p>
              </div>
            </div>
          </button>}

          {/* Attendance */}
          <button
            onClick={() => navigate(`/mentor/attendance?classroomId=${classroomId}`)}
            className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 rounded-none shadow-sm hover:shadow-md hover:border-[#B99652] transition-all duration-200 group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center text-[#9a7837] group-hover:bg-[#B99652] group-hover:text-white transition-all shrink-0">
                <CalendarCheck size={22} />
              </div>
              <div>
                <p className="font-bold text-[#1e1b4b] text-sm group-hover:text-[#9a7837] transition">Attendance</p>
                <p className="text-xs text-slate-500 mt-0.5">Track attendance</p>
              </div>
            </div>
          </button>

          {/* Add Result */}
          <button
            onClick={() => navigate(`/mentor/results?classroomId=${classroomId}`)}
            className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 rounded-none shadow-sm hover:shadow-md hover:border-[#B99652] transition-all duration-200 group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center text-[#9a7837] group-hover:bg-[#B99652] group-hover:text-white transition-all shrink-0">
                <BarChart3 size={22} />
              </div>
              <div>
                <p className="font-bold text-[#1e1b4b] text-sm group-hover:text-[#9a7837] transition">Add Result</p>
                <p className="text-xs text-slate-500 mt-0.5">Record grades</p>
              </div>
            </div>
          </button>
        </div>

        {/* Courses Section - Sharp Square & Golden Theme */}
        <div className="bg-white rounded-none shadow-sm border border-[#ebdcaa] p-6 sm:p-8 mb-8 border-t-4 border-t-[#B99652]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#ebdcaa]/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center text-[#9a7837]">
                <BookOpen size={22} />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif]">
                  Courses in this Classroom
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                  Total: <span className="font-bold text-[#9a7837]">{courses.length}</span> courses
                </p>
              </div>
            </div>
            <button
              data-tour="classroom-create-course-btn"
              onClick={() => setShowCreateCourseModal(true)}
              className="px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs sm:text-sm font-semibold transition flex items-center gap-2 shadow-sm self-start sm:self-auto"
            >
              <Plus size={16} /> Create Course
            </button>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-14 bg-[#fffdf4]/60 border border-dashed border-[#ebdcaa] rounded-none">
              <div className="w-16 h-16 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center mx-auto mb-4 text-[#9a7837]">
                <BookOpen size={30} />
              </div>
              <p className="text-[#1e1b4b] text-base font-bold">No Courses Yet</p>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">Create your first course for this classroom to get started</p>
              <button
                onClick={() => setShowCreateCourseModal(true)}
                className="mt-5 px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs sm:text-sm font-semibold shadow-sm transition"
              >
                Create First Course
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course, index) => (
                <div
                  key={course._id}
                  className="bg-white border border-[#ebdcaa] rounded-none overflow-hidden hover:shadow-md hover:border-[#B99652]/60 transition duration-200 group flex flex-col justify-between"
                >
                  {/* Course Header Banner */}
                  <div 
                    className="relative px-5 py-5 text-white bg-cover bg-center"
                    style={{
                      backgroundImage: course.photo 
                        ? `url(${API}${course.photo})`
                        : (course.title && (course.title.toLowerCase().includes('math') || course.title.toLowerCase().includes('algebra') || course.title.toLowerCase().includes('geometry') || course.title.toLowerCase().includes('stat') || course.title.toLowerCase().includes('calc')))
                          ? `url(${['/banners/math_blueprint.png', '/banners/math_geometry.png', '/banners/math_stats.png'][index % 3]})`
                          : (course.title && (course.title.toLowerCase().includes('scienc') || course.title.toLowerCase().includes('physic') || course.title.toLowerCase().includes('chemist') || course.title.toLowerCase().includes('biolog') || course.title.toLowerCase().includes('experiment') || course.title.toLowerCase().includes('lab')))
                            ? `url(${['/banners/science_general.png', '/banners/science_physics.png', '/banners/science_chemistry.png'][index % 3]})`
                            : 'linear-gradient(to right, #B99652, #8c6d32)'
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/35 to-transparent"></div>
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold text-white group-hover:text-[#ebdcaa] transition line-clamp-1">{course.title}</h3>
                      <p className="text-slate-200 text-xs mt-1 line-clamp-2">{course.description || "No description provided"}</p>
                    </div>
                  </div>

                  {/* Course Info */}
                  <div className="px-5 py-4 space-y-2.5 bg-white flex-1">
                    <div className="flex items-center justify-between bg-[#fffdf4] p-2.5 border border-[#ebdcaa]/60 rounded-none">
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <UserCheck size={14} className="text-[#9a7837]" /> Teacher
                      </span>
                      <span className="text-xs text-[#1e1b4b] font-bold">{course.courseTeacher?.name || "Not Assigned"}</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#fffdf4] p-2.5 border border-[#ebdcaa]/60 rounded-none">
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Users size={14} className="text-[#0d9488]" /> Students
                      </span>
                      <span className="text-xs text-[#1e1b4b] font-bold">{course.students?.length || 0}</span>
                    </div>
                    {course.category && (
                      <div className="flex items-center justify-between bg-[#fffdf4] p-2.5 border border-[#ebdcaa]/60 rounded-none">
                        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                          <Tag size={14} className="text-[#B99652]" /> Category
                        </span>
                        <span className="text-[11px] bg-[#B99652]/15 text-[#9a7837] px-2.5 py-0.5 rounded-none font-semibold border border-[#B99652]/30">
                          {course.category}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="px-5 py-3.5 bg-[#fffdf4] border-t border-[#ebdcaa]/70 space-y-2">
                    <button
                      onClick={() => navigate(`/mentor/course/${course._id}`)}
                      className="w-full px-4 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none transition font-semibold text-xs flex items-center justify-center gap-2 shadow-sm"
                    >
                      <ExternalLink size={14} /> Course Portal
                    </button>
                    <button
                      onClick={() => navigate(`/mentor/course/${course._id}/manage`)}
                      className="w-full px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-[#ebdcaa] rounded-none transition font-semibold text-xs flex items-center justify-center gap-2"
                    >
                      <Settings size={14} className="text-slate-500" /> Manage Course
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Your Lectures: this teacher's lectures in this class */}
        <div className="mb-8">
          <LecturesTable API={API} token={token} mode="teacher" classroomId={classroomId} refreshKey={lecturesVersion} />
        </div>

        {/* Class Students Section - Sharp Square & Golden Theme */}
        <div className="bg-white rounded-none shadow-sm border border-[#ebdcaa] p-6 sm:p-8 border-t-4 border-t-[#B99652]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#ebdcaa]/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center text-[#9a7837]">
                <Users size={22} />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif]">
                  {isClassTeacher ? "Class Students" : "My Course Students"}
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                  Total: <span className="font-bold text-[#9a7837]">{students.length}</span> {isClassTeacher ? "students assigned" : "students of this class enrolled in your courses"}
                </p>
              </div>
            </div>
            {isClassTeacher && <button
              data-tour="classroom-assign-students-btn"
              onClick={() => setShowAssignStudentsModal(true)}
              className="px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs sm:text-sm font-semibold transition flex items-center gap-2 shadow-sm self-start sm:self-auto"
            >
              <UserPlus size={16} /> Assign Students
            </button>}
          </div>
          
          {students.length === 0 ? (
            <div className="text-center py-14 bg-[#fffdf4]/60 border border-dashed border-[#ebdcaa] rounded-none">
              <div className="w-16 h-16 bg-[#B99652]/15 rounded-none border border-[#B99652]/30 flex items-center justify-center mx-auto mb-4 text-[#9a7837]">
                <Users size={30} />
              </div>
              <p className="text-[#1e1b4b] text-base font-bold">No Students Assigned</p>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">Add students to this classroom to get started</p>
              {isClassTeacher && <button
                onClick={() => setShowAssignStudentsModal(true)}
                className="mt-5 px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs sm:text-sm font-semibold shadow-sm transition"
              >
                Assign First Student
              </button>}
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#ebdcaa]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fffdf4] border-b border-[#ebdcaa]">
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-[#1e1b4b] w-14">No.</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Student Name</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Email</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Roll Number</th>
                    <th className="px-5 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/50 bg-white">
                  {students.map((student, index) => (
                    <tr
                      key={student._id}
                      className="hover:bg-[#fffdf4]/80 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-xs font-bold text-slate-600 bg-slate-50/50">{index + 1}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-[#1e1b4b]">{student.name}</td>
                      <td className="px-5 py-3.5 text-xs sm:text-sm text-slate-600 font-mono">{student.email}</td>
                      <td className="px-5 py-3.5 text-xs sm:text-sm text-slate-600 font-medium">{student.rollNumber || "—"}</td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setSelectedAnalyticsStudent(student)}
                            className="px-3 py-1.5 bg-[#002366]/10 text-[#002366] hover:bg-[#002366] hover:text-white text-xs rounded-none transition font-semibold border border-[#002366]/30 flex items-center gap-1.5"
                            title="View Student Performance"
                          >
                            <BarChart3 size={13} className="text-[#B99652]" /> Performance
                          </button>
                          {isClassTeacher && <button
                            onClick={() => {
                              if (window.confirm(`${t('remove')} ${student.name} ${t('from_classroom')}?`)) {
                                toast.info(t('student_removal_coming_soon'));
                              }
                            }}
                            className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white text-xs rounded-none transition font-semibold border border-rose-200 flex items-center gap-1.5"
                            title="Remove Student"
                          >
                            <UserMinus size={13} /> Remove
                          </button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showStartClass && (
        <StartClassModal
          API={API}
          token={token}
          classroomId={Number(classroomId)}
          classLabel={classroom?.name}
          onClose={() => setShowStartClass(false)}
          onScheduled={() => setLecturesVersion((v) => v + 1)}
        />
      )}

      {/* Create Course Modal - Sharp Square & Golden Theme */}
      {showCreateCourseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div data-tour="classroom-create-course-form" className="bg-white rounded-none max-w-lg w-full shadow-2xl border border-[#ebdcaa] overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#ebdcaa] bg-[#B99652] text-white">
              <div className="flex items-center gap-2.5">
                <BookOpen size={20} className="text-white" />
                <h2 className="text-xl font-bold font-['DM_Serif_Display',serif]">Create New Course</h2>
              </div>
              <button
                onClick={() => setShowCreateCourseModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-none transition"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-[#1e1b4b]">
                  Course Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseForm.title}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, title: e.target.value })
                  }
                  className="w-full border border-[#ebdcaa] rounded-none px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] bg-[#fffdf4]/40"
                  placeholder="e.g. Advanced Mathematics"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-[#1e1b4b]">
                  Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={courseForm.description}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      description: e.target.value,
                    })
                  }
                  className="w-full border border-[#ebdcaa] rounded-none px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] bg-[#fffdf4]/40"
                  rows="3"
                  placeholder="Brief summary of course topics and curriculum"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-[#1e1b4b]">
                    Category
                  </label>
                  <input
                    type="text"
                    value={courseForm.category}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, category: e.target.value })
                    }
                    className="w-full border border-[#ebdcaa] rounded-none px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] bg-[#fffdf4]/40"
                    placeholder="e.g., Mathematics"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-[#1e1b4b]">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={courseForm.duration}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, duration: e.target.value })
                    }
                    className="w-full border border-[#ebdcaa] rounded-none px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] bg-[#fffdf4]/40"
                    placeholder="e.g., 3 months"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-[#1e1b4b]">
                  Course Teacher <span className="text-rose-500">*</span>
                </label>
                <select
                  value={courseForm.courseTeacherId}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      courseTeacherId: e.target.value,
                    })
                  }
                  className="w-full border border-[#ebdcaa] rounded-none px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] bg-[#fffdf4]/40"
                  required
                >
                  <option value="">Select a mentor</option>
                  {mentors && mentors.length > 0 ? (
                    mentors.map((mentor) => (
                      <option key={mentor._id} value={mentor._id}>
                        {mentor.name} ({mentor.email})
                      </option>
                    ))
                  ) : (
                    <option disabled>No mentors available</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-[#1e1b4b]">
                  Assign Students from this Classroom
                </label>
                <div className="border border-[#ebdcaa] rounded-none p-3 max-h-40 overflow-y-auto bg-[#fffdf4]/40 divide-y divide-[#ebdcaa]/40">
                  {students.length > 0 ? (
                    students.map((student) => (
                      <label key={student._id} className="flex items-center py-2 cursor-pointer hover:bg-white px-2">
                        <input
                          type="checkbox"
                          name="studentIds"
                          value={student._id}
                          onChange={(e) => {
                            const studentIds = courseForm.studentIds;
                            if (e.target.checked) {
                              setCourseForm({
                                ...courseForm,
                                studentIds: [...studentIds, student._id],
                              });
                            } else {
                              setCourseForm({
                                ...courseForm,
                                studentIds: studentIds.filter(
                                  (id) => id !== student._id
                                ),
                              });
                            }
                          }}
                          className="mr-2.5 rounded-none text-[#B99652] focus:ring-0"
                        />
                        <span className="text-xs font-medium text-slate-800">{student.name}</span>
                        <span className="text-[11px] text-slate-400 ml-auto">{student.email}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 py-2 text-center">No students available in this classroom</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#ebdcaa]">
                <button
                  type="submit"
                  className="flex-1 bg-[#B99652] hover:bg-[#a38241] text-white py-2.5 rounded-none font-bold text-xs uppercase tracking-wider transition shadow-sm"
                >
                  Create Course
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCourseModal(false)}
                  className="px-6 bg-slate-100 text-slate-700 py-2.5 rounded-none hover:bg-slate-200 font-bold text-xs uppercase tracking-wider transition border border-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Students Modal - Sharp Square & Golden Theme */}
      {showAssignStudentsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div data-tour="classroom-assign-form" className="bg-white rounded-none max-w-lg w-full shadow-2xl border border-[#ebdcaa] overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#ebdcaa] bg-[#B99652] text-white">
              <div className="flex items-center gap-2.5">
                <UserPlus size={20} className="text-white" />
                <h2 className="text-xl font-bold font-['DM_Serif_Display',serif]">Assign Students to Classroom</h2>
              </div>
              <button
                onClick={() => setShowAssignStudentsModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-none transition"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignStudents} className="p-6 space-y-4">
              {/* Search input for students */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search students by name or email..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-[#ebdcaa] rounded-none text-xs focus:outline-none focus:border-[#B99652] bg-[#fffdf4]/40"
                />
              </div>

              <div className="border border-[#ebdcaa] rounded-none p-3 max-h-72 overflow-y-auto bg-[#fffdf4]/30 space-y-1.5">
                {filteredAllStudents.length > 0 ? (
                  filteredAllStudents.map((student) => (
                    <label key={student._id} className="flex items-center p-2.5 hover:bg-white rounded-none transition cursor-pointer border border-transparent hover:border-[#ebdcaa] bg-white/70 shadow-xs">
                      <input
                        type="checkbox"
                        name="studentIds"
                        value={student._id}
                        className="w-4 h-4 rounded-none text-[#B99652] focus:ring-0 cursor-pointer"
                      />
                      <div className="ml-3 flex-1">
                        <p className="text-xs font-bold text-[#1e1b4b]">{student.name}</p>
                        <p className="text-[11px] text-slate-500">{student.email}</p>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Users className="text-slate-300 mx-auto mb-2" size={28} />
                    <p className="text-xs text-slate-500 font-medium">No students found matching search</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#ebdcaa]">
                <button
                  type="submit"
                  className="flex-1 bg-[#B99652] hover:bg-[#a38241] text-white py-2.5 rounded-none font-bold text-xs uppercase tracking-wider transition shadow-sm"
                >
                  Assign Students
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignStudentsModal(false)}
                  className="px-6 bg-slate-100 text-slate-700 py-2.5 rounded-none hover:bg-slate-200 font-bold text-xs uppercase tracking-wider transition border border-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student 360 Academic Performance Analytics Drawer */}
      <StudentAnalyticsDrawer
        isOpen={!!selectedAnalyticsStudent}
        onClose={() => setSelectedAnalyticsStudent(null)}
        student={selectedAnalyticsStudent}
        classroomId={classroomId}
        courses={courses}
      />
    </MentorLayout>
  );
};

export default ClassroomDetail;

