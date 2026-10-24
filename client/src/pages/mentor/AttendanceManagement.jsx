import { useEffect, useState } from "react";
import MentorLayout from "../../components/MentorLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import { Download, Save, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import SpeedAttendanceBar from "../../components/mentor/SpeedAttendanceBar";

const AttendanceManagement = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const classroomIdFromUrl = searchParams.get('classroomId');

  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Unwrap API response
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

  // Fetch Assigned Classrooms
  const fetchClassrooms = async (preselectedId = null) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      console.log('Fetching classrooms from /classrooms/mentor/me');
      const res = await fetch(`${API}/classrooms/mentor/me`, {
        headers: headers,
      });

      if (!res.ok) {
        console.error('Response status:', res.status);
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log('Classrooms response:', data);
      const classroomsList = unwrapResponse(data);
      console.log('Unwrapped classrooms:', classroomsList);
      const list = Array.isArray(classroomsList) ? classroomsList : [];
      setClassrooms(list);

      const targetId = preselectedId || (list.length > 0 ? list[0].id : null);
      if (targetId) {
        console.log('Selecting classroom ID:', targetId);
        setSelectedClassroom(targetId);
        fetchStudents(targetId);
      }
    } catch (err) {
      console.error("Failed to fetch classrooms:", err);
      toast.error(t('failed_to_load_classrooms'));
    } finally {
      setLoading(false);
    }
  };

  // Fetch Students for Classroom
  const fetchStudents = async (classroomId) => {
    try {
      if (!classroomId) return;
      console.log('Fetching students for classroom:', classroomId);
      const res = await fetch(`${API}/classrooms/${classroomId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.error('Students fetch response status:', res.status);
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const studentList = unwrapResponse(data);
      
      const processedStudents = (Array.isArray(studentList) ? studentList : []).map(s => ({
        ...s,
        id: s.id || s._id,
        _id: s._id || s.id,
        name: s.name || s.studentName || 'Student'
      }));
      
      setStudents(processedStudents);

      // Initialize default attendance
      const initialAttendance = {};
      processedStudents.forEach(student => {
        initialAttendance[student.id] = "present";
      });
      setAttendanceData(initialAttendance);

      // Fetch existing attendance for this classroom and date
      fetchAttendanceForDate(classroomId, processedStudents);
    } catch (err) {
      console.error("Failed to fetch students for classroom:", err);
      toast.error(t('failed_to_load_students'));
      setStudents([]);
      setAttendanceData({});
    }
  };

  // Fetch Existing Attendance
  const fetchAttendanceForDate = async (classroomId, currentStudents) => {
    try {
      if (!classroomId) return;
      const studentList = currentStudents || students;
      const res = await fetch(
        `${API}/attendance/classroom/${classroomId}/date/${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const existingAttendance = unwrapResponse(data);
        const attendanceMap = {};
        
        studentList.forEach(student => {
          const studentId = student.id || student._id;
          const record = Array.isArray(existingAttendance)
            ? existingAttendance.find(a => Number(a.studentId) === Number(studentId))
            : null;
          attendanceMap[studentId] = record?.status || "present";
        });

        setAttendanceData(attendanceMap);
      }
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  };

  // Handle Classroom Change
  const handleClassroomChange = (classroomId) => {
    setSelectedClassroom(classroomId);
    fetchStudents(classroomId);
  };

  // Handle Attendance Change
  const handleAttendanceChange = (studentId, status) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  // Save Attendance
  const handleSaveAttendance = async () => {
    if (!selectedClassroom) {
      toast.error(t('please_select_classroom'));
      return;
    }

    try {
      setSaving(true);
      console.log('Saving attendance for classroom:', selectedClassroom, 'Date:', selectedDate);

      const attendanceArray = students.map(student => ({
        studentId: student.id || student._id,
        status: attendanceData[student.id || student._id] || "present"
      }));

      console.log('Attendance data to save:', attendanceArray);

      const res = await fetch(`${API}/attendance/mark`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroomId: selectedClassroom,
          date: selectedDate,
          attendanceData: attendanceArray,
        }),
      });

      const responseData = await res.json();
      console.log('Backend response:', responseData);

      if (!res.ok) throw new Error(responseData.message || t('failed_to_save_attendance'));

      // Show success with details
      const presentCount = attendanceArray.filter(a => a.status === 'present').length;
      const absentCount = attendanceArray.filter(a => a.status === 'absent').length;
      toast.success(`Attendance saved successfully! ${presentCount} present, ${absentCount} absent`);
      
      // Refresh attendance data after successful save
      console.log('Refreshing attendance data...');
      fetchAttendanceForDate(selectedClassroom);
      
    } catch (err) {
      console.error("Error saving attendance:", err);
      toast.error(err.message || t('failed_to_save_attendance'));
    } finally {
      setSaving(false);
    }
  };

  // Download Attendance Excel
  const handleDownloadExcel = async () => {
    if (!selectedClassroom) {
      toast.error(t('please_select_classroom'));
      return;
    }

    try {
      const res = await fetch(
        `${API}/attendance/download?classroomId=${selectedClassroom}&startDate=${selectedDate}&endDate=${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('failed_to_download_file'));
      }

      // Get the blob from response
      const blob = await res.blob();
      
      // Check if response is actually an Excel file
      if (!blob.type.includes('spreadsheet') && !blob.type.includes('sheet')) {
        throw new Error(t('invalid_file_format'));
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-${selectedDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success(t('file_downloaded_successfully'));
    } catch (err) {
      console.error("Error downloading file:", err);
      toast.error(err.message || t('failed_to_download_file'));
    }
  };

  useEffect(() => {
    if (classroomIdFromUrl) {
      console.log('Classroom ID from URL:', classroomIdFromUrl);
      const classroomId = parseInt(classroomIdFromUrl, 10);
      fetchClassrooms(classroomId);
    } else {
      fetchClassrooms();
    }
  }, [classroomIdFromUrl, API, token]);

  useEffect(() => {
    if (selectedClassroom && selectedDate) {
      fetchAttendanceForDate(selectedClassroom);
    }
  }, [selectedDate]);

  if (loading) return <MentorLayout><div className="p-6">{t('loading')}</div></MentorLayout>;

  return (
    <MentorLayout>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight mb-2">{t('attendance_management')}</h1>
          <p className="text-gray-600">{t('mark_manage_student_attendance')}</p>
        </div>

        {/* Controls */}
        <div data-tour="attendance-controls" className="bg-white border border-[#ebdcaa]/60 rounded-none p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {classrooms.length > 1 && (
              <div>
                <label htmlFor="attendance-class" className="block text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">Class</label>
                <select
                  id="attendance-class"
                  value={selectedClassroom || ""}
                  onChange={(e) => handleClassroomChange(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa]/80 rounded-none text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366]"
                >
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.grade && c.section ? `${c.grade}-${c.section}` : c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">
                Classroom
              </label>
              <select
                value={String(selectedClassroom || "")}
                onChange={(e) => handleClassroomChange(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa]/80 rounded-none text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366] transition-all font-medium"
              >
                <option value="">Select a classroom...</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} {c.grade ? `(Grade ${c.grade})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">
                {t('date')}
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa]/80 rounded-none text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366] transition-all"
              />
            </div>

            <div className="flex items-end gap-3 md:col-span-2 pt-2">
              <button
                onClick={handleSaveAttendance}
                disabled={!selectedClassroom || saving || students.length === 0}
                className="flex-1 bg-[#B99652] hover:bg-[#a38241] text-white px-6 py-2.5 rounded-none font-semibold text-sm shadow-sm hover:shadow transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save Attendance"}</span>
              </button>
              <button
                onClick={handleDownloadExcel}
                disabled={!selectedClassroom || students.length === 0}
                className="bg-[#fffdf4] hover:bg-[#B99652] text-[#9a7837] hover:text-white border border-[#B99652] px-5 py-2.5 rounded-none font-semibold text-sm shadow-sm hover:shadow transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>

        {/* Minimal Single-Line Speed Attendance Bar (Just Above Table) */}
        {selectedClassroom && students.length > 0 && (
          <SpeedAttendanceBar
            students={students}
            attendanceData={attendanceData}
            onAttendanceChange={handleAttendanceChange}
            onSaveAttendance={handleSaveAttendance}
            selectedClassroom={selectedClassroom}
          />
        )}

        {/* Attendance Table */}
        {selectedClassroom && students.length > 0 ? (
          <div data-tour="attendance-table" className="bg-white border border-[#ebdcaa]/60 rounded-none shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fffdf4] border-b border-[#ebdcaa]/60">
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">S.No</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Student Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Email</th>
                  <th className="px-6 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => {
                  const studentId = student.id || student._id;
                  return (
                    <tr
                      key={studentId}
                      className="border-b border-[#ebdcaa]/30 hover:bg-[#fffdf4]/70 transition-colors"
                    >
                      <td className="px-6 py-3.5 text-sm text-gray-600">{index + 1}</td>
                      <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">{student.name}</td>
                      <td className="px-6 py-3.5 text-sm text-gray-600">{student.email}</td>
                      <td data-tour={index === 0 ? 'attendance-present-absent' : undefined} className="px-6 py-3.5 text-center">
                        <div className="flex justify-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              name={`attendance-${studentId}`}
                              value="present"
                              checked={attendanceData[studentId] === "present"}
                              onChange={() => handleAttendanceChange(studentId, "present")}
                              className="w-4 h-4 accent-emerald-600 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-emerald-700 group-hover:text-emerald-800">Present</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              name={`attendance-${studentId}`}
                              value="absent"
                              checked={attendanceData[studentId] === "absent"}
                              onChange={() => handleAttendanceChange(studentId, "absent")}
                              className="w-4 h-4 accent-rose-600 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-rose-700 group-hover:text-rose-800">Absent</span>
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-[#ebdcaa]/60 rounded-none p-12 text-center shadow-sm">
            <p className="text-gray-500 text-sm">
              {!selectedClassroom ? "Please select a classroom" : "No students in this classroom"}
            </p>
          </div>
        )}

        {/* Summary - Uniform Golden Theme */}
        {selectedClassroom && students.length > 0 && (
          <div data-tour="mentor-attendance-summary" className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-1">Present Today</p>
              <p className="text-2xl font-extrabold text-[#9a7837]">
                {Object.values(attendanceData).filter(s => s === "present").length}
              </p>
            </div>
            <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-1">Absent Today</p>
              <p className="text-2xl font-extrabold text-[#9a7837]">
                {Object.values(attendanceData).filter(s => s === "absent").length}
              </p>
            </div>
            <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-1">Total Students</p>
              <p className="text-2xl font-extrabold text-[#9a7837]">{students.length}</p>
            </div>
          </div>
        )}
      </div>
    </MentorLayout>
  );
};

export default AttendanceManagement;
