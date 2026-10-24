import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth";
import StudentLayout from "../../components/StudentLayout";
import { useTranslation } from "../../context/TranslationContext";
import { Calendar, AlertCircle } from "lucide-react";
import { toast } from "react-toastify";

const TimetableCard = ({ classroom, API }) => {
  const [showImage, setShowImage] = useState(false);

  return (
    <div key={classroom._id} className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="p-6 border-b">
        <h2 className="text-xl font-bold">
          {classroom.name} {classroom.section && `- ${classroom.section}`}
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          {t('class_teacher')}: {classroom.classTeacher?.name || "Not Assigned"}
        </p>
      </div>

      <div className="p-6">
        {classroom.timetable ? (
          <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            {!showImage ? (
              <>
                <Calendar className="w-16 h-16 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('timetable_available')}</h3>
                <p className="text-gray-500 mb-6 text-center max-w-md">
                  {t('view_timetable')}
                </p>
                <button
                  onClick={() => setShowImage(true)}
                  className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-sm font-medium flex items-center gap-2"
                >
                  {t('view_timetable')}
                </button>
              </>
            ) : (
              <div className="w-full flex flex-col items-center">
                <button
                  onClick={() => setShowImage(false)}
                  className="mb-4 text-sm text-gray-500 hover:text-primary underline"
                >
                  {t('hide_timetable')}
                </button>
                {classroom.timetable.toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={`${API.replace("/api", "")}${classroom.timetable}`}
                    className="w-full h-96 border rounded shadow-lg"
                    title="Timetable PDF"
                  ></iframe>
                ) : (
                  <img
                    src={`${API.replace("/api", "")}${classroom.timetable}`}
                    alt="Timetable"
                    className="max-w-full rounded shadow-lg border"
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
            {t('no_timetable_uploaded')}
          </div>
        )}
      </div>
    </div>
  );
};

const Timetable = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const fetchClassrooms = async () => {
    try {
      const res = await fetch(`${API}/classrooms/student-classrooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClassrooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error(t('failed_to_load_assessment'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <StudentLayout><div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">
        <div className="p-8 text-center text-gray-500">{t('loading_courses')}...</div>
      </div></StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Calendar className="text-primary" /> {t('timetable')}
        </h1>

        {classrooms.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">You are not assigned to any classroom yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {classrooms.map((classroom) => (
              <TimetableCard key={classroom._id} classroom={classroom} API={API} />
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default Timetable;
