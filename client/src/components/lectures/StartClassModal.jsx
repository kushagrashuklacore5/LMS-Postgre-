import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { X } from "lucide-react";

// "Start class" for one class: one of the teacher's own courses taught to it (the server lists
// and checks them), a topic, and now or later. A repeated submit sends the same requestKey, so
// it never creates a second lecture.
const pad = (n) => String(n).padStart(2, "0");
const localInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export default function StartClassModal({ API, token, classroomId, classLabel, onClose, onScheduled }) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ courseId: "", title: "", description: "", mode: "now", when: localInput(new Date(Date.now() + 60 * 60000)), durationMinutes: 60 });
  const [saving, setSaving] = useState(false);
  const requestKey = useMemo(() => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`), []);

  useEffect(() => {
    fetch(`${API}/live-classes/teaching/${classroomId}/courses`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "Could not load your courses");
        setCourses(data.data);
        if (data.data.length === 1) setForm((f) => ({ ...f, courseId: String(data.data[0].id) }));
      })
      .catch((err) => setError(err.message));
  }, [API, token, classroomId]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.courseId) return toast.error("Choose the course");
    if (!form.title.trim()) return toast.error("Enter the topic");
    let scheduledStartTime;
    if (form.mode === "schedule") {
      const when = new Date(form.when); // the teacher's local time; sent as UTC
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return toast.error("Choose a future date and time");
      scheduledStartTime = when.toISOString();
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/live-classes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId, courseId: Number(form.courseId), title: form.title.trim(), description: form.description.trim(),
          mode: form.mode, scheduledStartTime, durationMinutes: Number(form.durationMinutes), requestKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not create the class");
      if (form.mode === "now" || data.data.status === "live") {
        navigate(`/live/${data.data.id}`);
      } else {
        toast.success(`Scheduled for ${new Date(data.data.scheduledStartTime).toLocaleString()}`);
        onScheduled?.(data.data);
        onClose();
      }
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  const field = "w-full border border-[#ebdcaa] bg-white px-3 py-2 text-sm rounded-none focus:border-[#B99652] outline-none";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Start class">
      <form onSubmit={submit} className="bg-white w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1e1b4b]">Start a class{classLabel ? ` · ${classLabel}` : ""}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-[#1e1b4b]"><X size={18} /></button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {courses && courses.length === 0 && <p className="text-sm text-amber-700">You do not teach a course to this class, so you cannot start a class here.</p>}
        {courses && courses.length > 0 && (
          <>
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-700">Course *</span>
              <select value={form.courseId} onChange={set("courseId")} className={field} aria-label="Course" required>
                <option value="">Choose a course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-700">Topic *</span>
              <input value={form.title} onChange={set("title")} maxLength={200} className={field} placeholder="e.g. Fractions: adding unlike denominators" required />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-700">Description</span>
              <textarea value={form.description} onChange={set("description")} maxLength={2000} rows={2} className={field} />
            </label>
            <div className="flex gap-4 text-sm" role="radiogroup" aria-label="When">
              <label className="flex items-center gap-2"><input type="radio" checked={form.mode === "now"} onChange={() => setForm({ ...form, mode: "now" })} /> Start now</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.mode === "schedule"} onChange={() => setForm({ ...form, mode: "schedule" })} /> Schedule</label>
            </div>
            {form.mode === "schedule" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-xs font-semibold text-gray-700">Date and time</span>
                  <input type="datetime-local" value={form.when} min={localInput(new Date())} onChange={set("when")} className={field} required />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-semibold text-gray-700">Minutes</span>
                  <input type="number" min={10} max={480} value={form.durationMinutes} onChange={set("durationMinutes")} className={field} />
                </label>
              </div>
            )}
          </>
        )}
        {!courses && !error && <p className="text-sm text-gray-500">Loading your courses...</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-none">Cancel</button>
          <button type="submit" disabled={saving || !courses || courses.length === 0} className="px-4 py-2 text-sm bg-[#1e1b4b] text-white rounded-none disabled:opacity-50">
            {saving ? "Please wait..." : form.mode === "now" ? "Start now" : "Schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}
