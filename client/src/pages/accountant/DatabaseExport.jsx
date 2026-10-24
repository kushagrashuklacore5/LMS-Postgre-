import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import AccountantLayout from '../../components/AccountantLayout';
import { useAuth } from '../../auth/auth';
import {
  loadReportData,
  summarizeFees,
  summarizeInvoices,
  invoiceFields,
  isFeeConfigured,
  isPaidRecord,
  hasDues,
  formatInr
} from './reportData';

// Status badge per fee row; anything without a resolved fee structure is labelled as such, never as paid
const STATUS_BADGES = {
  'Paid': { label: 'PAID', className: 'bg-emerald-50 text-emerald-800 border border-emerald-300' },
  'Partial': { label: 'PARTIAL DUES', className: 'bg-[#B99652]/15 text-[#8c6d31] border border-[#B99652]/40' },
  'Pending': { label: 'PENDING DUES', className: 'bg-[#B99652]/15 text-[#8c6d31] border border-[#B99652]/40' },
  'Fee Not Configured': { label: 'FEE NOT CONFIGURED', className: 'bg-slate-100 text-slate-700 border border-slate-300' },
  'Needs Review': { label: 'NEEDS REVIEW', className: 'bg-red-50 text-red-700 border border-red-300' }
};

export default function AccountantDatabaseExport() {
  const { token, API } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('fees'); // 'fees', 'funds', 'expenses'

  // Data states: only what the API returned
  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [errors, setErrors] = useState({ fees: null, invoices: null });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const get = (url) => axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await loadReportData(get, API);
      setStudents(data.students);
      setInvoices(data.invoices);
      setErrors(data.errors);
    } finally {
      setLoading(false);
    }
  };

  // Utility to export array of objects to UTF-8 CSV Excel file
  const downloadCSV = (filename, headers, rows) => {
    if (!rows || rows.length === 0) {
      toast.info("No data available to export.");
      return;
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Add UTF-8 BOM so Excel opens Hindi/Special chars cleanly
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`📊 Excel report '${filename}' exported successfully!`);
  };

  // An unknown amount is exported as text, never as 0
  const feeCell = (s, value) => (isFeeConfigured(s) ? value : 'Fee not configured');

  // Export 1: Paid Students Only
  const exportPaidStudentsCSV = () => {
    const paidList = students.filter(isPaidRecord);
    const headers = ['Student ID', 'Student Name', 'Email Address', 'Phone', 'Classroom / Course', 'Total Fee (INR)', 'Paid Amount (INR)', 'Remaining Dues (INR)', 'Status'];
    const rows = paidList.map(s => [
      s.id || 'N/A',
      s.name,
      s.email,
      s.phone || 'N/A',
      s.className || '',
      s.totalFee,
      s.paidAmount,
      s.remainingBalance,
      'PAID'
    ]);
    downloadCSV('Paid_Students_Fee_Report', headers, rows);
  };

  // Export 2: Unpaid / Dues Pending Students
  const exportUnpaidStudentsCSV = () => {
    const unpaidList = students.filter(hasDues);
    const headers = ['Student ID', 'Student Name', 'Email Address', 'Phone', 'Classroom / Course', 'Total Fee (INR)', 'Paid to Date (INR)', 'Outstanding Dues (INR)', 'Due Date', 'Status'];
    const rows = unpaidList.map(s => [
      s.id || 'N/A',
      s.name,
      s.email,
      s.phone || 'N/A',
      s.className || '',
      s.totalFee,
      s.paidAmount,
      s.remainingBalance,
      s.dueDate || '',
      s.status === 'Partial' ? 'PARTIAL DUES' : 'PENDING DUES'
    ]);
    downloadCSV('Unpaid_Pending_Dues_Report', headers, rows);
  };

  // Export 3: Master Fee Statement
  const exportMasterFeeCSV = () => {
    const headers = ['Student ID', 'Student Name', 'Email Address', 'Phone', 'Classroom / Course', 'Total Fee (INR)', 'Paid Amount (INR)', 'Outstanding Dues (INR)', 'Due Date', 'Overall Status'];
    const rows = students.map(s => [
      s.id || 'N/A',
      s.name,
      s.email,
      s.phone || 'N/A',
      s.className || '',
      feeCell(s, s.totalFee),
      s.paidAmount ?? '',
      feeCell(s, s.remainingBalance),
      s.dueDate || '',
      s.status
    ]);
    downloadCSV('Master_Fee_Collection_Report', headers, rows);
  };

  // Export 5: Vendor Invoices & Expenses
  const exportExpensesCSV = () => {
    const headers = ['Invoice No', 'Vendor Name', 'Expense Category', 'Invoice Amount (INR)', 'Date', 'Payment Status'];
    const rows = invoices.map(invoice => {
      const i = invoiceFields(invoice);
      return [i.number || '', i.vendor || '', i.category || '', i.amount ?? '', i.date || '', i.status || ''];
    });
    downloadCSV('Vendor_Expenses_Report', headers, rows);
  };

  // Calculations (real rows only; students without a fee structure are counted separately)
  const feeTotals = summarizeFees(students);
  const invoiceTotals = summarizeInvoices(invoices);
  const loadErrors = [errors.fees, errors.invoices].filter(Boolean);

  const visibleStudents = students
    .filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.email?.toLowerCase().includes(searchQuery.toLowerCase()));
  const visibleInvoices = invoices
    .filter(i => (invoiceFields(i).vendor || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const emptyRow = (message) => (
    <tr>
      <td colSpan={6} className="px-5 py-10 text-center text-slate-500">{message}</td>
    </tr>
  );

  return (
    <AccountantLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">

        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#ebdcaa]">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={28} className="text-[#B99652]" />
              <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight">
                Reports & Financial Analytics
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Export student fee records and vendor expenses into Excel (.csv) format. Figures come only from recorded data.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={exportMasterFeeCSV}
              className="bg-[#002366] hover:bg-[#001744] text-white font-bold px-4 py-2.5 rounded-none text-xs uppercase tracking-wider shadow-xs transition-all flex items-center gap-2 cursor-pointer border border-[#002366]"
            >
              <Download size={15} />
              Export Master Excel
            </button>

            <button
              onClick={fetchAllData}
              className="bg-white hover:bg-[#fffdf4] text-[#002366] p-2.5 rounded-none border border-[#ebdcaa] shadow-xs transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Load errors: shown instead of any substitute data */}
        {!loading && loadErrors.length > 0 && (
          <div role="alert" className="bg-red-50 border border-red-300 text-red-800 p-4 rounded-none text-xs flex gap-3">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wider mb-1">Some report data could not be loaded</p>
              {loadErrors.map((message, idx) => <p key={idx}>{message}</p>)}
              <p className="mt-1 text-red-700">Affected figures are shown as “—”. Use Refresh to try again.</p>
            </div>
          </div>
        )}

        {!loading && !errors.fees && feeTotals.notConfiguredCount > 0 && (
          <div className="bg-slate-50 border border-slate-300 text-slate-700 p-3 rounded-none text-xs">
            {feeTotals.notConfiguredCount} student{feeTotals.notConfiguredCount === 1 ? '' : 's'} have no fee structure configured for their university. Their dues are not included in the totals below.
          </div>
        )}

        {/* Quick Excel Export Modules Grid */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-[#B99652]" /> Instant Excel Download Modules
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Card 1: Paid Students Excel */}
            <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-4 border-t-emerald-600 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                    Paid Accounts ({errors.fees ? '—' : feeTotals.paidCount})
                  </span>
                  <CheckCircle2 size={20} className="text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Paid Students Excel</h3>
                <p className="text-xs text-slate-500 mt-1">
                  List of students with cleared fees, payment receipts & transaction modes.
                </p>
              </div>
              <button
                onClick={exportPaidStudentsCSV}
                className="mt-4 w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-3 text-xs uppercase tracking-wider rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-700"
              >
                <Download size={14} /> Download Excel
              </button>
            </div>

            {/* Card 2: Unpaid / Dues Pending Excel */}
            <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-4 border-t-[#B99652] shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#8c6d31] bg-[#B99652]/10 px-2 py-0.5 border border-[#B99652]/30">
                    Pending Dues ({errors.fees ? '—' : feeTotals.pendingCount})
                  </span>
                  <Clock size={20} className="text-[#B99652]" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Unpaid / Dues Excel</h3>
                <p className="text-xs text-slate-500 mt-1">
                  List of students with pending balances, due dates & contact details.
                </p>
              </div>
              <button
                onClick={exportUnpaidStudentsCSV}
                className="mt-4 w-full bg-[#B99652] hover:bg-[#a38240] text-white font-bold py-2 px-3 text-xs uppercase tracking-wider rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer border border-[#B99652]"
              >
                <Download size={14} /> Download Excel
              </button>
            </div>

            {/* Card 3: Funds & Grants (no data source exists yet) */}
            <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-4 border-t-[#002366] shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#002366] bg-[#002366]/10 px-2 py-0.5 border border-[#002366]/20">
                    Revenue & Grants
                  </span>
                  <TrendingUp size={20} className="text-[#002366]" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Funds & Grants Excel</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Not available: no funds or grants records are connected to the system yet.
                </p>
              </div>
              <button
                disabled
                title="No funds & grants data source is connected"
                className="mt-4 w-full bg-slate-200 text-slate-500 font-bold py-2 px-3 text-xs uppercase tracking-wider rounded-none flex items-center justify-center gap-2 border border-slate-300 cursor-not-allowed"
              >
                <Download size={14} /> Not Available
              </button>
            </div>

            {/* Card 4: Vendor Expenses */}
            <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-4 border-t-slate-700 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 border border-slate-300">
                    Operational Expenses
                  </span>
                  <FileText size={20} className="text-slate-700" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Vendor Invoices Excel</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Full log of vendor invoices, operational expenses & bill status.
                </p>
              </div>
              <button
                onClick={exportExpensesCSV}
                className="mt-4 w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-3 text-xs uppercase tracking-wider rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-800"
              >
                <Download size={14} /> Download Excel
              </button>
            </div>

          </div>
        </div>

        {/* Financial Overview Metrics Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-none border border-[#ebdcaa] shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee Collections</span>
            <h3 className="text-xl font-bold text-emerald-700 mt-1">{errors.fees ? '—' : formatInr(feeTotals.totalPaid)}</h3>
            <p className="text-[11px] text-slate-500">{errors.fees ? 'Could not be loaded' : `${feeTotals.paidCount} accounts fully cleared`}</p>
          </div>

          <div className="bg-white p-4 rounded-none border border-[#ebdcaa] shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Uncollected Dues</span>
            <h3 className="text-xl font-bold text-[#8c6d31] mt-1">{errors.fees ? '—' : formatInr(feeTotals.totalPending)}</h3>
            <p className="text-[11px] text-slate-500">
              {errors.fees
                ? 'Could not be loaded'
                : `${feeTotals.pendingCount} accounts pending${feeTotals.notConfiguredCount ? ` · ${feeTotals.notConfiguredCount} without fee structure` : ''}`}
            </p>
          </div>

          <div className="bg-white p-4 rounded-none border border-[#ebdcaa] shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Funds & Grants Allocated</span>
            <h3 className="text-xl font-bold text-slate-400 mt-1">—</h3>
            <p className="text-[11px] text-slate-500">No funds & grants data source connected</p>
          </div>

          <div className="bg-white p-4 rounded-none border border-[#ebdcaa] shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Vendor Expenses</span>
            <h3 className="text-xl font-bold text-slate-800 mt-1">{errors.invoices ? '—' : formatInr(invoiceTotals.total)}</h3>
            <p className="text-[11px] text-slate-500">{errors.invoices ? 'Could not be loaded' : `${invoiceTotals.count} invoices recorded`}</p>
          </div>
        </div>

        {/* Preview Data Tabs & Table */}
        <div className="bg-white rounded-none border border-[#ebdcaa] shadow-xs">

          {/* Tab Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#ebdcaa] bg-[#fbf6e6] p-3 gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('fees')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                  activeTab === 'fees'
                    ? 'bg-[#002366] text-white border border-[#002366]'
                    : 'bg-[#fffdf4] text-slate-700 border border-[#ebdcaa] hover:bg-[#f6ebd0]'
                }`}
              >
                Student Fee Records ({students.length})
              </button>
              <button
                onClick={() => setActiveTab('funds')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                  activeTab === 'funds'
                    ? 'bg-[#002366] text-white border border-[#002366]'
                    : 'bg-[#fffdf4] text-slate-700 border border-[#ebdcaa] hover:bg-[#f6ebd0]'
                }`}
              >
                Funds & Grants
              </button>
              <button
                onClick={() => setActiveTab('expenses')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                  activeTab === 'expenses'
                    ? 'bg-[#002366] text-white border border-[#002366]'
                    : 'bg-[#fffdf4] text-slate-700 border border-[#ebdcaa] hover:bg-[#f6ebd0]'
                }`}
              >
                Vendor Expenses ({invoices.length})
              </button>
            </div>

            <div className="relative max-w-xs w-full">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search report preview..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-[#ebdcaa] rounded-none text-xs bg-white text-slate-800 focus:outline-none focus:border-[#B99652]"
              />
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-500">
                <div className="w-8 h-8 border-3 border-[#B99652] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Loading reports data...
              </div>
            ) : activeTab === 'fees' ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fffdf4] text-[#002366] text-xs uppercase tracking-wider font-bold border-b border-[#ebdcaa]">
                    <th className="px-5 py-3">Student Name</th>
                    <th className="px-5 py-3">Course / Class</th>
                    <th className="px-5 py-3">Total Fee</th>
                    <th className="px-5 py-3">Paid to Date</th>
                    <th className="px-5 py-3">Remaining Dues</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 text-xs">
                  {errors.fees
                    ? emptyRow('Student fee records could not be loaded.')
                    : visibleStudents.length === 0
                      ? emptyRow('No student fee records found.')
                      : visibleStudents.map((s) => {
                          const badge = STATUS_BADGES[s.status] || { label: String(s.status || '—').toUpperCase(), className: 'bg-slate-100 text-slate-700 border border-slate-300' };
                          const configured = isFeeConfigured(s);
                          return (
                            <tr key={s.id} className="hover:bg-[#fffdf4] transition-colors">
                              <td className="px-5 py-3 font-semibold text-[#002366]">
                                {s.name}
                                <div className="text-[11px] text-slate-500 font-normal">{s.email}</div>
                              </td>
                              <td className="px-5 py-3 text-slate-700">{s.className || '—'}</td>
                              <td className="px-5 py-3 text-slate-900 font-medium">{configured ? formatInr(s.totalFee) : <span className="text-slate-400">Not configured</span>}</td>
                              <td className="px-5 py-3 text-emerald-700 font-semibold">{formatInr(s.paidAmount)}</td>
                              <td className="px-5 py-3 font-bold">
                                {!configured ? (
                                  <span className="text-slate-400">—</span>
                                ) : Number(s.remainingBalance) > 0 ? (
                                  <span className="text-[#8c6d31]">{formatInr(s.remainingBalance)}</span>
                                ) : (
                                  <span className="text-slate-400">₹0</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`px-2 py-0.5 font-bold ${badge.className}`}>{badge.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                </tbody>
              </table>
            ) : activeTab === 'funds' ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <TrendingUp size={28} className="mx-auto mb-3 text-slate-300" />
                No funds or grants records are connected to the system yet, so nothing can be reported here.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fffdf4] text-[#002366] text-xs uppercase tracking-wider font-bold border-b border-[#ebdcaa]">
                    <th className="px-5 py-3">Invoice No</th>
                    <th className="px-5 py-3">Vendor Name</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 text-xs">
                  {errors.invoices
                    ? emptyRow('Vendor invoices could not be loaded.')
                    : visibleInvoices.length === 0
                      ? emptyRow('No vendor invoices recorded.')
                      : visibleInvoices.map((invoice, idx) => {
                          const i = invoiceFields(invoice);
                          return (
                            <tr key={invoice.id ?? idx} className="hover:bg-[#fffdf4] transition-colors">
                              <td className="px-5 py-3 font-bold text-slate-600">{i.number || '—'}</td>
                              <td className="px-5 py-3 font-semibold text-[#002366]">{i.vendor || '—'}</td>
                              <td className="px-5 py-3 text-slate-700">{i.category || '—'}</td>
                              <td className="px-5 py-3 font-bold text-slate-900">{formatInr(i.amount)}</td>
                              <td className="px-5 py-3 text-slate-600">{i.date || '—'}</td>
                              <td className="px-5 py-3">
                                {i.status
                                  ? <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold">{i.status}</span>
                                  : <span className="text-slate-400">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                </tbody>
              </table>
            )}
          </div>

        </div>

      </div>
    </AccountantLayout>
  );
}
