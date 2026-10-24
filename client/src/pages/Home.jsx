import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Users,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  MessageCircle,
  BarChart3,
  Smartphone,
  Zap,
  Search,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  UserCheck,
  Package,
  Calculator,
  Menu,
  X,
  Award,
  BookMarked,
  Layers,
  FileCheck,
  Clock,
  TrendingUp,
  Globe,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Facebook,
  Linkedin,
  Youtube,
  Instagram,
  Share2,
  Building2,
  Bot,
  Video
} from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';
import { useTranslation } from '../context/TranslationContext';
import QuickLoginModal from '../components/QuickLoginModal';
import BookDemoModal from '../components/BookDemoModal';
import { useAuth } from '../auth/auth';
import axios from 'axios';
import { toast } from 'react-toastify';
import core5Logo from '../assets/core5-final-rbg.png';
import PersonaOrbit, { PERSONAS } from '../components/home/PersonaOrbit';

import studentReading from '../assets/student_reading.jpg';
import schoolgirlTransparent from '../assets/schoolgirl_transparent.png';
import iconCourse from '../assets/icon_course.png';
import iconAnalytics from '../assets/icon_analytics.png';
import iconMobile from '../assets/icon_mobile.png';
import iconEcosystem from '../assets/icon_ecosystem.png';
import { API_BASE } from '../config/api';

// Core5 Platform Capabilities & Metrics
const corePlatformPillars = [
  { name: 'AI-Powered Assessments & Assignments', icon: Sparkles },
  { name: 'Direct Video Call & Live Lectures', icon: Video },
  { name: '22+ Indian Languages (Bhashini AI)', icon: Globe },
  { name: '6 Dedicated Role Portals', icon: Users },
  { name: 'Multi-Campus Group Governance', icon: Building2 },
  { name: 'Instant Results & Marksheet Engine', icon: FileCheck },
  { name: '99.9% Enterprise Cloud SLA', icon: Zap },
  { name: '256-Bit Encrypted Data Isolation', icon: ShieldCheck }
];

// Interactive Role Showcase Data
const roleShowcases = {
  student: {
    title: 'Self-Paced Learning & Verifiable Certificates',
    subtitle: 'Empowering students to learn at their own speed with interactive progress tracking',
    icon: GraduationCap,
    badgeColor: 'bg-orange-100 text-[#F05A36]',
    features: [
      'Access assigned & open enrollment courses',
      'Track real-time module completion %',
      'Submit assignments & receive graded feedback',
      'Auto-generate verifiable completion certificates'
    ],
    cta: 'Explore Student Portal'
  },
  mentor: {
    title: 'Comprehensive Course Creation & Class Management',
    subtitle: 'Tools for educators to build courses, manage classrooms, and guide learners',
    icon: BookOpen,
    badgeColor: 'bg-amber-100 text-amber-600',
    features: [
      'Interactive course builder with video & quiz modules',
      'Monitor individual & class performance analytics',
      'Evaluate assignments & record student grades',
      'Conduct live Q&A & announcement broadcasts'
    ],
    cta: 'Explore Mentor Portal'
  },
  admin: {
    title: 'Enterprise Platform Oversight & Governance',
    subtitle: 'Full control over user applications, system integrity, and role permissions',
    icon: ShieldCheck,
    badgeColor: 'bg-purple-100 text-purple-600',
    features: [
      'Approve & manage mentor & staff applications',
      'Comprehensive user account control & role access',
      'System-wide financial & inventory audit logs',
      'Database export & security policy enforcement'
    ],
    cta: 'Explore Admin Portal'
  }
};

