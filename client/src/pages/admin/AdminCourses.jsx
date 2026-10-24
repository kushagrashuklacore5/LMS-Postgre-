import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { BookOpen, Plus, Users, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import ClassEnrollmentScope from "../../components/admin/ClassEnrollmentScope";
import { useAuth } from "../../auth/auth";

// "Are you sure?" with the exact consequence; Cancel changes nothing.
const ConfirmDialog = ({ title, children, confirmLabel, busy, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
    <div className="bg-white w-full max-w-md p-6 space-y-4">
      <h2 className="text-lg font-bold text-[#1e1b4b]">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2">{children}</div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm border border-gray-300 rounded-none">Cancel</button>
        <button onClick={onConfirm} disabled={busy} className="px-4 py-2 text-sm bg-red-700 text-white rounded-none disabled:opacity-50">
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// The school's courses, the classes each one is taught to, and how many students take it.
// An admin assigns a course to classes here, removes a class assignment, and opens a class of
// a course to tick who of that class takes it. The server checks every change again.
const AdminCourses = () => {
  const { API, token } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState(null); // course being assigned
  const [chosen, setChosen] = useState(new Set());
  const [scope, setScope] = useState("all");
  const [pickedStudents, setPickedStudents] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [deassign, setDeassign] = useState(null); // { course, cls }
  const [roster, setRoster] = useState(null); // { course, cls, data, ticked: Set, error }
  const [removing, setRemoving] = useState(null); // students about to be unenrolled, awaiting confirmation

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    setError("");
    try {
      const [overviewRes, classesRes, teachersRes] = await Promise.all([
        fetch(`${API}/courses/teaching/overview`, { headers }),
        fetch(`${API}/classrooms`, { headers }),
        fetch(`${API}/users/mentors-simple`, { headers }),
      ]);
      const overview = await overviewRes.json();
      if (!overviewRes.ok) throw new Error(overview.message || "Could not load courses");
      const classesData = await classesRes.json();
      const teachersData = await teachersRes.json();
      const list = overview.data?.courses || [];
      setCourses(list);
      setClassrooms(Array.isArray(classesData) ? classesData : classesData.data || classesData.classrooms || []);
      setTeachers(Object.fromEntries((Array.isArray(teachersData) ? teachersData : []).map((t) => [t.id, t.name])));
      // an open assign dialog shows the classes as they are now
      setAssigning((open) => (open ? list.find((c) => c.id === open.id) || null : open));
      return list;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const classLabel = (c) => (c.grade && c.section ? `${c.grade}-${c.section}` : c.name);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? courses.filter((c) => c.title.toLowerCase().includes(q)) : courses;
  }, [courses, search]);

  const openAssign = (course) => {
    setAssigning(course);
    setChosen(new Set());
    setScope("all");
    setPickedStudents(new Set());
  };

  const toggle = (id) => {
    const next = new Set(chosen);
    next.has(id) ? next.delete(id) : next.add(id);
    setChosen(next);
  };

  const assignedClass = (course, classId) => course.classes.find((k) => k.id === classId && k.assigned);

  const saveAssignment = async () => {
    if (chosen.size === 0 || saving) return;
    if (scope === "selected" && pickedStudents.size === 0) { toast.error("Tick at least one student, or choose All students."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/courses/${assigning.id}/classrooms`, {
        method: "POST",
        headers,
        body: JSON.stringify({ classroomIds: [...chosen], scope, ...(scope === "selected" ? { studentIds: [...pickedStudents] } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not assign the course");
      const enrolled = data.data.reduce((sum, r) => sum + r.enrolledNow, 0);
      const already = data.data.reduce((sum, r) => sum + r.alreadyEnrolled, 0);
      toast.success(`${assigning.title}: ${enrolled} student(s) enrolled${already ? `, ${already} already enrolled` : ""}`);
      setAssigning(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeassign = async () => {
    if (!deassign || saving) return;
    const { course, cls } = deassign;
    setSaving(true);
    try {
      const res = await fetch(`${API}/courses/${course.id}/classrooms/${cls.id}`, { method: "DELETE", headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not remove the class assignment");
      toast.success(`${cls.label} removed from "${course.title}"; ${data.data.enrolmentsRemoved} enrolment(s) removed`);
      setDeassign(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- one class of a course: who takes it ---------- */
  const openRoster = async (course, cls) => {
    setRoster({ course, cls, data: null, ticked: new Set(), error: "" });
    try {
      const res = await fetch(`${API}/courses/${course.id}/classrooms/${cls.id}/students`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load the class");
      setRoster({ course, cls, data: data.data, ticked: new Set(data.data.students.filter((s) => s.enrolled).map((s) => s.id)), error: "" });
    } catch (err) {
      setRoster({ course, cls, data: null, ticked: new Set(), error: err.message });
    }
  };

  const tickStudent = (id) => {
    const next = new Set(roster.ticked);
    next.has(id) ? next.delete(id) : next.add(id);
    setRoster({ ...roster, ticked: next });
  };
  const tickAll = (on) => setRoster({ ...roster, ticked: on ? new Set(roster.data.students.map((s) => s.id)) : new Set() });

  const rosterChanges = () => {
    if (!roster?.data) return { add: [], remove: [] };
    const { students } = roster.data;
    return {
      add: students.filter((s) => !s.enrolled && roster.ticked.has(s.id)),
      remove: students.filter((s) => s.enrolled && !roster.ticked.has(s.id)),
    };
  };

  const sendRoster = async (body) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/courses/${roster.course.id}/classrooms/${roster.cls.id}/students`, { method: "PUT", headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not save the students");
      const { added, removed, label } = data.data;
      toast.success(`${roster.course.title} · ${label}: ${added.length} enrolled, ${removed.length} removed`);
      setRemoving(null);
      setRoster(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Removing anyone needs a confirmation naming them; only adding students goes straight through
  const saveRoster = () => {
    const { add, remove } = rosterChanges();
    if (add.length === 0 && remove.length === 0) { setRoster(null); return; }
    if (remove.length > 0) { setRemoving(remove); return; }
    sendRoster({ studentIds: [...roster.ticked] });
  };

  const changes = rosterChanges();

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-[#ebdcaa] pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">Courses</h1>
            <p className="text-gray-600 text-sm mt-1">Assign each course to classes. Click a class to choose which of its students take the course.</p>
          </div>
          <button onClick={() => navigate("/admin/create-course")} className="flex items-center gap-2 px-4 py-2 bg-[#1e1b4b] text-white text-sm font-semibold rounded-none hover:bg-[#2d2a6e]">
            <Plus size={16} /> New course
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search courses..."
          className="w-full md:w-80 border border-[#ebdcaa] bg-white px-3 py-2 text-sm rounded-none focus:border-[#B99652] outline-none"
        />

        {loading && <p className="text-gray-500 text-sm">Loading courses...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <div className="bg-white border border-[#ebdcaa] p-8 text-center text-gray-500">
            {courses.length === 0 ? "No courses yet. Create one with \"New course\"." : "No course matches your search."}
          </div>
        )}

        <div className="space-y-3">
          {visible.map((course) => (
            <div key={course.id} className="bg-white border border-[#ebdcaa] p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-[#B99652] shrink-0" />
                  <h2 className="font-semibold text-[#1e1b4b] truncate">{course.title}</h2>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Teacher: {teachers[course.mentorId] || "not assigned"} · <Users size={12} className="inline" /> {course.total} student(s)
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {course.classes.length === 0 && <span className="text-xs text-amber-700">Not assigned to any class</span>}
                  {course.classes.map((cls) => (
                    <span key={cls.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#fffdf4] border border-[#ebdcaa] text-[#1e1b4b]">
                      {cls.assigned ? (
                        <button onClick={() => openRoster(course, cls)} className="hover:underline" title={`Choose which students of ${cls.label} take ${course.title}`}>
                          {cls.label} — {cls.count}
                        </button>
                      ) : (
                        <span>{cls.label} — {cls.count}</span>
                      )}
                      {cls.isHome && <span className="text-[10px] text-gray-500 ml-1">(home)</span>}
                      {!cls.assigned && <span className="text-[10px] text-gray-500 ml-1" title="Students of this class were added one by one; the class itself is not assigned">(individual)</span>}
                      {cls.assigned && (
                        <button onClick={() => setDeassign({ course, cls })} aria-label={`Remove class assignment ${cls.label}`} title="Remove class assignment" className="ml-1 text-gray-400 hover:text-red-600">
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => openAssign(course)} className="px-4 py-2 border border-[#B99652] text-[#1e1b4b] text-sm font-semibold rounded-none hover:bg-[#ebdcaa]/30">
                Assign to classes
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- assign a course to more classes ---------- */}
      {assigning && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Assign to classes">
          <div className="bg-white w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#1e1b4b]">Assign “{assigning.title}” to classes</h2>
            {classrooms.length === 0 ? (
              <p className="text-sm text-gray-500">This school has no classes yet. Create one under Classrooms.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#ebdcaa] border border-[#ebdcaa]">
                {classrooms.map((c) => {
                  const already = assignedClass(assigning, c.id);
                  // an assigned class is not offered again: its students are chosen by opening it
                  return already ? (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm bg-gray-50" data-assigned="true">
                      <span className="w-[13px]" />
                      <span className="flex-1">{classLabel(c)}</span>
                      <span className="text-xs text-green-700 font-semibold">Assigned · {already.count}/{c.studentCount ?? 0}</span>
                      <button type="button" onClick={() => setDeassign({ course: assigning, cls: already })} className="text-xs text-red-700 hover:underline">
                        Remove class
                      </button>
                    </div>
                  ) : (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-[#fffdf4]">
                      <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                      <span className="flex-1">{classLabel(c)}</span>
                      <span className="text-xs text-gray-500">{`${c.studentCount ?? 0} student(s)`}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <ClassEnrollmentScope
              API={API}
              token={token}
              classes={classrooms.filter((c) => chosen.has(c.id)).map((c) => ({ id: c.id, label: classLabel(c) }))}
              scope={scope}
              onScope={setScope}
              selected={pickedStudents}
              onSelected={setPickedStudents}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAssigning(null)} disabled={saving} className="px-4 py-2 text-sm border border-gray-300 rounded-none">Cancel</button>
              <button onClick={saveAssignment} disabled={saving || chosen.size === 0} className="px-4 py-2 text-sm bg-[#1e1b4b] text-white rounded-none disabled:opacity-50">
                {saving ? "Assigning..." : `Assign ${chosen.size || ""}`.trim()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- the students of one class, for one course ---------- */}
      {roster && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Class students">
          <div className="bg-white w-full max-w-lg p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-[#1e1b4b]">{roster.course.title} · {roster.cls.label}</h2>
              <p className="text-xs text-gray-500 mt-1">Ticked students take the course. Untick a student to remove them from this course only.</p>
            </div>
            {roster.error && <p className="text-sm text-red-600">{roster.error}</p>}
            {!roster.data && !roster.error && <p className="text-sm text-gray-500">Loading the class...</p>}
            {roster.data && (
              <>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{roster.ticked.size} of {roster.data.classSize} enrolled · {roster.data.scope === "all" ? "All students (and later joiners)" : "Selected students"}</span>
                  {roster.data.students.length > 0 && (
                    <button type="button" className="text-[#B99652] hover:underline" onClick={() => tickAll(roster.ticked.size !== roster.data.students.length)}>
                      {roster.ticked.size === roster.data.students.length ? "Untick all" : "Tick all"}
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto border border-[#ebdcaa] divide-y divide-[#ebdcaa]">
                  {roster.data.students.length === 0 && <p className="p-3 text-sm text-gray-500">No students in this class yet.</p>}
                  {roster.data.students.map((s) => (
                    <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-[#fffdf4]">
                      <input type="checkbox" checked={roster.ticked.has(s.id)} onChange={() => tickStudent(s.id)} />
                      <span className="flex-1">{s.name}</span>
                      {s.rollNumber && <span className="text-xs text-gray-400">#{s.rollNumber}</span>}
                      {s.enrolled && !roster.ticked.has(s.id) && <span className="text-xs text-red-700">will be removed</span>}
                      {!s.enrolled && roster.ticked.has(s.id) && <span className="text-xs text-green-700">will be enrolled</span>}
                    </label>
                  ))}
                </div>
                {roster.data.scope === "selected" && roster.data.students.length > 0 && (
                  <button type="button" disabled={saving} onClick={() => sendRoster({ scope: "all" })} className="text-xs text-[#1e1b4b] underline disabled:opacity-50">
                    Enrol the whole class, and students who join it later
                  </button>
                )}
              </>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setRoster(null)} disabled={saving} className="px-4 py-2 text-sm border border-gray-300 rounded-none">Close</button>
              <button onClick={saveRoster} disabled={saving || !roster.data || (changes.add.length === 0 && changes.remove.length === 0)} className="px-4 py-2 text-sm bg-[#1e1b4b] text-white rounded-none disabled:opacity-50">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {removing && roster && (
        <ConfirmDialog
          title="Remove from course?"
          confirmLabel={`Remove ${removing.length} student(s)`}
          busy={saving}
          onCancel={() => setRemoving(null)}
          onConfirm={() => sendRoster({ studentIds: [...roster.ticked] })}
        >
          <p>These students of <strong>{roster.cls.label}</strong> will no longer take <strong>{roster.course.title}</strong>:</p>
          <ul className="list-disc pl-5">{removing.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
          {changes.add.length > 0 && <p>{changes.add.length} other student(s) will be enrolled.</p>}
          <p className="text-xs text-gray-500">Only the course enrolment is removed. Their account, class, marks and submissions stay.{roster.data?.scope === "all" ? " The class switches to Selected students, so students who join it later are not enrolled automatically." : ""}</p>
        </ConfirmDialog>
      )}

      {deassign && (
        <ConfirmDialog
          title="Remove class assignment?"
          confirmLabel="Remove class"
          busy={saving}
          onCancel={() => setDeassign(null)}
          onConfirm={confirmDeassign}
        >
          <p>Remove <strong>{deassign.cls.label}</strong> from <strong>{deassign.course.title}</strong>?</p>
          <p className="text-xs text-gray-500">Students enrolled through this class lose the course; students enrolled individually keep it. Accounts, class memberships, marks and submissions stay.{deassign.cls.isHome ? " Another assigned class becomes the course's home class." : ""}</p>
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
};

export default AdminCourses;
