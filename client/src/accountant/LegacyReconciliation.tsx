import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  Lock, 
  HelpCircle, 
  Calendar, 
  Receipt, 
  User, 
  DollarSign, 
  Building,
  Info
} from 'lucide-react';
import { useAuth } from '../auth/auth';

interface AcademicContext {
  classroomId: number | null;
  classroomName: string | null;
  grade: string | null;
  activeScheduleId: number | null;
  activePlanName: string | null;
  currentFeeStructureId: number | null;
  currentFeeStructureCategory: string | null;
  currentAnnualFee: number | null;
  isStructureDeterminedSafely: boolean;
}

interface ReconciliationRequirement {
  status: string;
  academicSessionConfirmed: boolean;
  readOnlyNotice: string;
}

interface UnallocatedPayment {
  paymentId: number;
  studentId: number;
  studentName: string;
  studentEmail: string;
  universityId: number;
  amount: number;
  amountPaise: number;
  paymentType: string;
  paymentMethod: string;
  status: string;
  transactionId: string;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  receiptNo: string | null;
  referenceNo: string | null;
  description: string | null;
  createdAt: string;
  paymentDate: string | null;
  scheduleId: number | null;
  installmentStage: number | null;
  allocationStatus: string;
  currentAcademicContext: AcademicContext;
  reconciliationRequirement: ReconciliationRequirement;
}

interface SummaryData {
  totalUnallocatedCount: number;
  totalUnallocatedAmount: number;
  affectedStudentsCount: number;
  reconciliationMode: string;
  academicSessionConfirmationRequired: boolean;
}

