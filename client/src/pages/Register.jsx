import React, { useState } from 'react';
import { useAuth } from '../auth/auth';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { BookOpen, User, Mail, Lock } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';

import core5Logo from '../assets/core5-final-rbg.png';

const Register = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student'
  });
  const [isLoading, setIsLoading] = useState(false);
  const { API, loginUser } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.post(`${API}/auth/register`, formData);
      const { token, user } = response.data;
      loginUser(token, user);

      toast.success(t('forms:register_success'));
      setTimeout(() => {
        navigate('/student/dashboard');
      }, 1500);

    } catch (err) {
      toast.error(err.response?.data?.message || t('forms:register_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute top-10 right-10 w-96 h-96 bg-[#F05A36]/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center">
          <Link to="/" className="inline-flex items-center group mb-2">
            <img 
              src={core5Logo} 
              alt="Core5 Academy Logo" 
              className="h-16 md:h-20 w-auto object-contain group-hover:scale-105 transition-transform duration-300 brightness-110 drop-shadow-md" 
            />
          </Link>
          <p className="mt-2 text-center text-xs text-slate-500 font-medium">
            {t('forms:register_tagline')}
          </p>
        </div>

        {/* Registration Card (Exact Sharp Square Geometry) */}
        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-xl rounded-none sm:px-10 border border-slate-200/80">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-serif-heading font-light text-[#1d528f] tracking-tight">
                {t('forms:register_title')}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {t('forms:register_subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field */}
              <div>
                <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t('forms:register_full_name')} *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-xs"
                    placeholder={t('forms:register_name_placeholder')}
                    required
                  />
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t('forms:register_email')} *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-xs"
                    placeholder="student@core5.edu"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t('forms:register_password')} *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-xs"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {t('forms:register_password_hint')}
                </p>
              </div>

              {/* Hidden Role Field */}
              <input type="hidden" name="role" value="student" />

              {/* Submit Button (Header-Button Specification) */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 header-button bg-[#B99652] hover:bg-[#a68443] text-white font-['Poppins'] font-semibold text-[13px] uppercase tracking-[0.5px] border-none rounded-none shadow-md hover:shadow-lg active:scale-[0.99] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 mt-2"
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{t('forms:register_creating')}</span>
                    </div>
                  ) : (
                    <span>{t('forms:register_submit')}</span>
                  )}
                </button>
              </div>
            </form>

            {/* Footer / Login Link */}
            <div className="text-center pt-6 border-t border-slate-100 mt-6 text-xs text-slate-500">
              {t('forms:register_have_account')}{' '}
              <Link to="/login" className="text-amber-600 font-bold hover:underline">
                {t('forms:register_sign_in_link')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;