import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { toast } from "react-toastify";
import { Plus, Trash2, FileText, Film, Link as LinkIcon, Download, ArrowLeft } from "lucide-react";
import { fileLink } from "../../config/api";

const CourseMaterialsUpload = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { API, token, user } = useAuth();
  const { t } = useTranslation();

  const [course, setCourse] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "video_link", // Default to link
    linkUrl: "",
    description: "",
    file: null
  });

  // ✅ FETCH COURSE DATA AND MATERIALS
  useEffect(() => {
    fetchCourseAndMaterials();
  }, [courseId]);

  const fetchCourseAndMaterials = async () => {
    try {
      setLoading(true);

      // Fetch course details
      const courseRes = await fetch(`${API}/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (courseRes.ok) {
        const courseData = await courseRes.json();
        setCourse(courseData);
      }

      // Fetch materials
      const materialsRes = await fetch(`${API}/materials/course/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (materialsRes.ok) {
        const materialsData = await materialsRes.json();
        setMaterials(materialsData || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load course or materials");
    } finally {
      setLoading(false);
    }
  };

  // ✅ HANDLE FORM CHANGES
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // ✅ HANDLE FILE SELECTION
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        file: file
      }));
    }
  };

  // ✅ HANDLE MATERIAL UPLOAD
  const handleUploadMaterial = async (e) => {
    e.preventDefault();

    if (!formData.title) {
      toast.error("Material title is required");
      return;
    }

    if (formData.type === "video" || formData.type === "pdf" || formData.type === "file") {
      if (!formData.file) {
        toast.error("Please select a file to upload");
        return;
      }
    } else if (formData.type === "video_link" || formData.type === "pdf_link") {
      if (!formData.linkUrl) {
        toast.error("Please enter a link URL");
        return;
      }
    }

    try {
      setUploading(true);

      const uploadFormData = new FormData();
      uploadFormData.append("courseId", courseId);
      uploadFormData.append("title", formData.title);
      uploadFormData.append("type", formData.type);
      uploadFormData.append("description", formData.description);

      if (formData.type === "video" || formData.type === "pdf" || formData.type === "file") {
        uploadFormData.append("file", formData.file);
      } else {
        uploadFormData.append("linkUrl", formData.linkUrl);
      }

      const response = await fetch(`${API}/materials/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: uploadFormData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload material");
      }

      const newMaterial = await response.json();
      setMaterials([newMaterial.material, ...materials]);

      // Reset form
      setFormData({
        title: "",
        type: "video_link",
        linkUrl: "",
        description: "",
        file: null
      });

      setShowUploadForm(false);
      toast.success("Material uploaded successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload material");
    } finally {
      setUploading(false);
    }
  };

  // ✅ HANDLE MATERIAL DELETION
  const handleDeleteMaterial = async (materialId) => {
    if (!window.confirm("Are you sure you want to delete this material?")) {
      return;
    }

    try {
      const response = await fetch(`${API}/materials/${materialId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setMaterials(materials.filter(m => m.id !== materialId));
        toast.success("Material deleted successfully");
      } else {
        toast.error("Failed to delete material");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Error deleting material");
    }
  };

  // ✅ GET MATERIAL ICON
  const getMaterialIcon = (type) => {
    switch (type) {
      case "video":
      case "video_link":
        return <Film className="w-6 h-6 text-red-500" />;
      case "pdf":
      case "pdf_link":
        return <FileText className="w-6 h-6 text-red-600" />;
      case "file":
        return <FileText className="w-6 h-6 text-blue-500" />;
      default:
        return <LinkIcon className="w-6 h-6 text-green-500" />;
    }
  };

  if (loading) {
    return (
      <MentorLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </MentorLayout>
    );
  }

  return (
    <MentorLayout>
      <div className="max-w-6xl mx-auto p-6">
        {/* HEADER */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft size={20} /> Back
          </button>

          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold">{course?.title || "Course Materials"}</h1>
              <p className="text-gray-600 mt-2">{course?.description}</p>
            </div>
            <button
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={20} /> Add Material
            </button>
          </div>
        </div>

        {/* UPLOAD FORM */}
        {showUploadForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">Upload Course Material</h2>

            <form onSubmit={handleUploadMaterial} className="space-y-6">
              {/* Material Title */}
              <div>
                <label className="block text-sm font-semibold mb-2">Material Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleFormChange}
                  placeholder="e.g., Lecture 1: Introduction"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Material Type */}
              <div>
                <label className="block text-sm font-semibold mb-2">Material Type *</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="video_link">Video Link (YouTube, Vimeo, etc.)</option>
                  <option value="pdf_link">PDF Link</option>
                  <option value="video">Upload Video File</option>
                  <option value="pdf">Upload PDF</option>
                  <option value="file">Upload Other File</option>
                </select>
              </div>

              {/* Link URL or File Upload */}
              {(formData.type === "video_link" || formData.type === "pdf_link") ? (
                <div>
                  <label className="block text-sm font-semibold mb-2">Link URL *</label>
                  <input
                    type="url"
                    name="linkUrl"
                    value={formData.linkUrl}
                    onChange={handleFormChange}
                    placeholder="https://example.com/video.mp4"
                    className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold mb-2">Select File *</label>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    accept={
                      formData.type === "video" ? "video/*" :
                      formData.type === "pdf" ? ".pdf" :
                      "*/*"
                    }
                  />
                  {formData.file && (
                    <p className="text-sm text-green-600 mt-2">📎 {formData.file.name}</p>
                  )}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold mb-2">Description (Optional)</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  placeholder="Add a description or notes about this material..."
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="4"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold transition"
                >
                  {uploading ? "Uploading..." : "Upload Material"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadForm(false)}
                  className="flex-1 bg-gray-300 text-gray-800 py-3 rounded-lg hover:bg-gray-400 font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MATERIALS LIST */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Uploaded Materials ({materials.length})</h2>

          {materials.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg mb-4">No materials uploaded yet</p>
              <button
                onClick={() => setShowUploadForm(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Upload First Material
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {materials.map((material) => (
                <div
                  key={material.id}
                  className="border border-gray-300 rounded-lg p-6 hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {getMaterialIcon(material.type)}
                      <div>
                        <h3 className="text-lg font-semibold">{material.title}</h3>
                        <p className="text-sm text-gray-500 capitalize">{material.type}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteMaterial(material.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Delete material"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {material.description && (
                    <p className="text-gray-600 text-sm mb-4">{material.description}</p>
                  )}

                  {material.fileUrl && (
                    <div className="mb-4">
                      <a
                        href={fileLink(material.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-semibold"
                      >
                        <Download size={16} /> Download File
                      </a>
                    </div>
                  )}

                  {material.linkUrl && (
                    <div className="mb-4">
                      <a
                        href={material.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-semibold"
                      >
                        <LinkIcon size={16} /> Open Link
                      </a>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-4 pt-4 border-t">
                    <p>Uploaded by: {material.uploadedByName}</p>
                    <p>Date: {new Date(material.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MentorLayout>
  );
};

export default CourseMaterialsUpload;
