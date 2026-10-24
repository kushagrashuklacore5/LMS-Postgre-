import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import StudentLayout from "../../components/StudentLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { BookOpen, ArrowLeft } from "lucide-react";

const StudentClassroom = () => {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const { token, API } = useAuth();
  const { t } = useTranslation();

  const [courses, setCourses] = useState([]);
  const [classroom, setClassroom] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClassroomCourses = async () => {
      try {
        setLoading(true);

        // 🔹 get all courses of this classroom
        const response = await axios.get(
          `${API}/courses/classroom/${classroomId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = Array.isArray(response.data) ? response.data : [];
        setCourses(data);

        // derive classroom info from courses
        if (data.length > 0 && data[0].classroom) {
          setClassroom(data[0].classroom);
        }
      } catch (error) {
        console.error("CLASSROOM FETCH ERROR:", error);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchClassroomCourses();
  }, [classroomId, token, API]);

  if (loading) {
    return (
      <StudentLayout><div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div></StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {classroom?.name || t('classroom')}
            </h1>
            <p className="text-gray-500">
              {t('all_courses_in_classroom')}
            </p>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 border px-4 py-2 rounded"
          >
            <ArrowLeft size={18} /> {t('back')}
          </button>
        </div>

        {/* COURSES */}
        {courses.length === 0 ? (
          <p className="text-gray-500">{t('no_courses_available')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <Link
                key={course._id}
                to={`/student/course/${course._id}`}
                className="bg-white border rounded-xl p-5 hover:shadow transition"
              >
                <div className="flex justify-between mb-2">
                  <BookOpen className="text-primary" />
                </div>

                <h3 className="font-semibold mb-2">
                  {course.title}
                </h3>

                <p className="text-sm text-gray-500">
                  Mentor: {course.mentorId?.name || "Mentor"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentClassroom;
