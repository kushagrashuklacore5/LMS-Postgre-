import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";

const CreateClassroomModal = ({ open, onClose, onSuccess }) => {
  const { API, token } = useAuth();
  const { t } = useTranslation();

  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [customGrade, setCustomGrade] = useState(""); // a class that is not Grade 1-12, e.g. BSc
  const [classTeacher, setClassTeacher] = useState("");
  const [studentIds, setStudentIds] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingMentors, setLoadingMentors] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [timetable, setTimetable] = useState(null);

  /* ================= FETCH MENTORS AND STUDENTS ================= */
  useEffect(() => {
    if (open) {
      fetchMentors();
      fetchStudents();
    }
  }, [open]);

  const fetchMentors = async () => {
    try {
      setLoadingMentors(true);
      const res = await fetch(`${API}/admin/mentors`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error();

      setMentors(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t('failed_to_load_teachers'));
    } finally {
      setLoadingMentors(false);
    }
  };

  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      const res = await fetch(`${API}/users/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error();

      const studentList = Array.isArray(data) ? data.filter(u => u.role === "student") : [];
      setStudents(studentList);
    } catch {
      toast.error(t('failed_to_load_students'));
    } finally {
      setLoadingStudents(false);
    }
  };

  /* ================= CREATE CLASSROOM ================= */
  const handleCreate = async () => {
    const className = customGrade.trim() || grade;
    if (!className) {
      return toast.error(t('grade_required'));
    }
    
    if (!section) {
      return toast.error(t('section_required'));
    }

    // every class needs its class teacher (the server refuses one without)
    if (!classTeacher) {
      return toast.error(mentors.length ? 'Choose the class teacher.' : 'Add a teacher first (Add Teacher), then create the class.');
    }

    try {
      // Get teacher's name from selected ID
      const selectedTeacher = mentors.find(m => m.id === classTeacher);
      const teacherName = selectedTeacher ? selectedTeacher.name : "";

      const requestData = {
        name: `${className} - ${section}`,
        grade: className,
        section,
        classTeacher: teacherName,
        classTeacherId: classTeacher ? parseInt(classTeacher) : null,
        studentIds: studentIds.length > 0 ? studentIds.map(id => parseInt(id)) : []
      };

      console.log('Creating classroom with data:', requestData);

      // Create classroom (with students assigned in the same request)
      const res = await fetch(`${API}/classrooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || t('failed_to_create_classroom'));
      }

      // Get the created classroom - handle both wrapped and unwrapped responses
      const createdClassroom = data.classroom || data.data || data;

      toast.success(t('classroom_created_successfully'));
      onSuccess();
      onClose();

      // reset form
      setGrade("");
      setSection("");
      setClassTeacher("");
      setStudentIds([]);
      setPhoto(null);
      setTimetable(null);
    } catch (err) {
      console.error('Create classroom error:', err);
      toast.error(err.message || t('failed_to_create_classroom'));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[#fffdf4] w-full max-w-md border border-[#ebdcaa] rounded-none p-6 max-h-[90vh] overflow-y-auto shadow-xl">

        {/* HEADER */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#ebdcaa]">
          <h2 className="font-bold text-lg font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('create_classroom_button')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-[#1e1b4b]">
            <X size={18} />
          </button>
        </div>

        {/* FORM */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-1.5">
              {t('grade_level')} <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-2 text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              required
            >
              <option value="">{t('select_grade_placeholder')}</option>
              <option value="1">Grade 1 (Primary)</option>
              <option value="2">Grade 2 (Primary)</option>
              <option value="3">Grade 3 (Primary)</option>
              <option value="4">Grade 4 (Primary)</option>
              <option value="5">Grade 5 (Secondary)</option>
              <option value="6">Grade 6 (Secondary)</option>
              <option value="7">Grade 7 (Secondary)</option>
              <option value="8">Grade 8 (Secondary)</option>
              <option value="9">Grade 9 (Secondary)</option>
              <option value="10">Grade 10 (Secondary)</option>
              <option value="11">Grade 11 (Secondary)</option>
              <option value="12">Grade 12 (Secondary)</option>
            </select>
            <input
              className="mt-2 w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-2 text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
              placeholder={t('custom_class_name')}
              maxLength={50}
              value={customGrade}
              onChange={(e) => setCustomGrade(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-1.5">
              {t('section')} <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-2 text-sm text-[#1e1b4b] placeholder-slate-400 focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
              placeholder={t('section_placeholder')}
              value={section}
              onChange={(e) => setSection(e.target.value)}
              required
            />
          </div>

          {/* CLASS TEACHER DROPDOWN */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-1.5">
              Class Teacher <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-2 text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
              value={classTeacher}
              onChange={(e) => setClassTeacher(e.target.value)}
              disabled={loadingMentors}
              required
              aria-required="true"
            >
              <option value="">Select Class Teacher *</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
            {!loadingMentors && mentors.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">No teachers yet. Add a teacher first, then create the class.</p>
            )}
          </div>

          {/* STUDENT SELECTION */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-1.5">{t('assign_students_optional')}</label>
            <select
              className="w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-2 text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
              multiple
              value={studentIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setStudentIds(selected);
              }}
              disabled={loadingStudents}
              size={4}
            >
              {students.map((s) => {
                const sId = s.id || s._id;
                return (
                  <option key={sId} value={sId}>
                    {s.name} ({s.email})
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">{t('hold_ctrl_to_select_multiple')}</p>
          </div>

          {/* PHOTO UPLOAD */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-1.5">{t('classroom_photo_optional')}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files[0])}
              className="w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-[#B99652]"
            />
          </div>

          {/* TIMETABLE UPLOAD */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-1.5">{t('timetable_optional')}</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setTimetable(e.target.files[0])}
              className="w-full bg-white border border-[#ebdcaa] rounded-none px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-[#B99652]"
            />
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#ebdcaa]">
          <button onClick={onClose} className="border border-[#ebdcaa] bg-white text-[#1e1b4b] px-4 py-2 rounded-none text-xs uppercase tracking-wider font-semibold hover:bg-slate-50 transition-colors">
            {t('cancel')}
          </button>
          <button
            onClick={handleCreate}
            className="bg-[#B99652] hover:bg-[#a38241] text-white px-5 py-2 rounded-none text-xs uppercase tracking-wider font-semibold transition-colors"
          >
            {t('create')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default CreateClassroomModal;