function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Modal, Dropdown & Tab states
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('student');
  const [activeShowcaseTab, setActiveShowcaseTab] = useState('student');
  const [isLoginDropdownOpen, setIsLoginDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activePersona, setActivePersona] = useState(0);
  const dropdownRef = useRef(null);

  // Hero Login Card States
  const { loginUser, API } = useAuth();
  const [heroLogin, setHeroLogin] = useState({ email: '', password: '' });
  const [heroShowPassword, setHeroShowPassword] = useState(false);
  const [heroRememberMe, setHeroRememberMe] = useState(false);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState('');

  const handleHeroLogin = async (e) => {
    e.preventDefault();
    if (!heroLogin.email || !heroLogin.password) {
      setHeroError('Please fill in both email and password.');
      return;
    }
    setHeroLoading(true);
    setHeroError('');
    try {
      const backendUrl = API || API_BASE;
      const response = await axios.post(`${backendUrl}/auth/login`, {
        email: heroLogin.email,
        password: heroLogin.password
      });
      if (response.data && response.data.token) {
        const { token, user } = response.data;
        loginUser(token, user);
        toast.success(`Welcome back, ${user.name || 'User'}!`);
        const role = user.role?.toLowerCase();
        switch (role) {
          case 'superadmin': navigate('/superadmin/dashboard'); break;
          case 'admin': navigate('/admin/dashboard'); break;
          case 'mentor': case 'teacher': navigate('/mentor/dashboard'); break;
          case 'student': navigate('/student/dashboard'); break;
          case 'storekeeper': navigate('/storekeeper/dashboard'); break;
          case 'accountant': navigate('/accountant/dashboard'); break;
          default: navigate('/');
        }
      } else {
        setHeroError('Invalid server response.');
      }
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfterHeader = err.response.headers?.['retry-after'];
        const retrySec = parseInt(retryAfterHeader, 10) || 
                         (typeof err.response.data?.remainingTime === 'number' ? err.response.data.remainingTime : null);
        let rateLimitMsg = 'Too many login attempts. Please try again later.';
        if (retrySec && retrySec > 0) {
          if (retrySec >= 60) {
            const mins = Math.ceil(retrySec / 60);
            rateLimitMsg = `Too many login attempts. Please try again in ${mins} minute${mins > 1 ? 's' : ''}.`;
          } else {
            rateLimitMsg = `Too many login attempts. Please try again in ${retrySec} second${retrySec > 1 ? 's' : ''}.`;
          }
        } else if (err.response.data?.message) {
          rateLimitMsg = err.response.data.message;
        }
        setHeroError(rateLimitMsg);
      } else {
        setHeroError(err.response?.data?.message || 'Login failed. Check your credentials.');
      }
    } finally {
      setHeroLoading(false);
    }
  };

  // Active Pricing Plan Index for Interactive Touch Carousel (0: Standard, 1: Enterprise, 2: Custom)
  const [activePricingIndex, setActivePricingIndex] = useState(1);

  // Stats Counter State (Animates on load/scroll)
  const [counts, setCounts] = useState({ universities: 0, students: 0, uptime: 0 });

  useEffect(() => {
    const timer = setTimeout(() => {
      setCounts({ universities: 50, students: 100, uptime: 99.9 });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Auto-open modal if user visits /login directly
  useEffect(() => {
    if (location.pathname === '/login') {
      setIsLoginModalOpen(true);
    }
  }, [location.pathname]);

  const handleCloseLoginModal = () => {
    setIsLoginModalOpen(false);
    if (location.pathname === '/login') {
      navigate('/', { replace: true });
    }
  };

  const handleOpenDemo = () => {
    setIsDemoModalOpen(true);
  };

  const handleCloseDemo = () => {
    setIsDemoModalOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsLoginDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenLogin = (role = 'student') => {
    setSelectedRole(role);
    setIsLoginDropdownOpen(false);
    setIsLoginModalOpen(true);
    if (location.pathname !== '/login') {
      navigate('/login');
    }
  };

  const handlePersonaExplore = (personaIndex) => {
    switch (personaIndex) {
      case 0: // Students
        handleOpenLogin('student');
        break;
      case 1: // Faculty
        handleOpenLogin('mentor');
        break;
      case 2: // University
        handleOpenDemo();
        break;
      case 3: // Admins
        handleOpenLogin('admin');
        break;
      default:
        handleOpenDemo();
        break;
    }
  };

  const roleOptions = [
    { id: 'student', label: 'Student Portal', icon: GraduationCap, desc: 'Access assigned courses & track grades' },
    { id: 'mentor', label: 'Mentor / Faculty', icon: BookOpen, desc: 'Manage classes, assignments & students' },
    { id: 'admin', label: 'Admin / Staff', icon: ShieldCheck, desc: 'Platform oversight & user management' },
    { id: 'storekeeper', label: 'Storekeeper', icon: Package, desc: 'Inventory & laboratory equipment' },
    { id: 'accountant', label: 'Accountant', icon: Calculator, desc: 'Fee collections & financial reporting' }
  ];

  return (
    <div className="relative isolate min-h-screen bg-[#FAF8F4] text-slate-800 font-sans-body antialiased selection:bg-amber-500 selection:text-white">
      {/* ================= PAGE-WIDE TEXTURED BACKGROUND ================= */}
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
        {/* Soft, dim light */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 15% 10%, rgba(255, 244, 222, 0.85) 0%, rgba(255, 244, 222, 0) 65%),' +
              'radial-gradient(ellipse 50% 45% at 90% 60%, rgba(185, 150, 82, 0.08) 0%, rgba(185, 150, 82, 0) 70%),' +
              'radial-gradient(ellipse 120% 100% at 50% 50%, rgba(0, 0, 0, 0) 60%, rgba(11, 21, 40, 0.05) 100%)',
          }}
        ></div>
        {/* Very light paper-grain texture */}
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: '200px 200px',
          }}
        ></div>
      </div>

      {/* ================= HEADER NAVBAR (DARK NAVY FOR PERFECT LOGO CONTRAST) ================= */}
      <header className="sticky top-0 z-40 bg-[#0B1528] border-b border-slate-800/80 text-white shadow-lg transition-all duration-300">
        <div className="container mx-auto px-4 md:px-8 py-3">
          <div className="flex items-center justify-between">

            {/* Brand Logo Image (White elements in logo contrast perfectly against #0B1528) */}
            <Link to="/" className="flex items-center group py-1">
              <img
                src={core5Logo}
                alt="Core5 Academy Logo"
                className="h-14 sm:h-16 md:h-20 lg:h-22 w-auto object-contain group-hover:scale-105 transition-transform duration-300 drop-shadow-md brightness-110"
              />
            </Link>

            {/* Desktop Navigation Links (Polymath font, 15px, 600 weight, Uppercase & Gold Active Link) */}
            <nav className="hidden lg:flex items-center space-x-8 text-[15px] font-['Polymath',sans-serif] font-semibold tracking-[0.5px] uppercase text-slate-200 upper-nav-link">
              <a href="#why-us" className="hover:text-[#B99652] transition-colors">{t('nav_why_us', 'WHY US')}</a>
              <a href="#showcase" className="hover:text-[#B99652] transition-colors">{t('nav_portals', 'PORTALS')}</a>
              <a href="#features" className="hover:text-[#B99652] transition-colors">{t('nav_features', 'FEATURES')}</a>
              <a href="#pricing" className="text-[#B99652] hover:text-[#a68443] transition-colors">{t('nav_pricing', 'PRICING')}</a>
              <a href="#partners" className="hover:text-[#B99652] transition-colors">{t('nav_partners', 'PARTNERS')}</a>
            </nav>

            {/* Right Actions: Login Dropdown, Book a Demo Button & Mobile Hamburger */}
            <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">

              {/* Single Direct Login Button */}
              <button
                onClick={() => handleOpenLogin('student')}
                className="hidden sm:inline-flex items-center space-x-1.5 px-4 py-2 rounded-none text-sm font-bold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/20 shadow-sm"
              >
                <span>{t('nav_login', 'Login')}</span>
              </button>

              {/* Main CTA Button: Book a Demo (Header-Button Specification) */}
              <button
                onClick={handleOpenDemo}
                className="hidden sm:inline-flex px-5 py-2.5 header-button bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] border-none rounded-none shadow-md transition-all duration-300 transform hover:-translate-y-0.5"
              >
                {t('book_a_demo', 'Book a Demo')}
              </button>

              {/* Language Selector */}
              <div className="hidden sm:block pl-1">
                <LanguageSelector />
              </div>

              {/* Mobile Hamburger Menu Toggle Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                aria-label="Toggle Mobile Menu"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ================= MOBILE NAVIGATION DRAWER ================= */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm lg:hidden animate-fadeIn"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="fixed inset-y-0 right-0 w-4/5 max-w-sm bg-white shadow-2xl p-6 flex flex-col justify-between overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div className="flex items-center">
                  <img
                    src={core5Logo}
                    alt="Core5 Academy Logo"
                    className="h-14 w-auto object-contain"
                  />
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex flex-col space-y-4 mb-8 text-[15px] font-['Polymath',sans-serif] font-semibold tracking-[0.5px] uppercase text-slate-800 upper-nav-link">
                <a href="#why-us" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#B99652] transition-colors">{t('nav_why_us', 'WHY US')}</a>
                <a href="#showcase" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#B99652] transition-colors">{t('nav_portals', 'PORTALS')}</a>
                <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#B99652] transition-colors">{t('nav_features', 'FEATURES')}</a>
                <a href="#pricing" onClick={() => setIsMobileMenuOpen(false)} className="text-[#B99652] hover:text-[#a68443] transition-colors">{t('nav_pricing', 'PRICING')}</a>
                <a href="#partners" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#B99652] transition-colors">{t('nav_partners', 'PARTNERS')}</a>
              </nav>

              <div className="border-t border-slate-100 pt-4 mb-6">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleOpenLogin('student');
                  }}
                  className="w-full flex items-center justify-center space-x-2 p-3 rounded-none bg-[#B99652] hover:bg-[#a68443] text-white font-bold text-sm uppercase tracking-wider transition-all shadow-md"
                >
                  <span>{t('nav_login', 'LOGIN')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenDemo();
                }}
                className="w-full block py-3.5 text-center rounded-xl bg-gradient-to-r from-amber-500 to-[#D97706] text-white font-bold text-sm shadow-md"
              >
                {t('book_a_demo', 'Book a Demo')}
              </button>
              <div className="flex justify-center pt-1">
                <LanguageSelector />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= HERO SECTION (WITH SCROLL REVEAL ANIMATION) ================= */}
      <section className="relative bg-transparent text-slate-900 pt-8 pb-16 md:pt-16 md:pb-24 overflow-hidden">
        {/* Faint fine grid, fading out toward the edges */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(11, 21, 40, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(11, 21, 40, 0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 40% 40%, black 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 40% 40%, black 30%, transparent 80%)',
          }}
        ></div>

        <div className="container max-w-6xl mx-auto px-4 md:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

            {/* Left Column: Text & CTAs (Cinematic Ultra Slow-Mo Slide from Far Left) */}
            <motion.div
              initial={{ opacity: 0, x: -280 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 space-y-6"
            >
              {/* Elegant Corporate Headline */}
              {/* Hero copy is English in every language (product requirement); lang/dir
                  keep its punctuation and alignment correct inside RTL pages. */}
              <h1 lang="en" dir="ltr" className="text-4xl md:text-5xl lg:text-6xl hero-headline-font font-semibold leading-[1.15] tracking-tight text-[#1d528f]">
                Learning that moves everyone forward.
              </h1>

              <p lang="en" dir="ltr" className="text-base md:text-xl text-slate-600 leading-relaxed font-normal max-w-xl">
                Give educators the clarity to teach their best and every learner the support to reach what's next in their academic journey.
              </p>

              {/* Enterprise Action Buttons (Header-Button Specification) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2 md:pt-4">
                <button
                  onClick={handleOpenDemo}
                  className="inline-flex items-center justify-center px-8 py-3.5 header-button bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] border-none rounded-none shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
                >
                  <span>{t('book_live_demo', 'Book a Live Demo')}</span>
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>

                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center px-8 py-3.5 btn-gold-outline rounded-none border-2 border-[#B99652] bg-white hover:bg-[#B99652] text-[#B99652] hover:text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] shadow-sm transition-all duration-300"
                >
                  {t('view_enterprise_pricing', 'View Enterprise Pricing →')}
                </a>
              </div>

              {/* Key Trust Signals (Animated Counters) */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-slate-300/80 max-w-md">
                <div>
                  <div className="text-2xl md:text-3xl font-serif-heading font-bold text-slate-900">
                    {counts.universities}+
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{t('counter_universities', 'Universities')}</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-serif-heading font-bold text-slate-900">
                    {counts.students}k+
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{t('counter_active_students', 'Active Students')}</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-serif-heading font-bold text-amber-600">
                    {counts.uptime}%
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{t('counter_uptime', 'System Uptime')}</div>
                </div>
              </div>
            </motion.div>

            {/* Right Column: Inline Login Form (Cinematic Ultra Slow-Mo Slide from Far Right) */}
            <motion.div
              initial={{ opacity: 0, x: 280 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
              className="lg:col-span-6 flex items-start justify-center lg:justify-end w-full"
            >
              <div className="w-full max-w-md lg:max-w-lg lg:ml-auto">
                {/* Login Form — blended with page */}
                <div className="bg-white/60 backdrop-blur-sm rounded-none border border-slate-200/50 px-8 md:px-10 py-8 md:py-10">
                  <h2 className="text-2xl md:text-3xl hero-headline-font font-semibold tracking-tight text-[#1d528f] mb-1">
                    {t('login_to_account', 'Log In to Your Account')}
                  </h2>
                  <p className="text-slate-500 text-sm mb-7">
                    {t('enter_credentials_desc', 'Enter your credentials to access your dashboard.')}
                  </p>

                  {/* Error Banner */}
                  {heroError && (
                    <div className="mb-5 p-3 rounded-none bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center space-x-2">
                      <span>⚠️</span>
                      <span className="flex-1">{heroError}</span>
                      <button onClick={() => setHeroError('')} className="text-rose-400 hover:text-rose-600">×</button>
                    </div>
                  )}

                  <form onSubmit={handleHeroLogin} className="space-y-5">
                    {/* Email Field */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        {t('email_or_username', 'Email or Username')} <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder={t('email_or_username_placeholder', 'Enter your email or username')}
                          value={heroLogin.email}
                          onChange={(e) => setHeroLogin(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full pl-11 pr-4 py-3 rounded-none border border-slate-300/80 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B99652]/40 focus:border-[#B99652] transition-all"
                          required
                        />
                      </div>
                    </div>

                    {/* Password Field */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        {t('password_label', 'Password')} <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                        <input
                          type={heroShowPassword ? 'text' : 'password'}
                          placeholder={t('password_placeholder_hero', 'Enter your password')}
                          value={heroLogin.password}
                          onChange={(e) => setHeroLogin(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full pl-11 pr-12 py-3 rounded-none border border-slate-300/80 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B99652]/40 focus:border-[#B99652] transition-all"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setHeroShowPassword(!heroShowPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {heroShowPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Remember Me + Forgot Password */}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={heroRememberMe}
                          onChange={(e) => setHeroRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-[#B99652] focus:ring-[#B99652]/30"
                        />
                        <span className="text-sm text-slate-600">{t('remember_me', 'Remember me')}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="text-sm font-semibold text-[#B99652] hover:text-[#a68443] transition-colors"
                      >
                        {t('forgot_password', 'Forgot password?')}
                      </button>
                    </div>

                    {/* Sign In Button */}
                    <button
                      type="submit"
                      disabled={heroLoading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-none bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] shadow-md hover:shadow-lg disabled:opacity-60 transition-all duration-300"
                    >
                      {heroLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <span>{t('sign_in_portal_btn', 'SIGN IN')}</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center my-5">
                    <div className="flex-1 border-t border-slate-300/60"></div>
                    <span className="px-4 text-xs text-slate-400 font-medium">{t('or_divider', 'or')}</span>
                    <div className="flex-1 border-t border-slate-300/60"></div>
                  </div>

                  {/* Enterprise Demo Button */}
                  <button
                    type="button"
                    onClick={handleOpenDemo}
                    className="w-full flex items-center justify-center gap-2.5 py-3 rounded-none border-2 border-slate-300/80 hover:border-[#B99652] bg-white/80 text-slate-700 hover:text-[#B99652] font-semibold text-sm transition-all duration-200"
                  >
                    <Globe className="w-4 h-4" />
                    <span>{t('request_enterprise_demo', 'Request Enterprise Demo')}</span>
                  </button>

                  {/* Footer Link */}
                  <p className="text-center text-xs text-slate-500 mt-5">
                    {t('new_to_core5', 'New to Core5?')}{' '}
                    <Link to="/register" className="font-semibold text-[#B99652] hover:text-[#a68443] hover:underline transition-colors">
                      {t('request_access', 'Request access')}
                    </Link>
                  </p>
                </div>
              </div>
            </motion.div>


          </div>
        </div>
      </section>

      {/* ================= INFINITE CORE5 CAPABILITIES MARQUEE ================= */}
      <section
        id="platform-highlights"
        className="py-10 relative overflow-hidden"
        style={{
          backgroundColor: '#f6f1e5',
          backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(241, 234, 221, 0.6) 100%)'
        }}
      >
        <div className="container mx-auto px-4 mb-4 text-center">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            {t('platform_capabilities_metrics', 'CORE5 ENTERPRISE PLATFORM CAPABILITIES & METRICS')}
          </p>
        </div>

        {/* Infinite Scroll Track */}
        <div className="relative flex overflow-x-hidden">
          <div className="py-3 animate-marquee flex whitespace-nowrap gap-10 items-center">
            {corePlatformPillars.concat(corePlatformPillars).map((pillar, idx) => {
              const IconComp = pillar.icon || Award;
              return (
                <div
                  key={idx}
                  className="flex items-center space-x-3 px-6 py-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#F05A36]/50 transition-all hover:shadow-sm"
                >
                  <IconComp className="w-5 h-5 text-[#F05A36] shrink-0" />
                  <span className="font-sans font-semibold text-slate-800 text-sm tracking-normal">
                    {pillar.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= WHY US SECTION (REFERENCE LAYOUT: HEX PHOTO + CONNECTED ROLE BADGES) ================= */}
      <section
        id="why-us"
        className="py-20 md:py-24 relative overflow-hidden border-b border-amber-900/5"
        style={{
          backgroundColor: '#fffdf4',
          backgroundImage: `
            linear-gradient(to right, rgba(200, 165, 70, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200, 165, 70, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px'
        }}
      >
        {/* Shared rounded-hexagon clip paths */}
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <clipPath id="hexFlatRounded" clipPathUnits="objectBoundingBox">
              <path d="M0.22,0.06 Q0.25,0 0.31,0 L0.69,0 Q0.75,0 0.78,0.06 L0.97,0.44 Q1,0.5 0.97,0.56 L0.78,0.94 Q0.75,1 0.69,1 L0.31,1 Q0.25,1 0.22,0.94 L0.03,0.56 Q0,0.5 0.03,0.44 Z" />
            </clipPath>
            <clipPath id="hexPointyRounded" clipPathUnits="objectBoundingBox">
              <path d="M0.43,0.035 Q0.5,0 0.57,0.035 L0.93,0.215 Q1,0.25 1,0.32 L1,0.68 Q1,0.75 0.93,0.785 L0.57,0.965 Q0.5,1 0.43,0.965 L0.07,0.785 Q0,0.75 0,0.68 L0,0.32 Q0,0.25 0.07,0.215 Z" />
            </clipPath>
          </defs>
        </svg>

        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">

            {/* Left Column: Pill, Headline, Subtext, Feature List, CTA */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-6 space-y-6 flex flex-col justify-center"
            >
              {/* Top Pill Badge */}
              <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#1d528f]/5 border border-[#1d528f]/15 text-[#1d528f] text-xs font-semibold font-['Poppins'] tracking-wide self-start">
                <GraduationCap className="w-4 h-4 text-[#B99652]" />
                <span>University Learning Platform</span>
              </div>

              {/* Headline */}
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif-heading font-medium text-[#1d528f] tracking-tight leading-[1.15]">
                Engineering for
                <span className="block text-[#1d528f]">Academic Excellence</span>
                Built for Every Learner.
              </h2>

              {/* Subtext */}
              <p className="text-slate-600 text-sm md:text-base leading-relaxed font-normal max-w-lg">
                We combine course delivery, campus logistics, and financial management into one cohesive interface, eliminating tool fragmentation across your university.
              </p>

              {/* Persona note with 3D bottom-to-top rotational roll transition */}
              <div
                className="min-h-[46px] my-2 border-l-[3px] border-[#B99652] pl-3 overflow-hidden flex items-center"
                style={{ perspective: 800 }}
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={activePersona}
                    initial={{ opacity: 0, y: 24, rotateX: 70, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -24, rotateX: -70, filter: 'blur(2px)' }}
                    transition={{
                      duration: 0.45,
                      ease: [0.25, 1, 0.5, 1],
                    }}
                    style={{
                      transformOrigin: '50% 50% -10px',
                      backfaceVisibility: 'hidden',
                      willChange: 'transform, opacity',
                    }}
                    className="text-sm text-[#1D528F] leading-relaxed"
                  >
                    {PERSONAS[activePersona]?.note}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* 4 Feature Items (plain, no cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 pt-2">
                {[
                  { icon: Layers, title: 'Unified Portal', desc: 'Single secure login for Students, Mentors, Admins, and Faculty.' },
                  { icon: Bot, title: 'AI Guided Learning', desc: 'Personalized support, smarter recommendations, better outcomes.' },
                  { icon: Package, title: 'Campus Logistics', desc: 'Manage housing, transport, IT and campus resources seamlessly.' },
                  { icon: ShieldCheck, title: 'Digital Credentials', desc: 'Verified certificates, transcripts and academic records — all in one place.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start space-x-3.5 group">
                    <div className="w-11 h-11 shrink-0 rounded-full bg-[#1d528f]/5 border border-[#1d528f]/10 flex items-center justify-center transition-colors group-hover:bg-[#B99652]/10 group-hover:border-[#B99652]/30">
                      <Icon className="w-5 h-5 text-[#1d528f] stroke-[1.75]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#1d528f] font-serif-heading mb-1">{title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="pt-4">
                <button
                  onClick={handleOpenDemo}
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] rounded-none shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
                >
                  <span>{t('explore_the_platform', 'Explore the Platform')}</span>
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* Right Column: Persona Orbit */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="lg:col-span-6 flex items-center justify-center w-full"
            >
              <PersonaOrbit onChange={setActivePersona} onExplore={handlePersonaExplore} />
            </motion.div>

          </div>
        </div>
      </section>

      {/* ================= ENTERPRISE PRICING SECTION ================= */}
      <section
        id="pricing"
        className="py-20 md:py-28 relative overflow-hidden border-b border-amber-900/5"
        style={{
          backgroundColor: '#fffdf4',
          backgroundImage: `
            linear-gradient(to right, rgba(200, 165, 70, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200, 165, 70, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px'
        }}
      >
        <div className="container mx-auto px-4 md:px-8">

          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center mb-16 space-y-3"
          >
            <h2 className="text-3xl md:text-5xl hero-headline-font font-semibold text-[#1d528f] tracking-tight">
              Enterprise & University Pricing
            </h2>
            <p className="text-slate-600 text-base md:text-lg">
              Flexible, transparent plans designed for modern departments, full campuses, and multi-university networks.
            </p>
          </motion.div>

          {/* Dynamic Touch-Interactive Quick Pricing Carousel */}
          <div className="relative max-w-6xl mx-auto py-6 px-4">
            <div className="relative w-full max-w-5xl mx-auto h-[580px] flex items-center justify-center overflow-visible py-4">
              {(() => {
                const allPlans = [
                  {
                    id: 0,
                    category: 'Departmental',
                    title: 'Standard Campus',
                    subtitle: 'Perfect for individual departments, colleges, and academic divisions.',
                    price: '$499',
                    period: '/ month',
                    badge: null,
                    features: [
                      'Up to 1,500 active students',
                      'Course & Assignment Manager',
                      'Real-time Gradebook & Attendance',
                      'Standard Email & Ticket Support',
                      '100 GB Secure Cloud Storage'
                    ],
                    buttonText: t('book_live_demo', 'Book a Live Demo'),
                    buttonClass: 'btn-gold-outline rounded-none border-2 border-[#B99652] bg-white hover:bg-[#B99652] text-[#B99652] hover:text-white'
                  },
                  {
                    id: 1,
                    category: 'University Wide',
                    title: 'Enterprise Campus',
                    subtitle: 'Complete LMS & AI infrastructure for entire university campuses.',
                    price: '$1,299',
                    period: '/ month',
                    badge: 'Most Popular',
                    features: [
                      'Unlimited Active Students & Faculty',
                      'AI GuideBot 2.0 Academic Assistant',
                      'Automated Exam & Assignment Evaluation',
                      'Single Sign-On (SSO) & Custom Domain',
                      '1 TB Storage + Priority 24/7 SLA Support',
                      'Verifiable Digital Completion Certificates'
                    ],
                    buttonText: t('book_live_demo_arrow', 'Book a Live Demo →'),
                    buttonClass: 'header-button bg-[#B99652] hover:bg-[#a68443] text-white border-none'
                  },
                  {
                    id: 2,
                    category: 'Global Network',
                    title: 'Custom Institution',
                    subtitle: 'Tailored solutions for multi-campus networks and education boards.',
                    price: 'Custom',
                    period: '/ annual contract',
                    badge: null,
                    features: [
                      'Unlimited Campuses & Custom Roles',
                      'Dedicated On-Premise / Hybrid Cloud',
                      'Custom AI Model Fine-tuning',
                      'Custom ERP & Finance Integration',
                      'Dedicated Success Manager & Onboarding'
                    ],
                    buttonText: t('contact_enterprise_sales', 'Contact Enterprise Sales'),
                    buttonClass: 'btn-gold-outline rounded-none border-2 border-[#B99652] bg-white hover:bg-[#B99652] text-[#B99652] hover:text-white'
                  }
                ];

                return allPlans.map((plan) => {
                  let offset = plan.id - activePricingIndex;
                  if (offset < -1) offset += 3;
                  if (offset > 1) offset -= 3;

                  const isCenter = offset === 0;

                  return (
                    <motion.div
                      key={plan.id}
                      initial={false}
                      animate={{
                        x: `${offset * 105}%`,
                        scale: isCenter ? 1.05 : 0.85,
                        opacity: isCenter ? 1 : 0.75,
                        zIndex: isCenter ? 30 : 10,
                      }}
                      transition={{
                        duration: 0.8,
                        ease: [0.16, 1, 0.3, 1]
                      }}
                      onClick={() => setActivePricingIndex(plan.id)}
                      className={`absolute w-[290px] sm:w-[330px] md:w-[360px] p-8 flex flex-col justify-between cursor-pointer rounded-none transition-shadow ${
                        isCenter
                          ? 'bg-white border-2 border-[#B99652] shadow-2xl z-30'
                          : 'bg-white/80 backdrop-blur-sm border border-slate-200/90 shadow-md hover:bg-white z-10'
                      }`}
                    >
                      {/* Badge */}
                      {plan.badge && isCenter && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#B99652] text-white px-4 py-1 text-[11px] font-['Poppins'] font-semibold uppercase tracking-wider shadow-sm rounded-none">
                          {plan.badge}
                        </div>
                      )}

                      <div>
                        <div className={`text-sm font-bold uppercase tracking-wider mb-2 ${isCenter ? 'text-[#B99652]' : 'text-slate-400'}`}>
                          {plan.category}
                        </div>
                        <h3 className="text-2xl hero-headline-font font-semibold text-slate-900 mb-2">
                          {plan.title}
                        </h3>
                        <p className="text-slate-500 text-xs leading-relaxed mb-6">
                          {plan.subtitle}
                        </p>
                        
                        <div className="mb-6 pb-6 border-b border-slate-200/80">
                          <span className="text-4xl hero-headline-font font-bold text-[#1d528f]">{plan.price}</span>
                          <span className="text-slate-500 text-xs font-medium ml-1.5">{plan.period}</span>
                        </div>

                        {/* Features list */}
                        <div className="space-y-3 mb-8">
                          {plan.features.map((feat, i) => (
                            <div key={i} className="flex items-center space-x-3 text-xs font-medium text-slate-700">
                              <div className={`w-4 h-4 rounded-none flex items-center justify-center shrink-0 text-[10px] font-bold ${
                                isCenter ? 'bg-[#B99652] text-white' : 'bg-emerald-100 text-emerald-600'
                              }`}>✓</div>
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDemo();
                        }}
                        className={`w-full py-3.5 font-['Poppins'] font-semibold text-[12px] uppercase tracking-[0.5px] transition-all duration-300 ${
                          isCenter
                            ? 'header-button bg-[#B99652] hover:bg-[#a68443] text-white border-none shadow-md'
                            : 'btn-gold-outline rounded-none border-2 border-[#B99652] bg-white hover:bg-[#B99652] text-[#B99652] hover:text-white'
                        }`}
                      >
                        {isCenter && !plan.buttonText.includes('→') ? `${plan.buttonText} →` : (isCenter ? plan.buttonText : plan.buttonText.replace(' →', ''))}
                      </button>
                    </motion.div>
                  );
                });
              })()}
            </div>

            {/* Interactive Carousel Navigation Controls */}
            <div className="flex justify-center items-center space-x-3 pt-8">
              {[0, 1, 2].map((index) => (
                <button
                  key={index}
                  onClick={() => setActivePricingIndex(index)}
                  className={`transition-all duration-300 ${
                    activePricingIndex === index
                      ? 'w-9 h-2.5 bg-[#B99652] rounded-none'
                      : 'w-2.5 h-2.5 bg-slate-300 hover:bg-slate-400 rounded-none'
                  }`}
                  aria-label={`Select Pricing Plan ${index + 1}`}
                />
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ================= FEATURES GRID SECTION WITH STUDENT ================= */}
      <section id="features" className="pt-16 md:pt-24 pb-0 bg-transparent relative overflow-hidden">
        
        {/* Soft Ambient Textures, Dot Grids & Decorative SVG Accents - Smooth Top Blend */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 [mask-image:linear-gradient(to_bottom,transparent_0%,black_18%)] [webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_18%)]">
          {/* Subtle Warm-to-Cool Ambient Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#F1F5F9]/40 to-[#E8F1F9]/50" />

          {/* Subtle Dot Grid Overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

          {/* Theme Color Ambient Soft Blur Glows */}
          <div className="absolute top-10 -left-20 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl" />
          <div className="absolute top-1/3 right-0 w-[450px] h-[450px] bg-blue-100/25 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 left-10 w-80 h-80 bg-amber-100/30 rounded-full blur-2xl" />

          {/* Decorative Dot Matrix on Left Behind Girl */}
          <div className="absolute bottom-16 left-6 md:left-12 grid grid-cols-6 gap-2.5 opacity-30">
            {[...Array(24)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            ))}
          </div>

          {/* Abstract SVG Loops & Doodle Accents */}
          <svg className="absolute top-16 left-6 md:left-16 w-28 h-28 opacity-25 text-sky-400" viewBox="0 0 100 100" fill="none">
            <path d="M10 50 Q 30 10, 60 40 T 90 80" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
          </svg>

          {/* Paper Plane Doodle Accent */}
          <svg className="absolute top-24 left-36 md:left-48 w-7 h-7 opacity-35 text-sky-500 rotate-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>

          {/* Curved Ring Overlay Behind Girl */}
          <svg className="absolute -bottom-16 left-4 w-72 h-72 opacity-20 text-sky-400" viewBox="0 0 200 200" fill="none">
            <ellipse cx="100" cy="100" rx="90" ry="45" stroke="currentColor" strokeWidth="1.5" transform="rotate(-20 100 100)" />
          </svg>

          {/* Bottom Right Corner Accent Rings */}
          <svg className="absolute -bottom-14 -right-14 w-80 h-80 opacity-15 text-[#1d528f]" viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 6" />
            <circle cx="100" cy="100" r="65" stroke="#38BDF8" strokeWidth="1" />
          </svg>

          {/* Soft Pastel Floating Accent Dots */}
          <div className="absolute top-32 left-1/3 w-3 h-3 rounded-full bg-amber-400 opacity-50 animate-pulse" />
          <div className="absolute bottom-28 left-44 w-3.5 h-3.5 rounded-full bg-sky-300 opacity-45" />
          <div className="absolute top-20 right-1/4 w-3 h-3 rounded-full bg-purple-300 opacity-45" />
        </div>

        <div className="container mx-auto px-4 md:px-8 max-w-7xl relative z-10">

          {/* Main Layout: Girl on Left, Header + 4 Feature Cards on Right */}
          <div className="relative flex flex-col lg:flex-row items-center lg:items-end gap-6 md:gap-8 -mb-1">

            {/* Girl Image - Left Side (Cropped at skirt) */}
            <div className="h-[210px] sm:h-[255px] md:h-[295px] overflow-hidden flex items-start -ml-[46px] flex-shrink-0 z-10">
              <img
                src={schoolgirlTransparent}
                alt="Academy Student"
                className="h-[350px] sm:h-[430px] md:h-[490px] w-auto object-contain object-top drop-shadow-xl"
              />
            </div>

            {/* Right Side: Section Header + 4 Feature Cards */}
            <div className="flex-1 flex flex-col w-full">

              {/* Section Header - Positioned directly above the cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-8 md:mb-10 space-y-3 max-w-3xl mx-auto"
              >
                <h2 className="text-3xl md:text-5xl font-serif-heading font-light italic text-[#1d528f] tracking-tight leading-tight">
                  Everything learning needs,<br /> Nothing it doesn't,
                </h2>
                <p className="text-sm md:text-base text-slate-500 font-normal italic max-w-xl mx-auto">
                  Simple tools, connected experiences, and useful insight, all designed around the people doing the work.
                </p>
              </motion.div>

              {/* 4 Feature Cards - Right Side of Girl */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-4 w-full">

                {/* Card 1 - Course Management */}
                <motion.div
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 }}
                  whileHover={{ y: -6 }}
                  className="bg-white/95 backdrop-blur-sm p-6 rounded-none shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100 group cursor-pointer flex flex-col justify-between h-full"
                >
                  <div>
                    <div className="w-12 h-12 mb-5 group-hover:scale-110 transition-transform overflow-hidden rounded-lg">
                      <img src={iconCourse} alt="Course Management" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-2 group-hover:text-sky-600 transition-colors font-['Poppins']">
                      Course Management
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-5">
                      Create, organize, and deliver engaging learning experiences with tools educators love.
                    </p>
                  </div>
                  <div className="w-7 h-[3px] bg-sky-400 rounded-full" />
                </motion.div>

                {/* Card 2 - Actionable analytics */}
                <motion.div
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  whileHover={{ y: -6 }}
                  className="bg-white/95 backdrop-blur-sm p-6 rounded-none shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100 group cursor-pointer flex flex-col justify-between h-full"
                >
                  <div>
                    <div className="w-12 h-12 mb-5 group-hover:scale-110 transition-transform overflow-hidden rounded-lg">
                      <img src={iconAnalytics} alt="Actionable Analytics" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-2 group-hover:text-amber-600 transition-colors font-['Poppins']">
                      Actionable analytics
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-5">
                      Turn learning data into clear insights that help every student make meaningful progress.
                    </p>
                  </div>
                  <div className="w-7 h-[3px] bg-amber-400 rounded-full" />
                </motion.div>

                {/* Card 3 - Learning everywhere */}
                <motion.div
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 }}
                  whileHover={{ y: -6 }}
                  className="bg-white/95 backdrop-blur-sm p-6 rounded-none shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100 group cursor-pointer flex flex-col justify-between h-full"
                >
                  <div>
                    <div className="w-12 h-12 mb-5 group-hover:scale-110 transition-transform overflow-hidden rounded-lg">
                      <img src={iconMobile} alt="Learning Everywhere" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-2 group-hover:text-emerald-600 transition-colors font-['Poppins']">
                      Learning everywhere
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-5">
                      Keep teaching and learning moving with a seamless experience across every device.
                    </p>
                  </div>
                  <div className="w-7 h-[3px] bg-emerald-400 rounded-full" />
                </motion.div>

                {/* Card 4 - Connected ecosystem */}
                <motion.div
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 }}
                  whileHover={{ y: -6 }}
                  className="bg-white/95 backdrop-blur-sm p-6 rounded-none shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100 group cursor-pointer flex flex-col justify-between h-full"
                >
                  <div>
                    <div className="w-12 h-12 mb-5 group-hover:scale-110 transition-transform overflow-hidden rounded-lg">
                      <img src={iconEcosystem} alt="Connected Ecosystem" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-2 group-hover:text-purple-600 transition-colors font-['Poppins']">
                      Connected ecosystem
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-5">
                      Bring your toolkit, tools together with flexible integration across our platform.
                    </p>
                  </div>
                  <div className="w-7 h-[3px] bg-purple-400 rounded-full" />
                </motion.div>

              </div>

            </div>

          </div>

        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="relative z-20 bg-[#18181B] text-white pt-16 pb-8 border-t border-slate-800">
        <div className="container mx-auto px-4 md:px-8">

          {/* Main Footer Content Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-slate-800">

            {/* Brand Column */}
            <div className="space-y-4">
              <div className="flex items-center">
                <img
                  src={core5Logo}
                  alt="Core5 Academy Logo"
                  className="h-16 md:h-20 w-auto object-contain brightness-110"
                />
              </div>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm font-normal">
                Empowering universities, educators, and students with an integrated, secure, and intelligent Learning Management System.
              </p>
              <div className="flex items-center space-x-3 text-xs text-slate-400 pt-1">
                <span className="inline-flex items-center space-x-1.5 text-emerald-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ISO 27001 Certified</span>
                </span>
              </div>
            </div>

            {/* Quick Portals */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-serif-heading">Portals</h4>
              <ul className="space-y-2 text-xs font-medium text-slate-400">
                <li><button onClick={() => handleOpenLogin('student')} className="hover:text-[#F05A36] transition-colors">Student Portal</button></li>
                <li><button onClick={() => handleOpenLogin('mentor')} className="hover:text-[#F05A36] transition-colors">Faculty / Mentor Desk</button></li>
                <li><button onClick={() => handleOpenLogin('admin')} className="hover:text-[#F05A36] transition-colors">Admin Control Center</button></li>
                <li><button onClick={() => handleOpenLogin('storekeeper')} className="hover:text-[#F05A36] transition-colors">Storekeeper Logistics</button></li>
                <li><button onClick={() => handleOpenLogin('accountant')} className="hover:text-[#F05A36] transition-colors">Accountant Desk</button></li>
              </ul>
            </div>

            {/* Navigation */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-serif-heading">Platform</h4>
              <ul className="space-y-2 text-xs font-medium text-slate-400">
                <li><a href="#why-us" className="hover:text-[#F05A36] transition-colors">Why Core5</a></li>
                <li><a href="#showcase" className="hover:text-[#F05A36] transition-colors">Role Showcase</a></li>
                <li><a href="#features" className="hover:text-[#F05A36] transition-colors">Key Features</a></li>
                <li><a href="#partners" className="hover:text-[#F05A36] transition-colors">Partner Universities</a></li>
              </ul>
            </div>

            {/* Connect Us Column */}
            <div className="space-y-3">
              <h4 className="text-lg font-bold text-white font-sans-body tracking-tight">Connect Us</h4>

              <div className="space-y-2 text-xs text-slate-300 font-medium">
                <a href="tel:9930419595" className="flex items-center space-x-2.5 hover:text-[#F05A36] transition-colors">
                  <Phone className="w-4 h-4 text-white shrink-0" />
                  <span className="text-sm font-semibold text-white">9930419595</span>
                </a>

                <a href="mailto:info@core5.co.in" className="flex items-center space-x-2.5 hover:text-[#F05A36] transition-colors">
                  <Mail className="w-4 h-4 text-white shrink-0" />
                  <span className="text-xs text-slate-300">info@core5.co.in</span>
                </a>

                <a href="mailto:sales@core5.co.in" className="flex items-center space-x-2.5 hover:text-[#F05A36] transition-colors">
                  <Mail className="w-4 h-4 text-white shrink-0" />
                  <span className="text-xs text-slate-300">sales@core5.co.in</span>
                </a>
              </div>

              {/* Social Media Exact Sharp Square Buttons */}
              <div className="flex items-center space-x-2 pt-3">
                {/* Facebook */}
                <a href="#" aria-label="Facebook" className="w-8 h-8 rounded-none bg-[#3b5998] flex items-center justify-center text-white hover:scale-105 transition-transform">
                  <Facebook className="w-4 h-4" />
                </a>

                {/* Twitter / X */}
                <a href="#" aria-label="X" className="w-8 h-8 rounded-none bg-black border border-slate-700 flex items-center justify-center text-white hover:scale-105 transition-transform">
                  <span className="font-bold text-xs font-sans">X</span>
                </a>

                {/* YouTube */}
                <a href="#" aria-label="YouTube" className="w-8 h-8 rounded-none bg-[#cd201f] flex items-center justify-center text-white hover:scale-105 transition-transform">
                  <Youtube className="w-4 h-4" />
                </a>

                {/* LinkedIn */}
                <a href="#" aria-label="LinkedIn" className="w-8 h-8 rounded-none bg-[#0077b5] flex items-center justify-center text-white hover:scale-105 transition-transform">
                  <Linkedin className="w-4 h-4" />
                </a>

                {/* Instagram */}
                <a href="#" aria-label="Instagram" className="w-8 h-8 rounded-none bg-[#ff0000] flex items-center justify-center text-white hover:scale-105 transition-transform">
                  <Instagram className="w-4 h-4" />
                </a>
              </div>
            </div>

          </div>

          {/* Bottom Copyright & Legal Links */}
          <div className="pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-slate-400 gap-4">
            <div>
              © 2026 Core5 Academy. All rights reserved.
            </div>
            <div className="flex flex-wrap items-center space-x-6 text-slate-400 font-medium">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Security Center</a>
              <a href="#" className="hover:text-white transition-colors">Cookie Preferences</a>
            </div>
          </div>

        </div>
      </footer>

      {/* ================= FLOATING AI ASSISTANT WIDGET ================= */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => handleOpenLogin('student')}
          className="flex items-center space-x-2 px-5 py-3.5 header-button bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] border-none rounded-none shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
          aria-label="Ask us anything"
        >
          <MessageCircle className="w-5 h-5 fill-current" />
          <span>Ask us anything</span>
        </button>
      </div>

      {/* ================= QUICK LOGIN MODAL ================= */}
      <QuickLoginModal
        isOpen={isLoginModalOpen}
        onClose={handleCloseLoginModal}
        initialRole={selectedRole}
      />

      {/* ================= ENTERPRISE BOOK DEMO MODAL ================= */}
      <BookDemoModal
        isOpen={isDemoModalOpen}
        onClose={handleCloseDemo}
      />
    </div>
  );
}

export default Home;