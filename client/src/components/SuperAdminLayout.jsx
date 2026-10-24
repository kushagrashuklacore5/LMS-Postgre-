import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Star,
  Building2,
  Users,
  Plus,
  UserPlus,
  Calendar
} from "lucide-react";
import { useAuth } from "../auth/auth";
import { useTranslation } from "../context/TranslationContext";
import AnnouncementBell from "./AnnouncementBell";
import LoginFooter from './LoginFooter';
import GuideBotLauncher from '../guidebot/runtime/GuideBotLauncher';
import whiteLogo from '../assets/core5-final-rbg.png';
import UniversalLanguageSelector from './UniversalLanguageSelector';

const SuperAdminLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logoutUser, user, API } = useAuth();
  const { t } = useTranslation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Timer state
  const [timer, setTimer] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [planName, setPlanName] = useState('Free');

  // Fetch subscription data function
  const fetchSubscription = async () => {
    try {
      const response = await fetch(`${API}/subscriptions/current`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });


      const text = await response.text();
      const data = text ? JSON.parse(text) : null;

      if (data.success) {
        console.log('Subscription data received:', data.subscription);
        setSubscription(data.subscription);
        setPlanName(data.subscription.planName);
        
        // Set initial timer based on subscription status and remaining time
        const remainingSeconds = data.subscription.remainingSeconds;
        const isActive = data.subscription.status === 'active';
        
        if (isActive && remainingSeconds > 0) {
          // Active subscription with time remaining
          setTimer(remainingSeconds);
          setShowPopup(false);
        } else if (isActive && remainingSeconds <= 0) {
          // Active subscription but time expired (shouldn't happen but handle it)
          setShowPopup(true);
          setTimer(0);
        } else {
          // Expired subscription
          setShowPopup(true);
          setTimer(0);
        }
      } else {
        console.error('Failed to fetch subscription:', data.message);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch subscription data on mount
  useEffect(() => {
    fetchSubscription();
  }, []);

  // Listen for subscription refresh events
  useEffect(() => {
    const handleSubscriptionRefresh = () => {
      console.log('Refreshing subscription data...');
      fetchSubscription();
    };

    // Listen for custom event
    window.addEventListener('subscription-refresh', handleSubscriptionRefresh);
    
    // Listen for storage changes (from other tabs)
    const handleStorageChange = (e) => {
      if (e.key === 'subscription-updated') {
        console.log('Subscription updated in another tab, refreshing...');
        fetchSubscription();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('subscription-refresh', handleSubscriptionRefresh);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Global function to refresh subscription
  useEffect(() => {
    window.refreshSubscription = () => {
      console.log('Manual subscription refresh triggered');
      fetchSubscription();
    };
    
    return () => {
      delete window.refreshSubscription;
    };
  }, [fetchSubscription]);

  // Calculate time units
  const days = Math.floor(timer / 86400);
  const hours = Math.floor((timer % 86400) / 3600);
  const minutes = Math.floor((timer % 3600) / 60);
  const seconds = timer % 60;

  // Timer countdown effect
  useEffect(() => {
    if (loading || timer <= 0) return;

    const interval = setInterval(() => {
      setTimer((prevTimer) => {
        if (prevTimer <= 1) {
          // Timer reached zero, show popup and refresh subscription data
          setShowPopup(true);
          // Refresh subscription data to get updated status
          fetchSubscription();
          return 0;
        }
        return prevTimer - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, timer]);

  
  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  const cancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription and downgrade to Free?')) return;
    try {
      const response = await fetch(`${API}/subscriptions/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${text || 'no body'}`);
      const data = text ? JSON.parse(text) : null;
      if (data && data.success) {
        // update local state and timer
        setSubscription(data.subscription);
        setPlanName(data.subscription.planName || 'Free');
        const remaining = data.subscription.remainingSeconds ?? Math.max(0, Math.floor((new Date(data.subscription.expiryDate) - new Date()) / 1000));
        setTimer(Math.max(0, remaining));
        setShowPopup(false);
        // clear localStorage subscription flags
        localStorage.setItem('superadminPlanName', data.subscription.planName || 'Free');
        localStorage.setItem('superadminSubscriptionStatus', data.subscription.status || 'active');
        alert('Subscription cancelled — you have been moved to the Free plan.');
      } else {
        throw new Error((data && data.message) || 'Failed to cancel subscription');
      }
    } catch (err) {
      console.error('Cancel subscription error:', err);
      alert('Failed to cancel subscription: ' + (err.message || err));
    }
  };

  /* ================= SIDEBAR ITEMS ================= */
  const navItems = [
    { path: "/superadmin/dashboard", nameKey: 'nav_overview', name: 'Overview', icon: <LayoutDashboard size={20} />, tourId: 'nav-overview' },
    { path: "/superadmin/dashboard?tab=universities", nameKey: 'institutes', name: 'Institutes', icon: <Building2 size={20} />, tourId: 'nav-institutes' },
    { path: "/superadmin/dashboard?tab=createUniversity", nameKey: 'add_institute', name: 'Add Institute', icon: <Plus size={20} />, tourId: 'nav-add-institute' },
    { path: "/superadmin/dashboard?tab=createUser", nameKey: 'add_staff', name: 'Add Staff', icon: <UserPlus size={20} />, tourId: 'nav-add-staff' },
    { path: "/superadmin/dashboard?tab=users", nameKey: 'all_staff', name: 'All Staff', icon: <Users size={20} />, tourId: 'nav-all-staff' },
    { path: "/superadmin/subscription", nameKey: 'nav_subscription', name: 'Subscription', icon: <Star size={20} />, tourId: 'nav-subscription' },
  ];

  const getItemLabel = (item) => {
    if (!item) return '';
    const translated = t(item.nameKey);
    return translated && translated !== item.nameKey ? translated : (item.name || item.nameKey);
  };

  const currentItem = navItems.find((item) => {
    if (item.path.includes('?')) {
      const basePath = item.path.split('?')[0];
      const tabParam = item.path.split('?')[1].split('=')[1];
      return location.pathname === basePath && location.search.includes(tabParam);
    }
    return location.pathname === item.path && !location.search.includes('tab=');
  });

  const currentPage = currentItem ? getItemLabel(currentItem) : (t('nav_overview') !== 'nav_overview' ? t('nav_overview') : 'Overview');

  // Show loading screen while initializing
  if (loading) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#fffdf4] overflow-hidden">
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside
        className={`fixed top-0 left-0 h-full bg-[#002366] text-white shadow-[0_0_40px_rgba(0,35,102,0.4)] z-40 hidden lg:block transition-all duration-300 ${
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
                <linearGradient id="sa-nav-mountain-back" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4b5d94" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#1e274a" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="sa-nav-mountain-mid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e3e70" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#111833" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="sa-nav-mountain-front" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a254c" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#060a18" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Glowing Moon behind peak */}
              <circle cx="210" cy="85" r="14" fill="#ffd6a0" opacity="0.75" />

              {/* Back Mountain Ridge */}
              <path d="M 0 190 L 60 115 L 95 150 L 155 65 L 205 125 L 245 90 L 300 165 L 300 380 L 0 380 Z" fill="url(#sa-nav-mountain-back)" />

              {/* Mid Mountain Ridge */}
              <path d="M 0 235 L 45 175 L 90 215 L 160 135 L 220 195 L 260 165 L 300 215 L 300 380 L 0 380 Z" fill="url(#sa-nav-mountain-mid)" />

              {/* Foreground Mountain Base */}
              <path d="M 0 275 L 70 225 L 140 270 L 210 210 L 275 260 L 300 240 L 300 380 L 0 380 Z" fill="url(#sa-nav-mountain-front)" />
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
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'S'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#002366]"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-white">
                    {user?.name || 'Super Admin'}
                  </p>
                  <p className="text-white/70 text-xs truncate">
                    {user?.email || 'superadmin@core5.com'}
                  </p>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      Active
                    </span>
                    <span className="text-white/50 text-xs capitalize">Super Admin</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 min-h-0 p-4 space-y-1.5 overflow-y-auto hide-scrollbar relative z-10">
            {navItems.map((item) => {
              let isActive = false;
              if (item.path.includes('?')) {
                const basePath = item.path.split('?')[0];
                const tabParam = item.path.split('?')[1].split('=')[1];
                isActive = location.pathname === basePath && location.search.includes(tabParam);
              } else {
                isActive = location.pathname === item.path && !location.search.includes('tab=');
              }
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
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
          </nav>

          {/* Collapse & Logout Button */}
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
              {!sidebarCollapsed && <span className="ml-2.5 font-medium">{t('nav_logout') ?? 'Logout'}</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MOBILE MENU ================= */}
      <div className={`lg:hidden fixed inset-0 bg-black/50 z-50 ${mobileMenuOpen ? "block" : "hidden"}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <div className={`lg:hidden fixed top-0 left-0 h-full w-64 bg-[#002366] text-white shadow-lg z-50 transform transition-transform duration-300 ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex flex-col h-full bg-[#002366]">
          {/* Mobile Header */}
          <div className="h-24 sm:h-28 border-b border-white/15 flex items-center justify-between px-4">
            <img
              src={whiteLogo}
              alt="Core5 Academy"
              className="max-h-full w-auto object-contain"
            />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 hover:bg-white/10 rounded-lg text-white"
            >
              <ChevronLeft size={20} />
            </button>
          </div>

          {/* Mobile User Info */}
          <div className="p-4 border-b border-white/15">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-[#f1be38] text-[#1e1b4b] flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'S'}
              </div>
              <div>
                <h1 className="font-bold text-base text-white">Super Admin</h1>
                <p className="text-xs text-white/70 truncate">{user?.name || user?.email}</p>
              </div>
            </div>
          </div>

          {/* Mobile Navigation */}
          <nav className="flex-1 min-h-0 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              let isActive = false;
              if (item.path.includes('?')) {
                const basePath = item.path.split('?')[0];
                const tabParam = item.path.split('?')[1].split('=')[1];
                isActive = location.pathname === basePath && location.search.includes(tabParam);
              } else {
                isActive = location.pathname === item.path && !location.search.includes('tab=');
              }
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center rounded-xl px-3 py-3 transition-colors
                    ${isActive ? "bg-gradient-to-r from-blue-600/30 to-purple-600/30 text-white shadow-lg border border-white/20" : "hover:bg-white/10 text-white/80 hover:text-white"}
                  `}
                >
                  {item.icon}
                  <span className="ml-3 font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Logout */}
          <div className="p-4 border-t border-white/15 mt-auto">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center rounded-xl p-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 transition-colors"
            >
              <LogOut size={20} />
              <span className="ml-3 font-medium text-sm">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div
        className={`lg:ml-${sidebarCollapsed ? "20" : "64"} transition-all duration-300 h-screen overflow-hidden flex flex-col bg-[#fffdf4]`}
        style={{
          backgroundColor: '#fffdf4',
          backgroundImage: `
            linear-gradient(to right, rgba(200, 165, 70, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200, 165, 70, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px'
        }}
      >
        {/* Desktop Header */}
        <header className="bg-[#fffdf4]/90 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.02)] border-b border-[#ebdcaa]/40 sticky top-0 z-30 hidden lg:block">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Subscription Timer */}
              <div
                data-tour="header-subscription-timer"
                className={`flex items-center gap-2 px-3.5 py-1.5 border rounded-none shadow-2xs transition-colors duration-300 ${
                timer === 0
                  ? 'bg-[#fff8e7] border-[#fde68a] text-[#92400e]'
                  : 'bg-[#fffdf4] border-[#ebdcaa] text-[#1e1b4b]'
              }`}>
                <Star className={timer === 0 ? 'text-[#B99652]' : 'text-[#B99652]'} size={15} />
                {timer === 0 ? (
                  <div className="flex items-center gap-2 text-left">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#92400e]">Plan Expired</div>
                      <div className="text-xs font-bold text-[#1e1b4b]">Upgrade to continue</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase text-[#7a705a]">Plan</div>
                      <div className="text-xs font-bold text-[#1e1b4b]">{planName}</div>
                    </div>
                    <span className="text-[#ebdcaa] mx-1">•</span>
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase text-[#7a705a]">Days</div>
                      <div className="text-xs font-bold text-[#1e1b4b]">{days.toString().padStart(2, '0')}</div>
                    </div>
                    <span className="text-[#B99652] font-bold text-xs">:</span>
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase text-[#7a705a]">Hrs</div>
                      <div className="text-xs font-bold text-[#1e1b4b]">{hours.toString().padStart(2, '0')}</div>
                    </div>
                    <span className="text-[#B99652] font-bold text-xs">:</span>
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase text-[#7a705a]">Min</div>
                      <div className="text-xs font-bold text-[#1e1b4b]">{minutes.toString().padStart(2, '0')}</div>
                    </div>
                    <span className="text-[#B99652] font-bold text-xs">:</span>
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase text-[#7a705a]">Sec</div>
                      <div className="text-xs font-bold text-[#1e1b4b]">{seconds.toString().padStart(2, '0')}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Language Selector */}
              <UniversalLanguageSelector variant="compact" />

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-none text-xs font-bold uppercase tracking-wider transition-colors shadow-2xs"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Logout</span>
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
                <ChevronRight size={20} />
              </button>
              <h1 className="text-lg font-['DM_Serif_Display',serif] text-gray-800 tracking-wide">{currentPage}</h1>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Subscription Timer Mobile */}
              <div className={`flex items-center gap-1 px-2 py-1 border rounded-lg transition-colors duration-300 ${
                timer === 0 
                  ? 'bg-red-100 border-red-300' 
                  : 'bg-blue-100 border-blue-300'
              }`}>
                <Star className={timer === 0 ? 'text-red-600' : 'text-blue-600'} size={12} />
                {timer === 0 ? (
                  <div className="text-center">
                    <div className="text-xs font-bold text-red-700">EXPIRED</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    <div className="text-center">
                      <div className="text-xs font-semibold text-blue-700">D</div>
                      <div className="text-xs font-bold text-blue-800">{days.toString().padStart(2, '0')}</div>
                    </div>
                    <span className="text-blue-600 font-bold text-xs">:</span>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-blue-700">H</div>
                      <div className="text-xs font-bold text-blue-800">{hours.toString().padStart(2, '0')}</div>
                    </div>
                  </div>
                )}
              </div>
              <GuideBotLauncher tourId="superadmin-overview-v1" />
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-gray-100 rounded-lg text-red-600"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollable-content p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Footer */}
      <LoginFooter />

      {/* Subscription Expired Popup */}
      {showPopup && timer === 0 && (
        <div className="fixed inset-0 bg-[#1e1b4b]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#fffdf4] rounded-none p-8 max-w-md w-full border border-[#ebdcaa] shadow-[0_12px_40px_rgba(185,150,82,0.2)] animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#fff8e7] border border-[#fde68a] text-[#B99652] rounded-none flex items-center justify-center mx-auto mb-4 shadow-xs">
                <Star className="text-[#B99652] fill-[#B99652]/20" size={28} />
              </div>
              
              <h2 className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-2">
                Subscription Expired!
              </h2>
              
              <p className="text-xs sm:text-sm text-[#7a705a] mb-2">
                Your <span className="font-semibold text-[#92400e]">{planName}</span> plan has expired.
              </p>
              
              <p className="text-xs sm:text-sm text-[#7a705a] mb-6 leading-relaxed">
                To continue using the superadmin portal, please upgrade to a subscription plan.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPopup(false);
                    navigate("/superadmin/subscription");
                  }}
                  className="flex-1 bg-[#B99652] hover:bg-[#a38243] text-white px-5 py-2.5 rounded-none text-xs sm:text-sm font-bold border border-[#9b7b3e] shadow-xs transition-all uppercase tracking-wider"
                >
                  Upgrade Now
                </button>
                
                <button
                  onClick={() => setShowPopup(false)}
                  className="flex-1 bg-white hover:bg-[#fff8e7] text-[#665e4d] hover:text-[#1e1b4b] px-5 py-2.5 rounded-none text-xs sm:text-sm font-bold border border-[#ebdcaa] shadow-xs transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminLayout;
