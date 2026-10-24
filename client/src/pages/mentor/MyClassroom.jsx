import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { toast } from "react-toastify";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, UserPlus, CalendarCheck, BarChart3, Users, BookOpen, GraduationCap, ArrowLeft } from "lucide-react";

const MyClassroom = () => {
  const { API, token, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const [classroom, setClassroom] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /* ================= FETCH MY CLASSROOM ================= */
  const unwrapResponse = (data) => {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if ('data' in data) return data.data;
      if ('classrooms' in data) return data.classrooms;
    }
    return null;
  };

  const fetchClassroom = async () => {
    try {
      setLoading(true);
      setError(false);

      const teacherId = localStorage.getItem('userId') || 'me';
      const res = await fetch(`${API}/classrooms/mentor/${teacherId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const raw = await res.json();
      const data = unwrapResponse(raw);

      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        setClassroom({
          ...first,
          students: Array.isArray(first.students) ? first.students : [],
          courses: Array.isArray(first.courses) ? first.courses : [],
        });
      } else {
        setClassroom(null);
      }
    } catch (err) {
      console.error(err);
      setError(true);
      toast.error("Failed to load classroom");
    } finally {
      setLoading(false);
    }
  };

  /* ================= FETCH CLASSROOM STUDENTS ================= */
  const fetchClassroomStudents = async (classroomId) => {
    try {
      if (!classroomId) {
        setStudents([]);
        return;
      }

      const res = await fetch(`${API}/classrooms/${classroomId}/students`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const raw = await res.json();
      const studentsList = raw?.data || raw || [];
      setStudents(Array.isArray(studentsList) ? studentsList : []);
    } catch (err) {
      console.error('Error fetching classroom students:', err);
      setStudents([]);
    }
  };

  /* ================= FETCH CLASSROOM COURSES ================= */
  const fetchClassroomCourses = async () => {
    try {
      if (!classroom?.id && !classroom?._id) return;
      const cid = classroom.id || classroom._id;
      const res = await fetch(`${API}/courses/classroom?classroomId=${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list = unwrapResponse(data);
      setCourses(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error fetching classroom courses:', err);
      setCourses([]);
    }
  };

  /* ================= AUTO REFRESH ================= */
  useEffect(() => {
    fetchClassroom();
  }, [location.pathname]);

  useEffect(() => {
    if (classroom?.id || classroom?._id) {
      const cid = classroom.id || classroom._id;
      fetchClassroomStudents(cid);
      fetchClassroomCourses();
    }
  }, [classroom?.id, classroom?._id]);

  useEffect(() => {
    if (!socket) return;
    const onStudentAssigned = () => {
      fetchClassroom();
    };
    socket.on('student-assigned', onStudentAssigned);
    return () => socket.off('student-assigned', onStudentAssigned);
  }, [socket]);

  /* ================= LOADING ================= */
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
            <div className="text-sm font-semibold text-[#1e1b4b]">Loading classroom...</div>
          </div>
        </div>
      </MentorLayout>
    );
  }

  /* ================= ERROR / NOT CLASS TEACHER ================= */
  if (error || !classroom) {
    return (
      <MentorLayout>
        <div 
          className="p-8 min-h-screen text-[#1e1b4b]"
          style={{
            backgroundColor: "#fffdf4",
            backgroundImage: "linear-gradient(to right, #ebdcaa20 1px, transparent 1px), linear-gradient(to bottom, #ebdcaa20 1px, transparent 1px)",
            backgroundSize: "44px 44px"
          }}
        >
          <div className="max-w-4xl mx-auto text-center py-20 bg-white rounded-none shadow-sm border border-dashed border-[#ebdcaa]">
            <GraduationCap className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-2">
              {error ? "Unable to Load Classroom" : "No Classroom Assigned"}
            </h2>
            <p className="text-slate-500 text-sm mb-6">
              {error ? "Please check your network and try refreshing." : "You are not assigned as a class teacher yet."}
            </p>
            <button
              onClick={() => navigate("/mentor/classrooms")}
              className="px-6 py-2.5 bg-[#002366] hover:bg-[#001c52] text-white rounded-none text-xs uppercase tracking-wider font-bold shadow-sm transition"
            >
              Browse All Classrooms
            </button>
          </div>
        </div>
      </MentorLayout>
    );
  }

  /* ================= CLASSROOM VIEW ================= */
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
        <div className="max-w-6xl mx-auto">
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif] tracking-tight">
                {classroom.name} {classroom.section && `— ${classroom.section}`}
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 font-medium">
                Role: <span className="text-[#002366] font-bold">Assigned Class Teacher</span>
              </p>
            </div>
            <button
              onClick={() => navigate("/mentor/classrooms")}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#ebdcaa] text-[#1e1b4b] rounded-none hover:bg-[#ebdcaa]/25 transition duration-200 text-xs font-semibold shadow-sm self-start md:self-auto"
            >
              <ArrowLeft size={16} className="text-[#002366]" /> All Classrooms
            </button>
          </div>

          {/* ACTION BUTTONS (Sharp Square & Uniform Golden Theme) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <button
              onClick={() => navigate("/mentor/create-course")}
              className="p-4 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none hover:shadow-md transition text-left flex items-center gap-3 group"
            >
              <div className="w-10 h-10 bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center rounded-none group-hover:bg-[#B99652] group-hover:text-white transition">
                <Plus size={20} />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-[#1e1b4b] group-hover:text-[#9a7837] transition">Create Course</p>
                <p className="text-[11px] text-slate-400">Add course</p>
              </div>
            </button>

            <button
              onClick={() => navigate("/mentor/assign-classroom-students")}
              className="p-4 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none hover:shadow-md transition text-left flex items-center gap-3 group"
            >
              <div className="w-10 h-10 bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center rounded-none group-hover:bg-[#B99652] group-hover:text-white transition">
                <UserPlus size={20} />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-[#1e1b4b] group-hover:text-[#9a7837] transition">Assign Students</p>
                <p className="text-[11px] text-slate-400">Enrollment</p>
              </div>
            </button>

            <button
              onClick={() => navigate(`/mentor/attendance?classroomId=${classroom.id || classroom._id}`)}
              className="p-4 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none hover:shadow-md transition text-left flex items-center gap-3 group"
            >
              <div className="w-10 h-10 bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center rounded-none group-hover:bg-[#B99652] group-hover:text-white transition">
                <CalendarCheck size={20} />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-[#1e1b4b] group-hover:text-[#9a7837] transition">Attendance</p>
                <p className="text-[11px] text-slate-400">Track logs</p>
              </div>
            </button>

            <button
              onClick={() => navigate("/mentor/add-result")}
              className="p-4 bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none hover:shadow-md transition text-left flex items-center gap-3 group"
            >
              <div className="w-10 h-10 bg-[#B99652]/15 text-[#9a7837] flex items-center justify-center rounded-none group-hover:bg-[#B99652] group-hover:text-white transition">
                <BarChart3 size={20} />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-[#1e1b4b] group-hover:text-[#9a7837] transition">Add Result</p>
                <p className="text-[11px] text-slate-400">Grading</p>
              </div>
            </button>
          </div>

          {/* COURSES */}
          <div className="mb-8 bg-white border border-[#ebdcaa] rounded-none p-6 shadow-sm border-t-4 border-t-[#B99652]">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#ebdcaa]/60">
              <BookOpen size={20} className="text-[#9a7837]" />
              <h2 className="font-bold text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b]">Courses in Classroom</h2>
              <span className="text-xs text-slate-500 ml-auto">Total: {courses.length}</span>
            </div>

            {courses.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-8">No courses created yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((c) => (
                  <div
                    key={c._id}
                    onClick={() => navigate(`/mentor/course/${c._id}`)}
                    className="border border-[#ebdcaa] rounded-none p-4 cursor-pointer hover:border-[#B99652] hover:shadow-xs transition bg-[#fffdf4]/40"
                  >
                    <h3 className="font-bold text-sm text-[#1e1b4b]">{c.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Category: <span className="font-semibold text-slate-700">{c.category || "General"}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Duration: <span className="font-semibold text-slate-700">{c.duration || "N/A"}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* STUDENTS */}
          <div className="bg-white border border-[#ebdcaa] rounded-none p-6 shadow-sm border-t-4 border-t-[#B99652]">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#ebdcaa]/60">
              <Users size={20} className="text-[#9a7837]" />
              <h2 className="font-bold text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b]">Enrolled Students</h2>
              <span className="text-xs text-slate-500 ml-auto">Total: {students.length}</span>
            </div>

            {students.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-8">No students assigned yet</p>
            ) : (
              <div className="overflow-x-auto border border-[#ebdcaa]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#fffdf4] border-b border-[#ebdcaa]">
                    <tr>
                      <th className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] px-4 py-3">No.</th>
                      <th className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] px-4 py-3">Name</th>
                      <th className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] px-4 py-3">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ebdcaa]/50 bg-white">
                    {students.map((s, idx) => (
                      <tr key={s._id || s.id} className="hover:bg-[#fffdf4]/80 transition">
                        <td className="px-4 py-3 text-xs font-bold text-slate-500 bg-slate-50/50 w-12">{idx + 1}</td>
                        <td className="px-4 py-3 text-xs sm:text-sm font-semibold text-[#1e1b4b]">{s.name}</td>
                        <td className="px-4 py-3 text-xs sm:text-sm text-slate-600 font-mono">{s.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </MentorLayout>
  );
};

export default MyClassroom;
