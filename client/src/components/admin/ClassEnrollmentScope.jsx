import { useEffect, useState } from "react";

// "Who in these classes takes the course?": all students (and those who join later), or the
// students the admin ticks. Used when a course is created and when it is assigned to classes.
// The server checks every choice again (a ticked student must be in one of the classes).
export default function ClassEnrollmentScope({ API, token, classes, scope, onScope, selected, onSelected }) {
  const [studentsByClass, setStudentsByClass] = useState({});
  const [error, setError] = useState("");

  const classKey = classes.map((c) => c.id).join(",");
  useEffect(() => {
    if (scope !== "selected") return;
    let cancelled = false;
    setError("");
    Promise.all(
      classes
        .filter((c) => !studentsByClass[c.id])
        .map((c) =>
          fetch(`${API}/classrooms/${c.id}/students`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (r) => {
              const data = await r.json();
              if (!r.ok) throw new Error(data.message || "Could not load the class's students");
              return [c.id, Array.isArray(data) ? data : data.students || data.data || []];
            })
        )
    )
      .then((pairs) => { if (!cancelled && pairs.length) setStudentsByClass((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [scope, classKey]);

  // A class that is unticked takes its ticked students with it, so a student of an unrelated
  // class is never sent (waits until every chosen class's list has loaded)
  useEffect(() => {
    if (scope !== "selected" || classes.some((c) => !studentsByClass[c.id])) return;
    const inClasses = new Set(classes.flatMap((c) => studentsByClass[c.id].map((s) => s.id)));
    if ([...selected].some((id) => !inClasses.has(id))) onSelected(new Set([...selected].filter((id) => inClasses.has(id))));
  }, [scope, classKey, studentsByClass]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelected(next);
  };
  const setClass = (classId, on) => {
    const next = new Set(selected);
    (studentsByClass[classId] || []).forEach((s) => (on ? next.add(s.id) : next.delete(s.id)));
    onSelected(next);
  };

  if (classes.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Students">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="enrollment-scope" checked={scope === "all"} onChange={() => onScope("all")} />
          All students of {classes.length === 1 ? "the class" : "these classes"}
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="enrollment-scope" checked={scope === "selected"} onChange={() => onScope("selected")} />
          Selected students
        </label>
      </div>
      <p className="text-xs text-gray-500">
        {scope === "all"
          ? "Everyone in the class is enrolled, and students who join the class later too."
          : "Only the students you tick are enrolled. Students who join the class later are not."}
      </p>
      {scope === "selected" && (
        <div className="max-h-64 overflow-y-auto border border-[#ebdcaa] divide-y divide-[#ebdcaa]">
          {error && <p className="p-2 text-xs text-red-600">{error}</p>}
          {classes.map((c) => {
            const list = studentsByClass[c.id];
            const all = list && list.length > 0 && list.every((s) => selected.has(s.id));
            return (
              <div key={c.id} className="p-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#1e1b4b] mb-1">
                  <span>{c.label}</span>
                  {list && list.length > 0 && (
                    <button type="button" className="text-[#B99652] hover:underline" onClick={() => setClass(c.id, !all)}>
                      {all ? "Clear" : "Select all"}
                    </button>
                  )}
                </div>
                {!list && <p className="text-xs text-gray-500">Loading students...</p>}
                {list && list.length === 0 && <p className="text-xs text-gray-500">No students in this class yet.</p>}
                {list && list.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <span>{s.name}</span>
                    {s.email && <span className="text-xs text-gray-400">{s.email}</span>}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
