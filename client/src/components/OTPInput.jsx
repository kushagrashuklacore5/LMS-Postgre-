import React, { useState, useRef, useEffect } from 'react';

const OTPInput = ({ value, onChange, length = 6, disabled = false }) => {
  const [otpValues, setOtpValues] = useState(new Array(length).fill(''));
  const inputRefs = useRef([]);

  // Initialize with existing value
  useEffect(() => {
    if (value && value.length <= length) {
      const newValues = new Array(length).fill('');
      for (let i = 0; i < value.length; i++) {
        newValues[i] = value[i];
      }
      setOtpValues(newValues);
    }
  }, [value, length]);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index, e) => {
    const input = e.target;
    const val = input.value;
    
    // Only allow numbers
    if (!/^\d*$/.test(val)) {
      return;
    }

    // Update the value
    const newOtpValues = [...otpValues];
    newOtpValues[index] = val.slice(-1); // Take only last character
    setOtpValues(newOtpValues);

    // Call onChange with complete OTP
    const completeOtp = newOtpValues.join('');
    onChange(completeOtp);

    // Auto-focus next input
    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    const input = e.target;
    
    // Handle backspace
    if (e.key === 'Backspace') {
      if (otpValues[index]) {
        // Clear current input
        const newOtpValues = [...otpValues];
        newOtpValues[index] = '';
        setOtpValues(newOtpValues);
        onChange(newOtpValues.join(''));
      } else if (index > 0) {
        // Move to previous input and clear it
        inputRefs.current[index - 1]?.focus();
        const newOtpValues = [...otpValues];
        newOtpValues[index - 1] = '';
        setOtpValues(newOtpValues);
        onChange(newOtpValues.join(''));
      }
    }
    
    // Handle left arrow
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    // Handle right arrow
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Handle paste
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      // Paste functionality handled in onPaste
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    
    // Only allow numbers
    if (!/^\d+$/.test(pastedData)) {
      return;
    }

    // Distribute pasted digits across inputs
    const newOtpValues = [...otpValues];
    for (let i = 0; i < Math.min(pastedData.length, length); i++) {
      newOtpValues[i] = pastedData[i];
    }
    setOtpValues(newOtpValues);
    onChange(newOtpValues.join(''));

    // Focus appropriate input
    const focusIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleFocus = (index) => {
    // Select all text when focusing
    setTimeout(() => {
      inputRefs.current[index]?.select();
    }, 0);
  };

  return (
    <div className="flex justify-center items-center gap-2 sm:gap-3">
      {otpValues.map((val, index) => (
        <div key={index} className="relative">
          <input
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={val}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(index)}
            disabled={disabled}
            className="w-12 h-12 sm:w-14 sm:h-14 text-center text-lg sm:text-xl font-bold bg-white/10 border-2 border-white/30 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white focus:bg-white/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="•"
          />
          {val && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default OTPInput;
