import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import MentorLayout from '../../components/MentorLayout';
import { toast } from 'react-toastify';
import {
  Users,
  UserPlus,
  Check,
  BookOpen,
  ArrowLeft,
  CheckCircle,
  XCircle
} from 'lucide-react';

const AssignStudents = () => {
  const navigate = useNavigate();
  const { token, API } = useAuth();
  const { t } = useTranslation();
  
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    getCourses();
  }, []);

  const getCourses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/courses/mentor`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Could not load courses');
      }

      const data = await response.json();
      setCourses(data);

    } catch (error) {
      toast.error('Failed to load courses');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getStudentsAndAssigned = async (courseId) => {
    try {
      setLoading(true);
      const [studentsRes, courseRes] = await Promise.all([
        fetch(`${API}/users/students`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/courses/${courseId}/students`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      let allStudents = [];
      if (studentsRes.ok) {
        allStudents = await studentsRes.json();
      }

      let assigned = [];
      if (courseRes.ok) {
        assigned = await courseRes.json();
      }

      const processedAll = (allStudents || []).map(s => ({
        ...s,
        _id: s._id || s.id || s.userId,
        id: s.id || s._id || s.userId
      }));

      const processedAssigned = (assigned || []).map(s => ({
        ...s,
        _id: s._id || s.id || s.studentId,
        id: s.id || s._id || s.studentId
      }));

      setStudents(processedAll);
      setAssignedStudents(processedAssigned);

      // Pre-select already assigned students
      const assignedIds = new Set(processedAssigned.map(s => s._id || s.id));
      setSelected(assignedIds);
    } catch (error) {
      toast.error('Failed to load students');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectCourse = (course) => {
    const cid = course._id || course.id;
    setSelectedCourse(course);
    setAssignedStudents([]);
    setSelected(new Set());
    getStudentsAndAssigned(cid);
  };

  const goBackToCourses = () => {
    setSelectedCourse(null);
    setSelected(new Set());
  };

  const toggleStudent = (studentId) => {
    const newSelected = new Set(selected);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelected(newSelected);
  };

  const assignStudents = async () => {
    if (!selectedCourse) {
      toast.error('Please select a course first');
      return;
    }

    if (selected.size === 0) {
      toast.error('Please select at least one student');
      return;
    }

    try {
      setAssigning(true);
      const studentIds = Array.from(selected);
      const cid = selectedCourse._id || selectedCourse.id;

      const response = await fetch(`${API}/courses/${cid}/assign-students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentIds: studentIds
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign students');
      }

      toast.success(`Assigned ${studentIds.length} student(s) successfully`);
      window.dispatchEvent(new CustomEvent('guidebot:action-success', { detail: { actionId: 'students-assigned' } }));
      
      // Refresh
      await getStudentsAndAssigned(cid);
      await getCourses();
    } catch (error) {
      toast.error('Failed to assign students');
      console.error(error);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <MentorLayout>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-text">Loading courses...</p>
            </div>
          </div>
        </div>
      </MentorLayout>
    );
  }

  return (
    <MentorLayout>
      <div className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
                <div data-tour="assign-students-page" className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-text">{t('assign_students')}</h1>
                <p className="text-gray-600 mt-1">{t('assign_students_description')}</p>
              </div>
              
              {selectedCourse && (
                <button
                  onClick={goBackToCourses}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-text rounded-lg hover:bg-gray-50"
                >
                  <ArrowLeft size={18} />
                  Back to Courses
                </button>
              )}
            </div>
          </div>

          {/* Course Selection View */}
          {!selectedCourse ? (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-xl font-bold text-text mb-4">Your Courses</h2>
                <p className="text-gray-600 mb-6">Select a course to assign students</p>
                
                {courses.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto text-gray-300" size={48} />
                    <p className="text-text font-medium mt-4">{t('no_courses_found')}</p>
                    <p className="text-gray-600 mb-6">{t('create_course_first')}</p>
                    <button
                      onClick={() => navigate('/mentor/create-course')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90"
                    >
                      Create Course
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map((course, courseIndex) => (
                      <div
                        key={course._id}
                        data-tour={courseIndex === 0 ? 'assign-course-block' : undefined}
                        onClick={() => selectCourse(course)}
                        className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md cursor-pointer"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                            <BookOpen className="text-primary" size={20} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-text line-clamp-1">{course.title}</h3>
                            <p className="text-sm text-gray-500">{course.category || t('general')}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{course.students?.length || 0} {t('students').toLowerCase()}</span>
                          <button data-tour={courseIndex === 0 ? 'assign-course-select' : undefined} className="flex items-center gap-1 text-primary">
                            <span>{t('select')}</span>
                            <UserPlus size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Student Assignment View */
            <div data-tour="assign-view" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Students List */}
              <div className="lg:col-span-2">
                <div data-tour="assign-students-panel" className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text">{t('students')}</h2>
                    <div className="text-sm text-gray-600">
                      {selected.size} selected • {assignedStudents.length} already assigned
                    </div>
                  </div>

                  {students.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="mx-auto text-gray-300" size={48} />
                      <p className="text-text font-medium mt-4">{t('no_students_found')}</p>
                      <p className="text-gray-600">{t('no_students_available')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {students.map((student) => {
                        const isAssigned = assignedStudents.some(s => s._id === student._id || s === student._id);
                        const isSelected = selected.has(student._id);
                        
                        return (
                          <div key={student._id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                                  <span className="font-semibold text-primary">
                                    {student.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-text">{student.name}</p>
                                  <p className="text-sm text-gray-500">{student.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {isAssigned && (
                                  <span className="inline-flex items-center gap-1 text-sm text-success">
                                    <CheckCircle size={14} />
                                    Assigned
                                  </span>
                                )}
                                <button
                                  onClick={() => toggleStudent(student._id)}
                                  className={`w-5 h-5 border rounded flex items-center justify-center ${
                                    isSelected
                                      ? 'bg-primary border-primary text-white'
                                      : 'border-gray-300'
                                  }`}
                                >
                                  {isSelected && <Check size={12} />}
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

              {/* Assignment Panel */}
              <div>
                <div data-tour="assign-panel" className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                  <h2 className="text-xl font-bold text-text mb-4">Assignment</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Course</p>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="font-medium text-text">{selectedCourse.title}</p>
                        <p className="text-sm text-gray-500">{selectedCourse.category || 'General'}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-2">Selection</p>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Selected</span>
                          <span className="text-xl font-bold text-primary">{selected.size}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {selected.size === 0 ? t('no_students_selected') : `${selected.size} ${t('student_count_suffix')}`}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 space-y-3">
                      <button
                        onClick={assignStudents}
                        disabled={assigning || selected.size === 0}
                        className="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        {assigning ? t('assigning') : t('assign_students')}
                      </button>
                      
                      <button
                        onClick={goBackToCourses}
                        className="w-full px-4 py-2.5 border border-gray-300 text-text rounded-lg hover:bg-gray-50"
                      >
                        {t('change_course')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Course Info */}
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
                  <h3 className="font-medium text-text mb-3">Course Info</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium">Title:</span> {selectedCourse.title}</p>
                    <p><span className="font-medium">Category:</span> {selectedCourse.category || 'General'}</p>
                    <p><span className="font-medium">Students:</span> {assignedStudents.length} assigned</p>
                    <p><span className="font-medium">Duration:</span> {selectedCourse.duration} hours</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MentorLayout>
  );
};

export default AssignStudents;