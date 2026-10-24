import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

// "Your Lectures": one table for the three portals.
//   teacher  their own lectures (of one class or one course when given): start, open, cancel, attendance
//   student  lectures of their classes and enrolled courses, with their own attendance; Join when live
//   admin    the school's lectures (of one class when given), with attendance
// The server decides what each person may see; this only shows it.

const BADGE = {
  upcoming: "bg-blue-50 text-blue-700 border-blue-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  live: "bg-red-50 text-red-700 border-red-200",
  completed: "bg-gray-50 text-gray-700 border-gray-200",
  attended: "bg-green-50 text-green-700 border-green-200",
  missed: "bg-amber-50 text-amber-800 border-amber-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200 line-through",
  failed: "bg-red-50 text-red-800 border-red-200",
  unknown: "bg-gray-50 text-gray-500 border-gray-200",
  pending: "bg-gray-50 text-gray-500 border-gray-200",
  notStarted: "bg-amber-50 text-amber-800 border-amber-200",
};
const LABEL = { notStarted: "Not started", scheduled: "Upcoming", upcoming: "Upcoming", live: "Live", completed: "Completed", attended: "Attended", missed: "Missed", cancelled: "Cancelled", failed: "Failed", unknown: "Not measured", pending: "Pending" };

export const StatusBadge = ({ status }) => (
  <span className={`inline-block text-xs px-2 py-0.5 border ${BADGE[status] || BADGE.pending}`}>{LABEL[status] || status}</span>
);