export default function LegacyReconciliation() {
  const { token, API } = useAuth();
  const [payments, setPayments] = useState<UnallocatedPayment[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchUnallocatedPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      const authToken = token || localStorage.getItem('token');
      const res = await fetch(`${API}/accountant/unallocated-payments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication required to access legacy reconciliation.');
        } else if (res.status === 403) {
          throw new Error('Access denied. Only accountants and administrators can access reconciliation records.');
        } else {
          throw new Error(`Server responded with status ${res.status}`);
        }
      }

      const json = await res.json();
      if (json.success) {
        setPayments(json.data || []);
        setSummary(json.summary || null);
      } else {
        throw new Error(json.message || 'Failed to load unallocated payments.');
      }
    } catch (err: any) {
      console.error('Error fetching unallocated payments:', err);
      setError(err.message || 'An unexpected error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnallocatedPayments();
  }, []);

  const filteredPayments = useMemo(() => {
    if (!searchQuery.trim()) return payments;
    const q = searchQuery.toLowerCase().trim();
    return payments.filter(p => 
      p.studentName.toLowerCase().includes(q) ||
      String(p.studentId).includes(q) ||
      String(p.paymentId).includes(q) ||
      (p.transactionId && p.transactionId.toLowerCase().includes(q)) ||
      (p.currentAcademicContext?.classroomName && p.currentAcademicContext.classroomName.toLowerCase().includes(q))
    );
  }, [payments, searchQuery]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50/50 min-h-screen">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
              Legacy Payment Reconciliation
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 rounded-md">
              Read-Only Review
            </span>
          </div>
          <p className="text-slate-600 text-sm mt-1">
            Audit historical payments with missing schedule/stage linkage and review reconciliation requirements safely.
          </p>
        </div>

        <button
          onClick={fetchUnallocatedPayments}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs text-sm font-semibold transition cursor-pointer self-start sm:self-auto disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? "animate-spin text-blue-600" : "text-slate-500"} />
          Refresh List
        </button>
      </div>

      {/* Mandatory Read-Only Academic Session Notice */}
      <div className="mb-6 p-4 rounded-xl bg-amber-50/90 border border-amber-300/80 shadow-xs flex items-start gap-3.5">
        <div className="p-2 bg-amber-600 text-white rounded-lg shrink-0 mt-0.5">
          <ShieldAlert size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
            Pending Academic-Session Confirmation Required
          </h4>
          <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
            Historical payments recorded prior to the installment schedule system are held in an unallocated state. 
            Because the payment session is unconfirmed, automatic assignment to a student&apos;s current grade or active fee structure 
            is strictly prohibited to prevent cross-session misallocation. 
            <strong> Step 1 is strictly for inspection and auditing; no allocation changes or database writes will take place.</strong>
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Unallocated Payments</span>
            <Receipt className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {summary ? summary.totalUnallocatedCount : payments.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Payments missing schedule/stage linkage</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Unallocated Value</span>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-700 mt-2">
            {formatCurrency(summary?.totalUnallocatedAmount || payments.reduce((acc, p) => acc + p.amount, 0))}
          </p>
          <p className="text-xs text-slate-500 mt-1">Pending administrator confirmation</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Affected Students</span>
            <User className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-700 mt-2">
            {summary?.affectedStudentsCount ?? new Set(payments.map(p => p.studentId)).size}
          </p>
          <p className="text-xs text-slate-500 mt-1">Online checkout blocked until reconciled</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by student, ID, or TXN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-xs"
          />
        </div>
        <div className="text-xs text-slate-500 self-start sm:self-auto">
          Showing {filteredPayments.length} of {payments.length} unallocated records
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-700 font-semibold text-sm">Loading legacy unallocated payments...</p>
          <p className="text-slate-400 text-xs mt-1">Checking payment records against installment schedules</p>
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center shadow-xs">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-slate-800 font-bold text-base mb-1">Failed to Load Records</h3>
          <p className="text-slate-600 text-sm max-w-md mx-auto mb-4">{error}</p>
          <button
            onClick={fetchUnallocatedPayments}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
          >
            Retry Loading
          </button>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-slate-800 font-bold text-base mb-1">
            {searchQuery ? "No matching records found" : "No Unallocated Payments Found"}
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            {searchQuery 
              ? "Try adjusting your search criteria or clear the search filter."
              : "All historical payments in your authorized institution are properly linked to installment schedules."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">Payment ID &amp; TXN</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Payment Date</th>
                  <th className="py-3.5 px-4">Current Fee Context</th>
                  <th className="py-3.5 px-4">Linkage Status</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => {
                  const ctx = p.currentAcademicContext;
                  return (
                    <tr key={p.paymentId} className="hover:bg-slate-50/70 transition">
                      {/* Student Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{p.studentName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Student ID: #{p.studentId} • {ctx?.classroomName || (ctx?.grade ? `Grade ${ctx.grade}` : 'Unassigned')}
                        </div>
                        {p.studentEmail && (
                          <div className="text-xs text-slate-400 truncate max-w-xs">{p.studentEmail}</div>
                        )}
                      </td>

                      {/* Payment ID & TXN */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-medium text-slate-800 text-xs">
                          Payment #{p.paymentId}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {p.transactionId || 'No TXN Ref'}
                        </div>
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 rounded mt-1">
                          {p.paymentMethod || p.paymentType || 'Payment'}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatCurrency(p.amount)}
                        </div>
                        <div className="text-[11px] text-emerald-600 font-medium">
                          Status: {p.status}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-600 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400" />
                          {formatDate(p.createdAt)}
                        </div>
                      </td>

                      {/* Current Fee Context */}
                      <td className="py-3.5 px-4">
                        {ctx?.isStructureDeterminedSafely ? (
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {ctx.currentFeeStructureCategory || 'Curriculum'} Structure #{ctx.currentFeeStructureId}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Annual Fee: {ctx.currentAnnualFee ? formatCurrency(ctx.currentAnnualFee) : 'N/A'}
                            </div>
                            <div className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                              Session unconfirmed
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs text-slate-400 italic">
                              No active schedule found
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Requires manual curriculum match
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Linkage Status */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
                          <AlertTriangle size={12} className="shrink-0" />
                          Unallocated
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Missing schedule / stage
                        </div>
                      </td>

                      {/* Action (Read-Only / Disabled) */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          disabled
                          title="Allocation mutation is disabled in Step 1. Academic session confirmation required."
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg text-xs font-semibold cursor-not-allowed opacity-80"
                        >
                          <Lock size={12} />
                          Confirm Allocation
                        </button>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Disabled (Step 1 Read-Only)
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Info size={14} className="text-slate-400" />
              <span>Phase 2C Step 1 — Audit &amp; Inspection Mode Only. No writes or balance alterations will occur.</span>
            </div>
            <span>Authorized Scope: University #{summary ? '1' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
