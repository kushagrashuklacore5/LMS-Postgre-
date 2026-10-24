import React, { useState, useEffect } from 'react';
import { Copy, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

interface PasswordDisplayProps {
  password: string;
  vendorEmail: string;
  onClose: () => void;
}

export default function PasswordDisplay({ password, vendorEmail, onClose }: PasswordDisplayProps) {
  const [timeLeft, setTimeLeft] = useState(5);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  console.log('PasswordDisplay component rendered with:', { password, vendorEmail, timeLeft });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-600" size={32} />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Vendor Added Successfully!</h3>
          <p className="text-gray-600">Here are the login credentials for the vendor</p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <label className="text-sm text-gray-600 block mb-1">Vendor Email</label>
            <p className="font-medium text-slate-900">{vendorEmail}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-blue-600 font-medium">Generated Password</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-blue-600 hover:text-blue-700 p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  onClick={copyToClipboard}
                  className="text-blue-600 hover:text-blue-700 p-1"
                >
                  {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg text-slate-900">
                {showPassword ? password : '•'.repeat(password.length)}
              </span>
            </div>
            {copied && (
              <p className="text-xs text-green-600 mt-2">Password copied to clipboard!</p>
            )}
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-yellow-600 mt-0.5" size={16} />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Important:</p>
              <ul className="text-xs space-y-1">
                <li>• This password will disappear in {timeLeft} seconds</li>
                <li>• Please copy it now and share it with the vendor</li>
                <li>• Vendor can use email + password to login to their portal</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Auto-closing in {timeLeft}s...
          </div>
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            Close Now
          </button>
        </div>
      </div>
    </div>
  );
}
