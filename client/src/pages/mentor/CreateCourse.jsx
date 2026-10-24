import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import MentorLayout from '../../components/MentorLayout';
import { toast } from 'react-toastify';
import { ArrowLeft, Pencil } from 'lucide-react';

const CreateCourse = () => {
  const navigate = useNavigate();
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const [courses, setCourses] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [students, setStudents] = useState([]);                 // ✅ ADD
  const [selectedStudents, setSelectedStudents] = useState([]); // ✅ ADD
  const [classroomContext, setClassroomContext] = useState(null);

  const [selectedMentor, setSelectedMentor] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCourse, setEditingCourse] = useState(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    duration: "",
  });

  // Handle classroom context from navigation
  useEffect(() => {
    if (location.state?.classroomId) {
      setClassroomContext({
        classroomId: location.state.classroomId,
        classroomName: location.state.classroomName
      });
    }
  }, [location.state]);

  useEffect(() => {
    getCourses();
    getMentors();
    getStudents(); // ✅ ADD
  }, []);

  // Set default mentor to current user if they are a mentor
  useEffect(() => {
    const { user } = JSON.parse(localStorage.getItem('auth') || '{}');
    if (user && user.role === 'mentor' && user.id) {
      setSelectedMentor(user.id.toString());
    }
  }, []);

  /* ================= UNWRAP RESPONSE ================= */
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

  /* ================= GET COURSES ================= */
  const getCourses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/courses/mentor`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      const courses = unwrapResponse(data);
      setCourses(Array.isArray(courses) ? courses : []);
    } catch {
      toast.error(t('failed_to_load_courses'));
    } finally {
      setLoading(false);
    }
  };

  /* ================= GET MENTORS ================= */
  const getMentors = async () => {
    try {
      const res = await fetch(`${API}/users/mentors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const mentorsList = unwrapResponse(data);
      setMentors(Array.isArray(mentorsList) ? mentorsList : []);
    } catch {
      toast.error(t('failed_to_load_teachers'));
    }
  };

  /* ================= GET STUDENTS (ADD) ================= */
  const getStudents = async () => {
    try {
      const res = await fetch(`${API}/users/students-simple`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const studentsList = unwrapResponse(data);
      setStudents(Array.isArray(studentsList) ? studentsList : []);
    } catch {
      toast.error(t('failed_to_load_students'));
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  /* ================= START EDITING ================= */
  const startEditing = (course) => {
    setEditingCourse(course);
    setFormData({
      title: course.title,
      description: course.description,
      category: course.category,
      duration: course.duration,
    });
    // courseTeacher is an ID from getMentorCourses (not populated)
    setSelectedMentor(course.mentorId || "");

    // students are populated objects
    if (course.students && course.students.length > 0) {
      setSelectedStudents(course.students.map(s => s._id));
    } else {
      setSelectedStudents([]);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ================= SAVE COURSE ================= */
  const saveCourse = async (e) => {
    e.preventDefault();

    console.log('📚 [VALIDATION DEBUG] Form data:', formData);
    console.log('📚 [VALIDATION DEBUG] Selected mentor:', selectedMentor);
    console.log('📚 [VALIDATION DEBUG] Title valid:', !!formData.title);
    console.log('📚 [VALIDATION DEBUG] Category valid:', !!formData.category);
    console.log('📚 [VALIDATION DEBUG] Duration valid:', !!formData.duration);
    console.log('📚 [VALIDATION DEBUG] Mentor valid:', !!selectedMentor);

    if (!formData.title || !formData.category || !formData.duration || !selectedMentor) {
      toast.error('Please fill all required fields');
      console.log('📚 [VALIDATION DEBUG] Validation failed - missing required fields');
      return;
    }

    try {
      setSaving(true);

      const url = editingCourse
        ? `${API}/courses/update-course/${editingCourse._id}`
        : `${API}/courses/create-course`;

      const method = editingCourse ? 'PUT' : 'POST';

      const requestData = {
        ...formData,
        mentorId: selectedMentor,
        studentIds: selectedStudents,
        classroomId: classroomContext?.classroomId,
      };

      console.log('📚 [FRONTEND DEBUG] Course data being sent:', requestData);
      console.log('📚 [FRONTEND DEBUG] API URL:', url);
      console.log('📚 [FRONTEND DEBUG] Method:', method);
      console.log('📚 [FRONTEND DEBUG] Token available:', !!token);

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save course');
      }

      toast.success(editingCourse ? t('course_updated_successfully') : t('course_created_successfully'));
      getCourses();
      resetForm();
    } catch (error) {
      console.error('❌ Course save error:', error);
      toast.error(`Failed to save course: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingCourse(null);
    setSelectedMentor("");
    setSelectedStudents([]); // ✅ ADD
    setFormData({
      title: "",
      description: "",
      category: "",
      duration: "",
    });
  };

  const filteredCourses = courses.filter(course =>
    course.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MentorLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="mb-8 flex justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('course_management')}</h1>
            <p className="text-gray-600">{t('manage_courses')}</p>
            {classroomContext && (
              <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                <span className="text-sm text-blue-800 font-medium">
                  📍 Creating course for: {classroomContext.classroomName}
                </span>
              </div>
            )}
          </div>
          <button onClick={() => navigate('/mentor/dashboard')} className="border px-4 py-2 rounded flex gap-2">
            <ArrowLeft size={18} /> {t('back')}
          </button>
        </div>

        {/* FORM */}
        <div className="bg-white border rounded-xl p-5 mb-6">
          <h2 className="text-xl font-bold mb-4">
            {editingCourse ? t('edit_course') : t('create_course')}
          </h2>

          <form onSubmit={saveCourse}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

              <input name="title" value={formData.title} onChange={handleInputChange}
                placeholder={t('course_title_placeholder')} className="border px-3 py-2 rounded" required />

              <input name="category" value={formData.category} onChange={handleInputChange}
                placeholder={t('category')} className="border px-3 py-2 rounded" required />

              <input type="number" name="duration" value={formData.duration}
                onChange={handleInputChange}
                placeholder={t('duration_hours')} className="border px-3 py-2 rounded" required />

              <select value={selectedMentor}
                onChange={(e) => setSelectedMentor(e.target.value)}
                className="border px-3 py-2 rounded" required>
                <option value="">{t('assign_course_teacher')}</option>
                {mentors.map(m => (
                  <option key={m._id} value={m._id}>{m.name}</option>
                ))}
              </select>

              {/* ✅ ASSIGN STUDENTS */}
              <select
                multiple
                value={selectedStudents}
                onChange={(e) =>
                  setSelectedStudents([...e.target.selectedOptions].map(o => o.value))
                }
                className="border px-3 py-2 rounded md:col-span-2"
              >
                <option disabled>{t('assign_students')}</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

            </div>

            <textarea name="description" value={formData.description}
              onChange={handleInputChange}
              placeholder={t('description')}
              className="border px-3 py-2 rounded w-full mb-4"
              rows="3" required />

            <button type="submit" disabled={saving}
              className="bg-primary text-white px-5 py-2 rounded">
              {saving ? t('saving') : editingCourse ? t('update_course') : t('create_course')}
            </button>
          </form>
        </div>

        {/* COURSES LIST */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-xl font-bold mb-4">{t('your_courses')}</h2>

          {filteredCourses.map(course => (
            <div key={course._id} className="border rounded-lg p-4 mb-3 hover:shadow flex justify-between items-center">
              <div
                onClick={() => navigate(`/mentor/course/${course._id}`)}
                className="cursor-pointer flex-1"
              >
                <h3 className="font-semibold">{course.title}</h3>
                <p className="text-sm text-gray-500">
                  {t('teacher')}: {mentors.find(m => m.id === course.mentorId)?.name || t('not_assigned')}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing(course);
                }}
                className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-full transition-colors"
                title={t('edit_course')}
              >
                <Pencil size={18} />
              </button>
            </div>
          ))}
        </div>

      </div>
    </MentorLayout>
  );
};;

export default CreateCourse;
