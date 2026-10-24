import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from "../../auth/auth";
import AccountantLayout from "../../components/AccountantLayout";
import { useTranslation } from "../../context/TranslationContext";
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  DollarSign,
  ArrowUpDown,
  CreditCard,
  User,
  Calendar,
  Hash,
  ShieldCheck
} from "lucide-react";

const PaymentHistory = () => {
  const { t } = useTranslation();
  const { token, API } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!token) {
        setError('Authentication required. Please log in.');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API}/accountant/payments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        setError('Your session has expired or authentication failed. Please log in again.');
        setPayments([]);
        return;
      }

      if (response.status === 403) {
        setError('Access denied: You do not have accountant permissions or your institution association is missing.');
        setPayments([]);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || `Server returned an error (${response.status}) while loading payments.`);
        setPayments([]);
        return;
      }

      const data = await response.json();
      if (data && data.success && Array.isArray(data.data)) {
        setPayments(data.data);
      } else {
        setError(data?.message || 'Invalid data format received from the payments server.');
        setPayments([]);
      }
    } catch (err) {
      console.error('Error fetching accountant payments:', err);
      setError('Network communication error while connecting to the payments server. Please check your connection.');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  // Format currency consistently with Indian numbering system
  const formatCurrency = (amt) => {
    const num = Number(amt);
    if (isNaN(num)) return '₹0';
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // Format date safely without fabricating dates
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return String(dateStr);
    }
  };

  const formatTimeDisplay = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return null;
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'paid' || s === 'success' || s === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
          <CheckCircle size={12} className="shrink-0" />
          Paid
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
          <Clock size={12} className="shrink-0" />
          Pending
        </span>
      );
    }
    if (s === 'failed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-300">
          <XCircle size={12} className="shrink-0" />
          Failed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
        {status || 'Unknown'}
      </span>
    );
  };

  // Dynamically computed metrics strictly from genuine API records
  const totalVolume = useMemo(() => {
    return payments
      .filter((p) => {
        const s = String(p.status || '').toLowerCase();
        return s === 'paid' || s === 'success' || s === 'completed';
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const paidCount = useMemo(() => {
    return payments.filter((p) => {
      const s = String(p.status || '').toLowerCase();
      return s === 'paid' || s === 'success' || s === 'completed';
    }).length;
  }, [payments]);

  const pendingCount = useMemo(() => {
    return payments.filter((p) => String(p.status || '').toLowerCase() === 'pending').length;
  }, [payments]);

  // Client-side filtering and sorting of authentic data
  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        if (statusFilter !== 'ALL') {
          const s = String(p.status || '').toLowerCase();
          if (statusFilter.toLowerCase() !== s) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const name = String(p.studentName || '').toLowerCase();
          const email = String(p.studentEmail || '').toLowerCase();
          const txn = String(p.transactionId || '').toLowerCase();
          const desc = String(p.description || '').toLowerCase();
          const method = String(p.paymentMethod || '').toLowerCase();
          const pType = String(p.type || '').toLowerCase();

          if (
            !name.includes(q) &&
            !email.includes(q) &&
            !txn.includes(q) &&
            !desc.includes(q) &&
            !method.includes(q) &&
            !pType.includes(q)
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [payments, statusFilter, searchQuery, sortOrder]);

  // Export genuine records to CSV
  const handleExportCSV = () => {
    if (filteredPayments.length === 0) return;
    const headers = [
      'Transaction ID',
      'Student ID',
      'Student Name',
      'Student Email',
      'Amount (INR)',
      'Status',
      'Payment Date',
      'Created At',
      'Payment Method',
      'Payment Type',
      'Description'
    ];

    const rows = filteredPayments.map((p) => [
      `"${p.transactionId || p.id || ''}"`,
      p.studentId || '',
      `"${(p.studentName || '').replace(/"/g, '""')}"`,
      `"${(p.studentEmail || '').replace(/"/g, '""')}"`,
      p.amount || 0,
      `"${p.status || ''}"`,
      `"${p.date || ''}"`,
      `"${p.createdAt || ''}"`,
      `"${p.paymentMethod || 'N/A'}"`,
      `"${p.type || 'N/A'}"`,
      `"${(p.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payment_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AccountantLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        {/* ================= HEADER ================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight font-['DM_Serif_Display',serif]">
              {t('payment_history_title', 'Payment History')}
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              {t('payment_history_subtitle', 'Live ledger of student fee payments and official transaction receipts')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchPayments}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#B99652] text-[#002366] hover:bg-[#B99652]/10 transition-colors font-medium text-xs uppercase tracking-wider disabled:opacity-50"
              title={t('refresh', 'Refresh')}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>{t('refresh', 'Refresh')}</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={loading || filteredPayments.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#002366] text-white hover:bg-[#001845] transition-colors font-semibold text-xs uppercase tracking-wider disabled:opacity-40"
              title={t('export_csv', 'Export CSV')}
            >
              <Download size={14} />
              <span>{t('export_csv', 'Export CSV')}</span>
            </button>
          </div>
        </div>

        {/* ================= SUMMARY STAT TILES ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#ebdcaa] p-4 rounded-none shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                {t('total_collection', 'Total Collection')}
              </span>
              <div className="p-2 bg-emerald-50 text-emerald-700 border border-emerald-200">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#002366] mt-2">
              {formatCurrency(totalVolume)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{t('verified_settled_fees', 'Verified settled fees')}</p>
          </div>

          <div className="bg-white border border-[#ebdcaa] p-4 rounded-none shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                {t('successful_payments', 'Successful Payments')}
              </span>
              <div className="p-2 bg-blue-50 text-blue-700 border border-blue-200">
                <CheckCircle size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#002366] mt-2">
              {paidCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">{t('settled_transactions', 'Settled transactions')}</p>
          </div>

          <div className="bg-white border border-[#ebdcaa] p-4 rounded-none shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                {t('pending_transactions', 'Pending Transactions')}
              </span>
              <div className="p-2 bg-amber-50 text-amber-700 border border-amber-200">
                <Clock size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#002366] mt-2">
              {pendingCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">{t('awaiting_confirmation', 'Awaiting confirmation')}</p>
          </div>

          <div className="bg-white border border-[#ebdcaa] p-4 rounded-none shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                {t('total_records', 'Total Records')}
              </span>
              <div className="p-2 bg-purple-50 text-purple-700 border border-purple-200">
                <CreditCard size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#002366] mt-2">
              {payments.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">{t('total_institution_logs', 'Total institution logs')}</p>
          </div>
        </div>

        {/* ================= SEARCH & FILTER CONTROLS ================= */}
        <div className="bg-white border border-[#ebdcaa] p-4 rounded-none shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('search_payments_placeholder', 'Search by student name, email, transaction ID, or note...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] rounded-none bg-slate-50/50"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 border border-slate-300 p-0.5 bg-slate-50">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-[#002366] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('all', 'All')}
              </button>
              <button
                onClick={() => setStatusFilter('Paid')}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  statusFilter === 'Paid'
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('paid', 'Paid')}
              </button>
              <button
                onClick={() => setStatusFilter('Pending')}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  statusFilter === 'Pending'
                    ? 'bg-amber-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('pending', 'Pending')}
              </button>
              <button
                onClick={() => setStatusFilter('Failed')}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  statusFilter === 'Failed'
                    ? 'bg-rose-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Failed
              </button>
            </div>

            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold uppercase tracking-wider transition-colors"
              title="Toggle date sorting"
            >
              <ArrowUpDown size={13} />
              <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>

        {/* ================= STATE HANDLING: LOADING / ERROR / EMPTY / TABLE ================= */}
        {loading ? (
          <div className="bg-white border border-[#ebdcaa] p-16 text-center shadow-xs">
            <div className="w-9 h-9 border-3 border-[#B99652] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#002366]">Loading institutional payment history...</p>
            <p className="text-xs text-slate-500 mt-1">Retrieving verified tenant ledger from database</p>
          </div>
        ) : error ? (
          <div className="bg-white border border-rose-300 p-8 text-center shadow-xs">
            <AlertCircle className="h-10 w-10 text-rose-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 mb-1">Failed to Load Payments</h3>
            <p className="text-rose-700 text-sm max-w-lg mx-auto mb-4">{error}</p>
            <button
              onClick={fetchPayments}
              className="inline-flex items-center gap-2 bg-[#002366] hover:bg-[#001845] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all"
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          </div>
        ) : payments.length === 0 ? (
          <div className="bg-white border border-[#ebdcaa] p-16 text-center shadow-xs">
            <div className="w-14 h-14 rounded-full bg-[#ebdcaa]/40 text-[#B99652] flex items-center justify-center mx-auto mb-4">
              <FileText size={28} />
            </div>
            <h3 className="text-lg font-bold text-[#002366] mb-1">No Payments Yet</h3>
            <p className="text-slate-600 text-sm max-w-md mx-auto">
              There are currently no recorded student fee payments for this institution. New payments will appear here in real time as students complete transactions.
            </p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white border border-[#ebdcaa] p-12 text-center shadow-xs">
            <Search size={36} className="mx-auto text-slate-400 mb-3" />
            <h3 className="text-base font-bold text-[#002366] mb-1">No Matching Payments Found</h3>
            <p className="text-slate-500 text-sm mb-4">
              No transactions match your current search and filter criteria.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
              className="px-4 py-2 border border-[#B99652] text-[#002366] hover:bg-[#B99652]/10 text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              {t('clear_filters', 'Clear Filters')}
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#ebdcaa] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#002366] text-white text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('date', 'Date')}</th>
                    <th className="py-3 px-4">{t('student', 'Student')}</th>
                    <th className="py-3 px-4">{t('transaction_id', 'Transaction Ref')}</th>
                    <th className="py-3 px-4">{t('payment_method', 'Mode / Channel')}</th>
                    <th className="py-3 px-4 text-right">{t('amount', 'Amount')}</th>
                    <th className="py-3 px-4 text-center">{t('status', 'Status')}</th>
                    <th className="py-3 px-4">{t('description', 'Description')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredPayments.map((p) => {
                    const timeStr = formatTimeDisplay(p.createdAt);
                    return (
                      <tr key={p.id || p.transactionId} className="hover:bg-[#fcfaf5] transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            {formatDateDisplay(p.date || p.createdAt)}
                          </div>
                          {timeStr && (
                            <div className="text-xs text-slate-400">
                              {timeStr}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {p.studentName || 'Student'}
                          </div>
                          {p.studentEmail && (
                            <div className="text-xs text-slate-500">
                              {p.studentEmail}
                            </div>
                          )}
                          {p.studentId && (
                            <span className="inline-block mt-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 border border-slate-200">
                              ID: {p.studentId}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5">
                            {p.transactionId || String(p.id)}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                          <div className="font-medium capitalize text-xs">
                            {p.paymentMethod || p.type || 'Standard'}
                          </div>
                          {p.type && p.paymentMethod && p.type !== p.paymentMethod && (
                            <div className="text-[11px] text-slate-400 uppercase tracking-wider">
                              {p.type}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-slate-900">
                          {formatCurrency(p.amount)}
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {getStatusBadge(p.status)}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                          {p.description || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
              <span>
                Showing <strong>{filteredPayments.length}</strong> of <strong>{payments.length}</strong> recorded payments
              </span>
              <span className="text-[11px] text-slate-400">
                Data strictly isolated for current university tenant
              </span>
            </div>
          </div>
        )}
      </div>
    </AccountantLayout>
  );
};

export default PaymentHistory;
