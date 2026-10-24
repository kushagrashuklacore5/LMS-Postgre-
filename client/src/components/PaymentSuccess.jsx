import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PaymentSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      navigate('/student-portal');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center animate-fade-in">
        {/* Animated Checkmark */}
        <div className="mb-6">
          <svg 
            className="w-20 h-20 mx-auto text-green-500 animate-checkmark" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" className="animate-circle" />
            <path 
              d="M8 12l2 2 4-4" 
              className="animate-tick"
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Payment Successful!
        </h2>
        
        <p className="text-gray-600 mb-4">
          Your fee payment has been processed successfully.
        </p>
        
        <p className="text-sm text-gray-500">
          Redirecting to dashboard in 3 seconds...
        </p>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes drawCircle {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
        
        @keyframes drawTick {
          from { stroke-dashoffset: 50; }
          to { stroke-dashoffset: 0; }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        
        .animate-checkmark {
          animation: fadeIn 0.5s ease-out;
        }
        
        .animate-circle {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: drawCircle 0.6s ease-out 0.3s forwards;
        }
        
        .animate-tick {
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
          animation: drawTick 0.4s ease-out 0.9s forwards;
        }
      `}</style>
    </div>
  );
};

export default PaymentSuccess;
