import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FilePlus2, User, Plus, Trash2 } from "lucide-react";

const AddResult = () => {
  const { API, token } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("General");
  const [comments, setComments] = useState("");
  const [subjects, setSubjects] = useState([
    { name: "", marks: "", total: "", status: "PASS" },
  ]);

  useEffect(() => {
    fetchClassrooms();
  }, [API, token]);

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

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      console.log('🏫 Fetching classrooms from /classrooms/mentor/me');
      console.log('🔗 API endpoint:', `${API}/classrooms/mentor/me`);
      console.log('🔑 Token available:', !!token);
      
      const res = await fetch(`${API}/classrooms/mentor/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('📡 Response status:', res.status);
      console.log('📡 Response ok:', res.ok);
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      console.log('📦 Raw classroom response:', data);
      
      const classroomsList = unwrapResponse(data);
      console.log('✅ Unwrapped classrooms:', classroomsList);
      console.log('📊 Classroom count:', Array.isArray(classroomsList) ? classroomsList.length : 0);
      
      if (Array.isArray(classroomsList) && classroomsList.length > 0) {
        console.log('✅ Setting classrooms and selecting first one');
        setClassrooms(classroomsList);
        const assignedClassroom = classroomsList[0];
        console.log('🎯 First classroom ID:', assignedClassroom.id);
        setSelectedClassroom(assignedClassroom.id);
        await fetchStudents(assignedClassroom.id);
      } else {
        console.warn('⚠️ No classrooms returned');
        setClassrooms([]);
        toast.error("No classroom assigned");
      }
    } catch (err) {
      console.error("❌ LOAD CLASSROOM ERROR:", err);
      toast.error("Failed to load classrooms");
      setClassrooms([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (classroomId) => {
    try {
      console.log('🔍 Fetching all students for result creation...');
      console.log('🔗 API endpoint:', `${API}/users?role=student`);
      console.log('🔑 Token available:', !!token);
      
      // Fetch all students instead of classroom-specific students
      const res = await fetch(`${API}/users?role=student`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('📡 Response status:', res.status);
      console.log('📡 Response ok:', res.ok);
      
      const data = await res.json();
      console.log('📦 Raw response data:', data);
      
      const studentList = unwrapResponse(data);
      console.log('✅ Unwrapped students:', studentList);
      console.log('📊 Student count:', Array.isArray(studentList) ? studentList.length : 0);
      
      // Filter to only show students (not admins, mentors, etc.)
      const filteredStudents = Array.isArray(studentList) 
        ? studentList.filter(user => user.role === 'student')
        : [];
      
      console.log('👥 Filtered students (role=student):', filteredStudents.length);
      filteredStudents.forEach((student, index) => {
        console.log(`   ${index + 1}. ${student.name} (${student.email})`);
      });
      
      setStudents(filteredStudents);
      
      // Reset student selection when changing classroom
      setStudentId("");
    } catch (err) {
      console.error("❌ Failed to fetch students:", err);
      toast.error("Failed to load students");
      setStudents([]);
    }
  };

  const handleClassroomChange = (classroomId) => {
    setSelectedClassroom(classroomId);
    fetchStudents(classroomId);
  };

  const updateSubject = (index, field, value) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addSubjectRow = () => {
    setSubjects((prev) => [...prev, { name: "", marks: "", total: "", status: "PASS" }]);
  };

  const removeSubjectRow = (index) => {
    setSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClassroom) {
      toast.error("Select a classroom");
      return;
    }
    if (!studentId) {
      toast.error("Select a student");
      return;
    }
    const cleanedSubjects = subjects
      .filter((s) => s.name && s.marks !== "" && s.total !== "")
      .map((s) => ({
        name: s.name,
        marks: Number(s.marks),
        total: Number(s.total),
        status: s.status || "PASS",
      }));

    if (cleanedSubjects.length === 0) {
      toast.error("Add at least one subject with marks");
      return;
    }

    // Validation: Check if marks <= total
    for (const sub of cleanedSubjects) {
      if (sub.marks > sub.total) {
        toast.error(`Marks cannot exceed total for ${sub.name}`);
        return;
      }
    }

    try {
      const res = await fetch(`${API}/results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroomId: selectedClassroom,
          studentId,
          subjects: cleanedSubjects,
          term,
          comments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to save result");
      }
      toast.success("Result saved");
      navigate("/mentor/classroom");
    } catch (err) {
      console.error("SAVE RESULT ERROR:", err);
      toast.error(err.message || "Failed to save result");
    }
  };

  if (loading) {
    return (
      <MentorLayout>
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </MentorLayout>
    );
  }

  if (!selectedClassroom || classrooms.length === 0) {
    return (
      <MentorLayout>
        <div className="max-w-5xl mx-auto p-6">
          <p className="text-gray-600">You are not assigned as a class teacher.</p>
        </div>
      </MentorLayout>
    );
  }

  const currentClassroom = classrooms.find(c => c.id === selectedClassroom);

  return (
    <MentorLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <FilePlus2 className="text-primary" />
          <h1 className="text-2xl font-bold">Add Student Result</h1>
        </div>

        <div className="bg-white rounded-2xl border p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Classroom
              </label>
              <select
                value={String(selectedClassroom || "")}
                onChange={(e) => handleClassroomChange(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Select a classroom</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} {c.section ? `- Section ${c.section}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Student ({students.length} available in system)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <select
                  className="w-full border rounded-lg pl-9 pr-3 py-2"
                  value={String(studentId || "")}
                  onChange={(e) => setStudentId(Number(e.target.value))}
                >
                  <option value="">Select student</option>
                  {students.length > 0 ? (
                    students.map((s) => (
                      <option key={s._id || s.id} value={String(s._id || s.id)}>
                        {s.name} ({s.email})
                      </option>
                    ))
                  ) : (
                    <option disabled>No students available in system</option>
                  )}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Term
              </label>
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="e.g., Midterm, Final, General"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comments
              </label>
              <input
                type="text"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Optional teacher's remarks"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Subjects</h3>
              <button
                type="button"
                onClick={addSubjectRow}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm"
              >
                <Plus size={16} />
                Add Subject
              </button>
            </div>

            <div className="space-y-3">
              {subjects.map((s, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                  <input
                    type="text"
                    placeholder="Subject"
                    className="col-span-4 border rounded-lg px-3 py-2"
                    value={s.name}
                    onChange={(e) => updateSubject(idx, "name", e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Marks"
                    className="col-span-2 border rounded-lg px-3 py-2"
                    value={s.marks}
                    onChange={(e) => updateSubject(idx, "marks", e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Total"
                    className="col-span-2 border rounded-lg px-3 py-2"
                    value={s.total}
                    onChange={(e) => updateSubject(idx, "total", e.target.value)}
                  />
                  <select
                    className="col-span-3 border rounded-lg px-3 py-2"
                    value={s.status}
                    onChange={(e) => updateSubject(idx, "status", e.target.value)}
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSubjectRow(idx)}
                    className="col-span-1 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg h-10"
                    title="Remove"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              className="px-5 py-2 rounded-lg bg-primary text-white"
            >
              Save Result
            </button>
          </div>
        </div>
      </div>
    </MentorLayout>
  );
};

export default AddResult;
