import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { useAuth } from "../../auth/auth";
import { toast } from "react-toastify";
import { ArrowLeft, Users, BookOpen, Plus, UserPlus, X, Search, CheckCircle, Video } from "lucide-react";
import LecturesTable from "../../components/lectures/LecturesTable";
import { useTranslation } from "../../context/TranslationContext";

const ClassroomDetails = () => {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const { API, token } = useAuth();
  const { t } = useTranslation();

  const [classroom, setClassroom] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("courses");
  const [loading, setLoading] = useState(true);

  // Add Student Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [searchStudent, setSearchStudent] = useState("");
  const [submittingStudent, setSubmittingStudent] = useState(false);

  /* ================= FETCH CLASSROOM ================= */
  const fetchClassroom = async () => {
    try {
      const res = await fetch(`${API}/classrooms/${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const classroomData = data.data || data;
      setClassroom(classroomData);
    } catch (err) {
      console.error("Error fetching classroom:", err);
      toast.error(err.message || t('failed_to_load_classroom'));
      setClassroom(null);
    }
  };

  /* ================= FETCH COURSES ================= */
  const fetchCourses = async () => {
    try {
      const res = await fetch(
        `${API}/courses/classroom?classroomId=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const coursesList = Array.isArray(data) ? data : (data.data || []);
      setCourses(coursesList);
    } catch (err) {
      console.error("Error fetching courses:", err);
      setCourses([]);
    }
  };

  /* ================= FETCH STUDENTS ================= */
  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API}/classrooms/${classroomId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setStudents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching students:", err);
      setStudents([]);
    }
  };

  /* ================= FETCH ALL STUDENTS FOR MODAL ================= */
  const fetchAllStudents = async () => {
    try {
      const res = await fetch(`${API}/users/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setAllStudents(data.filter(u => u.role === 'student'));
      }
    } catch (err) {
      console.error("Error fetching all students:", err);
    }
  };

  useEffect(() => {
    if (classroomId) {
      Promise.all([fetchClassroom(), fetchCourses(), fetchStudents()]).finally(() =>
        setLoading(false)
      );
    }
  }, [classroomId]);

  const handleOpenAddStudentModal = () => {
    fetchAllStudents();
    setIsAddModalOpen(true);
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      toast.error("Please select a student");
      return;
    }

    try {
      setSubmittingStudent(true);
      const res = await fetch(`${API}/classrooms/assign-student`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          classroomId,
          studentId: selectedStudentId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to assign student");

      toast.success("Student assigned to classroom successfully!");
      setIsAddModalOpen(false);
      setSelectedStudentId("");
      fetchStudents();
      fetchCourses();
    } catch (err) {
      console.error("Error assigning student:", err);
      toast.error(err.message || "Failed to assign student");
    } finally {
      setSubmittingStudent(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center bg-[#fffdf4] border border-[#ebdcaa]">
          <div className="animate-spin rounded-none h-10 w-10 border-4 border-[#B99652] border-t-transparent mx-auto"></div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mt-3">{t('loading_classroom')}</p>
        </div>
      </AdminLayout>
    );
  }

  if (!classroom) {
    return (
      <AdminLayout>
        <div className="p-8 text-center bg-[#fffdf4] border border-[#ebdcaa]">
          <p className="text-sm font-semibold text-red-600">{t('classroom_not_found')}</p>
        </div>
      </AdminLayout>
    );
  }

  const enrolledStudentIds = new Set(students.map(s => String(s.id || s._id)));
  const availableStudents = allStudents.filter(
    s => !enrolledStudentIds.has(String(s.id || s._id)) &&
    (s.name?.toLowerCase().includes(searchStudent.toLowerCase()) || s.email?.toLowerCase().includes(searchStudent.toLowerCase()))
  );

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin/classrooms")}
              className="p-2 bg-white border border-[#ebdcaa] rounded-none hover:bg-[#ebdcaa]/30 text-[#1e1b4b] transition-colors"
              title="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-[#B99652]" />
            </button>
            <div>
              <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                {classroom.name} {classroom.section && `- Section ${classroom.section}`}
              </h1>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-0.5">
                {t('class_teacher')}: {" "}
                <span className="text-[#1e1b4b]">
                  {(typeof classroom.classTeacher === 'object' ? classroom.classTeacher?.name : classroom.classTeacher) || t('not_assigned')}
                </span>
                <span className="mx-2">•</span>
                <span>Grade {classroom.grade}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenAddStudentModal}
              className="px-4 py-2 bg-[#B99652] hover:bg-[#a38446] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              Add Student
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex items-center gap-4 border-b border-[#ebdcaa]">
          <button
            onClick={() => setActiveTab("courses")}
            className={`pb-3 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "courses"
                ? "border-[#B99652] text-[#1e1b4b]"
                : "border-transparent text-slate-500 hover:text-[#1e1b4b]"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Courses ({courses.length})
          </button>
          <button
            onClick={() => setActiveTab("students")}
            className={`pb-3 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "students"
                ? "border-[#B99652] text-[#1e1b4b]"
                : "border-transparent text-slate-500 hover:text-[#1e1b4b]"
            }`}
          >
            <Users className="w-4 h-4" />
            Students ({students.length})
          </button>
          <button
            onClick={() => setActiveTab("lectures")}
            className={`pb-3 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "lectures"
                ? "border-[#B99652] text-[#1e1b4b]"
                : "border-transparent text-slate-500 hover:text-[#1e1b4b]"
            }`}
          >
            <Video className="w-4 h-4" />
            Lectures
          </button>
        </div>

        {/* COURSES TAB */}
        {activeTab === "courses" && (
          <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#ebdcaa]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#B99652]" />
                <h2 className="font-bold text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('courses')}</h2>
              </div>
            </div>

            {courses.length === 0 ? (
              <div className="text-center py-12 bg-white border border-[#ebdcaa]">
                <p className="text-sm font-semibold text-[#1e1b4b]">{t('no_courses_yet')}</p>
                <p className="text-xs text-slate-500 mt-1">No courses have been assigned to this classroom yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((course) => (
                  <div
                    key={course._id || course.id}
                    className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs hover:border-[#B99652] transition-colors"
                  >
                    <h3 className="font-bold text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b]">{course.title}</h3>

                    <div className="mt-3 space-y-2 text-xs text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-500 uppercase tracking-wider">{t('teacher')}:</span>{" "}
                        <span className="font-semibold text-[#1e1b4b]">{course.mentor?.name || t('not_assigned')}</span>
                      </p>

                      <p className="flex items-center gap-1.5 text-slate-600">
                        <Users className="w-4 h-4 text-[#B99652]" />
                        <span className="font-semibold text-slate-500 uppercase tracking-wider">{t('students')}:</span>{" "}
                        <span className="font-semibold text-[#1e1b4b]">{course.students?.length || 0}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STUDENTS TAB */}
        {activeTab === "students" && (
          <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#ebdcaa]">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#B99652]" />
                <h2 className="font-bold text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b]">Enrolled Students</h2>
              </div>
              <button
                onClick={handleOpenAddStudentModal}
                className="px-3 py-1.5 bg-[#B99652] hover:bg-[#a38446] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Student
              </button>
            </div>

            {students.length === 0 ? (
              <div className="text-center py-12 bg-white border border-[#ebdcaa]">
                <Users className="w-12 h-12 text-[#B99652]/40 mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#1e1b4b]">No Students Enrolled Yet</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">Add students to this classroom to let them access courses and track attendance</p>
                <button
                  onClick={handleOpenAddStudentModal}
                  className="px-4 py-2 bg-[#B99652] text-white text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add First Student
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-[#ebdcaa] bg-white">
                  <thead>
                    <tr className="bg-[#ebdcaa]/30 border-b border-[#ebdcaa] text-slate-700 font-semibold uppercase tracking-wider">
                      <th className="p-3">#</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Roll Number</th>
                      <th className="p-3">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ebdcaa]/50">
                    {students.map((student, idx) => (
                      <tr key={student.id || idx} className="hover:bg-[#fffdf4]">
                        <td className="p-3 font-semibold text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-semibold text-[#1e1b4b]">{student.name}</td>
                        <td className="p-3 text-slate-600">{student.email}</td>
                        <td className="p-3 text-slate-600">{student.rollNumber || "—"}</td>
                        <td className="p-3 text-slate-600">{student.grade || classroom.grade || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* LECTURES TAB: the class's lecture history, all teachers */}
        {activeTab === "lectures" && (
          <LecturesTable API={API} token={token} mode="admin" classroomId={classroomId} title="Lectures of this class" />
        )}

      </div>

      {/* ADD STUDENT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffdf4] border border-[#ebdcaa] shadow-xl w-full max-w-lg p-6 relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[#ebdcaa]">
              <UserPlus className="w-5 h-5 text-[#B99652]" />
              <h3 className="font-bold text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                Add Student to {classroom.name}
              </h3>
            </div>

            <form onSubmit={handleAssignStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Search Students
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-[#ebdcaa] bg-white focus:outline-hidden focus:border-[#B99652]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Select Student ({availableStudents.length} available)
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-2.5 text-xs border border-[#ebdcaa] bg-white focus:outline-hidden focus:border-[#B99652]"
                  required
                >
                  <option value="">-- Choose a student --</option>
                  {availableStudents.map((s) => (
                    <option key={s.id || s._id} value={s.id || s._id}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-[#ebdcaa] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-[#ebdcaa] text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingStudent || !selectedStudentId}
                  className="px-5 py-2 bg-[#B99652] hover:bg-[#a38446] disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider transition-colors"
                >
                  {submittingStudent ? "Assigning..." : "Assign Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ClassroomDetails;
