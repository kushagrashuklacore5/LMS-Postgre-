import React, { useEffect, useRef, useState } from 'react';
import { Bell, BookOpen, Clock, GraduationCap, LayoutDashboard, RotateCcw, School, Send, Trophy, UserCheck, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/auth';
import core5RobotPerfect from '../../assets/core5_robot_perfect.png';
import core5RobotAvatar from '../../assets/core5_robot_avatar.png';

/**
 * Core5 AI Assistant Mascot (Frontend UI Shell).
 * Pure decoupled frontend interface with 3D Mascot & "Hi! Need help?" speech bubble.
 * Old pseudo-backend services decoupled and ready for friend's dedicated AI API integration.
 */

const firstName = (user) => String(user?.name || '').trim().split(/\s+/)[0] || 'there';

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeLocalStorage = () => {
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

const shouldAutoOpen = (storage, uid) => {
  if (!storage || !uid) return false;
  try {
    return storage.getItem(`core5_chatbot:opened:${uid}`) === null;
  } catch (_) {
    return false;
  }
};

const markAutoOpened = (storage, uid) => {
  if (!storage || !uid) return;
  try {
    storage.setItem(`core5_chatbot:opened:${uid}`, '1');
  } catch (_) {}
};

let nextId = 0;
const newId = () => `${Date.now()}-${nextId++}`;

const BotAvatar = () => (
  <div className="h-7 w-7 shrink-0 rounded-full bg-[#002366] ring-1 ring-[#B99652]/40 overflow-hidden flex items-center justify-center shadow-sm">
    <img src={core5RobotAvatar} alt="Bot Avatar" className="w-full h-full object-cover scale-110" />
  </div>
);

export default function LMSChatbot({ role = 'student' }) {
  const { t, i18n } = useTranslation('chatbot');
  const { user } = useAuth();
  const userId = user?.id ?? user?.userId ?? user?._id;

  const modeConfig = {
    student: {
      role: 'student',
      chips: [
        { Icon: Trophy, label: t('chip_my_results', 'My Results'), message: 'How do I check my results?' },
        { Icon: Clock, label: t('chip_attendance', 'Attendance'), message: 'How is attendance recorded?' },
        { Icon: School, label: t('chip_my_classroom', 'My Classroom'), message: 'Tell me about classroom schedules' },
        { Icon: Bell, label: t('chip_announcements', 'Announcements'), message: 'Where are my school announcements?' },
      ],
      subtitle: t('subtitle_student', 'AI Student Assistant'),
      badge: t('badge_student', 'Student'),
      placeholder: t('placeholder_student', 'Ask anything about your courses, studies, or exams...'),
      greeting: (name) =>
        t('greeting_student', {
          name,
          defaultValue: `Hi ${name}! I'm your AI Academic Assistant. How can I assist you with your learning today?`,
        }),
    },
    mentor: {
      role: 'mentor',
      chips: [
        { Icon: School, label: t('chip_my_classrooms', 'My Classrooms'), message: 'Help with classroom management' },
        { Icon: Users, label: t('chip_my_students', 'My Students'), message: 'Student engagement tips' },
        { Icon: Trophy, label: t('chip_class_results', 'Class Results'), message: 'Grading and assessment insights' },
        { Icon: BookOpen, label: t('chip_my_courses', 'My Courses'), message: 'Course curriculum assistance' },
      ],
      subtitle: t('subtitle_mentor', 'AI Mentor Assistant'),
      badge: t('badge_mentor', 'Mentor'),
      placeholder: t('placeholder_mentor', 'Ask anything about your classrooms, students, or syllabus...'),
      greeting: (name) =>
        t('greeting_mentor', {
          name,
          defaultValue: `Hi ${name}! I'm your AI Faculty Assistant. Ready to help you manage your classrooms and students.`,
        }),
    },
    admin: {
      role: 'admin',
      chips: [
        { Icon: LayoutDashboard, label: t('chip_overview', 'Overview'), message: 'Campus administration insights' },
        { Icon: School, label: t('chip_classrooms', 'Classrooms'), message: 'Classroom allocation guidance' },
        { Icon: UserCheck, label: t('chip_mentors', 'Mentors'), message: 'Faculty management queries' },
        { Icon: Users, label: t('chip_students', 'Students'), message: 'Student enrollment guidance' },
      ],
      subtitle: t('subtitle_admin', 'AI Administrative Assistant'),
      badge: t('badge_admin', 'Admin'),
      placeholder: t('placeholder_admin', 'Ask about institutional operations, faculty, or students...'),
      greeting: (name) =>
        t('greeting_admin', {
          name,
          defaultValue: `Hi ${name}! I'm your AI Campus Assistant. How can I assist your administration today?`,
        }),
    },
  };

  const mode = modeConfig[role] || modeConfig.student;
  const isAuthorized = user?.role === mode.role;
  const { chips, subtitle, placeholder } = mode;
  const roleBadge = mode.badge;

  const greetingHtml = () => mode.greeting(esc(firstName(user)));

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => [{ id: newId(), role: 'assistant', html: greetingHtml() }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsEnd = useRef(null);
  const mounted = useRef(true);

  // Update initial greeting when language changes if user hasn't sent messages yet
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === 'assistant') {
        return [{ ...prev[0], html: greetingHtml() }];
      }
      return prev;
    });
  }, [i18n.language, role]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // First visit auto-open check
  useEffect(() => {
    if (!isAuthorized) return;
    const storage = safeLocalStorage();
    if (shouldAutoOpen(storage, userId)) {
      markAutoOpened(storage, userId);
      setIsOpen(true);
    }
  }, [isAuthorized, userId]);

  useEffect(() => {
    if (isOpen) msgsEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, isOpen]);

  if (!isAuthorized) return null;

  const open = () => {
    markAutoOpened(safeLocalStorage(), userId);
    setIsOpen(true);
  };

  const sendMessage = async (text) => {
    const tMsg = (text ?? input).trim();
    if (!tMsg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { id: newId(), role: 'user', text: tMsg }]);
    setLoading(true);

    // Natural assistant responsiveness delay
    await new Promise((resolve) => setTimeout(resolve, 600));

    // =========================================================================
    // 🔗 INTEGRATION POINT FOR YOUR FRIEND'S AI BACKEND:
    // =========================================================================
    // When your friend provides the AI API URL, uncomment this block:
    // try {
    //   const res = await fetch("YOUR_FRIEND_API_URL/chat", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ message: tMsg, role, userId })
    //   });
    //   const data = await res.json();
    //   html = data.reply || data.answer || data.message;
    // } catch (err) {
    //   html = "Error connecting to AI service.";
    // }
    // =========================================================================

    const html = `<div class="p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl text-slate-700 text-xs leading-relaxed shadow-sm">
      <div class="flex items-center gap-1.5 font-semibold text-[#002366] mb-1">
        <span>🤖</span>
        <span>${t('ai_assistant_title', 'Core5 AI Engine')}</span>
      </div>
      <p class="text-slate-600 mb-1.5">
        ${t('ai_connecting_notice', 'Query received! The dedicated AI intelligence backend is currently being integrated and will answer live here shortly.')}
      </p>
      <div class="text-[11px] text-amber-900 bg-amber-100/70 p-2 rounded-lg font-mono">
        Query: "${esc(tMsg)}"
      </div>
    </div>`;

    if (!mounted.current) return;
    setMessages((prev) => [...prev, { id: newId(), role: 'assistant', html }]);
    setLoading(false);
  };

  const resetChat = () => {
    setMessages([{ id: newId(), role: 'assistant', html: greetingHtml() }]);
    setInput('');
  };

  const showChips = messages.length === 1 && !loading;
  const canSend = Boolean(input.trim()) && !loading;

  return (
    <div className="fixed bottom-6 right-6 rtl:right-auto rtl:left-6 z-40">
      {/* Chat window modal */}
      <div
        role="dialog"
        aria-label={t('aria_assistant', 'Eklavya assistant')}
        aria-hidden={!isOpen}
        onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
        style={{ width: 'min(390px, calc(100vw - 48px))', height: 'min(580px, calc(100vh - 120px))' }}
        className={`absolute bottom-[68px] right-0 rtl:right-auto rtl:left-0 flex flex-col overflow-hidden rounded-2xl bg-[#f7f8fc] border border-[#e6e8f1] shadow-[0_20px_50px_rgba(0,35,102,0.22)] origin-bottom-right rtl:origin-bottom-left transition-all duration-200 ${
          isOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#002366] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-full bg-[#002366] ring-2 ring-[#B99652]/60 overflow-hidden flex items-center justify-center shadow-md">
              <img src={core5RobotAvatar} alt="Eklavya Avatar" className="w-full h-full object-cover scale-110" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">{t('assistant_title', 'Eklavya')}</p>
              <p className="text-xs text-white/60 truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={resetChat}
              title={t('restart', 'Restart')}
              aria-label={t('restart_conversation', 'Restart conversation')}
              className="h-8 w-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t('close_assistant', 'Close assistant')}
              className="h-8 w-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Signed-in status strip */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-[#e6e8f1] shrink-0 text-xs">
          <span className="text-[#7a809c]">{t('signed_in_as', 'Signed in as')}</span>
          <span className="font-semibold text-[#141a33] truncate">{user?.name || roleBadge}</span>
          <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 shrink-0">
            {roleBadge}
          </span>
        </div>

        {/* Messages */}
        <div aria-live="polite" className="flex-1 overflow-y-auto hide-scrollbar px-3 py-4 space-y-3">
          {messages.map((msg) =>
            msg.role === 'user' ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] px-3 py-2 bg-[#002366] text-white text-[13px] leading-relaxed break-words shadow-sm">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex items-start gap-2">
                <BotAvatar />
                <div
                  className="max-w-[88%] min-w-0 px-3 py-2.5 bg-white border border-[#e6e8f1] text-[13px] leading-relaxed text-[#3a4160] break-words shadow-sm"
                  dangerouslySetInnerHTML={{ __html: msg.html }}
                />
              </div>
            )
          )}

          {loading && (
            <div className="flex items-start gap-2" aria-label={t('loading', 'Loading')}>
              <BotAvatar />
              <div className="flex items-center gap-1 px-3 py-3 bg-white border border-[#e6e8f1] shadow-sm">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#B99652] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {showChips && (
            <div className="grid grid-cols-2 gap-2 pl-9">
              {chips.map(({ Icon, label, message }) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => sendMessage(message)}
                  className="flex items-center gap-2 px-2.5 py-2 bg-white border border-[#e6e8f1] text-left text-xs font-medium text-[#3a4160] hover:border-[#5b3fd9] hover:text-[#5b3fd9] transition-colors shadow-sm"
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          )}
          <div ref={msgsEnd} />
        </div>

        {/* Input */}
        <div className="px-3 pt-3 pb-2 bg-white border-t border-[#e6e8f1] shrink-0">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={placeholder}
              aria-label={t('aria_input', 'Message the assistant')}
              maxLength={300}
              className="flex-1 min-w-0 h-10 px-3 bg-white border border-[#d0cbef] rounded-lg text-sm text-[#141a33] outline-none placeholder-[#7a809c] focus:border-[#5b3fd9] focus:ring-1 focus:ring-[#5b3fd9]/30 transition-all"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!canSend}
              aria-label={t('send_message', 'Send message')}
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-[#d8ceff] text-[#5b3fd9] hover:bg-[#c9bbff] disabled:opacity-50 disabled:cursor-default disabled:hover:bg-[#d8ceff] transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-[#7a809c]">{t('powered_by', 'Powered by Core5')}</p>
        </div>
      </div>

      {/* Global Mascot Animations */}
      <style>{`
        @keyframes robotFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        @keyframes robotWaveTilt {
          0%, 100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(2.5deg) translateY(-0.5px);
          }
          75% {
            transform: rotate(-1.5deg) translateY(0.5px);
          }
        }
        @keyframes bubbleFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @keyframes robotBlinkPulse {
          0%, 92%, 100% {
            filter: drop-shadow(0 8px 16px rgba(0, 35, 102, 0.22));
          }
          95% {
            filter: drop-shadow(0 10px 20px rgba(185, 150, 82, 0.35));
          }
        }

        .animate-robot-float {
          animation: robotFloat 3.2s ease-in-out infinite;
        }
        .animate-robot-tilt {
          animation: robotWaveTilt 2.8s ease-in-out infinite;
          transform-origin: bottom center;
        }
        .animate-bubble-float {
          animation: bubbleFloat 3.2s ease-in-out infinite 0.2s;
        }
        .animate-robot-blink {
          animation: robotBlinkPulse 4s ease-in-out infinite;
        }
      `}</style>

      {/* When Chat is CLOSED: 3D Robot Mascot as Clickable Trigger */}
      {!isOpen ? (
        <button
          type="button"
          onClick={open}
          aria-label={t('open_assistant', 'Open AI Assistant')}
          className="group relative flex flex-col items-center cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-[#B99652] transition-transform duration-200 hover:-translate-y-1.5 active:translate-y-0"
        >
          {/* Speech Bubble: "Hi! Need help?" */}
          <div className="relative mb-1.5 px-3 py-1 bg-[#FFFDF8] border border-[#B99652]/40 rounded-full shadow-[0_4px_14px_rgba(0,35,102,0.12)] flex items-center justify-center animate-bubble-float pointer-events-none">
            <span className="text-[12px] font-semibold text-[#002366] tracking-tight font-sans whitespace-nowrap">
              {t('speech_bubble_help', 'Hi! Need help?')}
            </span>
            {/* Subtle pointer tail pointing down to robot */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#FFFDF8] border-r border-b border-[#B99652]/40 rotate-45" />
          </div>

          {/* 3D Robot Mascot (Standalone Trigger) */}
          <div className="relative w-[72px] h-[74px] animate-robot-float filter drop-shadow-[0_10px_22px_rgba(0,35,102,0.28)] group-hover:scale-110 active:scale-95 transition-transform duration-200">
            <img
              src={core5RobotPerfect}
              alt="Core5 AI Assistant Mascot"
              className="w-full h-full object-contain pointer-events-none select-none animate-robot-tilt"
            />
          </div>
        </button>
      ) : (
        /* When Chat is OPEN: Sleek Floating Close Button */
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label={t('close_assistant', 'Close assistant')}
          className="h-[50px] w-[50px] rounded-full flex items-center justify-center bg-[#002366] text-white border border-[#B99652]/40 shadow-[0_8px_24px_rgba(0,35,102,0.25)] hover:bg-[#001c52] hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#B99652]"
        >
          <X size={22} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
