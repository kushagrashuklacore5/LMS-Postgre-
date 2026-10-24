import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Check, UserX, RotateCcw, ChevronLeft, ChevronRight, ClipboardCheck, UserCheck, X, Save } from "lucide-react";

/**
 * SpeedAttendanceBar
 * 
 * Minimal, eye-friendly, single-line speed attendance strip.
 * - Sits directly above the attendance table.
 * - Single horizontal line (height ~50px).
 * - Soft, calm, non-vibrant palette (neutral slate, soft emerald, muted rose).
 * - Smooth down-to-up text sliding animation when advancing to the next student.
 * - Stationary buttons on the right: cursor stays fixed on [✓ Present].
 * - Full keyboard support: Space/Enter/P = Present, A = Absent, Left Arrow = Undo, Esc = Close.
 */
const SpeedAttendanceBar = ({
  students = [],
  attendanceData = {},
  onAttendanceChange,
  onSaveAttendance,
  selectedClassroom
}) => {
  const [isActive, setIsActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState("up"); // 'up' (down-to-up) or 'down' (up-to-down)
  const [isCompleted, setIsCompleted] = useState(false);

  // Natural alphabetical sorting
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => 
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
    );
  }, [students]);

  const total = sortedStudents.length;
  const currentStudent = sortedStudents[currentIndex] || null;
  const currentStudentId = currentStudent ? (currentStudent.id || currentStudent._id) : null;
  const currentStatus = currentStudentId ? attendanceData[currentStudentId] : "present";

  // Calculate counts
  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    sortedStudents.forEach((s) => {
      const sId = s.id || s._id;
      const status = attendanceData[sId];
      if (status === "present") present++;
      else if (status === "absent") absent++;
    });
    return { present, absent, total };
  }, [sortedStudents, attendanceData, total]);

  // Reset when students or classroom changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsCompleted(false);
  }, [selectedClassroom]);

  // Mark & Advance
  const handleMarkAndAdvance = useCallback((status) => {
    if (!currentStudent || !currentStudentId) return;

    onAttendanceChange(currentStudentId, status);

    if (currentIndex < total - 1) {
      setDirection("up");
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
    }
  }, [currentStudent, currentStudentId, currentIndex, total, onAttendanceChange]);

  // Undo / Previous
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setDirection("down");
      setCurrentIndex((prev) => prev - 1);
      setIsCompleted(false);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setIsActive(false);
      } else if (isCompleted) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (onSaveAttendance) onSaveAttendance();
        }
      } else {
        if (e.key === " " || e.key === "p" || e.key === "P" || e.key === "Enter") {
          e.preventDefault();
          handleMarkAndAdvance("present");
        } else if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          handleMarkAndAdvance("absent");
        } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
          e.preventDefault();
          handlePrevious();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, isCompleted, handleMarkAndAdvance, handlePrevious, onSaveAttendance]);

  if (!students || students.length === 0) return null;

  // 1. Inactive State: Highlighted, clean single-line bar
  if (!isActive) {
    return (
      <div className="mb-3 px-4 py-2.5 bg-gradient-to-r from-[#fffdf7] via-white to-[#fffdf7] border-l-4 border-l-[#B99652] border border-[#ebdcaa] flex items-center justify-between text-xs shadow-xs transition-all">
        <div className="flex items-center gap-3 text-slate-700">
          <div className="p-1.5 bg-[#B99652] text-white shadow-2xs">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-[#1e1b4b] text-sm mr-2">Mark Attendance</span>
            <span className="text-slate-500 hidden sm:inline text-xs">
              • Quick 1-click single-line roll call (Space = Present, A = Absent)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsActive(true);
            setIsCompleted(false);
          }}
          className="px-4 py-2 bg-[#B99652] hover:bg-[#a38241] text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer border border-[#a38241]"
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Mark Attendance</span>
        </button>
      </div>
    );
  }

  // 2. Active State: Minimal Highlighted Single-Line Strip
  return (
    <div className="mb-3 px-4 py-2 bg-[#fffdfa] border-l-4 border-l-[#059669] border border-[#ebdcaa] shadow-sm flex items-center justify-between gap-4 transition-all">
      {!isCompleted && currentStudent ? (
        <>
          {/* Left: Counter + Sliding Student Identity in Single Line */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Minimal Counter */}
            <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
              {currentIndex + 1} / {total}
            </span>

            {/* Viewport for smooth down-to-up text sliding */}
            <div className="overflow-hidden h-7 flex items-center">
              <div 
                key={currentStudentId}
                className="flex items-center gap-2.5 whitespace-nowrap"
                style={{
                  animation: direction === "up" 
                    ? "minimalSlideDownToUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                    : "minimalSlideUpToDown 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                }}
              >
                <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {currentStudent.name}
                </span>

                <span className="text-xs text-slate-400 hidden md:inline truncate max-w-[200px]">
                  ({currentStudent.email || "No email"})
                </span>

                {/* Subtle Status Tag */}
                {currentStatus === "present" ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Present
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200">
                    Absent
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Stationary Action Buttons (Muted, Minimal, Calm) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Absent Button */}
            <button
              type="button"
              onClick={() => handleMarkAndAdvance("absent")}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Mark Absent (Key: A)"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Absent [A]</span>
            </button>

            {/* Present Button (STATIONARY HOTSPOT) */}
            <button
              type="button"
              onClick={() => handleMarkAndAdvance("present")}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Mark Present (Key: Space or Enter)"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Present [Space]</span>
            </button>

            {/* Undo */}
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous Student (Undo)"
            >
              Undo
            </button>

            {/* Close Speed Mode */}
            <button
              type="button"
              onClick={() => setIsActive(false)}
              className="p-1 text-slate-400 hover:text-slate-700 transition-colors ml-1"
              title="Exit Speed Mode (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        /* Completed State in the Same Single Line */
        <div className="w-full flex items-center justify-between text-xs py-0.5">
          <div className="flex items-center gap-2 text-slate-800">
            <span className="font-bold text-emerald-700 flex items-center gap-1">
              <Check className="w-4 h-4" />
              Roll Call Finished!
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">
              <strong className="text-emerald-700">{stats.present}</strong> Present,{" "}
              <strong className="text-rose-700">{stats.absent}</strong> Absent
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onSaveAttendance) onSaveAttendance();
                setIsActive(false);
              }}
              className="px-3 py-1 bg-[#B99652] hover:bg-[#a38241] text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Exit</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentIndex(0);
                setIsCompleted(false);
              }}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restart</span>
            </button>

            <button
              type="button"
              onClick={() => setIsActive(false)}
              className="p-1 text-slate-400 hover:text-slate-700"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Smooth Down-to-Up and Up-to-Down Keyframe Animations */}
      <style>{`
        @keyframes minimalSlideDownToUp {
          0% {
            opacity: 0;
            transform: translateY(14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes minimalSlideUpToDown {
          0% {
            opacity: 0;
            transform: translateY(-14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default SpeedAttendanceBar;
