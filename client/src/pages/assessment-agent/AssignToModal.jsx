import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loader2, Search, Users, X } from "lucide-react";

/*
 * "Assign to" popup (migration 008): choose which students of the test's class receive it.
 * Works on its OWN copy of the selection: Cancel changes nothing. Loading the class list is a plain read
 * (no AI). Default selection: the whole class, or - for a test suggested by an AI Performance Report - only
 * the student it was suggested for (`suggested`); the teacher can change it freely before confirming.
 *
 * onConfirm(ids, wholeClass): wholeClass = every student selected (sent as "whole class", so students who
 * join the class later also get the test, as before).
 */
export default function AssignToModal({ base, auth, classroom, courseId = null, classLabel, testTitle, suggested = null, busy = false, onCancel, onConfirm }) {
  const [students, setStudents] = useState(null); // null = loading
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const suggestedId = suggested ? suggested.id : null; // the default selection depends on the id only

  useEffect(() => {
    let alive = true;
    // a course test can only be given to the class's students enrolled in that course
    axios.get(`${base}/classrooms/${classroom.id}/students${courseId ? `?courseId=${courseId}` : ""}`, auth)
      .then((res) => {
        if (!alive) return;
        const list = res.data.students;
        setStudents(list);
        const inClass = suggestedId !== null && list.some((s) => s.id === suggestedId);
        setSelected(new Set(inClass ? [suggestedId] : suggestedId !== null ? [] : list.map((s) => s.id)));
      })
      .catch(() => { if (alive) { setStudents([]); setLoadError("Could not load the students of this class."); } });
    return () => { alive = false; };
  }, [base, auth, classroom.id, suggestedId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students || []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [students, query]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const total = students ? students.length : 0;
  const count = selected.size;
  const wholeClass = total > 0 && count === total;
  const suggestedMissing = suggested && students && !students.some((s) => s.id === suggested.id);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="aia-assign-title" data-testid="aia-assign-modal">
      <div className="bg-white rounded-none border border-[#ebdcaa] shadow-[0_12px_40px_rgba(0,35,102,0.2)] w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[#ebdcaa] bg-[#fffdf4]">
          <div>
            <h3 id="aia-assign-title" className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] flex items-center gap-2">
              <Users size={18} className="text-[#B99652]" />
              <span>Assign Assessment</span>
            </h3>
            <p className="text-xs text-[#7a705a] mt-0.5">"{testTitle}" · {classLabel(classroom)}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className="p-1 rounded-none hover:bg-[#B99652]/10 text-[#7a705a] hover:text-[#B99652] transition-colors" aria-label="Cancel">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 pb-3 space-y-3">
          {suggested && (
            <div className="p-3 rounded-none bg-[#fff8e7] border border-[#fde68a] text-xs text-[#92400e]" data-testid="aia-assign-suggested">
              Suggested for: <strong className="text-[#92400e]">{suggested.name}</strong>
              {suggestedMissing && <span className="block text-xs text-amber-700 mt-0.5">{suggested.name} is not in this class. Choose students below.</span>}
            </div>
          )}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-[#a09783]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students..."
              aria-label="Search students"
              className="w-full pl-9 pr-3 py-2 border border-[#ebdcaa] rounded-none text-xs sm:text-sm bg-[#fffdf4]/40 text-[#1e1b4b] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
              data-testid="aia-assign-search"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(new Set((students || []).map((s) => s.id)))}
              disabled={!total || busy}
              className="px-3 py-1.5 border border-[#ebdcaa] rounded-none font-bold text-[#92400e] bg-white hover:bg-[#fffdf4] disabled:opacity-50 transition-all"
              data-testid="aia-assign-all"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={!count || busy}
              className="px-3 py-1.5 border border-[#ebdcaa] rounded-none font-bold text-[#7a705a] bg-white hover:bg-[#fffdf4] disabled:opacity-50 transition-all"
              data-testid="aia-assign-none"
            >
              Deselect all
            </button>
          </div>
        </div>

        <div className="px-5 overflow-y-auto flex-1 min-h-[8rem]" data-testid="aia-assign-list">
          {students === null ? (
            <div className="flex items-center gap-2 text-xs text-[#7a705a] py-6 justify-center">
              <Loader2 size={16} className="animate-spin text-[#B99652]" />
              <span>Loading student roster…</span>
            </div>
          ) : loadError ? (
            <p className="text-xs text-red-600 py-4 font-medium">{loadError}</p>
          ) : total === 0 ? (
            <p className="text-xs text-[#7a705a] py-4">This class has no students enrolled.</p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-[#7a705a] py-4">No student matches "{query}".</p>
          ) : (
            <ul className="divide-y divide-[#ebdcaa]/60">
              {visible.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-3 py-2.5 cursor-pointer text-xs sm:text-sm font-medium hover:bg-[#fffdf4]/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      disabled={busy}
                      className="accent-[#B99652] h-4 w-4 rounded-none"
                      data-testid="aia-assign-student"
                      data-student-id={s.id}
                    />
                    <span className="flex-1 text-[#1e1b4b]">{s.name}</span>
                    {suggested && s.id === suggested.id && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                        Target Student
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-5 border-t border-[#ebdcaa] flex items-center justify-between gap-3 bg-[#fffdf4]/40">
          <span className="text-xs text-[#665e4d]" data-testid="aia-assign-count">
            Selected: <strong className="text-[#92400e]">{count}</strong> student{count === 1 ? "" : "s"}{wholeClass ? " (whole class)" : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 border border-[#ebdcaa] rounded-none text-xs font-bold text-[#665e4d] bg-white hover:bg-[#fffdf4] transition-colors"
              data-testid="aia-assign-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm([...selected].sort((a, b) => a - b), wholeClass)}
              disabled={busy || count === 0 || !!loadError}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none text-xs font-bold border border-[#9b7b3e] shadow-xs transition-all disabled:opacity-50"
              data-testid="aia-assign-confirm"
            >
              {busy && <Loader2 size={14} className="animate-spin text-white" />}
              <span>Confirm & Assign</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Publish body for the selection: whole class = no body (the pre-008 request); otherwise the chosen ids. */
export const publishBody = (ids, wholeClass) => (wholeClass ? undefined : { recipientIds: ids });

/** "Whole class" / "3 selected students" for a test's recipients (server field; absent before 008). */
export const recipientsText = (r) => (r && r.mode === "selected" ? `${r.studentIds.length} selected student${r.studentIds.length === 1 ? "" : "s"}` : "Whole class");
