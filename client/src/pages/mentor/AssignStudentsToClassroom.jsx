import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const AssignStudentsToClassroom = () => {
  const { API, token, socket } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ================= FETCH STUDENTS ================= */
  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API}/users/students-simple`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setStudents(data);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  /* ================= TOGGLE STUDENT ================= */
  const toggleStudent = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id]
    );
  };

  /* ================= ASSIGN STUDENTS ================= */
  const handleAssign = async () => {
    if (selected.length === 0) {
      return toast.error("Please select at least one student");
    }

    try {
      const res = await fetch(
        `${API}/classrooms/assign-students`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            studentIds: selected,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Assignment failed");
      }
      toast.success("Students assigned successfully");

      // Trigger a lightweight refresh: call mentor classrooms to ensure backend updates are visible
      try {
        const teacherId = localStorage.getItem('userId') || 'me';
        await fetch(`${API}/classrooms/mentor/${teacherId}`, { headers: { Authorization: `Bearer ${token}` } });
      } catch (e) {
        // ignore
      }

      // Emit local socket event to refresh other windows/tabs (best-effort)
      if (socket && socket.connected) {
        try { socket.emit('student-assigned', { studentIds: selected }); } catch {}
      }

      /* ✅ REDIRECT TO MY CLASSROOM */
      navigate("/mentor/classroom");
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <MentorLayout>
      <div 
        className="p-4 sm:p-6 md:p-8 min-h-screen text-[#1e1b4b]"
        style={{
          backgroundColor: "#fffdf4",
          backgroundImage: "linear-gradient(to right, #ebdcaa20 1px, transparent 1px), linear-gradient(to bottom, #ebdcaa20 1px, transparent 1px)",
          backgroundSize: "44px 44px"
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif] tracking-tight">
                Assign Students
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">Select students to enroll in classroom</p>
            </div>
            <button
              onClick={() => navigate("/mentor/classrooms")}
              className="px-4 py-2 bg-white border border-[#ebdcaa] text-[#1e1b4b] rounded-none hover:bg-[#ebdcaa]/25 text-xs font-semibold shadow-xs"
            >
              Back
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="w-8 h-8 border-2 border-[#002366] border-t-transparent animate-spin"></div>
            </div>
          ) : (
            <>
              {/* TABLE */}
              <div className="bg-white border border-[#ebdcaa] rounded-none shadow-sm overflow-hidden border-t-4 border-t-[#B99652]">
                <table className="w-full text-left">
                  <thead className="bg-[#fffdf4] border-b border-[#ebdcaa]">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold uppercase text-[#1e1b4b] w-14">Select</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase text-[#1e1b4b]">Name</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase text-[#1e1b4b]">Email</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#ebdcaa]/40 bg-white">
                    {students.map((s) => (
                      <tr
                        key={s._id}
                        className="hover:bg-[#fffdf4]/80 transition cursor-pointer"
                        onClick={() => toggleStudent(s._id)}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.includes(s._id)}
                            onChange={() => toggleStudent(s._id)}
                            className="w-4 h-4 rounded-none text-[#B99652] focus:ring-0"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-[#1e1b4b]">
                          {s.name}
                        </td>
                        <td className="px-4 py-3 text-xs sm:text-sm text-slate-600 font-mono">
                          {s.email}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ACTION BUTTON */}
              <div className="flex justify-end mt-6">
                <button
                  onClick={handleAssign}
                  className="bg-[#B99652] hover:bg-[#a38241] text-white px-6 py-2.5 rounded-none font-bold text-xs uppercase tracking-wider shadow-sm transition"
                >
                  Assign Selected Students ({selected.length})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </MentorLayout>
  );
};

export default AssignStudentsToClassroom;
