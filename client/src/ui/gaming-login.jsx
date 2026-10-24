'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Mail, Lock, Chrome, Twitter, Gamepad2 } from 'lucide-react';

const FormInput = ({ icon, type, placeholder, value, onChange, required }) => {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/60 focus:outline-none focus:border-purple-500/50 transition-colors"
      />
    </div>
  );
};

const SocialButton = ({ icon }) => {
  return (
    <button className="flex items-center justify-center p-2 bg-white/5 border border-white/10 rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors">
      {icon}
    </button>
  );
};

const ToggleSwitch = ({ checked, onChange, id }) => {
  return (
    <div className="relative inline-block w-10 h-5 cursor-pointer">
      <input
        type="checkbox"
        id={id}
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <div className={`absolute inset-0 rounded-full transition-colors ${checked ? 'bg-purple-600' : 'bg-white/20'}`}>
        <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </div>
  );
};

const VideoBackground = ({ videoUrl }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      <div className="absolute inset-0 bg-black/40 z-10" />
      <video
        ref={videoRef}
        className="absolute inset-0 min-w-full min-h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src={videoUrl} type="video/mp4" />
      </video>
    </div>
  );
};

const LoginForm = ({ onSubmit }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onSubmit(email, password, remember);
    setLoading(false);
  };

  return (
    <div className="p-8 rounded-2xl backdrop-blur-md bg-black/60 border border-white/10">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-white">NexusGate</h2>
        <p className="text-white/70">Your gaming universe awaits</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <FormInput
          icon={<Mail size={18} className="text-white/60" />}
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="relative">
          <FormInput
            icon={<Lock size={18} className="text-white/60" />}
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ToggleSwitch
              checked={remember}
              onChange={() => setRemember(!remember)}
              id="remember"
            />
            <span className="text-sm text-white/80">Remember me</span>
          </div>
          <span className="text-sm text-white/60">Forgot password?</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition"
        >
          {loading ? 'Logging in...' : 'Enter NexusGate'}
        </button>
      </form>

      <div className="mt-8">
        <div className="text-center text-white/60 text-sm mb-4">
          quick access via
        </div>
        <div className="grid grid-cols-3 gap-3">
          <SocialButton icon={<Chrome size={18} />} />
          <SocialButton icon={<Twitter size={18} />} />
          <SocialButton icon={<Gamepad2 size={18} />} />
        </div>
      </div>
    </div>
  );
};

const LoginPage = { LoginForm, VideoBackground };
export default LoginPage;
