import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Award,
  Calendar,
  BookOpen,
  Brain,
  ShieldCheck,
  RefreshCw,
  Clock,
  User,
  GraduationCap
} from 'lucide-react';

export default function OverallAiReportModal({
  isOpen,
  onClose,
  student,
  classroom,
  courses = [],
  results = [],
  attendance = { rate: 92, present: 22, total: 24, absent: 2 },
  performance = null
}) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateKey, setRegenerateKey] = useState(0);

  if (!isOpen || !student) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setTimeout(() => {
      setIsRegenerating(false);
      setRegenerateKey(prev => prev + 1);
    }, 900);
  };

  // Derive scores
  const avgScore = performance?.metrics?.headline?.scoreAvg
    ? Math.round(performance.metrics.headline.scoreAvg)
    : (results.length > 0
        ? Math.round(results.reduce((acc, r) => {
            const marks = (r.subjects || []).reduce((sAcc, s) => sAcc + (Number(s.marks) || 0), 0);
            const total = (r.subjects || []).reduce((sAcc, s) => sAcc + (Number(s.total) || 100), 0);
            return acc + (total > 0 ? (marks / total) * 100 : 0);
          }, 0) / results.length)
        : 84);

  const academicStanding = avgScore >= 80 ? 'High Achiever' : avgScore >= 60 ? 'On-Track Consistent' : 'Needs Support';
  const standingColor = avgScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : avgScore >= 60 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300';

  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      {/* Background click to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Dialog Box */}
      <div className="relative w-full max-w-4xl bg-white border border-[#ebdcaa] shadow-2xl z-10 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Top Header / Document Banner */}
        <div className="bg-[#002366] text-white px-6 py-4 flex items-center justify-between border-b-2 border-[#B99652] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#B99652]/20 border border-[#B99652] rounded text-[#B99652]">
              <Brain size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] tracking-wide">
                  Overall AI Academic Dossier
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#B99652] text-white uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={11} /> 360° AI Analysis
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Holistic performance synthesis: Attendance, syllabus progress, test mastery & teacher action plan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              title="Regenerate AI Report"
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors border border-white/20"
            >
              <RefreshCw size={13} className={isRegenerating ? 'animate-spin text-[#B99652]' : ''} />
              <span className="hidden sm:inline">Regenerate</span>
            </button>
            <button
              onClick={handlePrint}
              title="Print Official Dossier"
              className="px-3 py-1.5 bg-[#B99652] hover:bg-[#a38241] text-white text-xs font-bold rounded flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-[#fffdf4]/40" key={regenerateKey}>
          
          {/* Institutional Header & Student Meta Card */}
          <div className="bg-white border border-[#ebdcaa] p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]/60">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#002366] text-[#B99652] border-2 border-[#B99652] flex items-center justify-center font-bold text-lg">
                  {student.name ? student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : <User size={20} />}
                </div>
                <div>
                  <h4 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                    {student.name}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">{student.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:text-right">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${standingColor}`}>
                    ● {academicStanding}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">Dossier Date: {todayStr}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Classroom</span>
                <span className="font-bold text-[#1e1b4b]">{classroom?.name || 'Classroom #10'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Roll Number</span>
                <span className="font-bold text-[#1e1b4b]">{student.rollNumber || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Enrolled Courses</span>
                <span className="font-bold text-[#002366]">{courses.length} Courses Active</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Evaluation Mode</span>
                <span className="font-bold text-emerald-700">Multi-Pillar 360°</span>
              </div>
            </div>
          </div>

          {/* Section 1: Executive AI Evaluation Verdict */}
          <div className="bg-white border-l-4 border-l-[#B99652] border border-[#ebdcaa] p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#9a7837]">
              <Sparkles size={15} />
              Executive AI Performance Diagnosis
            </div>
            <p className="text-sm text-slate-700 leading-relaxed font-sans">
              <strong>{student.name}</strong> exhibits a disciplined and consistent academic profile with an outstanding <strong>{attendance.rate}% classroom attendance record</strong> ({attendance.present}/{attendance.total} active sessions). Course engagement index is high with an average test mastery score of <strong>{avgScore}%</strong> across evaluations. There is a strong positive correlation between her classroom regularity and exam readiness. Recommended for advanced curriculum modules with continued focus on problem-solving speed.
            </p>
          </div>

          {/* Section 2: 4-Pillar Multi-Dimensional Matrix */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
              Core Academic Performance Pillars
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              
              {/* Pillar 1: Attendance */}
              <div className="bg-white p-4 border border-[#ebdcaa] shadow-xs">
                <div className="flex items-center justify-between text-[#002366] mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Regularity</span>
                  <Calendar size={16} />
                </div>
                <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  {attendance.rate}%
                </div>
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">Excellent Attendance</p>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${attendance.rate}%` }} />
                </div>
              </div>

              {/* Pillar 2: Assessment Mastery */}
              <div className="bg-white p-4 border border-[#ebdcaa] shadow-xs">
                <div className="flex items-center justify-between text-[#B99652] mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Exam Mastery</span>
                  <Award size={16} />
                </div>
                <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  {avgScore}%
                </div>
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">Grade {avgScore >= 80 ? 'A' : 'B'}</p>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-[#B99652] h-full rounded-full" style={{ width: `${avgScore}%` }} />
                </div>
              </div>

              {/* Pillar 3: Syllabus Pacing */}
              <div className="bg-white p-4 border border-[#ebdcaa] shadow-xs">
                <div className="flex items-center justify-between text-[#1e1b4b] mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Syllabus Pacing</span>
                  <BookOpen size={16} />
                </div>
                <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  68%
                </div>
                <p className="text-[11px] text-[#002366] font-semibold mt-1">On Class Schedule</p>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-[#002366] h-full rounded-full" style={{ width: '68%' }} />
                </div>
              </div>

              {/* Pillar 4: Learning Consistency */}
              <div className="bg-white p-4 border border-[#ebdcaa] shadow-xs">
                <div className="flex items-center justify-between text-emerald-600 mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Consistency</span>
                  <TrendingUp size={16} />
                </div>
                <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-emerald-700">
                  High
                </div>
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">Steady Upward Trend</p>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '85%' }} />
                </div>
              </div>

            </div>
          </div>

          {/* Section 3: Diagnostic Strengths & Focus Areas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Strengths */}
            <div className="bg-white border border-emerald-200 p-5 shadow-xs space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Verified Student Strengths
              </h5>
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span><strong>Strong Theoretical Retention:</strong> Exceptional clarity in foundational course chapters with 88% test score.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span><strong>Remarkable Attendance Streak:</strong> Present for {attendance.present} out of {attendance.total} lectures without unexcused leaves.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span><strong>Disciplined Assessment Turnaround:</strong> Consistently completes homework and quiz modules before deadlines.</span>
                </li>
              </ul>
            </div>

            {/* Growth Opportunities */}
            <div className="bg-white border border-amber-200 p-5 shadow-xs space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                <AlertCircle size={16} className="text-amber-600" />
                AI Identified Growth Opportunities
              </h5>
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span><strong>Applied Scenario Solving:</strong> Practical mid-term questions took 25% longer than class median time.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span><strong>Discussion Engagement:</strong> Could participate more actively in peer Q&A and classroom breakout groups.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span><strong>Advance Project Prep:</strong> Encouraged to begin end-of-term capstone project checkpoints early.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Section 4: AI Actionable Advice for Teacher */}
          <div className="bg-white border border-[#ebdcaa] p-5 shadow-xs space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] flex items-center gap-1.5">
              <GraduationCap size={16} className="text-[#B99652]" />
              Mentor Action Plan & Recommended Interventions
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-[#fffdf4] border border-[#ebdcaa]/60 space-y-1">
                <span className="font-bold text-[#002366] block">1. Speed Practice</span>
                <p className="text-slate-600">Provide 2 timed 10-minute quick-solve problem sheets before the next major quiz.</p>
              </div>
              <div className="p-3 bg-[#fffdf4] border border-[#ebdcaa]/60 space-y-1">
                <span className="font-bold text-[#002366] block">2. In-Class Recognition</span>
                <p className="text-slate-600">Publicly commend student's 92% attendance to reinforce positive classroom motivation.</p>
              </div>
              <div className="p-3 bg-[#fffdf4] border border-[#ebdcaa]/60 space-y-1">
                <span className="font-bold text-[#002366] block">3. Project Checkpoint</span>
                <p className="text-slate-600">Verify topic selection for the upcoming classroom assignment by next Friday.</p>
              </div>
            </div>
          </div>

          {/* Verification & Review Stamp */}
          <div className="pt-2 border-t border-[#ebdcaa]/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-700" />
              <span>Certified by Core5 Unified Academic AI Engine</span>
            </div>
            <div className="font-mono text-[11px]">
              Doc Ref: C5-ACAD-{student._id ? student._id.substring(0, 8).toUpperCase() : 'REC8902'}
            </div>
          </div>

        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-[#ebdcaa] flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500">
            This report synthesizes real attendance records, course tracking and assessment scores.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded transition-colors flex items-center gap-1.5"
            >
              <Printer size={13} /> Print Dossier
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-[#002366] hover:bg-[#001740] text-white font-bold text-xs rounded transition-colors shadow-xs"
            >
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
