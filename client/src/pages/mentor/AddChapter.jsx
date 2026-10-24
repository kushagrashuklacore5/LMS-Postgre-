import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../../auth/auth';
import MentorLayout from '../../components/MentorLayout';
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Video,
  Image as ImageIcon,
  ChevronRight,
  ArrowLeft,
  Link,
  Eye,
  X
} from 'lucide-react';

const AddChapter = () => {
  const navigate = useNavigate();
  const { token, API } = useAuth();
  const { t } = useTranslation();

  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imageModal, setImageModal] = useState({ open: false, url: "" });

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    imageUrl: "",
    videoUrl: "",
    order: 1,
    file: null // Added file
  });

  const [editingChapter, setEditingChapter] = useState(null);

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
        throw new Error(t('could_not_load_courses'));
      }

      const data = await response.json();
      setCourses(data);

    } catch (error) {
      toast.error(t('failed_load_courses'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getChapters = async (courseId) => {
    try {
      const response = await fetch(`${API}/chapters/get-chapters?courseId=${courseId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('could_not_load_chapters'));
      }

      const data = await response.json();
      const sortedChapters = data.sort((a, b) => a.order - b.order);
      setChapters(sortedChapters);

    } catch (error) {
      toast.error(t('failed_load_chapters'));
      console.error(error);
    }
  };

  const selectCourse = (course) => {
    setSelectedCourse(course);
    getChapters(course._id);
    resetForm();
  };

  const goBackToCourses = () => {
    setSelectedCourse(null);
    setChapters([]);
    setEditingChapter(null);
    resetForm();
  };

  const handleInputChange = (e) => {
    if (e.target.name === 'file') {
      setFormData({ ...formData, file: e.target.files[0] });
    } else {
      setFormData({
        ...formData,
        [e.target.name]: e.target.value
      });
    }
  };

  const getNextOrder = () => {
    if (chapters.length === 0) return 1;
    return Math.max(...chapters.map(chapter => chapter.order)) + 1;
  };

  const saveChapter = async (e) => {
    e.preventDefault();

    if (!formData.title || !formData.videoUrl) {
      toast.error(t('title_video_required'));
      return;
    }

    try {
      const url = editingChapter
        ? `${API}/chapters/update-chapter/${editingChapter._id}`
        : `${API}/chapters/create-chapter`;

      const method = editingChapter ? 'PUT' : 'POST';
      const body = new FormData();
      body.append('title', formData.title);
      body.append('description', formData.description);
      body.append('imageUrl', formData.imageUrl);
      body.append('videoUrl', formData.videoUrl);
      body.append('order', editingChapter ? formData.order : getNextOrder());

      if (!editingChapter) {
        body.append('courseId', selectedCourse._id);
      }

      if (formData.file) {
        body.append('file', formData.file);
      }

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: body,
      });

      if (!response.ok) {
        throw new Error('Failed to save chapter');
      }

      toast.success(editingChapter ? t('chapter_updated') : t('chapter_created'));
      // Observed by GuideBot (ActionGuard) only — after the create request succeeded.
      if (!editingChapter) window.dispatchEvent(new CustomEvent('guidebot:action-success', { detail: { actionId: 'chapter-created' } }));

      getChapters(selectedCourse._id);
      resetForm();

    } catch (error) {
      toast.error(t('failed_create_chapter'));
      console.error(error);
    }
  };

  const editChapter = (chapter) => {
    setEditingChapter(chapter);
    setFormData({
      title: chapter.title,
      description: chapter.description || "",
      imageUrl: chapter.imageUrl || "",
      videoUrl: chapter.videoUrl,
      order: chapter.order,
    });
  };

  const deleteChapter = async (chapterId) => {
    if (!confirm(t('confirm_delete_chapter'))) return;

    try {
      const response = await fetch(`${API}/chapters/delete-chapter/${chapterId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete chapter');
      }

      toast.success(t('chapter_deleted'));
      getChapters(selectedCourse._id);

      if (editingChapter && editingChapter._id === chapterId) {
        resetForm();
      }

    } catch (error) {
      toast.error(t('failed_delete_chapter'));
      console.error(error);
    }
  };

  const resetForm = () => {
    setEditingChapter(null);
    setFormData({
      title: "",
      description: "",
      imageUrl: "",
      videoUrl: "",
      order: getNextOrder(),
    });
  };

  const openLink = (url) => {
    window.open(url, '_blank');
  };

  const openImage = (url) => {
    setImageModal({ open: true, url });
  };

  const closeImageModal = () => {
    setImageModal({ open: false, url: "" });
  };

  if (loading) {
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
          <div data-tour="add-chapter-page" className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-text">{t('manage_chapters')}</h1>
                <p className="text-gray-600 mt-1">
                  {selectedCourse
                    ? `${t('chapters_for')}: ${selectedCourse.title}`
                    : t('select_course_manage_chapters')}
                </p>
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
                <p className="text-gray-600 mb-6">Select a course to add or manage chapters</p>

                {courses.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto text-gray-300" size={48} />
                    <p className="text-text font-medium mt-4">No courses found</p>
                    <p className="text-gray-600 mb-6">Create your first course to add chapters</p>
                    <button
                      onClick={() => navigate('/mentor/create-course')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90"
                    >
                      <Plus size={18} />
                      {t('create_course_button')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map((course, courseIndex) => (
                      <div
                        key={course._id}
                        data-tour={courseIndex === 0 ? 'chapter-course-block' : undefined}
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
                          <span className="text-gray-600">{course.students?.length || 0} {t('students')}</span>
                          <button data-tour={courseIndex === 0 ? 'chapter-course-select' : undefined} className="flex items-center gap-1 text-primary">
                            <span>{t('select')}</span>
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Chapter Management View */
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chapters List */}
                <div className="lg:col-span-2">
                  <div data-tour="chapters-panel" className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-text">Chapters</h2>
                      <div className="text-sm text-gray-600">
                        {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {chapters.length === 0 ? (
                      <div className="text-center py-8">
                        <BookOpen className="mx-auto text-gray-300" size={32} />
                        <p className="text-text font-medium mt-4">No chapters yet</p>
                        <p className="text-gray-600">Add your first chapter below</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chapters.map((chapter) => (
                          <div key={chapter._id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-0.5 bg-blue-50 text-primary text-sm rounded">
                                    {chapter.order}
                                  </span>
                                  <h3 className="font-medium text-text">{chapter.title}</h3>
                                </div>
                                {chapter.description && (
                                  <p className="text-gray-600 text-sm line-clamp-2">{chapter.description}</p>
                                )}

                                {/* Links Section */}
                                <div className="mt-3 space-y-2">
                                  {chapter.videoUrl && (
                                    <div className="flex items-center gap-2">
                                      <Video className="text-primary" size={14} />
                                      <button
                                        onClick={() => openLink(chapter.videoUrl)}
                                        className="text-sm text-primary hover:text-secondary flex items-center gap-1"
                                      >
                                        <Link size={12} />
                                        <span className="truncate max-w-[200px]">Watch Video</span>
                                        <Eye size={12} />
                                      </button>
                                    </div>
                                  )}

                                  {chapter.imageUrl && (
                                    <div className="flex items-center gap-2">
                                      <ImageIcon className="text-primary" size={14} />
                                      <button
                                        onClick={() => openImage(chapter.imageUrl)}
                                        className="text-sm text-primary hover:text-secondary flex items-center gap-1"
                                      >
                                        <Link size={12} />
                                        <span className="truncate max-w-[200px]">View Image</span>
                                        <Eye size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => editChapter(chapter)}
                                  className="p-1.5 text-primary hover:bg-blue-50 rounded"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteChapter(chapter._id)}
                                  className="p-1.5 text-danger hover:bg-red-50 rounded"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Add/Edit Form */}
                <div>
                  <div data-tour="add-chapter-form" className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-xl font-bold text-text mb-4">
                      {editingChapter ? 'Edit Chapter' : 'Add Chapter'}
                    </h2>

                    <form onSubmit={saveChapter}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-text mb-2">Title</label>
                          <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="Chapter title"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text mb-2">Description</label>
                          <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="Chapter description"
                            rows="3"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text mb-2">Video URL</label>
                          <div className="relative">
                            <Video className="absolute left-3 top-3 text-gray-400" size={18} />
                            <input
                              type="url"
                              name="videoUrl"
                              value={formData.videoUrl}
                              onChange={handleInputChange}
                              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="https://example.com/video"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text mb-2">Image URL (Optional)</label>
                          <div className="relative">
                            <ImageIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                            <input
                              type="url"
                              name="imageUrl"
                              value={formData.imageUrl}
                              onChange={handleInputChange}
                              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="https://example.com/image.jpg"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text mb-2">Order</label>
                          <input
                            type="number"
                            name="order"
                            value={formData.order}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="Sequence number"
                            min="1"
                            required
                          />
                          <p className="text-sm text-gray-500 mt-1">
                            Next available: {getNextOrder()}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text mb-2">Import File (Optional)</label>
                          <input
                            type="file"
                            name="file"
                            onChange={handleInputChange}
                            className="w-full text-sm text-gray-500
                              file:mr-4 file:py-2.5 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-primary/10 file:text-primary
                              hover:file:bg-primary/20
                            "
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Upload documents, slides, or other resources.
                          </p>
                        </div>

                        <div className="space-y-3 pt-4">
                          <button
                            type="submit"
                            className="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90"
                          >
                            {editingChapter ? 'Update Chapter' : 'Add Chapter'}
                          </button>

                          {editingChapter && (
                            <button
                              type="button"
                              onClick={resetForm}
                              className="w-full px-4 py-2.5 border border-gray-300 text-text rounded-lg hover:bg-gray-50"
                            >
                              Cancel Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Course Info */}
                  <div className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-5">
                    <h3 className="font-medium text-text mb-3">Course Info</h3>
                    <div className="space-y-2 text-sm text-gray-600">
                      <p><span className="font-medium">Title:</span> {selectedCourse.title}</p>
                      <p><span className="font-medium">Category:</span> {selectedCourse.category || 'General'}</p>
                      <p><span className="font-medium">Students:</span> {selectedCourse.students?.length || 0}</p>
                      <p><span className="font-medium">Chapters:</span> {chapters.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Image Modal */}
              {imageModal.open && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="font-medium text-text">Image Preview</h3>
                      <button
                        onClick={closeImageModal}
                        className="p-1 text-gray-500 hover:text-text"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="p-4 flex items-center justify-center bg-gray-100 min-h-[400px]">
                      <img
                        src={imageModal.url}
                        alt="Chapter image"
                        className="max-w-full max-h-[70vh] object-contain rounded-lg"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "https://via.placeholder.com/400x300?text=Image+not+found";
                        }}
                      />
                    </div>
                    <div className="p-4 border-t border-gray-200 text-center">
                      <p className="text-sm text-gray-600 break-all">{imageModal.url}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MentorLayout>
  );
};

export default AddChapter;