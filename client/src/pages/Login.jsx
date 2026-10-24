import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { useTranslation } from '../context/TranslationContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axiosInstance from '../utils/axiosInstance';
import { Mail, Lock, Eye, EyeOff, Chrome, Twitter, Gamepad2, ArrowLeft, RefreshCw } from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';
import TermsConditionsModal from '../components/TermsConditionsModal';
import LoginFooter from '../components/LoginFooter';
import OTPInput from '../components/OTPInput';
import videoBg from '../assets/login-bg.mp4';
import whiteLogo from '../../../core5-final-rbg.png';
import passwordResetService from '../services/passwordResetService';
import { API_BASE } from '../config/api';

/* ============================================================
   LOGIN COMPONENT
   ============================================================ */

const Login = () => {
  const { loginUser, API: contextAPI, token } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Ensure API URL is always set
  const API = API_BASE;

  // Security: Redirect if already logged in
  useEffect(() => {
    if (token && token.role === 'superadmin') {
      // Verify token is still valid (basic check)
      try {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
          const decoded = JSON.parse(atob(storedToken.split('.')[1]));
          if (decoded.exp * 1000 > Date.now()) {
            navigate('/superadmin/dashboard');
            return;
          }
        }
      } catch (error) {
        // Token is invalid, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, [token, navigate]);

  /* ================= STATE ================= */
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  // Form validation errors
  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    password: ''
  });

  // Global error state
  const [globalError, setGlobalError] = useState('');
  const [errorType, setErrorType] = useState('');

  // Password reset states
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: email, 2: otp, 3: reset
  const [resetData, setResetData] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [cooldown, setCooldown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Rate limiting states
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState(0);
  const [attemptInfo, setAttemptInfo] = useState(null);
  const [loginAttempts, setLoginAttempts] = useState(0);

  /* ================= CLIENT-SIDE VALIDATION ================= */
  const validateField = (name, value) => {
    const errors = { ...fieldErrors };
    
    if (name === 'email') {
      if (!value || value.trim() === '') {
        errors.email = 'Email is required.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.email = 'Enter a valid email address.';
      } else {
        errors.email = '';
      }
    }
    
    if (name === 'password') {
      if (!value || value.trim() === '') {
        errors.password = 'Password is required.';
      } else {
        errors.password = '';
      }
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).filter(key => errors[key]).length === 0;
  };

  const validateForm = () => {
    const emailValid = validateField('email', formData.email);
    const passwordValid = validateField('password', formData.password);
    return emailValid && passwordValid;
  };

  /* ================= HANDLERS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Clear field error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    if (isPasswordReset) {
      setResetData(prev => ({
        ...prev,
        [name]: value
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Password reset handlers
  const startPasswordReset = () => {
    setIsPasswordReset(true);
    setResetStep(1);
    setResetData({ email: '', otp: '', newPassword: '', confirmPassword: '' });
  };

  const cancelPasswordReset = () => {
    setIsPasswordReset(false);
    setResetStep(1);
    setResetData({ email: '', otp: '', newPassword: '', confirmPassword: '' });
    setCooldown(0);
  };

  // Send OTP
  const handleSendOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await passwordResetService.sendOTP(resetData.email);
      toast.success('OTP sent to your email');
      setResetStep(2);
      startCooldown();
    } catch (error) {
      toast.error(error.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await passwordResetService.verifyOTP(resetData.email, resetData.otp);
      toast.success('OTP verified successfully');
      setResetStep(3);
    } catch (error) {
      toast.error(error.message || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await passwordResetService.resetPassword(
        resetData.email,
        resetData.newPassword,
        resetData.confirmPassword
      );
      toast.success('Password reset successfully! Please login with your new password.');
      cancelPasswordReset();
    } catch (error) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  // Cooldown timer
  const startCooldown = () => {
    setCooldown(60);
  };

  // Rate limiting timer effect
  useEffect(() => {
    let timer;
    if (isBlocked && blockTimeRemaining > 0) {
      timer = setTimeout(() => {
        setBlockTimeRemaining(prev => prev - 1);
      }, 1000);
    } else if (isBlocked && blockTimeRemaining === 0) {
      setIsBlocked(false);
      setBlockTimeRemaining(0);
      setAttemptInfo(null);
      toast.info('You can now try logging in again');
    }
    
    return () => clearTimeout(timer);
  }, [isBlocked, blockTimeRemaining]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => {
        setCooldown(cooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  /* ================= LOGIN LOGIC ================= */
  const performLogin = async (email, password) => {
    setIsLoading(true);
    setGlobalError('');
    setErrorType('');
    
    try {
      console.log(`🔐 Logging in to: ${API} with email: ${email}`);

      // Use regular auth/login endpoint for all users (including superadmin)
      const response = await axios.post(`${API}/auth/login`, 
        { email, password },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          withCredentials: true // Important for httpOnly cookies
        }
      );
      console.log('✅ Login response:', response.data);
      
      const { token, user } = response.data;

      // Reset rate limiting state on successful login
      setIsBlocked(false);
      setBlockTimeRemaining(0);
      setAttemptInfo(null);
      setLoginAttempts(0);

      // Store user data in expected format for AuthContext
      const userData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        universityId: user.university_id
      };
      
      // Use AuthContext loginUser function to properly store token and user
      loginUser(token, userData);
      
      console.log('✅ User logged in successfully:', user);
      toast.success('Login successful! Redirecting...');

      // Navigate based on user role
      if (user.role === 'superadmin') {
        navigate('/superadmin/dashboard');
      } else if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (user.role === 'mentor') {
        navigate('/mentor/classrooms');
      } else if (user.role === 'student') {
        navigate('/student/dashboard');
      } else if (user.role === 'storekeeper') {
        navigate('/storekeeper/dashboard');
      } else {
        navigate('/dashboard'); // Default dashboard
      }

    } catch (err) {
      console.error('❌ Login error:', err);
      
      // Handle different error types
      if (err.response) {
        const status = err.response.status;
        const errorMessage = err.response.data?.message || err.response.data?.error || 'Login failed';
        
        // Handle specific error codes
        if (status === 401) {
          setGlobalError('Incorrect email or password. Please try again.');
          setErrorType('invalid_credentials');
          if (err.response.data?.attemptInfo) {
            setAttemptInfo(err.response.data.attemptInfo);
          }
          // Keep email field, clear password field
          setFormData(prev => ({ ...prev, password: '' }));
          setLoginAttempts(prev => prev + 1);
        } else if (status === 400) {
          setGlobalError(errorMessage);
          setErrorType('validation_error');
        } else if (status === 429) {
          const retryAfterHeader = err.response.headers?.['retry-after'];
          const retrySec = parseInt(retryAfterHeader, 10) || 
                           (typeof err.response.data?.remainingTime === 'number' ? err.response.data.remainingTime : null);
          let rateLimitMsg = 'Too many login attempts. Please wait a moment and try again.';
          if (retrySec && retrySec > 0) {
            setIsBlocked(true);
            setBlockTimeRemaining(retrySec);
            if (retrySec >= 60) {
              const mins = Math.ceil(retrySec / 60);
              rateLimitMsg = `Too many login attempts. Please try again in ${mins} minute${mins > 1 ? 's' : ''}.`;
            } else {
              rateLimitMsg = `Too many login attempts. Please try again in ${retrySec} second${retrySec > 1 ? 's' : ''}.`;
            }
          } else if (err.response.data?.message) {
            rateLimitMsg = err.response.data.message;
          }
          setGlobalError(rateLimitMsg);
          setErrorType('rate_limited');
        } else {
          setGlobalError(errorMessage);
          setErrorType('server_error');
        }
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        setGlobalError('Unable to reach the server. Check your connection and try again.');
        setErrorType('network_error');
      } else {
        setGlobalError('Something went wrong. Please try again.');
        setErrorType('unknown_error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Clear global error on new submission
    setGlobalError('');
    setErrorType('');
    
    // Client-side validation
    if (!validateForm()) {
      // Validation errors are already set in fieldErrors state
      return;
    }
    
    // Check for multiple failed attempts
    if (loginAttempts >= 5) {
      setGlobalError('Multiple failed attempts detected. Please double-check your credentials.');
      setErrorType('multiple_attempts');
      return;
    }
    
    performLogin(formData.email, formData.password);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black hide-scrollbar">

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
      <div className="relative z-20 min-h-screen flex flex-col items-center justify-start -pt-40 pb-20 sm:px-6 lg:px-8">

        {/* Language selector top-right */}
        <div className="absolute top-6 right-6 z-30">
          <LanguageSelector />
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">

          <div className="text-center">
            <div className="flex justify-center">
              <img
                src={whiteLogo}
                alt="Core5 Academy"
                className="h-[28rem] sm:h-[32rem] w-auto object-contain drop-shadow-lg mx-auto mb-0 -translate-y-12"
              />
            </div>
          </div>

          <div className="-mt-32 sm:-mt-40 sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white/10 backdrop-blur-xl py-6 px-3 shadow-2xl sm:rounded-2xl sm:px-8 border border-white/10">

              {/* ================= FORM ================= */}
              {/* Login Form */}
              {!isPasswordReset ? (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {/* Global Error Banner */}
                  {globalError && (
                    <div 
                      role="alert" 
                      className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <p className="text-red-200 text-sm font-medium">{globalError}</p>
                      <button
                        type="button"
                        onClick={() => { setGlobalError(''); setErrorType(''); }}
                        className="text-red-300 hover:text-red-100 ml-2"
                        aria-label="Dismiss error"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <label htmlFor="email" className="sr-only">Email</label>
                    <Mail className="absolute left-3 top-3.5 text-white/60" />
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={() => validateField('email', formData.email)}
                      required
                      autoComplete="email"
                      placeholder={t('email_placeholder')}
                      aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                      aria-invalid={fieldErrors.email ? 'true' : 'false'}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 text-white border ${
                        fieldErrors.email 
                          ? 'border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500' 
                          : 'border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500'
                      } transition-all duration-200`}
                    />
                    {fieldErrors.email && (
                      <p id="email-error" className="mt-1 text-red-300 text-xs font-medium">
                        {fieldErrors.email}
                      </p>
                    )}
                  </div>

                  <div className="relative">
                    <label htmlFor="password" className="sr-only">Password</label>
                    <Lock className="absolute left-3 top-3.5 text-white/60" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      onBlur={() => validateField('password', formData.password)}
                      required
                      autoComplete="current-password"
                      placeholder={t('password_placeholder')}
                      aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                      aria-invalid={fieldErrors.password ? 'true' : 'false'}
                      className={`w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 text-white border ${
                        fieldErrors.password 
                          ? 'border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500' 
                          : 'border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500'
                      } transition-all duration-200`}
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute right-3 top-3.5 text-white/60 hover:text-white/80"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    {fieldErrors.password && (
                      <p id="password-error" className="mt-1 text-red-300 text-xs font-medium">
                        {fieldErrors.password}
                      </p>
                    )}
                    
                    {/* Password Debug Info */}
                    {formData.password && (
                      <div className="text-xs text-white/60 mt-1">
                        <span>Length: {formData.password.length}</span>
                        {formData.password.includes('#') && <span className="ml-2">Contains #</span>}
                        {formData.password.includes('$') && <span className="ml-2">Contains $</span>}
                        {formData.password.includes('@') && <span className="ml-2">Contains @</span>}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || isBlocked}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold py-3 rounded-xl hover:from-primary to-secondary hover:from-secondary to-primary transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-t-transparent"></div>
                        <span className="ml-2">Signing in...</span>
                      </div>
                    ) : isBlocked ? (
                      <span className="flex items-center">
                        <Lock className="w-5 h-5 mr-2" />
                        <span>Blocked ({blockTimeRemaining}s)</span>
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Lock className="w-5 h-5 mr-2" />
                        <span>{t('sign_in_button')}</span>
                      </span>
                    )}
                  </button>

                  {/* Rate Limiting Info */}
                  {isBlocked && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-center">
                      <p className="text-red-200 text-sm font-medium">
                        Too many login attempts
                      </p>
                      <p className="text-red-300 text-xs mt-1">
                        Try again in {blockTimeRemaining} seconds
                      </p>
                    </div>
                  )}

                  {attemptInfo && !isBlocked && attemptInfo.remainingAttempts < 5 && (
                    <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 text-center">
                      <p className="text-yellow-200 text-sm font-medium">
                        {attemptInfo.remainingAttempts} attempts remaining
                      </p>
                      <p className="text-yellow-300 text-xs mt-1">
                        Too many failed attempts will temporarily block login
                      </p>
                    </div>
                  )}

                  {/* Forgot Password Link */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={startPasswordReset}
                      className="text-white/80 hover:text-white text-sm underline transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </form>
              ) : (
                /* Password Reset Form */
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={cancelPasswordReset}
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h3 className="text-white font-semibold">Reset Password</h3>
                    <div className="w-5"></div>
                  </div>

                  {/* Step 1: Email Input */}
                  {resetStep === 1 && (
                    <form onSubmit={handleSendOTP} className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-3 top-3.5 text-white/60" />
                        <input
                          type="email"
                          name="email"
                          value={resetData.email}
                          onChange={handleChange}
                          required
                          placeholder="Enter your email"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold py-3 rounded-xl hover:from-primary to-secondary hover:from-secondary to-primary transition-all duration-300 transform hover:scale-105"
                      >
                        {isLoading ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-t-transparent"></div>
                            <span className="ml-2">Sending...</span>
                          </div>
                        ) : (
                          'Send OTP'
                        )}
                      </button>
                    </form>
                  )}

                  {/* Step 2: OTP Verification */}
                  {resetStep === 2 && (
                    <form onSubmit={handleVerifyOTP} className="space-y-6">
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-4 text-center">
                          Enter the 6-digit code sent to your email
                        </label>
                        <OTPInput
                          value={resetData.otp}
                          onChange={(value) => setResetData(prev => ({ ...prev, otp: value }))}
                          disabled={isLoading}
                          length={6}
                        />
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={isLoading || resetData.otp.length !== 6}
                          className="flex-1 bg-gradient-to-r from-primary to-secondary text-white font-semibold py-3 rounded-xl hover:from-primary to-secondary hover:from-secondary to-primary transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                          {isLoading ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-t-transparent"></div>
                              <span className="ml-2">Verifying...</span>
                            </div>
                          ) : (
                            'Verify OTP'
                          )}
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleSendOTP}
                          disabled={isLoading || cooldown > 0}
                          className="flex-1 bg-white/10 text-white font-semibold py-3 rounded-xl hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cooldown > 0 ? (
                            <span className="flex items-center justify-center">
                              <RefreshCw className="w-4 h-4 mr-2" />
                              {cooldown}s
                            </span>
                          ) : (
                            <span className="flex items-center justify-center">
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Resend
                            </span>
                          )}
                        </button>
                      </div>

                      {resetData.otp.length > 0 && resetData.otp.length < 6 && (
                        <p className="text-center text-white/60 text-sm">
                          Please enter all 6 digits
                        </p>
                      )}
                    </form>
                  )}

              {/* Step 3: Reset Password */}
              {resetStep === 3 && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-white/60" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="newPassword"
                      value={resetData.newPassword}
                      onChange={handleChange}
                      required
                      placeholder="New Password"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute right-3 top-3.5 text-white/60 hover:text-white/80"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-white/60" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={resetData.confirmPassword}
                      onChange={handleChange}
                      required
                      placeholder="Confirm New Password"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold py-3 rounded-xl hover:from-primary to-secondary hover:from-secondary to-primary transition-all duration-300 transform hover:scale-105"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-t-transparent"></div>
                        <span className="ml-2">Resetting...</span>
                      </div>
                    ) : (
                      'Reset Password'
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

                        </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <LoginFooter />
    </div>
  );
};

export default Login;
