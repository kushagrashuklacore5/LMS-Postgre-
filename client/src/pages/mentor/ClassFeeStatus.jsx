import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  Bell, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Users, 
  DollarSign, 
  Send, 
  Filter, 
  Calendar,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import MentorLayout from '../../components/MentorLayout';
import AccountantLayout from '../../components/AccountantLayout';
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import { isFeeConfigured, isPaidRecord, hasDues, formatInr } from '../accountant/reportData';

export default function ClassFeeStatus() {
  const { API, token, user } = useAuth();
  const { t } = useTranslation();
  const LayoutComponent = user?.role === 'accountant' ? AccountantLayout : MentorLayout;
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, PENDING, PAID
  const [sendingReminderId, setSendingReminderId] = useState(null);
  const [sendingBulk, setSendingBulk] = useState(false);

  useEffect(() => {
    fetchStudentFees();
  }, []);

  const fetchStudentFees = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/classrooms/teacher/students-fees`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setStudents(res.data.students || []);
      }
    } catch (err) {
      console.error("Failed to fetch student fees:", err);
      // Never show invented students: an empty list is the honest result of a failed request
      setStudents([]);
      toast.error(err.response?.data?.message || 'Could not load student fee records.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (student) => {
    // Only real, outstanding dues are ever sent; no amount or date is invented
    if (!hasDues(student)) {
      toast.info('No outstanding dues are recorded for this student.');
      return;
    }
    try {
      setSendingReminderId(student.id);
      // The server looks up the recipient, name, classes, amount and due date itself; only these two fields are accepted
      const payload = {
        studentId: student.id,
        message: 'Please clear your outstanding academic dues before the last date to avoid late fees.'
      };

      const res = await axios.post(`${API}/classrooms/send-fee-reminder`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success(res.data.message || `🔔 Fee reminder sent to ${student.name}.`);
      } else {
        toast.error(res.data?.message || 'Failed to send reminder.');
      }
    } catch (err) {
      console.error("Error sending reminder:", err);
      toast.error(err.response?.data?.message || "Error sending fee reminder.");
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleBulkReminders = async () => {
    const pendingStudents = students.filter(hasDues);
    if (pendingStudents.length === 0) {
      toast.info('All students have already paid their fees!');
      return;
    }

    try {
      setSendingBulk(true);
      let sent = 0;
      let skipped = 0;
      for (const student of pendingStudents) {
        const payload = {
          studentId: student.id,
          message: 'Bulk Reminder: Kindly submit your pending classroom fees before the due date.'
        };
        try {
          await axios.post(`${API}/classrooms/send-fee-reminder`, payload, {
            headers: { Authorization: `Bearer ${token}` }
          });
          sent++;
        } catch (err) {
          // e.g. reminded recently, awaiting reconciliation, or no longer owing: skip and continue with the rest
          skipped++;
        }
      }
      if (sent > 0) toast.success(`📢 Fee reminders sent to ${sent} student${sent === 1 ? '' : 's'}.`);
      if (skipped > 0) toast.info(`${skipped} student${skipped === 1 ? ' was' : 's were'} skipped (reminded recently, awaiting reconciliation, or no outstanding balance).`);
    } catch (err) {
      console.error("Error sending bulk reminders:", err);
      toast.error("Error dispatching bulk reminders.");
    } finally {
      setSendingBulk(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesQuery = 
      student.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.className?.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterStatus === 'PENDING') return matchesQuery && hasDues(student);
    if (filterStatus === 'PAID') return matchesQuery && isPaidRecord(student);
    return matchesQuery;
  });

  const totalStudentsCount = students.length;
  // Students without a resolved fee structure are neither paid nor pending
  const paidCount = students.filter(isPaidRecord).length;
  const pendingCount = students.filter(hasDues).length;
  const totalPendingAmount = students.filter(hasDues).reduce((acc, s) => acc + (Number(s.remainingBalance) || 0), 0);

  return (
    <LayoutComponent>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Clean Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#ebdcaa]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight">
              {t('nav_fee_status') !== 'nav_fee_status' ? t('nav_fee_status') : 'Student Fee Status & Reminders'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {t('fee_status_subtitle', 'Monitor student fee payment progress across your assigned classrooms and dispatch instant reminders.')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleBulkReminders}
              disabled={sendingBulk || pendingCount === 0}
              className="bg-[#B99652] hover:bg-[#a58342] text-white font-bold px-5 py-2.5 rounded-none text-xs uppercase tracking-wider shadow-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50 border border-[#B99652]"
            >
              {sendingBulk ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('sending', 'Sending Reminders...')}
                </>
              ) : (
                <>
                  <Send size={15} />
                  📢 {t('send_reminder', 'Notify All Pending')} ({pendingCount})
                </>
              )}
            </button>

            <button
              onClick={fetchStudentFees}
              className="bg-white hover:bg-[#fffdf4] text-[#002366] p-2.5 rounded-none border border-[#ebdcaa] shadow-xs transition-all cursor-pointer"
              title={t('refresh', 'Refresh Data')}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#B99652] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('total_students', 'Total Enrolled')}</span>
              <div className="p-2 bg-[#002366]/10 text-[#002366] rounded-none border border-[#002366]/20">
                <Users size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{totalStudentsCount}</h3>
            <p className="text-xs text-slate-500">{t('students', 'Classroom students')}</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-emerald-600 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('paid', 'Fees Cleared')}</span>
              <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-none border border-emerald-500/20">
                <CheckCircle2 size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-emerald-600">{paidCount}</h3>
            <p className="text-xs text-emerald-600 font-medium">{t('paid', 'Fully paid accounts')}</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#B99652] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Fee Dues</span>
              <div className="p-2 bg-[#B99652]/15 text-[#8c6d31] rounded-none border border-[#B99652]/30">
                <Clock size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-[#8c6d31]">{pendingCount}</h3>
            <p className="text-xs text-[#8c6d31] font-medium">Students with dues</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#002366] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Dues Amount</span>
              <div className="p-2 bg-rose-500/10 text-rose-600 rounded-none border border-rose-500/20">
                <DollarSign size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">₹{totalPendingAmount.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-500">Uncollected dues</p>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-white p-4 rounded-none border border-[#ebdcaa] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search student by name, email, or classroom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdfa] text-sm text-slate-800 focus:outline-none focus:border-[#B99652]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                filterStatus === 'ALL'
                  ? 'bg-[#002366] text-white border-[#002366]'
                  : 'bg-[#fffdf4] text-slate-700 border-[#ebdcaa] hover:bg-[#f6ebd0]'
              }`}
            >
              All ({students.length})
            </button>
            <button
              onClick={() => setFilterStatus('PENDING')}
              className={`px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                filterStatus === 'PENDING'
                  ? 'bg-[#B99652] text-white border-[#B99652]'
                  : 'bg-[#fffdf4] text-slate-700 border-[#ebdcaa] hover:bg-[#f6ebd0]'
              }`}
            >
              Pending Dues ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('PAID')}
              className={`px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                filterStatus === 'PAID'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-[#fffdf4] text-slate-700 border-[#ebdcaa] hover:bg-[#f6ebd0]'
              }`}
            >
              Paid ({paidCount})
            </button>
          </div>
        </div>

        {/* Student Fee Status Table */}
        <div className="bg-white rounded-none border border-[#ebdcaa] shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-3 border-[#B99652] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading student fee records...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <AlertCircle size={36} className="mx-auto text-slate-400 mb-2" />
              <p className="text-base font-semibold">No student records found</p>
              <p className="text-xs text-slate-400">Try changing your search query or filter selection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fbf6e6] text-[#002366] text-xs uppercase tracking-wider font-bold border-b border-[#ebdcaa]">
                    <th className="px-6 py-4">{t('student_name', 'Student Details')}</th>
                    <th className="px-6 py-4">{t('classrooms', 'Classroom / Course')}</th>
                    <th className="px-6 py-4">{t('total_fee_amount', 'Total Fee')}</th>
                    <th className="px-6 py-4">{t('paid_to_date', 'Paid to Date')}</th>
                    <th className="px-6 py-4">{t('balance_due', 'Remaining Dues')}</th>
                    <th className="px-6 py-4">{t('status', 'Status')}</th>
                    <th className="px-6 py-4 text-right">{t('actions', 'Reminder Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 text-sm">
                  {filteredStudents.map((student) => {
                    const isPending = hasDues(student);
                    const configured = isFeeConfigured(student);
                    return (
                      <tr key={student.id} className="hover:bg-[#fffdf4] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-none bg-[#B99652] text-white font-bold flex items-center justify-center text-sm border border-[#96773a]">
                              {student.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-[#002366]">{student.name}</div>
                              <div className="text-xs text-slate-500">{student.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {student.className || '—'}
                        </td>

                        <td className="px-6 py-4 text-slate-900 font-semibold">
                          {configured ? formatInr(student.totalFee) : <span className="text-slate-400 font-normal">Not configured</span>}
                        </td>

                        <td className="px-6 py-4 text-emerald-700 font-semibold">
                          {formatInr(student.paidAmount)}
                        </td>

                        <td className="px-6 py-4 font-bold">
                          {!configured ? (
                            <span className="text-slate-400">—</span>
                          ) : student.remainingBalance > 0 ? (
                            <span className="text-[#8c6d31]">{formatInr(student.remainingBalance)}</span>
                          ) : (
                            <span className="text-slate-400">₹0</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {student.status === 'Paid' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-300">
                              <CheckCircle2 size={13} /> Paid
                            </span>
                          ) : !configured ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300">
                              <AlertCircle size={13} /> {student.status === 'Needs Review' ? 'Needs Review' : 'Fee Not Configured'}
                            </span>
                          ) : student.status === 'Partial' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-blue-50 text-blue-800 text-xs font-semibold border border-blue-300">
                              <Clock size={13} /> Partial
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-[#B99652]/15 text-[#8c6d31] text-xs font-semibold border border-[#B99652]/40">
                              <AlertCircle size={13} /> Pending Dues
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          {isPending ? (
                            <button
                              onClick={() => handleSendReminder(student)}
                              disabled={sendingReminderId === student.id}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B99652] hover:bg-[#a58342] text-white font-bold text-xs uppercase tracking-wider rounded-none shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 border border-[#B99652]"
                            >
                              {sendingReminderId === student.id ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Bell size={14} />
                                  Send Reminder
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No Action Needed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </LayoutComponent>
  );
}
