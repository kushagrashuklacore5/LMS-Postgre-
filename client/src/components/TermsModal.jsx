import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const TermsModal = ({ onAccept, isOpen }) => {
  const [isChecked, setIsChecked] = useState(false);

  console.log('🎭 TermsModal render:', { isOpen });

  if (!isOpen) return null;

  const handleAccept = () => {
    if (isChecked) {
      onAccept();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Terms and Conditions</h2>
          <div className="text-gray-400">
            <X size={20} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-600">
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-800">Welcome to Core5 Academy!</h3>
            <p>
              By using our Learning Management System, you agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Use the platform for educational purposes only</li>
              <li>Respect intellectual property rights</li>
              <li>Maintain confidentiality of your account credentials</li>
              <li>Follow acceptable use policies</li>
              <li>Comply with applicable laws and regulations</li>
            </ul>
            <p>
              Your privacy is important to us. We handle your data in accordance with our Privacy Policy.
            </p>
            <p className="text-xs text-gray-500">
              This agreement is required before accessing your dashboard.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 space-y-4">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="terms-checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="terms-checkbox" className="text-sm text-gray-700">
              I agree to the Terms and Conditions
            </label>
          </div>

          <button
            onClick={handleAccept}
            disabled={!isChecked}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              isChecked
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Accept and Continue to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
