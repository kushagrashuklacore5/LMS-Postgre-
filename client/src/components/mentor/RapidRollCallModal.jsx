import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  X, 
  Check, 
  UserX, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Zap, 
  Save, 
  CheckCircle2, 
  Keyboard,
  ArrowDown,
  ArrowUp,
  UserCheck
} from "lucide-react";

/**
 * RapidRollCallModal
 * 
 * High-speed, horizontal single-spot roll call mode:
 * - Wide horizontal layout (landscape) matching desktop screen dimensions.
 * - Smooth "Down to Up" (or "Up to Down" on undo) vertical sliding transition for students.
 * - Stationary Action Buttons on the right: Teacher keeps mouse resting in one spot.
 * - A-Z alphabetical sequence.
 * - Keyboard shortcuts (Space / Enter / P = Present, A = Absent, Left Arrow = Undo, Right Arrow = Skip).
 */
const RapidRollCallModal = ({
  isOpen,
  onClose,
  students = [],
  attendanceData = {},
  onAttendanceChange,
  onSaveAttendance,
  selectedDate,
  classroomName = "Current Classroom"
}) => {
  // Sort students strictly in alphabetical order (A to Z)
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => 
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
    );
  }, [students]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState("down-to-up"); // 'down-to-up' (forward) or 'up-to-down' (undo)
  const [isCompleted, setIsCompleted] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  // Reset or adjust index when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsCompleted(false);
      setSlideDirection("down-to-up");
      setAnimKey(prev => prev + 1);
    }
  }, [isOpen]);

  const total = sortedStudents.length;
  const currentStudent = sortedStudents[currentIndex] || null;
  const nextStudent = currentIndex < total - 1 ? sortedStudents[currentIndex + 1] : null;
  const currentStudentId = currentStudent ? (currentStudent.id || currentStudent._id) : null;
  const currentStatus = currentStudentId ? attendanceData[currentStudentId] : "present";

  // Calculate live stats
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

  // Mark status and advance with smooth down-to-up slide
  const handleMarkAndAdvance = useCallback((status) => {
    if (!currentStudent || !currentStudentId) return;

    // Update parent state
    onAttendanceChange(currentStudentId, status);

    // Slide to next student
    if (currentIndex < total - 1) {
      setSlideDirection("down-to-up");
      setAnimKey(prev => prev + 1);
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Reached the end!
      setIsCompleted(true);
    }
  }, [currentStudent, currentStudentId, currentIndex, total, onAttendanceChange]);

  // Navigate backward (Undo / Previous) with up-to-down slide
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setSlideDirection("up-to-down");
      setAnimKey(prev => prev + 1);
      setCurrentIndex((prev) => prev - 1);
      setIsCompleted(false);
    }
  }, [currentIndex]);

  // Skip to next without changing status
  const handleSkipNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setSlideDirection("down-to-up");
      setAnimKey(prev => prev + 1);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
    }
  }, [currentIndex, total]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Ignore if typing inside an input/textarea
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleSkipNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isCompleted, handleMarkAndAdvance, handlePrevious, handleSkipNext, onClose, onSaveAttendance]);

  if (!isOpen) return null;

  const progressPercent = total > 0 ? Math.round(((currentIndex + (isCompleted ? 1 : 0)) / total) * 100) : 0;

  // Initials generator
  const getInitials = (name = "") => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || "ST";
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Horizontal Landscape Shell */}
      <div 
        className="relative w-full max-w-4xl xl:max-w-5xl bg-white border border-[#ebdcaa]/80 shadow-2xl rounded-none overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Strip */}
        <div className="bg-[#1e1b4b] text-white px-6 py-3.5 flex items-center justify-between border-b border-[#ebdcaa]/30">
          <div className="flex items-center gap-3">
            <span className="p-1.5 bg-[#B99652]/30 text-[#e9d5a1] rounded-none">
              <Zap className="w-5 h-5 fill-[#B99652] text-[#B99652]" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-wide flex items-center gap-2">
                Rapid Roll Call Cockpit
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#B99652] text-white px-2 py-0.5 rounded-none">
                  A-Z Order
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                {classroomName} • {selectedDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-xs bg-white/10 px-3 py-1.5 rounded-none">
              <span className="font-bold text-[#e9d5a1]">
                Student {Math.min(currentIndex + 1, total)} of {total}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-emerald-300 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                {stats.present} Present
              </span>
              <span className="text-rose-300 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                {stats.absent} Absent
              </span>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 hover:bg-white/10 rounded-none transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Linear Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#B99652] to-[#059669] transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Main Body: Horizontal 3-Column Layout */}
        <div className="p-6 sm:p-8 bg-gradient-to-b from-white to-[#fffdf7]">
          {!isCompleted && currentStudent ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              
              {/* Left Column: Avatar & Roll Badge (4 cols) */}
              <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-[#fffdf4] border border-[#ebdcaa]/70 rounded-none text-center">
                <div className="relative mb-3">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-[#002366] via-[#1e1b4b] to-[#2e1065] text-white flex items-center justify-center text-3xl sm:text-4xl font-extrabold shadow-md border-4 border-white ring-2 ring-[#ebdcaa]">
                    {getInitials(currentStudent.name)}
                  </div>
                  <span className="absolute -bottom-2 -right-1 px-2.5 py-0.5 bg-[#B99652] text-white text-[11px] font-bold shadow-sm uppercase tracking-wider">
                    #{currentIndex + 1}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold uppercase tracking-wider mb-2">
                  <span>A-Z Roll Order</span>
                </div>

                {/* Status Indicator Pill */}
                <div>
                  {currentStatus === "present" ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <Check className="w-3.5 h-3.5" /> Marked: Present
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      <UserX className="w-3.5 h-3.5" /> Marked: Absent
                    </span>
                  )}
                </div>
              </div>

              {/* Middle Column: Sliding Student Theater (Down-to-Up Transition) (5 cols) */}
              <div className="md:col-span-5 flex flex-col justify-center px-2 py-2 overflow-hidden">
                <div 
                  key={`${currentStudentId}-${animKey}`}
                  className="transition-all duration-300"
                  style={{
                    animation: slideDirection === "down-to-up"
                      ? "rapidSlideDownToUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                      : "rapidSlideUpToDown 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                  }}
                >
                  <div className="flex items-center gap-2 text-xs text-[#9a7837] font-bold uppercase tracking-wider mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B99652]"></span>
                    <span>Current Student</span>
                  </div>

                  <h3 className="text-3xl sm:text-4xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight leading-tight mb-2">
                    {currentStudent.name}
                  </h3>

                  <div className="space-y-1 mb-5">
                    <p className="text-sm text-slate-600 font-medium flex items-center gap-2">
                      <span className="text-slate-400">Email:</span>
                      <span className="text-slate-800">{currentStudent.email || "No email available"}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Classroom: <span className="font-semibold text-slate-700">{classroomName}</span>
                    </p>
                  </div>

                  {/* Next Student Preview Strip */}
                  <div className="p-3 bg-slate-50 border-l-4 border-l-[#B99652] border border-slate-200/80 text-xs text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-bold uppercase text-[10px]">Next in A-Z:</span>
                      <span className="font-semibold text-[#1e1b4b] truncate max-w-[170px]">
                        {nextStudent ? nextStudent.name : "None (Last Student)"}
                      </span>
                    </div>
                    {nextStudent && <ArrowDown className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </div>
              </div>

              {/* Right Column: STATIONARY ACTION HOTSPOT (3 cols) */}
              <div className="md:col-span-3 flex flex-col justify-center space-y-3 p-3 bg-white border border-[#ebdcaa]/60 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center mb-0.5">
                  Single-Spot Click Hotspot
                </div>

                {/* Primary Present Button (Stationary) */}
                <button
                  type="button"
                  onClick={() => handleMarkAndAdvance("present")}
                  className="group relative w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 border-2 border-emerald-600 hover:border-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-150 flex flex-col items-center justify-center cursor-pointer"
                  title="Mark Present & Slide to Next Student"
                >
                  <div className="flex items-center gap-2 font-extrabold text-base tracking-wide">
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>PRESENT</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-emerald-100 tracking-wider mt-0.5">
                    [ Space / Enter ]
                  </span>
                </button>

                {/* Absent Button (Stationary) */}
                <button
                  type="button"
                  onClick={() => handleMarkAndAdvance("absent")}
                  className="group relative w-full py-3 px-4 bg-rose-50 hover:bg-rose-600 active:scale-98 border-2 border-rose-200 hover:border-rose-600 text-rose-700 hover:text-white shadow-xs hover:shadow-md transition-all duration-150 flex flex-col items-center justify-center cursor-pointer"
                  title="Mark Absent & Slide to Next Student"
                >
                  <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
                    <UserX className="w-4 h-4 text-rose-600 group-hover:text-white" />
                    <span>ABSENT</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-rose-500 group-hover:text-rose-100 mt-0.5">
                    Key: [ A ]
                  </span>
                </button>

                {/* Navigation helpers (Undo / Skip) */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    className="flex items-center gap-1 py-1 px-1.5 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Previous Student (Undo)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">Undo [←]</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipNext}
                    className="flex items-center gap-1 py-1 px-1.5 hover:bg-slate-100 text-slate-700 transition-colors"
                    title="Skip to Next without changing"
                  >
                    <span className="text-[11px] font-semibold">Skip [→]</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          ) : (
            /* Roll Call Complete View (Horizontal Banner) */
            <div className="py-6 px-4 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <h3 className="text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">
                Roll Call Completed!
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                All {total} students in <span className="font-semibold">{classroomName}</span> have been marked for {selectedDate}.
              </p>

              {/* Horizontal Summary Strip */}
              <div className="flex items-center justify-center gap-4 max-w-md mx-auto mb-8">
                <div className="flex-1 p-3 bg-emerald-50 border border-emerald-200 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Present</p>
                  <p className="text-2xl font-extrabold text-emerald-700">{stats.present}</p>
                </div>
                <div className="flex-1 p-3 bg-rose-50 border border-rose-200 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Absent</p>
                  <p className="text-2xl font-extrabold text-rose-700">{stats.absent}</p>
                </div>
                <div className="flex-1 p-3 bg-[#fffdf4] border border-[#ebdcaa] text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#9a7837]">Total</p>
                  <p className="text-2xl font-extrabold text-[#1e1b4b]">{total}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (onSaveAttendance) onSaveAttendance();
                    onClose();
                  }}
                  className="px-6 py-3 bg-[#B99652] hover:bg-[#a38241] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Attendance & Close</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm transition-colors"
                >
                  Review in Table
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex(0);
                    setIsCompleted(false);
                    setSlideDirection("down-to-up");
                    setAnimKey(prev => prev + 1);
                  }}
                  className="px-4 py-3 border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold text-sm flex items-center justify-center gap-1 transition-colors"
                  title="Restart Roll Call"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restart</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Shortcuts / Status Footer */}
        <div className="bg-slate-50 px-6 py-2.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Keyboard className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700">Keyboard Shortcuts:</span>
            <span className="px-1.5 py-0.5 bg-white border border-slate-200 font-mono text-[10px] text-slate-700">Space / Enter / P</span>
            <span>(Present)</span>
            <span>•</span>
            <span className="px-1.5 py-0.5 bg-white border border-slate-200 font-mono text-[10px] text-slate-700">A</span>
            <span>(Absent)</span>
            <span>•</span>
            <span className="px-1.5 py-0.5 bg-white border border-slate-200 font-mono text-[10px] text-slate-700">←</span>
            <span>(Undo)</span>
            <span>•</span>
            <span className="px-1.5 py-0.5 bg-white border border-slate-200 font-mono text-[10px] text-slate-700">→</span>
            <span>(Skip)</span>
            <span>•</span>
            <span className="px-1.5 py-0.5 bg-white border border-slate-200 font-mono text-[10px] text-slate-700">Esc</span>
            <span>(Close)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-medium text-slate-600">Auto-Slides Down to Up</span>
          </div>
        </div>
      </div>

      {/* Down-to-Up & Up-to-Down Keyframe Animations */}
      <style>{`
        @keyframes rapidSlideDownToUp {
          0% {
            opacity: 0;
            transform: translateY(28px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes rapidSlideUpToDown {
          0% {
            opacity: 0;
            transform: translateY(-28px);
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

export default RapidRollCallModal;
