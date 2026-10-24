import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import MentorLayout from "../../components/MentorLayout";
import { useAuth } from "../../auth/auth";

// The students of the courses this teacher teaches, two ways:
//   By class  -> pick a class, then one of your courses taught to it: that class's students of the course
//   By course -> pick one of your courses: its students in every class, grouped under class headers
// The server decides who may see what; this page only asks for the teacher's own courses.
const MyStudents = () => {
  const { API, token } = useAuth();
  const [overview, setOverview] = useState({ courses: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("class");
  const [classId, setClassId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/courses/teaching/overview`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Could not load your courses");
        setOverview(data.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [API, token]);

  // Load the roster of the chosen course (in the class view, of the chosen class only)
  useEffect(() => {
    if (!courseId || (view === "class" && !classId)) { setRoster(null); return; }
    const query = new URLSearchParams();
    if (view === "class") query.set("inClass", classId);
    let cancelled = false;
    setRosterLoading(true);
    fetch(`${API}/courses/${courseId}/roster?${query}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Could not load students");
        if (!cancelled) setRoster(data.data);
      })
      .catch((err) => { if (!cancelled) { setRoster(null); setError(err.message); } })
      .finally(() => { if (!cancelled) setRosterLoading(false); });
    return () => { cancelled = true; };
  }, [API, token, view, classId, courseId]);

  const switchView = (next) => {
    setView(next);
    setClassId("");
    setCourseId("");
    setClassFilter("");
    setSearch("");
    setError("");
  };

  const coursesOfClass = overview.classes.find((c) => String(c.id) === String(classId))?.courses || [];

  // search and class filter are applied here; the roster already holds only enrolled students
  const groups = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    return roster.groups
      .filter((g) => !classFilter || String(g.classroom?.id ?? "none") === classFilter)
      .map((g) => ({ ...g, students: g.students.filter((s) => !q || [s.name, s.email, s.rollNumber].some((v) => String(v ?? "").toLowerCase().includes(q))) }))
      .filter((g) => g.students.length > 0);
  }, [roster, search, classFilter]);
  const shown = groups.reduce((sum, g) => sum + g.students.length, 0);

  const select = "border border-[#ebdcaa] bg-white px-3 py-2 text-sm rounded-none focus:border-[#B99652] outline-none";

  return (
    <MentorLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="border-b border-[#ebdcaa] pb-4">
          <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">My Students</h1>
          <p className="text-gray-600 text-sm mt-1">Students enrolled in the courses you teach.</p>
        </div>

        <div className="flex gap-2" role="tablist">
          {[["class", "By class"], ["course", "By course"]].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => switchView(key)}
              className={`px-4 py-2 text-sm font-semibold rounded-none border ${view === key ? "bg-[#1e1b4b] text-white border-[#1e1b4b]" : "bg-white text-[#1e1b4b] border-[#ebdcaa]"}`}>
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-500">Loading your courses...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && overview.courses.length === 0 && (
          <div className="bg-white border border-[#ebdcaa] p-8 text-center text-gray-500">You have no courses yet. Your admin assigns courses to you.</div>
        )}

        {!loading && overview.courses.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {view === "class" ? (
              <>
                <select aria-label="Class" value={classId} onChange={(e) => { setClassId(e.target.value); setCourseId(""); }} className={select}>
                  <option value="">Choose a class</option>
                  {overview.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={!classId} className={select}>
                  <option value="">{classId ? "Choose a course" : "Choose a class first"}</option>
                  {coursesOfClass.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.count})</option>)}
                </select>
              </>
            ) : (
              <>
                <select aria-label="Course" value={courseId} onChange={(e) => { setCourseId(e.target.value); setClassFilter(""); }} className={select}>
                  <option value="">Choose a course</option>
                  {overview.courses.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.total})</option>)}
                </select>
                {roster && roster.classes.length > 1 && (
                  <select aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={select}>
                    <option value="">All classes</option>
                    {roster.classes.map((c) => <option key={c.id ?? "none"} value={c.id ?? "none"}>{c.label} ({c.count})</option>)}
                  </select>
                )}
              </>
            )}
            {roster && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or roll no."
                  className="border border-[#ebdcaa] bg-white pl-8 pr-3 py-2 text-sm rounded-none focus:border-[#B99652] outline-none w-64" />
              </div>
            )}
          </div>
        )}

        {rosterLoading && <p className="text-sm text-gray-500">Loading students...</p>}

        {roster && !rosterLoading && (
          <>
            <p className="text-sm text-gray-600">
              <Users size={14} className="inline mr-1" />
              {roster.course.title}: showing {shown} of {view === "class" ? roster.shown : roster.total} student(s)
            </p>
            {groups.length === 0 ? (
              <div className="bg-white border border-[#ebdcaa] p-6 text-center text-gray-500">
                {roster.total === 0 ? "No students are enrolled in this course yet." : "No student matches your search."}
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.classroom?.id ?? "none"} className="bg-white border border-[#ebdcaa]">
                  <h2 className="px-4 py-2 bg-[#fffdf4] border-b border-[#ebdcaa] font-semibold text-[#1e1b4b] text-sm">
                    {group.classroom ? group.classroom.label : "No class"} — {group.students.length} student{group.students.length === 1 ? "" : "s"}
                  </h2>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-gray-500">
                      <tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Email</th><th className="px-4 py-2 font-medium">Roll no.</th></tr>
                    </thead>
                    <tbody>
                      {group.students.map((s) => (
                        <tr key={s.id} className="border-t border-[#f3ead0]">
                          <td className="px-4 py-2">{s.name}</td>
                          <td className="px-4 py-2 text-gray-600">{s.email}</td>
                          <td className="px-4 py-2 text-gray-600">{s.rollNumber || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </MentorLayout>
  );
};

export default MyStudents;
