import React, { useState, useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { useRealTimeTransactions } from '../store/transactionStore';

export default function RealTimeNotification({ className = '' }) {
  const [visible, setVisible] = useState(false);
  const [transaction, setTransaction] = useState(null);
  const lastUpdate = useRealTimeTransactions();

  useEffect(() => {
    if (lastUpdate) {
      setTransaction(lastUpdate);
      setVisible(true);
      
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setVisible(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [lastUpdate]);

  if (!visible || !transaction) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm ${className}`}>
      <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 animate-pulse">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <CheckCircle className="h-6 w-6 text-green-400" />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-green-800">
              New Payment Received!
            </p>
            <div className="mt-2 text-sm text-green-700">
              <p><strong>Student:</strong> {transaction.studentName}</p>
              <p><strong>Amount:</strong> ₹{transaction.amount.toLocaleString('en-IN')}</p>
              <p><strong>Payment Type:</strong> {transaction.paymentOption.charAt(0).toUpperCase() + transaction.paymentOption.slice(1)}</p>
              <p><strong>Time:</strong> {transaction.paymentTime}</p>
            </div>
          </div>
          <div className="ml-auto pl-3">
            <button
              onClick={() => setVisible(false)}
              className="inline-flex text-green-400 hover:text-green-600 focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
