import { useEffect, useState } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import MentorLayout from '../../components/MentorLayout';
import { toast } from 'react-toastify';
import {
  BarChart3,
  TrendingUp,
  Users,
  BookOpen,
  CheckCircle,
  Clock,
  ArrowLeft,
  Search,
  Eye,
  FileText,
  ChevronDown
} from 'lucide-react';

const Progress = () => {
  const navigate = useNavigate();
  const { token, API } = useAuth();
  const { t } = useTranslation();
  
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [progressData, setProgressData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedStudent, setExpandedStudent] = useState(null);

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
      toast.error(t('failed_to_load_courses'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getProgress = async (courseId) => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/progress/mentor`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Could not load progress data');
      }

      const data = await response.json();
      console.log('📊 Raw API response:', data);
      
      // Filter by course ID (use course.id for SQLite compatibility)
      const courseProgress = Array.isArray(data) ? data.filter(item => item.course && item.course.id === courseId) : [];
      console.log('🎯 Filtered progress for course', courseId, ':', courseProgress);
      
      setProgressData(courseProgress);
      
      if (courseProgress.length > 0) {
        toast.success(t('progress_data_loaded'));
      } else {
        toast.info('No progress data available for this course yet');
      }

    } catch (error) {
      toast.error(t('failed_to_load_progress'));
      console.error('❌ Error fetching progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectCourse = (course) => {
    setSelectedCourse(course);
    getProgress(course._id);
    setSearchTerm("");
  };

  const goBackToCourses = () => {
    setSelectedCourse(null);
    setProgressData([]);
  };



  const getStatus = (percentage) => {
    if (percentage === 100) return t('completed');
    if (percentage >= 70) return t('good');
    if (percentage >= 40) return t('average');
    if (percentage > 0) return t('slow');
    return t('not_started');
  };

  const getStatusColor = (percentage) => {
    if (percentage === 100) return 'text-success';
    if (percentage >= 70) return 'text-primary';
    if (percentage >= 40) return 'text-warning';
    if (percentage > 0) return 'text-orange-500';
    return 'text-gray-500';
  };

  const filteredProgress = progressData.filter(item =>
    item.student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.student.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: progressData.length,
    completed: progressData.filter(item => item.progress.completionPercentage === 100).length,
    averageProgress: progressData.length > 0
      ? Math.round(progressData.reduce((sum, item) => sum + item.progress.completionPercentage, 0) / progressData.length)
      : 0,
    totalChapters: progressData.reduce((sum, item) => sum + (item.progress.totalChapters || 0), 0),
    totalMaterials: progressData.reduce((sum, item) => sum + (item.progress.totalMaterials || 0), 0),
    totalAssessments: progressData.reduce((sum, item) => sum + (item.progress.totalAssessments || 0), 0),
    completedChapters: progressData.reduce((sum, item) => sum + (item.progress.completedChapters || 0), 0),
    completedMaterials: progressData.reduce((sum, item) => sum + (item.progress.completedMaterials || 0), 0),
    completedAssessments: progressData.reduce((sum, item) => sum + (item.progress.completedAssessments || 0), 0),
  };

  if (loading && !selectedCourse) {
    return (
      <MentorLayout>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-text">{t('loading_courses')}</p>
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
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-text">{t('progress_view')}</h1>
                <p className="text-gray-600 mt-1">{t('track_student_progress')}</p>
              </div>
              
              {selectedCourse && (
                <button
                  onClick={goBackToCourses}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-text rounded-lg hover:bg-gray-50"
                >
                  <ArrowLeft size={18} />
                  {t('back_to_courses')}
                </button>
              )}
            </div>
          </div>

          {/* Course Selection View */}
          {!selectedCourse ? (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-xl font-bold text-text mb-4">{t('your_courses')}</h2>
                <p className="text-gray-600 mb-6">{t('select_course_view_progress')}</p>
                
                {courses.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto text-gray-300" size={48} />
                    <p className="text-text font-medium mt-4">{t('no_courses_found')}</p>
                    <p className="text-gray-600 mb-6">{t('create_course_track_progress')}</p>
                    <button
                      onClick={() => navigate('/mentor/create-course')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90"
                    >
                      {t('create_course')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map((course) => (
                      <div
                        key={course._id}
                        onClick={() => selectCourse(course)}
                        className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md cursor-pointer"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                            <BarChart3 className="text-primary" size={20} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-text line-clamp-1">{course.title}</h3>
                            <p className="text-sm text-gray-500">{course.category || 'General'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{course.students?.length || 0} {t('students')}</span>
                          <button className="flex items-center gap-1 text-primary">
                            <span>{t('view_progress')}</span>
                            <Eye size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Progress View */
            <div className="space-y-6">
              {/* Course Info */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center">
                      <BarChart3 className="text-primary" size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-text">{selectedCourse.title}</h2>
                      <p className="text-gray-600">{t('student_progress_tracking')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/mentor/assign-students')}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                  >
                    {t('manage_students')}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">{t('students')}</p>
                      <p className="text-2xl font-bold text-text">{stats.total}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50">
                      <Users className="text-primary" size={20} />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">{t('completed')}</p>
                      <p className="text-2xl font-bold text-text">{stats.completed}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-50">
                      <CheckCircle className="text-success" size={20} />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">{t('avg_progress')}</p>
                      <p className="text-2xl font-bold text-text">{stats.averageProgress}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50">
                      <TrendingUp className="text-secondary" size={20} />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">{t('chapters')}</p>
                      <p className="text-2xl font-bold text-text">{stats.completedChapters}/{stats.totalChapters}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-50">
                      <BookOpen className="text-warning" size={20} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Stats - Materials & Assessments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">{t('materials')} {t('completed')}</p>
                      <p className="text-2xl font-bold text-text">{stats.completedMaterials}/{stats.totalMaterials}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-cyan-50">
                      <FileText className="text-blue-600" size={20} />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">{t('assessments')} {t('completed')}</p>
                      <p className="text-2xl font-bold text-text">{stats.completedAssessments}/{stats.totalAssessments}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50">
                      <Clock className="text-orange-600" size={20} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Search and Actions */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder={t('search_students')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              {/* Progress Details - Detailed Breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-gray-600">{t('loading_progress_data')}</p>
                  </div>
                ) : filteredProgress.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto text-gray-300" size={48} />
                    <p className="text-text font-medium mt-4">{t('no_progress_data_found')}</p>
                    <p className="text-gray-600">
                      {searchTerm ? t('no_students_match_search') : t('no_students_enrolled')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left p-4 font-medium text-sm text-gray-700">{t('student')}</th>
                          <th className="text-left p-4 font-medium text-sm text-gray-700">{t('progress')}</th>
                          <th className="text-left p-4 font-medium text-sm text-gray-700">{t('chapters')}</th>
                          <th className="text-left p-4 font-medium text-sm text-gray-700">{t('materials')}</th>
                          <th className="text-left p-4 font-medium text-sm text-gray-700">{t('assessments')}</th>
                          <th className="text-left p-4 font-medium text-sm text-gray-700">{t('status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProgress.map((item) => (
                          <React.Fragment key={item._id}>
                            <tr 
                              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                              onClick={() => setExpandedStudent(expandedStudent === item._id ? null : item._id)}
                            >
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                                    <span className="font-semibold text-primary">
                                      {item.student.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="font-medium text-text">{item.student.name}</p>
                                    <p className="text-sm text-gray-500">{item.student.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{item.progress.completionPercentage}%</span>
                                  </div>
                                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary"
                                      style={{ width: `${Math.min(100, item.progress.completionPercentage)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="text-sm">
                                  <p className="font-medium">{item.progress.completedChapters}/{item.progress.totalChapters}</p>
                                  <p className="text-gray-500 text-xs">
                                    {item.progress.progressBreakdown?.chapters?.percentage || 0}%
                                  </p>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="text-sm">
                                  <p className="font-medium">{item.progress.completedMaterials}/{item.progress.totalMaterials}</p>
                                  <p className="text-gray-500 text-xs">
                                    {item.progress.progressBreakdown?.materials?.percentage || 0}%
                                  </p>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="text-sm">
                                  <p className="font-medium">{item.progress.completedAssessments}/{item.progress.totalAssessments}</p>
                                  <p className="text-gray-500 text-xs">
                                    {item.progress.progressBreakdown?.assessments?.percentage || 0}%
                                  </p>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.progress.completionPercentage)}`}>
                                    {getStatus(item.progress.completionPercentage)}
                                  </span>
                                  <ChevronDown 
                                    size={16} 
                                    className={`transition-transform ${expandedStudent === item._id ? 'rotate-180' : ''}`}
                                  />
                                </div>
                              </td>
                            </tr>
                            
                            {/* Expanded Details Row */}
                            {expandedStudent === item._id && (
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <td colSpan="6" className="p-6">
                                  <div className="space-y-4">
                                    <h4 className="font-semibold text-text">Progress Details for {item.student.name}</h4>
                                    
                                    {/* Progress Breakdown Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      {/* Chapters */}
                                      <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                                        <div className="flex items-center gap-2 mb-3">
                                          <BookOpen size={18} className="text-yellow-600" />
                                          <h5 className="font-medium text-text">Chapters</h5>
                                        </div>
                                        <p className="text-2xl font-bold text-yellow-600 mb-2">
                                          {item.progress.completedChapters}/{item.progress.totalChapters}
                                        </p>
                                        <div className="w-full h-2 bg-yellow-200 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-yellow-600"
                                            style={{ width: `${Math.min(100, item.progress.progressBreakdown?.chapters?.percentage || 0)}%` }}
                                          />
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">
                                          {item.progress.progressBreakdown?.chapters?.percentage || 0}% Complete
                                        </p>
                                      </div>

                                      {/* Materials */}
                                      <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                                        <div className="flex items-center gap-2 mb-3">
                                          <FileText size={18} className="text-blue-600" />
                                          <h5 className="font-medium text-text">Materials</h5>
                                        </div>
                                        <p className="text-2xl font-bold text-blue-600 mb-2">
                                          {item.progress.completedMaterials}/{item.progress.totalMaterials}
                                        </p>
                                        <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-blue-600"
                                            style={{ width: `${Math.min(100, item.progress.progressBreakdown?.materials?.percentage || 0)}%` }}
                                          />
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">
                                          {item.progress.progressBreakdown?.materials?.percentage || 0}% Complete
                                        </p>
                                      </div>

                                      {/* Assessments */}
                                      <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                                        <div className="flex items-center gap-2 mb-3">
                                          <Clock size={18} className="text-orange-600" />
                                          <h5 className="font-medium text-text">Assessments</h5>
                                        </div>
                                        <p className="text-2xl font-bold text-orange-600 mb-2">
                                          {item.progress.completedAssessments}/{item.progress.totalAssessments}
                                        </p>
                                        <div className="w-full h-2 bg-orange-200 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-orange-600"
                                            style={{ width: `${Math.min(100, item.progress.progressBreakdown?.assessments?.percentage || 0)}%` }}
                                          />
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">
                                          {item.progress.progressBreakdown?.assessments?.percentage || 0}% Complete
                                        </p>
                                      </div>
                                    </div>

                                    {/* Overall Progress */}
                                    <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                                      <h5 className="font-medium text-text mb-3">Overall Progress</h5>
                                      <p className="text-3xl font-bold text-purple-600 mb-3">{item.progress.completionPercentage}%</p>
                                      <div className="w-full h-3 bg-purple-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-purple-600"
                                          style={{ width: `${Math.min(100, item.progress.completionPercentage)}%` }}
                                        />
                                      </div>
                                      <p className="text-sm text-gray-600 mt-2">
                                        {item.progress.totalCompleted} of {item.progress.totalItems} items completed
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-bold text-text mb-4">{t('progress_summary')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-gray-600 mb-2">Overall Completion Rate</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success"
                          style={{ width: `${Math.min(100, stats.total > 0 ? (stats.completed / stats.total) * 100 : 0)}%` }}
                        />
                      </div>
                      <span className="font-medium">
                        {Math.min(100, stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0)}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-2">Average Progress</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, stats.averageProgress)}%` }}
                        />
                      </div>
                      <span className="font-medium">{Math.min(100, stats.averageProgress)}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-2">Course Content Status</p>
                    <p className="text-sm">
                      <span className="font-medium">{stats.totalChapters}</span> {t('chapters')} • 
                      <span className="font-medium ml-1">{stats.totalMaterials}</span> {t('materials')} • 
                      <span className="font-medium ml-1">{stats.totalAssessments}</span> {t('assessments')}
                    </p>
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

export default Progress;