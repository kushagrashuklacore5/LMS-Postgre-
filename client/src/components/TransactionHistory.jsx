import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { onPayment } from '../accountant/mockSocket';
import { API_ORIGIN } from '../config/api';

const TransactionHistory = ({ studentId }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      // For demo, fetch all transactions
      const response = await axios.get(`${API_ORIGIN}/api/payments/transactions/demo`);
      if (response.data.success) {
        setTransactions(response.data.transactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Listen for real-time payments
  useEffect(() => {
    const unsub = onPayment((e) => {
      const newTransaction = {
        _id: e.id,
        paymentId: e.id,
        amount: e.amount,
        status: 'Success',
        paymentOption: e.paymentOption || 'installment',
        studentName: e.studentName || 'Student Name',
        createdAt: e.timestamp || new Date().toISOString()
      };
      
      setTransactions(prev => [newTransaction, ...prev]);
    });
    return unsub;
  }, []);

  const downloadInvoice = async (transaction) => {
    try {
      const response = await axios.post(`${API_ORIGIN}/api/payments/generate-invoice`, {
        transaction: transaction,
        student: { name: transaction.studentName, id: transaction.studentId },
        paymentOption: transaction.paymentOption || 'installment',
        totalFees: 50000
      });

      if (response.data.success) {
        // Create download link for HTML
        const link = document.createElement('a');
        if (response.data.type === 'html') {
          // For HTML content, create an HTML file
          const htmlContent = atob(response.data.invoice);
          const blob = new Blob([htmlContent], { type: 'text/html' });
          link.href = URL.createObjectURL(blob);
          link.download = `Fee_Receipt_${transaction.paymentId}_${Date.now()}.html`;
        } else {
          // For PDF content
          link.href = `data:application/pdf;base64,${response.data.invoice}`;
          link.download = `Fee_Receipt_${transaction.paymentId}_${Date.now()}.pdf`;
        }
        link.click();
        
        // Clean up object URL if created
        if (response.data.type === 'html') {
          setTimeout(() => URL.revokeObjectURL(link.href), 100);
        }
      }
    } catch (error) {
      console.error('Invoice download error:', error);
      alert('Failed to download invoice');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentOptionLabel = (option) => {
    switch (option) {
      case 'full': return 'Full Fees';
      case 'term': return 'Term-wise';
      case 'installment': return 'Installment';
      default: return 'Payment';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">Transaction History</h3>
        <p className="text-sm text-gray-600 mt-1">Your payment history and receipts</p>
      </div>
      
      {transactions.length === 0 ? (
        <div className="p-8 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500">No transactions found</p>
          <p className="text-sm text-gray-400 mt-1">Your payment history will appear here</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {transactions.map((transaction) => (
            <div key={transaction._id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      transaction.status === 'success' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.status === 'success' ? 'Success' : 'Failed'}
                    </span>
                    <span className="text-sm text-gray-600">
                      {getPaymentOptionLabel(transaction.paymentOption)}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Transaction ID</p>
                      <p className="font-medium text-gray-900">{transaction.paymentId}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Amount</p>
                      <p className="font-medium text-gray-900">₹{transaction.amount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Date & Time</p>
                      <p className="font-medium text-gray-900">{formatDate(transaction.createdAt)}</p>
                    </div>
                  </div>
                  
                  {transaction.studentName && (
                    <div className="mt-2">
                      <p className="text-gray-500">Student Name</p>
                      <p className="font-medium text-gray-900">{transaction.studentName}</p>
                    </div>
                  )}
                </div>
                
                <div className="ml-4">
                  <button
                    onClick={() => downloadInvoice(transaction)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Invoice
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
