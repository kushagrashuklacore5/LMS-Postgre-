import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  UserPlus,
  School,
  Database,
  FileSpreadsheet,
  BookOpen
} from "lucide-react";
import { useAuth } from "../auth/auth";
import QuotaLimitModal from './QuotaLimitModal';
import { useSimpleTranslation } from "../context/SimpleTranslationContext";
import { useTranslation } from "../context/TranslationContext";
import AnnouncementBell from "./AnnouncementBell";
import LoginFooter from './LoginFooter';
import GuideBotLauncher from '../guidebot/runtime/GuideBotLauncher';
import LMSChatbot from './Chatbot/LMSChatbot';
import whiteLogo from '../assets/core5-final-rbg.png';
import UniversalLanguageSelector from './UniversalLanguageSelector';

const AdminLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logoutUser, user, API, token } = useAuth();
  const { currentLanguage, supportedLanguages, changeLanguage } = useSimpleTranslation();
  const { t } = useTranslation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState(null);

  const handleNavClick = async (e, item) => {
    // Intercept database export & calendar navigation to check feature access
    // DISABLED: Allow all features without restrictions
    // Database export and calendar are now accessible to all users
  };

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  /* ================= SIDEBAR ITEMS ================= */
  const navItems = [
    { path: "/admin/dashboard", nameKey: 'nav_dashboard', name: 'Dashboard', icon: <LayoutDashboard size={20} />, tourId: 'nav-dashboard' },
    { path: "/admin/users", nameKey: 'nav_users', name: 'Users', icon: <Users size={20} />, tourId: 'nav-users' },
    { path: "/admin/courses", nameKey: 'nav_courses', name: 'Courses', icon: <BookOpen size={20} />, tourId: 'nav-courses' },
    { path: "/admin/fee-structure", nameKey: 'nav_fee_structure', name: 'Fee Structure', icon: <BarChart3 size={20} />, tourId: 'nav-fee-structure' },
    { path: "/admin/calendar", nameKey: 'nav_calendar', name: 'Calendar', icon: <Calendar size={20} />, tourId: 'nav-calendar' },

    /* ===== BELOW CALENDAR ===== */
    { path: "/admin/add-student", nameKey: 'nav_add_student', name: 'Add Student', icon: <UserPlus size={20} />, tourId: 'nav-add-student' },
    { path: "/admin/add-teacher", nameKey: 'nav_add_teacher', name: 'Add Teacher', icon: <UserPlus size={20} />, tourId: 'nav-add-teacher' },

    /* ===== CLASSROOMS (JUST BELOW ADD TEACHER) ===== */
    { path: "/admin/classrooms", nameKey: 'nav_classrooms', name: 'Classrooms', icon: <School size={20} />, tourId: 'nav-classrooms' },
    { path: "/admin/student-import", nameKey: 'nav_student_import', name: 'Import Students (AI Suggested Mapping)', icon: <FileSpreadsheet size={20} />, tourId: 'nav-student-import' },
  ];

  const getItemLabel = (item) => {
    if (!item) return '';
    const translated = t(item.nameKey);
    return translated && translated !== item.nameKey ? translated : (item.name || item.nameKey);
  };

  const currentNavItem = navItems.find((item) => item.path === location.pathname);
  const currentPage = currentNavItem ? getItemLabel(currentNavItem) : (t('nav_dashboard') !== 'nav_dashboard' ? t('nav_dashboard') : 'Dashboard');

  return (
    <div className="h-screen bg-[#fffdf4] overflow-hidden">
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside
        className={`fixed top-0 left-0 h-full bg-[#002366] text-white shadow-[0_0_40px_rgba(0,35,102,0.4)] z-40 hidden md:block transition-all duration-300 ${
          sidebarCollapsed ? "w-16 md:w-20" : "w-56 md:w-64"
        }`}
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
                <linearGradient id="admin-nav-mountain-back" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4b5d94" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#1e274a" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="admin-nav-mountain-mid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e3e70" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#111833" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="admin-nav-mountain-front" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a254c" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#060a18" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Glowing Moon behind peak */}
              <circle cx="210" cy="85" r="14" fill="#ffd6a0" opacity="0.75" />

              {/* Back Mountain Ridge */}
              <path d="M 0 190 L 60 115 L 95 150 L 155 65 L 205 125 L 245 90 L 300 165 L 300 380 L 0 380 Z" fill="url(#admin-nav-mountain-back)" />

              {/* Mid Mountain Ridge */}
              <path d="M 0 235 L 45 175 L 90 215 L 160 135 L 220 195 L 260 165 L 300 215 L 300 380 L 0 380 Z" fill="url(#admin-nav-mountain-mid)" />

              {/* Foreground Mountain Base */}
              <path d="M 0 275 L 70 225 L 140 270 L 210 210 L 275 260 L 300 240 L 300 380 L 0 380 Z" fill="url(#admin-nav-mountain-front)" />
            </svg>
          </div>

          {/* Logo Header */}
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
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#002366]"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-white">
                    {user?.name || 'Administrator'}
                  </p>
                  <p className="text-white/70 text-xs truncate">
                    {user?.email || 'admin@example.com'}
                  </p>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      Active
                    </span>
                    <span className="text-white/50 text-xs capitalize">Admin</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 min-h-0 p-4 space-y-1.5 overflow-y-auto hide-scrollbar relative z-10">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={(e) => handleNavClick(e, item)}
                  data-tour={item.tourId}
                  className={`flex items-center rounded-none px-3.5 py-3 transition-all duration-200
                    ${isActive
                      ? "bg-[#B99652]/20 text-white border-l-4 border-[#B99652] shadow-sm backdrop-blur-xs font-semibold"
                      : "text-white/70 hover:text-white hover:bg-white/10 hover:shadow-xs"
                    }
                    ${sidebarCollapsed ? "justify-center" : ""}
                  `}
                >
                  <div className={`${isActive ? "text-[#B99652]" : "text-white/70"} transition-colors`}>
                    {item.icon}
                  </div>
                  {!sidebarCollapsed && <span className="ml-3 font-medium text-sm">{getItemLabel(item)}</span>}
                </Link>
              );
            })}
            <QuotaLimitModal isOpen={showQuotaModal} onClose={() => setShowQuotaModal(false)} quotaDetails={quotaDetails} />
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/15 space-y-2 relative z-10">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-between p-2.5 rounded-none bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-all duration-200 border border-white/10"
            >
              <div className="flex items-center space-x-3">
                <ChevronLeft className={`transition-transform duration-200 ${sidebarCollapsed ? "rotate-180" : ""}`} />
                {!sidebarCollapsed && (
                  <span className="font-medium text-xs">{t('nav_collapse') ?? 'Collapse'}</span>
                )}
              </div>
              {sidebarCollapsed && <ChevronRight />}
            </button>

            <button
              onClick={handleLogout}
              className={`w-full flex items-center p-2.5 rounded-none bg-red-500/15 hover:bg-red-500/25 text-red-300 hover:text-red-200 border border-red-500/20 transition-all duration-200 text-xs font-medium ${
                sidebarCollapsed ? "justify-center" : ""
              }`}
            >
              <LogOut size={16} />
              {!sidebarCollapsed && <span className="ml-2.5 font-medium">{t('nav_logout')}</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main
        className={`transition-all flex-1 overflow-hidden ${sidebarCollapsed ? "md:ml-16 lg:ml-20" : "md:ml-56 lg:ml-64"} h-screen flex flex-col bg-[#fffdf4]`}
        style={{
          backgroundColor: '#fffdf4',
          backgroundImage: `
            linear-gradient(to right, rgba(200, 165, 70, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200, 165, 70, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px'
        }}
      >
        {/* Top Bar */}
        <header className="sticky top-0 bg-[#fffdf4]/90 backdrop-blur-md border-b border-[#ebdcaa]/40 z-30 px-3 sm:px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <ChevronRight size={20} />
              </button>
              <h1 className="text-lg sm:text-xl font-['DM_Serif_Display',serif] truncate text-[#1e1b4b] tracking-wide">{currentPage}</h1>
            </div>

            {/* Right Header Actions */}
            <div className="flex items-center gap-3">
              <UniversalLanguageSelector variant="compact" />
              <GuideBotLauncher tourId="admin-overview-v1" />
              <AnnouncementBell />
            </div>
          </div>
        </header>

        {/* Mobile Sidebar */}
        {mobileMenuOpen && (
          <div className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-sidebar open bg-[#002366] text-white" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-white/15">
                <div className="flex items-center justify-between">
                  <img src={whiteLogo} alt="Core5 Academy" className="h-10 w-auto" />
                  <button onClick={() => setMobileMenuOpen(false)} className="text-white">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
              
              <div className="p-4 border-b border-white/15">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#f1be38] text-[#1e1b4b] flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
                  </div>
                  <div>
                    <h1 className="font-bold text-base text-white">Admin Portal</h1>
                    <p className="text-xs text-white/70 truncate">{user?.name || user?.email}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={(e) => { setMobileMenuOpen(false); handleNavClick(e, item); }}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 text-white/80 hover:text-white"
                  >
                    {item.icon}
                    <span>{getItemLabel(item)}</span>
                  </Link>
                ))}
              </div>
              <div className="p-4 border-t border-white/15 mt-auto">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/20 text-red-300 rounded-xl hover:bg-red-500/30"
                >
                  <LogOut size={18} />
                  <span>{t('nav_logout')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">{children}</div>
      </main>

      {/* Footer */}
      <LoginFooter />

      {/* Admin Chatbot */}
      <LMSChatbot role="admin" />
    </div>
  );
};

export default AdminLayout;
