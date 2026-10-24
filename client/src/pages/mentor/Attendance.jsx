import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { toast } from "react-toastify";
import { Check, X, User } from "lucide-react";

const Attendance = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const [students, setStudents] = useState([]);
  const [classroomId, setClassroomId] = useState(null);
  const [records, setRecords] = useState({}); // Map of studentId -> status
  const date = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const fetchClassroom = async () => {
      try {
        const res = await fetch(`${API}/classrooms/mentor/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        const classrooms = data.data || data;

        if (!Array.isArray(classrooms) || classrooms.length === 0) {
          toast.error("No classroom found");
          return;
        }

        const firstClassroom = classrooms[0];
        setClassroomId(firstClassroom.id);
        
        // Fetch all students for attendance
        try {
          const studentsRes = await fetch(`${API}/users?role=student`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const studentsData = await studentsRes.json();
          const studentsList = studentsData.data || studentsData;
          
          // Filter to only show students (not admins, mentors, etc.)
          const filteredStudents = Array.isArray(studentsList) 
            ? studentsList.filter(user => user.role === 'student')
            : [];
          
          setStudents(filteredStudents);

          // Initialize all as present
          const initialRecords = {};
          if (Array.isArray(filteredStudents)) {
            filteredStudents.forEach(s => {
              initialRecords[s.id || s._id] = "present";
            });
          }
          setRecords(initialRecords);
        } catch {
          console.error("Failed to fetch students:", err);
          toast.error(t('failed_to_load_students'));
        }

      } catch {
        toast.error(t('failed_to_load_classroom'));
      }
    };

    fetchClassroom();
  }, []);

  const handleStatusChange = (studentId, status) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const markAll = (status) => {
    const newRecords = {};
    students.forEach(s => {
      newRecords[s._id] = status;
    });
    setRecords(newRecords);
  };

  const saveAttendance = async () => {
    try {
      if (!classroomId) {
        toast.error(t('classroom_not_loaded'));
        return;
      }

      const attendanceData = Object.keys(records).map(studentId => ({
        studentId,
        status: records[studentId]
      }));

      const res = await fetch(`${API}/attendance/mark`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroomId,
          date,
          attendanceData
        }),
      });

      if (!res.ok) throw new Error();
      toast.success(t('attendance_saved_successfully'));
    } catch {
      toast.error(t('failed_to_save_attendance'));
    }
  };

  return (
    <MentorLayout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('attendance_sheet')}</h1>
          <div className="text-gray-600 font-medium bg-white px-4 py-2 rounded-lg border">
            {t('date_colon')} {date}
          </div>
        </div>

        {students.length === 0 ? (
          <div className="bg-white p-8 rounded-xl text-center text-gray-500 shadow-sm">
            {t('no_students_in_classroom')}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
            {/* Toolbar */}
            <div className="p-4 bg-gray-50 border-b flex gap-3">
              <button
                onClick={() => markAll("present")}
                className="text-sm px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-medium transition-colors"
              >
                {t('mark_all_present')}
              </button>
              <button
                onClick={() => markAll("absent")}
                className="text-sm px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium transition-colors"
              >
                {t('mark_all_absent')}
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b font-semibold text-gray-600 text-sm uppercase tracking-wider">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-6">{t('student_details')}</div>
              <div className="col-span-5 text-center">{t('status')}</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {students.map((student, index) => (
                <div key={student._id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50 transition-colors">
                  <div className="col-span-1 text-center font-medium text-gray-500">
                    {index + 1}
                  </div>
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{student.name}</p>
                      <p className="text-sm text-gray-500">{student.email}</p>
                    </div>
                  </div>
                  <div className="col-span-5 flex justify-center gap-4">
                    <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer border transition-all ${records[student._id] === 'present' ? 'bg-green-50 border-green-200 text-green-700' : 'border-transparent hover:bg-gray-100'}`}>
                      <input
                        type="radio"
                        name={`status-${student._id}`}
                        checked={records[student._id] === "present"}
                        onChange={() => handleStatusChange(student._id, "present")}
                        className="accent-green-600 w-4 h-4"
                      />
                      <span className="font-medium">{t('present')}</span>
                    </label>

                    <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer border transition-all ${records[student._id] === 'absent' ? 'bg-red-50 border-red-200 text-red-700' : 'border-transparent hover:bg-gray-100'}`}>
                      <input
                        type="radio"
                        name={`status-${student._id}`}
                        checked={records[student._id] === "absent"}
                        onChange={() => handleStatusChange(student._id, "absent")}
                        className="accent-red-600 w-4 h-4"
                      />
                      <span className="font-medium">{t('absent')}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={saveAttendance}
            className="bg-primary text-white px-8 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <Check size={20} />
            {t('save_attendance_sheet')}
          </button>
        </div>
      </div>
    </MentorLayout>
  );
};

export default Attendance;
