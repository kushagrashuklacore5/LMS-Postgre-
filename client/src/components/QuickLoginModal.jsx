import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';
import { useAuth } from '../auth/auth';
import { useTranslation } from '../context/TranslationContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import studentReadingImg from '../assets/student_reading.jpg';
import core5Logo from '../assets/core5-final-rbg.png';
import { API_BASE } from '../config/api';

const QuickLoginModal = ({ isOpen, onClose, initialRole = 'student' }) => {
  const { loginUser, API } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeRole, setActiveRole] = useState(initialRole);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialRole) {
      setActiveRole(initialRole);
    }
  }, [initialRole]);

  useEffect(() => {
    setError('');
  }, [activeRole, formData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError(t('fill_both_email_password'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const backendUrl = API || API_BASE;
      const endpoint = `${backendUrl}/auth/login`;

      const response = await axios.post(endpoint, {
        email: formData.email,
        password: formData.password,
        expectedRole: activeRole
      });

      if (response.data && response.data.token) {
        const { token, user } = response.data;
        loginUser(token, user);
        toast.success(t('welcome_back_user', { name: user.name || t('student') }));
        onClose();

        // Redirect based on role
        const role = user.role?.toLowerCase() || activeRole;
        switch (role) {
          case 'superadmin':
            navigate('/superadmin/dashboard');
            break;
          case 'admin':
            navigate('/admin/dashboard');
            break;
          case 'mentor':
          case 'teacher':
            navigate('/mentor/dashboard');
            break;
          case 'student':
            navigate('/student/dashboard');
            break;
          case 'storekeeper':
            navigate('/storekeeper/dashboard');
            break;
          case 'accountant':
            navigate('/accountant/dashboard');
            break;
          default:
            navigate('/');
        }
      } else {
        setError(t('login_failed'));
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.response?.status === 429) {
        const retryAfterHeader = err.response.headers?.['retry-after'];
        const retrySec = parseInt(retryAfterHeader, 10) || 
                         (typeof err.response.data?.remainingTime === 'number' ? err.response.data.remainingTime : null);
        let rateLimitMsg = t('too_many_login_attempts');
        if (retrySec && retrySec > 0) {
          if (retrySec >= 60) {
            const mins = Math.ceil(retrySec / 60);
            rateLimitMsg = t('too_many_login_attempts_minutes', { minutes: mins });
          } else {
            rateLimitMsg = t('too_many_login_attempts_seconds', { seconds: retrySec });
          }
        } else if (err.response.data?.message) {
          rateLimitMsg = err.response.data.message;
        }
        setError(rateLimitMsg);
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || t('login_failed');
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 md:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-none shadow-2xl overflow-hidden border border-slate-200 flex flex-col md:flex-row my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-none bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
          aria-label={t('close')}
        >
          <X className="w-5 h-5" />
        </button>

        {/* ================= LEFT COLUMN: DEEP NAVY CARD WITH LOGO & REAL STUDENT PHOTO ================= */}
        <div className="hidden md:flex md:w-5/12 bg-gradient-to-br from-[#002366] via-[#08173e] to-[#040817] text-white p-8 flex-col justify-between relative overflow-hidden">
          {/* Ambient Glows & Abstract Arc Background SVG graphics */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-[#B99652]/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <svg className="w-full h-full" viewBox="0 0 400 600" fill="none">
              <circle cx="200" cy="300" r="250" stroke="white" strokeWidth="1.5" />
              <circle cx="200" cy="300" r="180" stroke="white" strokeWidth="1" />
              <path d="M-50 450 Q 200 200 450 450" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Top Brand Header */}
          <div className="relative z-10 flex items-center">
            <img
              src={core5Logo}
              alt="Core5 Academy"
              className="h-12 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
          </div>

          {/* Center Image Container */}
          <div className="relative z-10 my-4 flex items-center justify-center">
            <div className="relative w-full max-w-[260px] aspect-square rounded-none overflow-hidden shadow-2xl border-2 border-white/20 group">
              <img
                src={studentReadingImg}
                alt="Student sitting cross-legged reading book"
                className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

              <div className="absolute bottom-3 left-3 right-3 text-center bg-white/95 backdrop-blur-md py-2 px-3 rounded-none shadow-lg border border-[#ebdcaa]/60">
                <p className="text-xs font-bold text-[#1e1b4b]">{t('direct_institutional_access')}</p>
                <p className="text-[10px] text-slate-600 font-medium">{t('quick_login_title')}</p>
              </div>
            </div>
          </div>

          {/* Bottom Footer Quote */}
          <div className="relative z-10 text-xs text-white/80 font-medium leading-relaxed border-t border-white/15 pt-3">
            <span>{t('core5_academy')}</span>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: PURE WHITE LOGIN FORM & ROLE TABS ================= */}
        <div className="w-full md:w-7/12 p-6 md:p-10 bg-white text-slate-900 flex flex-col justify-center">

          {/* Form Header */}
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-['DM_Serif_Display',serif] font-bold text-[#1e1b4b] tracking-tight">
              {t('quick_login_title')}
            </h2>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-none bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center space-x-2">
                <span>⚠️</span>
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                {t('email_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t('email_placeholder')}
                  className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-xs"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  {t('password_label')}
                </label>
                <a href="/login" className="text-xs text-amber-600 hover:underline font-semibold">
                  {t('forgot_password')}
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={t('password_placeholder')}
                  className="w-full pl-10 pr-10 py-3 rounded-none border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded-none border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="remember" className="text-xs text-slate-600 font-medium select-none">
                {t('remember_me')}
              </label>
            </div>

            {/* Sign In Primary Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 header-button bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] border-none rounded-none shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{t('signing_in')}</span>
                </>
              ) : (
                <span>{t('sign_in_portal_btn')}</span>
              )}
            </button>

            {/* Google SSO Secondary Button (Exact Sharp Square) */}
            <button
              type="button"
              onClick={() => toast.info('Google SSO integration enabled.')}
              className="w-full py-3 px-4 rounded-none bg-white border border-slate-200 text-slate-800 font-semibold text-xs hover:bg-slate-50 transition-colors flex items-center justify-center space-x-2 shadow-xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{t('sign_in_with_google', 'Sign in with Google')}</span>
            </button>

            {/* Footer */}
            <div className="text-center pt-1 text-xs text-slate-500">
              {t('dont_have_account', "Don't have an account?")}{' '}
              <a href="/register" className="text-[#F05A36] font-bold hover:underline">
                {t('sign_up_link', 'Sign Up')}
              </a>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
};

export default QuickLoginModal;
