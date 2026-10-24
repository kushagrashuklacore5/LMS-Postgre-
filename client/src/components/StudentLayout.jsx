import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  GraduationCap,
  Trophy,
  Clock,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck,
  Calendar,
  CreditCard,
  Bell,
  Video
} from 'lucide-react';
import { useAuth } from "../auth/auth";
import QuotaLimitModal from './QuotaLimitModal';
import { useTranslation } from "../context/TranslationContext";
import LMSChatbot from './Chatbot/LMSChatbot';
import whiteLogo from '../assets/core5-final-rbg.png';
import AnnouncementBell from './AnnouncementBell';
import LiveNowBanner from './lectures/LiveNowBanner';
import UniversalLanguageSelector from './UniversalLanguageSelector';

const StudentLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logoutUser, user } = useAuth();
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState(null);
  const { API, token } = useAuth();

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  const handleNavClick = async (e, item) => {
    // Allow dashboard to always work
    if (item.path === '/student/dashboard') {
      return;
    }

    // DISABLED: Allow all features without restrictions
    // All features are now accessible to all users
  };

  // Enhanced navigation items with newest icons and features
  const navItems = [
    {
      path: '/student/dashboard',
      nameKey: 'navigation:nav_dashboard',
      icon: <Home size={20} />,
      descKey: 'navigation:nav_desc_overview_stats',
      tourId: 'nav-dashboard'
    },
    {
      path: '/student/courses',
      nameKey: 'navigation:nav_courses',
      icon: <GraduationCap size={20} />,
      descKey: 'navigation:nav_my_courses',
      tourId: 'nav-courses'
    },
    {
      path: '/student/assessment-agent/tests',
      nameKey: 'navigation:nav_my_tests',
      icon: <ClipboardList size={19} />,
      descKey: 'navigation:nav_desc_tests_from_teachers',
      tourId: 'nav-my-tests'
    },
    {
      path: '/student/assessment-agent/assignments',
      nameKey: 'common:assignments',
      icon: <FileCheck size={19} />,
      descKey: 'navigation:nav_desc_submit_track_assignments',
      tourId: 'nav-assignments'
    },
    {
      path: '/student/results',
      nameKey: 'common:results',
      icon: <Trophy size={20} />,
      descKey: 'navigation:nav_desc_academic_results',
      tourId: 'nav-results'
    },
    {
      path: '/student/lectures',
      nameKey: 'nav_lectures',
      icon: <Video size={20} />,
      label: 'Your Lectures',
      description: 'Live classes and history',
      tourId: 'nav-lectures'
    },
    {
      path: '/student/attendance',
      nameKey: 'navigation:nav_attendance',
      icon: <Clock size={20} />,
      descKey: 'common:attendance_records',
      tourId: 'nav-attendance'
    },
    {
      path: '/student/calendar',
      nameKey: 'navigation:nav_calendar',
      icon: <Calendar size={20} />,
      descKey: 'navigation:nav_desc_academic_schedule',
      tourId: 'nav-calendar'
    },
    {
      path: '/student/pay-fees',
      nameKey: 'navigation:nav_fees_payments',
      icon: <CreditCard size={20} />,
      descKey: 'navigation:nav_desc_fee_dues_receipts',
      tourId: 'nav-fees'
    }
  ];

  const currentPage =
    navItems.find((item) => item.path === location.pathname)?.nameKey
      ? t(navItems.find((item) => item.path === location.pathname)?.nameKey)
      : t('navigation:nav_dashboard');

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside
        className={`
          fixed top-0 left-0 rtl:left-auto rtl:right-0 h-full z-40 hidden lg:block
          transition-all duration-300
          ${sidebarCollapsed ? "w-20" : "w-64"}
          bg-[#002366]
          shadow-[0_0_40px_rgba(0,35,102,0.4)]
        `}
      >
        <div className="flex flex-col h-full bg-[#002366] relative overflow-hidden">

          {/* Full Mountain / Pahad Silhouette Backdrop for the entire Sidebar */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            {/* Ambient Stars & Subtle Glowing Accents */}
            <div className="absolute top-[28%] right-6 w-1.5 h-1.5 rounded-full bg-amber-200/40" />
            <div className="absolute top-[35%] left-7 w-1 h-1 rounded-full bg-white/40" />
            <div className="absolute top-[42%] right-12 w-2 h-2 rounded-full bg-white/30 blur-[0.5px]" />
            <div className="absolute bottom-[230px] right-6 w-12 h-12 rounded-full bg-gradient-to-tr from-amber-300/25 to-amber-100/5 blur-sm" />

            {/* Multi-layered Mountain Silhouettes */}
            <svg
              className="absolute inset-x-0 bottom-0 w-full h-[380px] opacity-60 pointer-events-none"
              viewBox="0 0 300 380"
              preserveAspectRatio="none"
              fill="none"
            >
              <defs>
                <linearGradient id="nav-mountain-back" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4b5d94" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#1e274a" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="nav-mountain-mid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e3e70" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#111833" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="nav-mountain-front" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a254c" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#060a18" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Glowing Moon behind peak */}
              <circle cx="210" cy="85" r="14" fill="#ffd6a0" opacity="0.75" />

              {/* Back Mountain Ridge */}
              <path d="M 0 190 L 60 115 L 95 150 L 155 65 L 205 125 L 245 90 L 300 165 L 300 380 L 0 380 Z" fill="url(#nav-mountain-back)" />

              {/* Mid Mountain Ridge */}
              <path d="M 0 235 L 45 175 L 90 215 L 160 135 L 220 195 L 260 165 L 300 215 L 300 380 L 0 380 Z" fill="url(#nav-mountain-mid)" />

              {/* Foreground Mountain Base */}
              <path d="M 0 275 L 70 225 L 140 270 L 210 210 L 275 260 L 300 240 L 300 380 L 0 380 Z" fill="url(#nav-mountain-front)" />
            </svg>
          </div>

          {/* ===== LOGO ===== */}
          <div className="h-24 sm:h-28 border-b border-white/15 flex items-center justify-center relative z-10">
            {!sidebarCollapsed && (
              <img
                src={whiteLogo}
                alt="Core5 Academy"
                className="max-h-full w-auto object-contain"
              />
            )}
            {sidebarCollapsed && (
              <img
                src={whiteLogo}
                alt="Core5 Academy"
                className="h-16 w-auto object-contain"
              />
            )}
          </div>

          {/* ================= USER INFO ================= */}
          {!sidebarCollapsed && (
            <div className="p-4 border-b border-white/15 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[#f1be38] text-[#1e1b4b] flex items-center justify-center font-bold text-base shadow-md">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'S'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#002366]"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-white">
                    {user?.name || t('common:student')}
                  </p>
                  <p className="text-white/70 text-xs truncate">
                    {user?.email || 'student@example.com'}
                  </p>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      {t('common:active')}
                    </span>
                    <span className="text-white/50 text-xs">{t('common:student')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= NAVIGATION ================= */}
          <nav className="flex-1 min-h-0 p-4 overflow-y-auto hide-scrollbar relative z-10">
            <div className="space-y-2">
              {navItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={(e) => handleNavClick(e, item)}
                    data-tour={item.tourId}
                    className={`
                      group relative flex items-center rounded-xl px-3 py-3 transition-all duration-200
                      ${isActive
                        ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30 text-white shadow-lg border border-white/20 backdrop-blur-xs'
                        : 'text-white/70 hover:text-white hover:bg-white/10 hover:shadow-md'
                      }
                      ${sidebarCollapsed ? 'justify-center' : ''}
                    `}
                  >
                    <div className={`flex items-center ${sidebarCollapsed ? '' : 'justify-between w-full'}`}>
                      <div className="flex items-center space-x-3">
                        <div className={`
                          ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white'}
                          transition-colors duration-200
                        `}>
                          {item.icon}
                        </div>
                        {!sidebarCollapsed && (
                          <div>
                            <span className={`font-medium ${isActive ? 'text-white' : 'text-white/80 group-hover:text-white'}`}>
                              {t(item.nameKey)}
                            </span>
                            {!sidebarCollapsed && (
                              <p className="text-xs text-white/50 group-hover:text-white/70 mt-0.5">
                                {t(item.descKey)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {!sidebarCollapsed && isActive && (
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      )}
                    </div>

                    {/* Tooltip for collapsed state */}
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-2 rtl:left-auto rtl:right-full rtl:ml-0 rtl:mr-2 px-2 py-1 bg-[#001c52] text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                        {t(item.nameKey)}
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-[#001c52] rotate-45"></div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="p-4 border-t border-white/15 space-y-3 relative z-10">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-white/10 to-white/5 hover:from-white/20 hover:to-white/10 text-white/80 hover:text-white transition-all duration-200 group"
            >
              <div className="flex items-center space-x-3">
                <ChevronLeft className={`transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                {!sidebarCollapsed && (
                  <span className="font-medium">{t('nav_collapse') ?? 'Collapse'}</span>
                )}
              </div>
              {sidebarCollapsed && <ChevronRight />}
            </button>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-pink-500/20 rounded-xl blur-xl"></div>
              <button
                onClick={handleLogout}
                className={`relative w-full flex items-center p-3 rounded-xl bg-gradient-to-r from-red-500/10 to-pink-500/10 hover:from-red-500/20 hover:to-pink-500/20 text-red-400 hover:text-red-300 transition-all duration-200 group ${sidebarCollapsed ? 'justify-center' : ''}`}
              >
                <LogOut size={18} className="group-hover:scale-110 transition-transform duration-200" />
                {!sidebarCollapsed && (
                  <span className="ml-3 font-medium">{t('nav_logout') ?? 'Logout'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= MOBILE SIDEBAR ================= */}
      {mobileMenuOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-sidebar open bg-[#002366]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/15">
              <div className="flex items-center justify-between">
                <img src={whiteLogo} alt="Core5 Academy" className="h-10 w-auto" />
                <button onClick={() => setMobileMenuOpen(false)}>
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
            <div className="p-5 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-[#f1be38] text-[#1e1b4b] flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'S'}
                </div>
                <div>
                  <h1 className="font-bold text-lg">{t('common:student_portal')}</h1>
                  <p className="text-white/70 text-sm">{t('dashboard:welcome_back')}</p>
                </div>
              </div>
            </div>

            <nav className="p-4">
              <div className="space-y-1">
                {navItems.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={(e) => { setMobileMenuOpen(false); handleNavClick(e, item); }}
                      className={`
                        flex items-center space-x-3 rounded-xl px-3 py-3 transition
                        ${isActive
                          ? 'bg-white/20 text-white'
                          : 'text-white/80 hover:bg-white/10'
                        }
                      `}
                    >
                      {item.icon}
                      <span className="font-medium">{t(item.nameKey)}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-6 space-y-3">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-2 p-3 rounded-xl bg-red-500/20 hover:bg-red-500/30"
                >
                  <LogOut size={18} />
                  <span className="font-medium">{t('common:logout')}</span>
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ================= MAIN CONTENT ================= */}
      <main
        className={`
          transition-all duration-300 flex-1 overflow-y-auto
          ${sidebarCollapsed ? 'md:ml-16 lg:ml-20 rtl:md:ml-0 rtl:lg:ml-0 rtl:md:mr-16 rtl:lg:mr-20' : 'md:ml-56 lg:ml-64 rtl:md:ml-0 rtl:lg:ml-0 rtl:md:mr-56 rtl:lg:mr-64'}
          flex-1 overflow-y-auto
        `}
      >

        {/* A lecture of the student's that is live or about to start: Join from any page */}
        <LiveNowBanner API={API} token={token} />

        {/* ================= MOBILE MENU TRIGGER & TOPBAR ================= */}
        <div className="md:hidden p-3 flex items-center justify-between bg-white border-b border-gray-100 sticky top-0 z-20">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-none hover:bg-gray-100 text-slate-700"
            aria-label={t('navigation:nav_open_menu')}
          >
            <ChevronRight size={20} />
          </button>
          <div className="flex items-center gap-2">
            <UniversalLanguageSelector variant="compact" />
          </div>
        </div>

        {/* ================= DESKTOP SUBPAGE TOPBAR ================= */}
        {location.pathname !== '/student/dashboard' && (
          <header className="sticky top-0 z-30 bg-[#fffdf4]/90 backdrop-blur-md border-b border-[#ebdcaa]/40 px-6 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hidden md:flex items-center justify-between">
            <h1 className="text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-wide">{currentPage}</h1>
            <div className="flex items-center gap-3">
              <UniversalLanguageSelector variant="compact" />
            </div>
          </header>
        )}

        {/* ================= CONTENT AREA ================= */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollable-content p-3 sm:p-4 md:p-6 h-full max-h-screen">
          <div className="min-h-full">
            {children}
          </div>
        </div>

      </main>

      {/* ================= QUOTA MODAL (OVERLAY) ================= */}
      <QuotaLimitModal isOpen={showQuotaModal} onClose={() => setShowQuotaModal(false)} quotaDetails={quotaDetails} />

      <LMSChatbot />
    </div>
  );
};

/* Custom scrollbar styles */
const style = document.createElement('style');
style.textContent = `
  .scrollable-content::-webkit-scrollbar {
    width: 8px;
  }
  .scrollable-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }
  .scrollable-content::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }
  .scrollable-content::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;
if (!document.head.querySelector('style[data-scrollbar-styles]')) {
  style.setAttribute('data-scrollbar-styles', 'true');
  document.head.appendChild(style);
}

export default StudentLayout;