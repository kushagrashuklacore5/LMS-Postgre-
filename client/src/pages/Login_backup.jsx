import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { useSimpleTranslation } from '../context/SimpleTranslationContext';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BookOpen, Mail, Lock, Eye, EyeOff, Chrome, Twitter, Gamepad2 } from 'lucide-react';
import SimpleLanguageSelector from '../components/SimpleLanguageSelector';
import TranslationTest from '../components/TranslationTest';
import videoBg from '../assets/login-bg.mp4';

/* ============================================================
   LOGIN COMPONENT
   ============================================================ */

const Login = () => {
  const { t, version, currentLanguage } = useSimpleTranslation();
  const [forceRender, setForceRender] = useState(0);

  // Force re-render when language changes
  useEffect(() => {
    console.log('🔄 Login component re-rendering due to language change:', currentLanguage);
    setForceRender(prev => prev + 1);
  }, [currentLanguage, version]);

  /* ================= STATE ================= */
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /* ================= AUTH + NAV ================= */
  const { loginUser, API: contextAPI } = useAuth();
  const navigate = useNavigate();
  
  // Ensure API URL is always set
  const API = contextAPI || '/api';

  /* ================= HANDLERS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  /* ================= LOGIN LOGIC ================= */
  const performLogin = async (email, password) => {
    setIsLoading(true);
    try {
      console.log(`🔐 Logging in to: ${API} with email: ${email}`);

      const response = await axios.post(`${API}/auth/login`, { email, password });
      console.log('✅ Login response:', response.data);
      
      const { token, user } = response.data;

      if (!token || !user) {
        throw new Error('Invalid response received from server');
      }

      // Store auth data
      loginUser(token, user);
      console.log('✅ User logged in successfully:', user);
      toast.success('Login successful! Redirecting...');

      // Navigate based on role
      const role = user.role || 'student';
      console.log(`🧭 Navigating for role: ${role}`);
      
      switch (role) {
        case 'admin':
          navigate('/admin/dashboard');
          break;
        case 'mentor':
        case 'teacher':
          navigate('/mentor/dashboard');
          break;
        case 'accountant':
          navigate('/accountant/dashboard');
          break;
        case 'storekeeper':
          navigate('/storekeeper/dashboard');
          break;
        case 'student':
        default:
          navigate('/student/dashboard');
          break;
      }

    } catch (err) {
      console.error('❌ Login error:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Login failed';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (email, password) => {
    setFormData({ email, password });
    performLogin(email, password);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    performLogin(formData.email, formData.password);
  };

  return (
    <div key={`${version}-${forceRender}`} className="relative min-h-screen overflow-hidden bg-black">

      {/* ================= VIDEO BACKGROUND ================= */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          className="w-full h-full object-cover"
        >
          <source src={videoBg} type="video/mp4" />
        </video>
      </div>

      {/* ================= DARK OVERLAY ================= */}
      <div className="absolute inset-0 bg-black/60 z-10"></div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="relative z-20 min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">

        <div className="sm:mx-auto sm:w-full sm:max-w-md">

          <div className="text-center">
            <div className="flex justify-between items-center mb-4">
              <div className="flex-1"></div>
              <SimpleLanguageSelector compact={true} className="bg-white/10 backdrop-blur-xl border-white/20" />
              <div className="flex-1"></div>
            </div>
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center shadow-lg">
                <BookOpen className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="mt-6 text-4xl font-extrabold text-white tracking-tight drop-shadow-lg">
              {t('edumentor_lms')}
            </h1>
            
            {/* Debug Translation Test */}
            <div className="mt-4">
              <TranslationTest />
            </div>
          </div>

          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white/10 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-white/10">

              {/* ================= FORM ================= */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-white/60" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder={t('email_placeholder')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-white/60" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder={t('password_placeholder')}
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 text-white border-white/20 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3 top-3.5 text-white/60 hover:text-white/80"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold py-3 rounded-xl hover:from-primary to-secondary hover:from-secondary to-primary transition-all duration-300 transform hover:scale-105"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-t-transparent"></div>
                      <span className="ml-2">{t('login')}...</span>
                    </div>
                  ) : (
                    <span className="flex items-center">
                      <Lock className="w-5 h-5 mr-2" />
                      <span>{t('sign_in')}</span>
                    </span>
                  )}
                  required
                  placeholder={t('email_placeholder')}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-white/60" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder={t('password_placeholder')}
                  className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 text-white border-white/20 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute right-3 top-3.5 text-white/60 hover:text-white/80"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold py-3 rounded-xl hover:from-primary to-secondary hover:from-secondary to-primary transition-all duration-300 transform hover:scale-105"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-t-transparent"></div>
                    <span className="ml-2">{t('login')}...</span>
                  </div>
                ) : (
                  <span className="flex items-center">
                    <Lock className="w-5 h-5 mr-2" />
                    <span>{t('sign_in')}</span>
                  </span>
                )}
              </button>
            </form>

            {/* ================= DEMO CREDENTIALS ================= */}
            <div className="mt-6 p-4 bg-black/20 rounded-lg">
              <p className="text-white/80 text-sm font-semibold mb-3">{t('demo_accounts')}</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleDemoLogin('admin@gmail.com', '12345678')}
                  className="w-full text-left p-2 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{t('admin')}</p>
                      <p className="text-white/60 text-xs">admin@gmail.com / 12345678</p>
                    </div>
                    <span className="text-blue-400 text-xs group-hover:text-blue-300">{t('click_to_login')}</span>
                  </div>
                </button>
                
                <button
                  onClick={() => handleDemoLogin('mentor@gmail.com', '12345678')}
                  className="w-full text-left p-2 bg-green-600/20 hover:bg-green-600/30 rounded-lg transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{t('mentor')}</p>
                      <p className="text-white/60 text-xs">mentor@gmail.com / 12345678</p>
                    </div>
                    <span className="text-green-400 text-xs group-hover:text-green-300">{t('click_to_login')}</span>
                  </div>
                </button>
                
                <button
                  onClick={() => handleDemoLogin('student@gmail.com', '12345678')}
                  className="w-full text-left p-2 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{t('student')}</p>
                      <p className="text-white/60 text-xs">student@gmail.com / 12345678</p>
                    </div>
                    <span className="text-purple-400 text-xs group-hover:text-purple-300">{t('click_to_login')}</span>
                  </div>
                </button>
                
                <button
                  onClick={() => handleDemoLogin('accountant@demo.com', '12345678')}
                  className="w-full text-left p-2 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{t('accountant')}</p>
                      <p className="text-white/60 text-xs">accountant@demo.com / 12345678</p>
                        <p className="text-white/60 text-xs">accountant@demo.com / 12345678</p>
                      </div>
                      <span className="text-purple-400 text-xs group-hover:text-purple-300">Click to Login</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => handleDemoLogin('storekeeper@demo.com', '12345678')}
                    className="w-full text-left p-2 bg-orange-600/20 hover:bg-orange-600/30 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">Storekeeper</p>
                        <p className="text-white/60 text-xs">storekeeper@demo.com / 12345678</p>
                      </div>
                      <span className="text-orange-400 text-xs group-hover:text-orange-300">Click to Login</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* ================= SIGN UP LINK ================= */}
            <div className="text-center mt-6">
              <p className="text-white/80">
                Don't have an account?{' '}
                <Link to="/register" className="text-white hover:text-blue-200 hover:underline">
                  Sign Up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
