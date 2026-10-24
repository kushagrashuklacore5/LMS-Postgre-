// Global transaction store for real-time updates with database persistence
import React from 'react';
import { io } from 'socket.io-client';
import { API_BASE, API_ORIGIN } from '../config/api';

const API_BASE_URL = API_BASE;

export interface Transaction {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  paymentOption: 'full' | 'term' | 'installment';
  paymentDate: string;
  paymentTime: string;
  status: 'success' | 'failed';
  classroom: string;
  grade: string;
  feeCategory: string;
  timestamp: string;
}

class TransactionStore {
  private transactions: Transaction[] = [];
  private listeners: Set<() => void> = new Set();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.transactions;
  }

  // Load transactions from database for specific student (with authentication)
  async loadTransactions(studentId?: string) {
    try {
      const token = localStorage.getItem('token') || '';
      
      // If studentId is provided, load only that student's transactions
      // Otherwise load all transactions (for admin/accountant view)
      // Server exposes student-specific route at /transactions/student/:studentId
      const endpoint = studentId 
        ? `${API_BASE_URL}/transactions/student/${studentId}`
        : `${API_BASE_URL}/transactions`;
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      const data = await response.json();
      
      if (data.success) {
        this.transactions = data.transactions.map((t: any) => ({
          id: t.transactionId || t.id,
          studentId: t.studentId,
          studentName: t.studentName,
          amount: t.amount,
          paymentOption: t.paymentOption || t.type || 'full',
          paymentDate: t.paymentDate,
          paymentTime: t.paymentTime,
          status: t.status,
          classroom: t.classroom || 'N/A',
          grade: t.grade || 'N/A',
          feeCategory: t.feeCategory || 'N/A',
          timestamp: t.timestamp || t.createdAt
        }));
        
        // Notify all listeners
        this.listeners.forEach(listener => listener());
        console.log('✅ Transactions loaded from database:', this.transactions.length);
      }
    } catch (error) {
      console.error('Error loading transactions from database:', error);
    }
  }

  addTransaction(transaction: Transaction) {
    // Add to local state immediately for real-time updates
    this.transactions = [transaction, ...this.transactions];
    
    // Save to database
    this.saveTransactionToDB(transaction);
    
    // Notify all listeners
    this.listeners.forEach(listener => {
      try { listener(); } catch (e) { console.error('Listener error:', e); }
    });
    
    // Trigger real-time update event
    window.dispatchEvent(new CustomEvent('transaction-updated', {
      detail: transaction
    }));
  }

  private async saveTransactionToDB(transaction: Transaction) {
    try {
      const token = localStorage.getItem('token') || '';
      const response = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          studentId: transaction.studentId,
          amount: transaction.amount,
          type: transaction.paymentOption,
          status: transaction.status.toLowerCase(),
          transactionId: transaction.id,
          description: `Payment for ${transaction.studentName} - ${transaction.paymentOption}`,
          studentName: transaction.studentName,
          classroom: transaction.classroom,
          grade: transaction.grade,
          feeCategory: transaction.feeCategory
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Error saving transaction to database:', errData.message || response.statusText);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!data.success) {
        console.error('Error saving transaction to database (payload):', data.message || data);
      } else {
        console.log('✅ Transaction saved to database:', transaction.id);
      }
    } catch (error) {
      console.error('Error saving transaction to database:', error);
    }
  }

  getTransactionsByStudent(studentId: string): Transaction[] {
    return this.transactions.filter(t => t.studentId === studentId);
  }

  getTransactionsByGrade(grade: string): Transaction[] {
    return this.transactions.filter(t => t.grade === grade);
  }

  getTotalRevenue(): number {
    return this.transactions
      .filter(t => t.status === 'success')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  getTodayTransactions(): Transaction[] {
    const today = new Date().toDateString();
    return this.transactions.filter(t => 
      new Date(t.timestamp).toDateString() === today
    );
  }

  getPaymentStats() {
    const allTransactions = this.transactions;
    const students = new Set(allTransactions.map(t => t.studentId));
    
    let paid = 0;
    let partial = 0;
    let pending = 0;

    students.forEach(studentId => {
      const studentTransactions = allTransactions.filter(t => t.studentId === studentId);
      if (studentTransactions.length === 0) {
        pending++;
      } else {
        const totalPaid = studentTransactions.reduce((sum, t) => sum + t.amount, 0);
        // Assuming full fee is 12000 for secondary and 8050 for primary
        const isSecondary = studentTransactions.some(t => t.feeCategory === 'Secondary');
        const fullFee = isSecondary ? 12000 : 8050;
        
        if (totalPaid >= fullFee) {
          paid++;
        } else {
          partial++;
        }
      }
    });

    return {
      total: students.size,
      paid,
      partial,
      pending
    };
  }
}