const when = (l) => new Date(l.actualStartTime || l.scheduledStartTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const minutes = (l) => (l.durationMinutes || l.durationMinutes === 0 ? `${l.durationMinutes} min` : "—");

// The waiting room opens this long before a scheduled lecture; the teacher may start 30 minutes early
const STUDENT_EARLY_MS = 10 * 60 * 1000;
const TEACHER_EARLY_MS = 30 * 60 * 1000;
const startsAt = (l) => new Date(l.scheduledStartTime).getTime();
// a scheduled lecture whose whole slot has passed without the teacher starting it
const overdue = (l, now) => l.status === "scheduled" && now > startsAt(l) + (l.durationMinutes || 60) * 60000;
// "in 2 h 5 min", "in 4 min", "in 30 s"
const countdown = (ms) => {
  if (ms <= 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
};

// The join button every student sees for an upcoming or live lecture: greyed out with the time
// left until the waiting room opens, then clickable; inside the room the class opens by itself
// as soon as the teacher starts it.
const StudentJoin = ({ lecture, now, onJoin }) => {
  if (!lecture.embedded || !["scheduled", "live"].includes(lecture.status)) return null;
  if (lecture.status === "live") {
    return (
      <button onClick={onJoin} className="text-xs px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-none font-semibold animate-pulse">
        ● Join now
      </button>
    );
  }
  if (overdue(lecture, now)) {
    return <button disabled className="text-xs px-3 py-1.5 border border-gray-200 text-gray-400 rounded-none cursor-not-allowed">Not started by teacher</button>;
  }
  const opensIn = startsAt(lecture) - STUDENT_EARLY_MS - now;
  if (opensIn > 0) {
    return (
      <button disabled title="The button becomes active 10 minutes before the class" className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-none cursor-not-allowed">
        Join · opens in {countdown(opensIn)}
      </button>
    );
  }
  return (
    <button onClick={onJoin} className="text-xs px-3 py-1.5 bg-[#1e1b4b] hover:bg-[#2d2a6e] text-white rounded-none font-semibold">
      Join class
    </button>
  );
};

export default function LecturesTable({ API, token, mode, classroomId, courseId, refreshKey, title = "Your Lectures" }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // lecture id whose attendance is shown
  const [attendance, setAttendance] = useState({});
  const [busy, setBusy] = useState(null);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const load = useCallback(async () => {
    setError("");
    const path = mode === "student" ? "student" : mode === "admin" ? "school" : "mine";
    const query = new URLSearchParams({ ...(classroomId ? { classroomId } : {}), ...(courseId && mode !== "student" ? { courseId } : {}) });
    try {
      const res = await fetch(`${API}/live-classes/${path}?${query}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load the lectures");
      let list = data.data || [];
      if (mode === "student" && courseId) list = list.filter((l) => String(l.courseId) === String(courseId));
      if (mode === "student" && classroomId) list = list.filter((l) => String(l.classroomId) === String(classroomId));
      setRows(list);
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, [API, token, mode, classroomId, courseId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // A clock for the countdowns, and a refresh while any lecture is upcoming or live, so a button
  // turns active (and "Join now" appears when the teacher starts) without reloading the page
  const [now, setNow] = useState(Date.now());
  const pending = (rows || []).some((l) => l.status === "scheduled" || l.status === "live");
  useEffect(() => {
    if (!pending) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const refresh = setInterval(load, 30000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [pending, load]);

  const act = async (lecture, action) => {
    if (busy) return;
    if (action === "cancel" && !window.confirm(`Cancel "${lecture.title}" on ${when(lecture)}?`)) return;
    setBusy(lecture.id);
    try {
      const res = await fetch(`${API}/live-classes/${lecture.id}/${action}`, { method: "POST", headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "That did not work");
      if (action === "start") navigate(`/live/${lecture.id}`);
      else { toast.success("Lecture cancelled"); await load(); }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const toggleAttendance = async (lecture) => {
    if (open === lecture.id) return setOpen(null);
    setOpen(lecture.id);
    if (attendance[lecture.id]) return;
    try {
      const res = await fetch(`${API}/live-classes/${lecture.id}/attendance`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load attendance");
      setAttendance((a) => ({ ...a, [lecture.id]: data.data }));
    } catch (err) {
      setAttendance((a) => ({ ...a, [lecture.id]: { error: err.message } }));
    }
  };

  const staff = mode !== "student";
  const status = (l) => (overdue(l, now) ? "notStarted" : mode === "student" ? l.myStatus : l.status);
  return (
    <section className="bg-white border border-[#ebdcaa] p-4 sm:p-6" aria-label={title}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{title}</h2>
        <button onClick={load} className="text-xs text-[#9a7837] hover:underline">Refresh</button>
      </div>
      {rows === null && <p className="text-sm text-gray-500">Loading lectures...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && rows.length === 0 && !error && <p className="text-sm text-gray-500 py-6 text-center">No lectures yet.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto border border-[#ebdcaa]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#fffdf4] text-xs uppercase tracking-wider text-[#1e1b4b]">
              <tr>
                <th className="px-3 py-2">Date / time</th>
                {staff && <th className="px-3 py-2">Class</th>}
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Topic</th>
                {mode !== "teacher" && <th className="px-3 py-2">Teacher</th>}
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Status</th>
                {staff && <th className="px-3 py-2">Attendance</th>}
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebdcaa]/60">
              {rows.map((l) => (
                <Fragment key={l.id}>
                  <tr>
                    <td className="px-3 py-2 whitespace-nowrap">{when(l)}</td>
                    {staff && <td className="px-3 py-2">{l.classLabel || "—"}</td>}
                    <td className="px-3 py-2">{l.courseTitle}</td>
                    <td className="px-3 py-2">{l.title}</td>
                    {mode !== "teacher" && <td className="px-3 py-2">{l.teacherName || "—"}</td>}
                    <td className="px-3 py-2 whitespace-nowrap">{mode === "student" && l.status === "completed" ? `${l.myAttendedMinutes} / ${minutes(l)}` : minutes(l)}</td>
                    <td className="px-3 py-2"><StatusBadge status={status(l)} /></td>
                    {staff && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        {l.status === "completed" || l.status === "live" ? (
                          <button onClick={() => toggleAttendance(l)} className="text-xs text-[#9a7837] hover:underline">
                            {l.attendance.attended} attended{l.status === "completed" ? `, ${l.attendance.missed} missed` : ""}
                          </button>
                        ) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {mode === "teacher" && l.status === "scheduled" && l.embedded && (startsAt(l) - TEACHER_EARLY_MS - now > 0 ? (
                        <button disabled title="You can start 30 minutes before the scheduled time" className="text-xs px-2 py-1 border border-gray-300 text-gray-500 rounded-none mr-2 cursor-not-allowed">
                          Start · in {countdown(startsAt(l) - TEACHER_EARLY_MS - now)}
                        </button>
                      ) : (
                        <button onClick={() => act(l, "start")} disabled={busy === l.id} className="text-xs px-2 py-1 bg-red-700 text-white rounded-none mr-2 disabled:opacity-50">Start class</button>
                      ))}
                      {staff && l.status === "scheduled" && (
                        <button onClick={() => act(l, "cancel")} disabled={busy === l.id} className="text-xs px-2 py-1 border border-gray-300 rounded-none disabled:opacity-50">Cancel</button>
                      )}
                      {mode === "teacher" && l.status === "live" && l.embedded && (
                        <button onClick={() => navigate(`/live/${l.id}`)} className="text-xs px-2 py-1 bg-red-700 text-white rounded-none">Open</button>
                      )}
                      {mode === "student" && <StudentJoin lecture={l} now={now} onJoin={() => navigate(`/live/${l.id}`)} />}
                    </td>
                  </tr>
                  {staff && open === l.id && (
                    <tr>
                      <td colSpan={9} className="px-3 py-3 bg-[#fffdf4]">
                        {!attendance[l.id] && <p className="text-xs text-gray-500">Loading attendance...</p>}
                        {attendance[l.id]?.error && <p className="text-xs text-red-600">{attendance[l.id].error}</p>}
                        {attendance[l.id]?.students && (
                          <>
                            {attendance[l.id].attendanceState === "unknown" && <p className="text-xs text-gray-500 mb-2">No join or leave was recorded for this lecture, so attendance could not be measured.</p>}
                            <table className="text-xs w-full">
                              <tbody>
                                {attendance[l.id].students.map((s) => (
                                  <tr key={s.studentId}>
                                    <td className="py-1 pr-3">{s.name}</td>
                                    <td className="py-1 pr-3"><StatusBadge status={s.status} /></td>
                                    <td className="py-1 pr-3">{s.attendedMinutes} min{s.intervals > 1 ? ` (${s.intervals} times)` : ""}</td>
                                    <td className="py-1 text-gray-500">{s.firstJoinedAt ? `joined ${new Date(s.firstJoinedAt).toLocaleTimeString()}` : ""}</td>
                                  </tr>
                                ))}
                                {attendance[l.id].students.length === 0 && <tr><td className="py-1 text-gray-500">No students.</td></tr>}
                              </tbody>
                            </table>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
