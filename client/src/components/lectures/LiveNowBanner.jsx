import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

// A bar at the top of every student and teacher page for lectures that are live now or about to
// start, with the one button that matters:
//   student  Join now (live) / Join class (from 10 min before: the waiting room, which joins by
//            itself when the teacher starts)
//   teacher  Open class (live) / Start class (from 30 min before, the earliest the server allows)
// The server decides which lectures each person may see and do; this only polls that list.
const EARLY_MS = { student: 10 * 60 * 1000, teacher: 30 * 60 * 1000 };

export default function LiveNowBanner({ API, token, mode = "student" }) {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    const path = mode === "teacher" ? "mine" : "student/upcoming";
    const load = () =>
      fetch(`${API}/live-classes/${path}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (!stopped && data?.data) setLectures(data.data); setNow(Date.now()); })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => { stopped = true; clearInterval(timer); };
  }, [API, token, mode]);

  const start = (l) => new Date(l.scheduledStartTime).getTime();
  const relevant = lectures.filter((l) => l.embedded && (l.status === "live"
    || (l.status === "scheduled" && start(l) - now <= EARLY_MS[mode] && now <= start(l) + (l.durationMinutes || 60) * 60000)));
  if (relevant.length === 0) return null;

  const open = async (l) => {
    if (mode === "teacher" && l.status === "scheduled") {
      if (busy) return;
      setBusy(l.id);
      try {
        const res = await fetch(`${API}/live-classes/${l.id}/start`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Could not start the class");
      } catch (err) {
        toast.error(err.message);
        setBusy(null);
        return;
      }
    }
    navigate(`/live/${l.id}`);
  };

  return (
    <div className="space-y-1" role="status" aria-label="Live classes">
      {relevant.map((l) => {
        const live = l.status === "live";
        const label = mode === "teacher" ? (live ? "Open class" : "Start class") : live ? "Join now" : "Join class";
        return (
          <div key={l.id} className={`flex flex-wrap items-center gap-3 px-4 py-2 text-sm text-white ${live ? "bg-red-700" : "bg-[#1e1b4b]"}`}>
            <span className="font-semibold">{live ? "● LIVE NOW" : "Starting soon"}</span>
            <span className="flex-1 min-w-0 truncate">
              {l.title} · {l.courseTitle}{l.classLabel ? ` · ${l.classLabel}` : ""}{mode === "student" && l.teacherName ? ` · ${l.teacherName}` : ""}
              {!live && ` · ${new Date(l.scheduledStartTime).toLocaleTimeString(undefined, { timeStyle: "short" })}`}
            </span>
            <button onClick={() => open(l)} disabled={busy === l.id} className="px-3 py-1 bg-white text-[#1e1b4b] font-semibold rounded-none text-xs disabled:opacity-50">
              {busy === l.id ? "Starting..." : label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
