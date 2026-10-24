import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Package,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Warehouse
} from 'lucide-react';
import { useAuth } from '../auth/auth';
import LoginFooter from './LoginFooter';
import whiteLogo from '../assets/core5-final-rbg.png';
import UniversalLanguageSelector from './UniversalLanguageSelector';
import { useTranslation } from '../context/TranslationContext';

const VendorLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logoutUser, user } = useAuth();
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  const navItems = [
    { path: '/vendor/dashboard', nameKey: 'nav_dashboard', name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/vendor/invoices', nameKey: 'invoices', name: 'Invoices', icon: <FileText size={20} /> },
    { path: '/vendor/orders', nameKey: 'purchase_orders', name: 'Orders', icon: <Package size={20} /> },
    { path: '/vendor/stock', nameKey: 'vendor_stock', name: 'Stock', icon: <Warehouse size={20} /> },
    { path: '/vendor/payments', nameKey: 'payments', name: 'Payments', icon: <DollarSign size={20} /> },
  ];

  const getItemLabel = (item) => {
    if (!item) return '';
    const translated = t(item.nameKey);
    return translated && translated !== item.nameKey ? translated : (item.name || item.nameKey);
  };

  const currentItem = navItems.find(item => location.pathname === item.path);
  const currentPage = currentItem ? getItemLabel(currentItem) : (t('nav_dashboard') !== 'nav_dashboard' ? t('nav_dashboard') : 'Dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50">
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-[#002366] text-white shadow-[0_0_40px_rgba(0,35,102,0.4)] z-40 hidden lg:block transition-all duration-300 ${
          sidebarCollapsed ? "w-20" : "w-64"
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
                <linearGradient id="vendor-nav-mountain-back" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4b5d94" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#1e274a" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="vendor-nav-mountain-mid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e3e70" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#111833" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="vendor-nav-mountain-front" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a254c" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#060a18" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Glowing Moon behind peak */}
              <circle cx="210" cy="85" r="14" fill="#ffd6a0" opacity="0.75" />

              {/* Back Mountain Ridge */}
              <path d="M 0 190 L 60 115 L 95 150 L 155 65 L 205 125 L 245 90 L 300 165 L 300 380 L 0 380 Z" fill="url(#vendor-nav-mountain-back)" />

              {/* Mid Mountain Ridge */}
              <path d="M 0 235 L 45 175 L 90 215 L 160 135 L 220 195 L 260 165 L 300 215 L 300 380 L 0 380 Z" fill="url(#vendor-nav-mountain-mid)" />

              {/* Foreground Mountain Base */}
              <path d="M 0 275 L 70 225 L 140 270 L 210 210 L 275 260 L 300 240 L 300 380 L 0 380 Z" fill="url(#vendor-nav-mountain-front)" />
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
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'V'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#002366]"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-white">
                    {user?.name || 'Vendor Partner'}
                  </p>
                  <p className="text-white/70 text-xs truncate">
                    {user?.email || 'vendor@core5.com'}
                  </p>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      Active
                    </span>
                    <span className="text-white/50 text-xs capitalize">Vendor</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= NAVIGATION ================= */}
          <nav className="flex-1 min-h-0 p-4 space-y-1.5 overflow-y-auto hide-scrollbar relative z-10">
            <div className="space-y-1.5">
              {navItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                      flex items-center gap-3 px-3.5 py-3 rounded-none transition-all duration-200
                      ${isActive
                        ? 'bg-[#B99652]/20 text-white border-l-4 border-[#B99652] shadow-sm backdrop-blur-xs font-semibold'
                        : 'text-white/70 hover:bg-white/10 hover:text-white hover:shadow-xs'
                      }
                      ${sidebarCollapsed ? 'justify-center' : ''}
                    `}
                  >
                    <span className={`shrink-0 ${isActive ? 'text-[#B99652]' : 'text-white/70'} transition-colors`}>{item.icon}</span>
                    {!sidebarCollapsed && (
                      <span className="font-medium text-sm">{getItemLabel(item)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* ===== FOOTER ===== */}
          <div className="p-4 border-t border-white/15 space-y-2 relative z-10">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-between p-2.5 rounded-none bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-all duration-200 border border-white/10"
            >
              <div className="flex items-center space-x-3">
                <ChevronLeft className={`transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                {!sidebarCollapsed && (
                  <span className="font-medium text-xs">{t('nav_collapse') ?? 'Collapse'}</span>
                )}
              </div>
              {sidebarCollapsed && <ChevronRight size={18} />}
            </button>

            <button
              onClick={handleLogout}
              className={`w-full flex items-center p-2.5 rounded-none bg-red-500/15 hover:bg-red-500/25 text-red-300 hover:text-red-200 border border-red-500/20 transition-all duration-200 text-xs font-medium ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
            >
              <LogOut size={16} />
              {!sidebarCollapsed && <span className="ml-2.5 font-medium">{t('nav_logout') ?? 'Logout'}</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MOBILE SIDEBAR ================= */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 lg:hidden transition-opacity ${
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 h-screen w-64 z-40 bg-[#002366] text-white shadow-lg transition-transform duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full bg-[#002366]">
          <div className="h-24 sm:h-28 border-b border-white/15 flex items-center justify-between px-4">
            <img src={whiteLogo} alt="Core5 Academy" className="max-h-full w-auto object-contain" />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 hover:bg-white/10 rounded-lg text-white"
            >
              <ChevronLeft size={20} />
            </button>
          </div>

          <div className="p-4 border-b border-white/15">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-[#f1be38] text-[#1e1b4b] flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'V'}
              </div>
              <div>
                <h1 className="font-bold text-base text-white">Vendor Portal</h1>
                <p className="text-xs text-white/70 truncate">{user?.name || user?.email}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
                  ${location.pathname === item.path
                    ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30 text-white shadow-lg border border-white/20'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
              >
                {item.icon}
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            ))}
          </nav>

          {/* Mobile Logout */}
          <div className="p-4 border-t border-white/15 mt-auto">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors font-medium text-sm"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <div className={`lg:ml-${sidebarCollapsed ? "20" : "64"} transition-all duration-300 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50`}>
        {/* Desktop Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30 hidden lg:block">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-xl font-semibold text-gray-800">{currentPage}</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <UniversalLanguageSelector variant="compact" />
              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30 lg:hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-lg font-semibold text-gray-800">{currentPage}</h1>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
      
      {/* Footer */}
      <LoginFooter />
    </div>
  );
};

export default VendorLayout;
