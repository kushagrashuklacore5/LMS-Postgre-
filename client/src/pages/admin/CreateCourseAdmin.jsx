import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';
import ClassEnrollmentScope from '../../components/admin/ClassEnrollmentScope';
import { ArrowLeft, Upload, Users, BookOpen, Check } from 'lucide-react';

const CreateCourseAdmin = () => {
  const navigate = useNavigate();
  const { token, API } = useAuth();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    duration: "",
    mentorId: "",
  });
  const [photo, setPhoto] = useState(null);
  const [mentors, setMentors] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState(new Set());
  const [scope, setScope] = useState("all");
  const [searchStudent, setSearchStudent] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setFetching(true);
      // Fetch Mentors with Auth Header
      const mentorsRes = await fetch(`${API}/users/mentors-simple`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const mentorsData = mentorsRes.ok ? await mentorsRes.json() : [];
      
      // Fetch All Users (to filter students and fallback mentors)
      const usersRes = await fetch(`${API}/users/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const usersData = usersRes.ok ? await usersRes.json() : [];
      const studentsData = Array.isArray(usersData) ? usersData.filter(u => u.role === 'student') : [];
      const mentorsFromAll = Array.isArray(usersData) ? usersData.filter(u => u.role === 'mentor') : [];

      if (Array.isArray(mentorsData) && mentorsData.length > 0) {
        setMentors(mentorsData);
      } else if (mentorsFromAll.length > 0) {
        setMentors(mentorsFromAll);
      }

      // Classes the course can be taught to (whole classes are enrolled after it is created)
      const classesRes = await fetch(`${API}/classrooms`, { headers: { Authorization: `Bearer ${token}` } });
      const classesData = await classesRes.json();
      setClassrooms(Array.isArray(classesData) ? classesData : classesData.data || classesData.classrooms || []);

      if (Array.isArray(mentorsData)) setMentors(mentorsData);
      if (Array.isArray(studentsData)) setStudents(studentsData);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t('failed_to_load_mentors_students'));
    } finally {
      setFetching(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
    }
  };

  const toggleClass = (classroomId) => {
    const next = new Set(selectedClasses);
    next.has(classroomId) ? next.delete(classroomId) : next.add(classroomId);
    setSelectedClasses(next);
  };

  const toggleStudent = (studentId) => {
    if (!studentId) return;
    const sIdStr = String(studentId);
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(sIdStr)) {
      newSelected.delete(sIdStr);
    } else {
      newSelected.add(sIdStr);
    }
    setSelectedStudents(newSelected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.mentorId) {
      toast.error(t('title_and_mentor_required'));
      return;
    }
    // Class first: a course is created for one or more existing classes
    if (selectedClasses.size === 0) {
      toast.error("Choose at least one class for this course.");
      return;
    }
    if (scope === "selected" && selectedStudents.size === 0) {
      toast.error("Tick at least one student, or choose All students.");
      return;
    }

    setLoading(true);
    // One request: the server saves the course, its classes and the students (all of each class,
    // or the ticked ones) together, or nothing at all.
    const classIds = Array.from(selectedClasses);
    // only ticked students of classes that are still chosen
    const studentIds = Array.from(selectedStudents);
    const submitData = { ...formData, classroomIds: classIds, scope, ...(scope === "selected" ? { studentIds } : {}) };

    try {
      const response = await fetch(`${API}/courses/create-course`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(submitData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to create course");
      }

      toast.success(`${t('course_created_successfully')} (${result.course?.totalStudents ?? 0} student(s) enrolled)`);
      navigate("/admin/courses");
    } catch (error) {
      console.error(error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(student => 
    student.name?.toLowerCase().includes(searchStudent.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchStudent.toLowerCase())
  );

  if (fetching) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin h-12 w-12 border-t-2 border-b-2 border-[#B99652] rounded-none"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex justify-between items-center border-b border-[#ebdcaa] pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
              {t('create_course_title')}
            </h1>
            <p className="text-gray-600 text-sm mt-1">{t('assign_mentor_students')}</p>
          </div>
          <button 
            onClick={() => navigate('/admin/dashboard')} 
            className="flex items-center gap-2 px-4 py-2 border border-[#ebdcaa] bg-white text-[#1e1b4b] hover:bg-[#ebdcaa]/20 rounded-none text-sm font-medium transition-all"
          >
            <ArrowLeft size={16} /> {t('back')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: Course Details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#fffdf4] p-6 rounded-none border border-[#ebdcaa] shadow-sm">
              <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa] flex items-center gap-2">
                <BookOpen size={20} className="text-[#B99652]" />
                {t('course_details')}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('course_title_label')}</label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-[#ebdcaa] rounded-none px-4 py-2.5 text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                    placeholder={t('course_title_placeholder')}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('category_label')}</label>
                    <input
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-[#ebdcaa] rounded-none px-4 py-2.5 text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                      placeholder={t('category_placeholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('duration_label')}</label>
                    <input
                      name="duration"
                      value={formData.duration}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-[#ebdcaa] rounded-none px-4 py-2.5 text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                      placeholder={t('duration_placeholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('description_label')}</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="4"
                    className="w-full bg-white border border-[#ebdcaa] rounded-none px-4 py-2.5 text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none resize-none"
                    placeholder={t('description_placeholder')}
                  />
                </div>
              </div>
            </div>

            {/* MENTOR SELECTION */}
            <div className="bg-[#fffdf4] p-6 rounded-none border border-[#ebdcaa] shadow-sm">
              <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa] flex items-center gap-2">
                <Users size={20} className="text-[#B99652]" />
                {t('assign_mentor_label')}
              </h2>
              
              <select
                name="mentorId"
                value={formData.mentorId}
                onChange={handleInputChange}
                className="w-full bg-white border border-[#ebdcaa] rounded-none px-4 py-2.5 text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none text-[#1e1b4b]"
                required
              >
                <option value="">{t('select_a_mentor')}</option>
                {mentors.map(m => {
                  const mId = m.id || m._id;
                  return (
                    <option key={mId} value={mId}>
                      {m.name}{m.email ? ` (${m.email})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

          {/* CLASSES (required: class first) */}
          <div className="bg-[#fffdf4] p-6 rounded-none border border-[#ebdcaa] shadow-sm h-fit">
            <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1 pb-2 border-b border-[#ebdcaa] flex items-center gap-2">
              <Users size={20} className="text-[#B99652]" />
              Classes *
            </h2>
            {classrooms.length === 0 ? (
              <p className="text-sm text-amber-700">
                No classes yet. <button type="button" className="underline" onClick={() => navigate("/admin/classrooms")}>Create a class first</button>, then its courses.
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {classrooms.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm px-2 py-1.5 bg-white border border-[#ebdcaa] cursor-pointer">
                    <input type="checkbox" checked={selectedClasses.has(c.id)} onChange={() => toggleClass(c.id)} />
                    <span className="flex-1">{c.grade && c.section ? `${c.grade}-${c.section}` : c.name}</span>
                    <span className="text-xs text-gray-500">{c.studentCount ?? 0}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* RIGHT COLUMN: which students of the chosen classes take the course */}
          <div className="bg-[#fffdf4] p-6 rounded-none border border-[#ebdcaa] shadow-sm h-fit">
            <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-3 pb-2 border-b border-[#ebdcaa] flex items-center gap-2">
              <Users size={20} className="text-[#B99652]" />
              {t('assign_students')}
            </h2>
            {selectedClasses.size === 0 ? (
              <p className="text-sm text-gray-500">Choose the class(es) first.</p>
            ) : (
              <ClassEnrollmentScope
                API={API}
                token={token}
                classes={classrooms.filter((c) => selectedClasses.has(c.id)).map((c) => ({ id: c.id, label: c.grade && c.section ? `${c.grade}-${c.section}` : c.name }))}
                scope={scope}
                onScope={setScope}
                selected={selectedStudents}
                onSelected={setSelectedStudents}
              />
            )}
          </div>

          {/* SUBMIT BUTTON */}
          <div className="lg:col-span-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#B99652] hover:bg-[#a38241] text-white py-3.5 rounded-none font-semibold text-base transition-all disabled:opacity-50 shadow-sm"
            >
              {loading ? t('creating_course') : t('create_course_assign_students')}
            </button>
          </div>

        </form>
      </div>
    </AdminLayout>
  );
};

export default CreateCourseAdmin;
