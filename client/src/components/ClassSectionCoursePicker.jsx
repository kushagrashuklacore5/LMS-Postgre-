import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth";

const selectClass = "w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400";
const classLabel = (grade) => (/^\d+$/.test(String(grade)) ? `Grade ${grade}` : String(grade));
const sortClasses = (a, b) => {
  const [numA, numB] = [Number(a), Number(b)];
  return Number.isFinite(numA) && Number.isFinite(numB) ? numA - numB : String(a).localeCompare(String(b));
};

/**
 * Class -> Section -> Course, limited to what the signed-in admin/teacher may target.
 * One request loads the whole tree (GET /classrooms/teaching-scope); the dropdowns then filter
 * it in memory. The server checks every id again when the form is submitted.
 *
 * value: { classroomId, courseId }   onChange(nextValue)
 * courseMode: "none" (class/section only) | "optional" | "required"
 */
const ClassSectionCoursePicker = ({ value, onChange, courseMode = "optional" }) => {
  const { API, token } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [grade, setGrade] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API}/classrooms/teaching-scope`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Failed to load classes");
        if (alive) setClassrooms(Array.isArray(data.data) ? data.data : []);
      } catch (err) {
        if (alive) setError(err.message || "Failed to load classes");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [API, token]);

  const selected = classrooms.find((c) => String(c.id) === String(value.classroomId)) || null;
  const activeGrade = selected ? String(selected.grade) : grade;

  const grades = useMemo(() => [...new Set(classrooms.map((c) => String(c.grade)))].sort(sortClasses), [classrooms]);
  const sections = useMemo(
    () => classrooms.filter((c) => String(c.grade) === activeGrade).sort((a, b) => String(a.section || "").localeCompare(String(b.section || ""))),
    [classrooms, activeGrade]
  );
  const courses = selected ? selected.courses : [];
  const visibleCourses = courses.filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase()));

  const chooseGrade = (next) => {
    setGrade(next);
    setSearch("");
    const options = classrooms.filter((c) => String(c.grade) === next);
    // A class with one section needs no second click
    onChange({ classroomId: options.length === 1 ? String(options[0].id) : "", courseId: "" });
  };

  if (loading) return <p className="text-sm text-gray-500 mb-3">Loading classes...</p>;
  if (error) return <p className="text-sm text-red-600 mb-3">{error}</p>;
  if (classrooms.length === 0) {
    return <p className="text-sm text-gray-600 mb-3 border border-dashed border-gray-300 p-3">You are not assigned to any class yet.</p>;
  }

  return (
    <div className="space-y-3 mb-3" data-testid="class-section-course-picker">
      <div className="grid grid-cols-2 gap-3">
        <select className={selectClass} value={activeGrade} onChange={(e) => chooseGrade(e.target.value)} aria-label="Class" data-testid="picker-class">
          <option value="">Select class</option>
          {grades.map((g) => <option key={g} value={g}>{classLabel(g)}</option>)}
        </select>

        <select
          className={selectClass}
          value={value.classroomId || ""}
          disabled={!activeGrade}
          onChange={(e) => { setSearch(""); onChange({ classroomId: e.target.value, courseId: "" }); }}
          aria-label="Section"
          data-testid="picker-section"
        >
          <option value="">{activeGrade ? "Select section" : "Select a class first"}</option>
          {sections.map((c) => {
            const same = sections.filter((s) => String(s.section || "") === String(c.section || "")).length > 1;
            return <option key={c.id} value={String(c.id)}>{c.section || "No section"}{same ? ` (#${c.id})` : ""}</option>;
          })}
        </select>
      </div>

      {courseMode !== "none" && selected && (
        courses.length === 0 ? (
          <p className="text-xs text-gray-500">No courses are assigned to you in this class and section.</p>
        ) : (
          <div className="space-y-2">
            {courses.length > 6 && (
              <input
                type="search"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Search courses"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="picker-course-search"
              />
            )}
            <select
              className={selectClass}
              value={value.courseId || ""}
              onChange={(e) => onChange({ classroomId: value.classroomId, courseId: e.target.value })}
              aria-label="Course"
              data-testid="picker-course"
            >
              <option value="">{courseMode === "required" ? "Select course" : "No course (whole class and section)"}</option>
              {visibleCourses.map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
            </select>
          </div>
        )
      )}
    </div>
  );
};

export default ClassSectionCoursePicker;
