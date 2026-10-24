import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { toast } from "react-toastify";
import { Plus, Edit, Eye, Trash2, BookOpen } from "lucide-react";
import io from "socket.io-client";
import { fileLink } from "../../config/api";

const MentorCourseDetails = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const { API, token } = useAuth();
    const { t } = useTranslation();

    const [course, setCourse] = useState(null);
    const [assessments, setAssessments] = useState([]);
    const [studentProgress, setStudentProgress] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCourseData();
        // Connect to the backend, not the page origin (the Vite dev server).
        const socket = io(API.replace(/\/api\/?$/, ""), {
          transports: ["websocket", "polling"],
          // the server only sends realtime events to sockets that carry a valid session
          auth: { token: localStorage.getItem("token") || undefined }
        });
        const onProgress = (data) => {
            if (data.courseId === courseId) {
                fetchCourseData();
            }
        };
        const onAssessment = (data) => {
            if (data.courseId === courseId) {
                fetchCourseData();
            }
        };
        socket.on("course-progress-updated", onProgress);
        socket.on("assessment-submitted", onAssessment);
        return () => {
            socket.off("course-progress-updated", onProgress);
            socket.off("assessment-submitted", onAssessment);
            socket.disconnect();
        };
    }, [courseId]);

    const fetchCourseData = async () => {
        try {
            setLoading(true);
            // Fetch Course
            const courseRes = await fetch(`${API}/courses/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (courseRes.ok) {
                const courseData = await courseRes.json();
                setCourse(courseData);
            }

            // Fetch Assessments
            const assessmentRes = await fetch(`${API}/assessments/course/${courseId}/all`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (assessmentRes.ok) {
                const assessmentData = await assessmentRes.json();
                setAssessments(assessmentData);
            }

            // Fetch Student Progress
            const progressRes = await fetch(`${API}/progress/mentor?courseId=${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (progressRes.ok) {
                const progressData = await progressRes.json();
                // Filter only for this course since endpoint returns all mentor courses data
                // Use course.id for SQLite compatibility (not course._id)
                const filteredProgress = Array.isArray(progressData) ? progressData.filter(p => p.course && p.course.id === courseId) : [];
                setStudentProgress(filteredProgress);
            }

            // ✅ Fetch Course Materials
            const materialsRes = await fetch(`${API}/materials/course/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (materialsRes.ok) {
                const materialsData = await materialsRes.json();
                setMaterials(materialsData || []);
            }

        } catch (error) {
            console.error(error);
            toast.error("Failed to load course details");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAssessment = () => {
        navigate("/mentor/create-assessment", { state: { courseId } });
    };

    if (loading) return <MentorLayout>Loading...</MentorLayout>;
    if (!course) return <MentorLayout>Course not found</MentorLayout>;

    return (
        <MentorLayout>
            <div className="max-w-6xl mx-auto p-6">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">{course.title}</h1>
                        <p className="text-gray-500">{course.description}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate(`/mentor/course/${courseId}/materials`)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            <BookOpen size={20} /> Manage Materials
                        </button>
                        <button
                            onClick={handleCreateAssessment}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                        >
                            <Plus size={20} /> Create Assessment
                        </button>
                    </div>
                </div>

                {/* ✅ MATERIALS SECTION */}
                {materials.length > 0 && (
                    <div className="bg-white rounded-xl shadow p-6 mb-8">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">📚 Course Materials ({materials.length})</h2>
                            <button
                                onClick={() => navigate(`/mentor/course/${courseId}/materials`)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                            >
                                View All →
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {materials.slice(0, 4).map((material) => (
                                <div key={material.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                                    <div className="flex items-start gap-3">
                                        <div>
                                            <h3 className="font-semibold text-sm">{material.title}</h3>
                                            <p className="text-xs text-gray-500 mt-1">Type: {material.type}</p>
                                            {material.fileUrl && (
                                                <a href={fileLink(material.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 block">
                                                    📥 Download
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow p-6 mb-8">
                    <h2 className="text-xl font-bold mb-4">Student Progress</h2>

                    {studentProgress.length === 0 ? (
                        <p className="text-gray-500">No students enrolled or no progress recorded yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chapters Completed</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {studentProgress.map((record, index) => (
                                        <tr key={index}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{record.student.name}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-500">{record.student.email}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{record.progress.completedChapters} / {record.progress.totalChapters}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="w-full bg-gray-200 rounded-full h-2.5 max-w-[100px] overflow-hidden">
                                                    <div className="bg-primary h-2.5 rounded-full" style={{ width: `${Math.min(100, record.progress.completionPercentage || 0)}%`, maxWidth: '100%' }}></div>
                                                </div>
                                                <span className="text-xs text-gray-500 mt-1 inline-block">{Math.min(100, record.progress.completionPercentage || 0)}%</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow p-6">
                    <h2 className="text-xl font-bold mb-4">Assessments</h2>

                    {assessments.length === 0 ? (
                        <p className="text-gray-500">No assessments created yet.</p>
                    ) : (
                        <div className="space-y-4">
                            {assessments.map(a => (
                                <div key={a._id} className="border rounded-lg p-4 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-semibold text-lg">{a.title}</h3>
                                        <div className="text-sm text-gray-500 flex gap-4 mt-1">
                                            <span>{a.questions?.length || 0} Questions</span>
                                            <span>{a.isPublished ? "✅ Published" : "Draft"}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => navigate(`/mentor/assessment/${a._id}`)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                                            title="Edit/Design"
                                        >
                                            <Edit size={18} />
                                        </button>
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

export default MentorCourseDetails;