// Global store instance
export const transactionStore = new TransactionStore();

// DON'T load all transactions on app startup - only load student-specific when user is authenticated
// Initialize will happen in PayFees component with proper student filtering

// Hook for using the store
export function useTransactionStore() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => {
    const unsubscribe = transactionStore.subscribe(forceUpdate);
    return () => unsubscribe();
  }, []);

  return {
    transactions: transactionStore.getSnapshot(),
    addTransaction: transactionStore.addTransaction.bind(transactionStore),
    getTransactionsByStudent: transactionStore.getTransactionsByStudent.bind(transactionStore),
    getTransactionsByGrade: transactionStore.getTransactionsByGrade.bind(transactionStore),
    getTotalRevenue: transactionStore.getTotalRevenue.bind(transactionStore),
    getTodayTransactions: transactionStore.getTodayTransactions.bind(transactionStore),
    getPaymentStats: transactionStore.getPaymentStats.bind(transactionStore),
    loadTransactions: transactionStore.loadTransactions.bind(transactionStore)
  };
}

// Real-time transaction emitter
export const emitTransaction = (transaction: Transaction) => {
  transactionStore.addTransaction(transaction);
};

// Hook for listening to real-time updates
export const useRealTimeTransactions = () => {
  const [lastUpdate, setLastUpdate] = React.useState<Transaction | null>(null);
  
  React.useEffect(() => {
    const handleUpdate = (event: CustomEvent<Transaction>) => {
      setLastUpdate(event.detail);
    };
    
    window.addEventListener('transaction-updated', handleUpdate as EventListener);
    return () => window.removeEventListener('transaction-updated', handleUpdate as EventListener);
  }, []);

  return lastUpdate;
};

// Initialize socket.io client once to listen for server-side payment events
;(function initSocket() {
  try {
    // Avoid initializing multiple times in hot-reload environments
    const w = window as any;
    if (w.__transactionSocketInitialized) return;
    w.__transactionSocketInitialized = true;

const socket = io((API_ORIGIN).replace('/api', ''), {
      transports: ['websocket'],
      autoConnect: true,
      // the server only sends realtime events to sockets that carry a valid session
      auth: { token: localStorage.getItem('token') || undefined }
    });

    socket.on('connect', () => {
      console.log('🔌 Transaction socket connected:', socket.id);
    });

    socket.on('payment', (payload: any) => {
      console.log('🔔 Received payment event from server:', payload);
      // Refresh store for accountant/admin views
      transactionStore.loadTransactions().catch(() => {});

      // If payload contains enough data, emit a local transaction-updated event for notifications
      if (payload && payload.id) {
        const tx = {
          id: payload.id,
          studentId: payload.studentId || payload.student_id || 'unknown',
          studentName: payload.studentName || payload.student_name || 'Student',
          amount: payload.amount || 0,
          paymentOption: payload.paymentOption || payload.type || 'installment',
          paymentDate: new Date(payload.timestamp || Date.now()).toLocaleDateString(),
          paymentTime: new Date(payload.timestamp || Date.now()).toLocaleTimeString(),
          status: payload.status || 'success',
          classroom: payload.classroom || 'N/A',
          grade: payload.grade || 'N/A',
          feeCategory: payload.feeCategory || 'N/A',
          timestamp: payload.timestamp || new Date().toISOString()
        };

        window.dispatchEvent(new CustomEvent('transaction-updated', { detail: tx }));
      }
    });

    socket.on('disconnect', (reason: any) => {
      console.log('Transaction socket disconnected:', reason);
    });
  } catch (e) {
    console.warn('Could not initialize transaction socket:', e);
  }
})();
